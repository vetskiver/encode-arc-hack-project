import { Router } from "express";
import { createGatewayMiddleware } from "@circlefin/x402-batching/server";
import type { PaymentRequest } from "@circlefin/x402-batching/server";
import { store } from "./store";
import * as stork from "./integrations/stork";

const router = Router();

const sellerAddress =
  process.env.X402_SELLER_ADDRESS ||
  process.env.DEFAULT_COMPANY_ADDRESS ||
  store.defaultUser;

const networks = (process.env.X402_NETWORKS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const facilitatorUrl = process.env.X402_FACILITATOR_URL;
const price = process.env.X402_PRICE || "$0.01";

const gateway = createGatewayMiddleware({
  sellerAddress,
  facilitatorUrl,
  description: "horizn AI Risk Intelligence — pay-per-query oracle & risk data",
});

// GET /api/paywall/oracle/:symbol
router.get("/api/paywall/oracle/:symbol", gateway.require(price), async (req, res) => {
  const payment = (req as PaymentRequest).payment;
  const symbol = (req.params.symbol || "BTCUSD").toUpperCase();
  try {
    const oracle = await stork.getPriceForSymbol(symbol);
    res.json({
      symbol,
      price: oracle.price,
      ts: oracle.ts,
      stale: oracle.stale,
      source: oracle.source,
      paid_by: payment?.payer,
      amount_paid: payment?.amount,
      network: payment?.network,
      transaction: payment?.transaction,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Oracle fetch failed", detail: err.message });
  }
});

// GET /api/paywall/risk/:companyId
router.get("/api/paywall/risk/:companyId", gateway.require(price), async (req, res) => {
  const payment = (req as PaymentRequest).payment;
  try {
    const company = await store.getCompany(req.params.companyId);
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }

    const snapshot = company.telemetry.lastSnapshot as any;
    const recentLog = company.actionLogs[0] || null;

    res.json({
      companyId: company.id,
      name: company.name,
      riskProfile: company.riskProfile,
      collateralAsset: company.collateralAsset,
      oracleSymbol: company.oracleSymbol,
      healthFactor: snapshot?.healthFactor ?? null,
      collateralValueUSDC: snapshot?.collateralValueUSDC ?? null,
      debtUSDC: snapshot?.debtUSDC ?? null,
      liquidityUSDC: snapshot?.liquidityUSDC ?? null,
      reserveUSDC: snapshot?.reserveUSDC ?? null,
      agentStatus: company.telemetry.status,
      lastDecision: recentLog ? {
        action: recentLog.action,
        amountUSDC: recentLog.amountUSDC,
        rationale: recentLog.rationale,
        trigger: recentLog.trigger,
        arcTxHash: recentLog.arcTxHash,
        circleTxRef: recentLog.circleTxRef,
        ts: recentLog.ts,
      } : null,
      policy: {
        ltvBps: company.policy.ltvBps,
        minHealthBps: company.policy.minHealthBps,
        volatilityThresholdPct: company.policy.volatilityThresholdPct,
      },
      paid_by: payment?.payer,
      amount_paid: payment?.amount,
      network: payment?.network,
      transaction: payment?.transaction,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/paywall/health — free health check
router.get("/api/paywall/health", (_req, res) => {
  res.json({
    ok: true,
    price,
    sellerAddress,
    networks: networks.length > 0 ? networks : "all",
    endpoints: [
      "GET /api/paywall/oracle/:symbol  — live oracle price (BTC/ETH/USDC)",
      "GET /api/paywall/risk/:companyId — AI risk report (atlas/northwind/harbor)",
    ],
  });
});

export default router;