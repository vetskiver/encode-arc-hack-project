import { Router, Request, Response } from "express";
import { store } from "./store";
import { startAgentLoop, stopAgentLoop } from "./agent/agentLoop";
import { agentTick } from "./agent/agentTick";
import { companyAgentTick } from "./agent/companyAgentTick";
import * as arc from "./integrations/arc";
import * as circle from "./integrations/circle";
import * as stork from "./integrations/stork";
import x402Routes from "./x402Routes";
import { numberToUSDC } from "./integrations/usdc";
import { rationaleHash } from "./utils/hash";
import {
  computeCollateralValueUSDC,
  computeMaxBorrow,
  computeHealthFactor,
  bpsToRatio,
} from "./utils/math";

const router = Router();
router.use(x402Routes);
type BucketName = "liquidity" | "reserve" | "yield" | "creditFacility";

// Amplify demo market shocks so UI changes are obvious.
const SHOCK_MULTIPLIER = parseFloat(process.env.SHOCK_MULTIPLIER || "1.5");      // volatile assets get 1.5× shock
const SHOCK_STABLE_DAMPING = parseFloat(process.env.SHOCK_STABLE_DAMPING || "1"); // stable assets damped ×1 (no dampening)

// ─────────────────────────────────────────────
// Multi-company endpoints
// ─────────────────────────────────────────────

// GET /api/companies — list all companies with summary
router.get("/api/companies", (_req: Request, res: Response) => {
  const companies = store.companies.map(c => ({
    id: c.id,
    name: c.name,
    address: c.address,
    riskProfile: c.riskProfile,
    telemetry: c.telemetry,
  }));
  res.json(companies);
});

// GET /api/company/:id/status — per-company status
router.get("/api/company/:id/status", (req: Request, res: Response) => {
  const company = store.getCompany(req.params.id);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const t = company.telemetry;
  res.json({
    agentEnabled: t.agentEnabled,
    status: t.status,
    lastReason: t.lastReason,
    nextTickAt: t.nextTickAt,
    snapshot: t.lastSnapshot,
    company: {
      id: company.id,
      name: company.name,
      riskProfile: company.riskProfile,
      policy: company.policy,
    },
  });
});

// GET /api/company/:id/logs — per-company action logs
router.get("/api/company/:id/logs", (req: Request, res: Response) => {
  const logs = store.getCompanyLogs(req.params.id);
  res.json(logs);
});

// POST /api/company/:id/tick — manually trigger one tick for a specific company
router.post("/api/company/:id/tick", async (req: Request, res: Response) => {
  try {
    const companyId = req.params.id;
    const company = store.getCompany(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await companyAgentTick(companyId);
    res.json({ executed: true, telemetry: company.telemetry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/platform/summary — aggregate across all companies
router.get("/api/platform/summary", async (_req: Request, res: Response) => {
  try {
    // Fetch per-company oracle prices in parallel
    const oraclesBySymbol: Record<string, Awaited<ReturnType<typeof stork.getPriceForSymbol>>> = {};
    await Promise.all(
      store.companies.map(async c => {
        const sym = c.oracleSymbol || "USDCUSD";
        if (!oraclesBySymbol[sym]) {
          oraclesBySymbol[sym] = await stork.getPriceForSymbol(sym);
        }
      })
    );

    let totalCollateralValue = 0;
    let totalDebt = 0;
    let totalLiquidity = 0;
    let totalReserve = 0;
    let totalYield = 0;
    let worstHF = 999;
    let anyRiskMode = false;

    const companySummaries = store.companies.map(c => {
      const sym = c.oracleSymbol || "USDCUSD";
      const oracle = oraclesBySymbol[sym];
      const collValue = c.collateralUnits * (oracle?.price ?? 1);
      const maxBorrow = collValue * (c.policy.ltvBps / 10000);
      const hf = c.debtUSDC > 0.01 ? maxBorrow / c.debtUSDC : 999;

      totalCollateralValue += collValue;
      totalDebt += c.debtUSDC;
      totalLiquidity += c.liquidityUSDC;
      totalReserve += c.reserveUSDC;
      totalYield += c.yieldUSDC;
      if (hf < worstHF) worstHF = hf;
      if (c.telemetry.status === "Risk Mode") anyRiskMode = true;

      return {
        id: c.id,
        name: c.name,
        riskProfile: c.riskProfile,
        collateralValue: collValue,
        collateralAsset: c.collateralAsset || "RWA",
        oracleSymbol: sym,
        oraclePrice: oracle?.price ?? 1,
        debt: c.debtUSDC,
        healthFactor: hf,
        liquidity: c.liquidityUSDC,
        reserve: c.reserveUSDC,
        status: c.telemetry.status,
        lastReason: c.telemetry.lastReason,
        dailySpentUSDC: c.dailySpentUSDC || 0,
        dailyMaxUSDC: c.policy.dailyMaxUSDC,
      };
    });

    const totalPool = totalLiquidity + totalReserve + totalYield;
    const weightedHF = totalDebt > 0.01
      ? (totalCollateralValue * (6000 / 10000)) / totalDebt  // approximate weighted avg
      : 999;

    // Use a representative oracle (BTC as platform oracle since it's most volatile)
    const platformOracle = oraclesBySymbol["BTCUSD"] || oraclesBySymbol["ETHUSD"] || oraclesBySymbol["USDCUSD"] || { price: 1, ts: Date.now(), source: "sim", stale: false };

    res.json({
      totalCollateralValue,
      totalDebt,
      totalLiquidity: totalPool,
      weightedHealthFactor: weightedHF,
      worstHealthFactor: worstHF,
      systemRisk: anyRiskMode ? "critical" : worstHF < 1.4 ? "warning" : "healthy",
      companies: companySummaries,
      oracle: {
        price: platformOracle.price,
        ts: platformOracle.ts,
        source: platformOracle.source,
        stale: platformOracle.stale,
        changePct: store.getChangePct(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Market Shock endpoint (for demo)
// ─────────────────────────────────────────────

// POST /api/demo/shock — simulate a market price shock across all company collateral assets
// Atlas (T-Bill/USDC) gets a 10× dampened shock; Northwind (ETH) and Harbor (BTC) get full shock.
// This illustrates real RWA differentiation: stable collateral weathers shocks better.
router.post("/api/demo/shock", async (req: Request, res: Response) => {
  try {
    const { pct } = req.body;
    if (typeof pct !== "number" || !Number.isFinite(pct)) {
      res.status(400).json({ error: "pct (percentage) is required, e.g. -15 for a 15% drop" });
      return;
    }

    // Collect all unique oracle symbols used by companies
    const symbols = [...new Set(store.companies.map(c => c.oracleSymbol || "USDCUSD"))];

    // Fetch current price for each symbol, then apply shock
    const shockResults: Record<string, { base: number; shocked: number; symbol: string }> = {};
    for (const sym of symbols) {
      const current = await stork.getPriceForSymbol(sym);
      // Apply amplified shock for volatile assets; optional dampening for stables.
      const effectivePct = sym === "USDCUSD" ? pct * SHOCK_STABLE_DAMPING : pct * SHOCK_MULTIPLIER;
      const shockedPrice = current.price * (1 + effectivePct / 100);
      if (shockedPrice <= 0) continue;
      stork.setSimulatedPriceForSymbol(sym, shockedPrice);
      shockResults[sym] = { base: current.price, shocked: shockedPrice, symbol: sym };
    }

    // Also seed per-company price history to reflect the shock for volatility calc
    for (const c of store.companies) {
      const sym = c.oracleSymbol || "USDCUSD";
      const r = shockResults[sym];
      if (r) store.seedCompanyShockHistory(c.id, r.base, r.shocked);
    }

    // Run a tick for each company so agents can respond
    const results: any[] = [];
    for (const id of store.getAllCompanyIds()) {
      try {
        const c = store.getCompany(id)!;
        const sym = c.oracleSymbol || "USDCUSD";
        const r = shockResults[sym];
        if (r) {
          const collValue = c.collateralUnits * r.shocked;
          const maxBorrow = collValue * (c.policy.ltvBps / 10000);
          const hf = c.debtUSDC > 0.01 ? maxBorrow / c.debtUSDC : 999;
          const minHealth = c.policy.minHealthBps / 10000;
          if (hf < minHealth) {
            store.updateCompanyTelemetry(id, {
              status: "Risk Mode",
              lastReason: `Price shock ${pct}% (${sym}): HF dropped to ${hf.toFixed(2)} (min ${minHealth.toFixed(2)})`,
            });
          }
        }
        await companyAgentTick(id);
        const updated = store.getCompany(id)!;
        results.push({
          id: updated.id,
          name: updated.name,
          collateralAsset: updated.collateralAsset || "RWA",
          oracleSymbol: sym,
          effectivePct: sym === "USDCUSD" ? pct * 0.1 : pct,
          shockedPrice: shockResults[updated.oracleSymbol || "USDCUSD"]?.shocked,
          status: updated.telemetry.status,
          lastReason: updated.telemetry.lastReason,
          healthFactor: updated.telemetry.lastSnapshot?.healthFactor,
        });
      } catch (err: any) {
        results.push({ id, error: err.message });
      }
    }

    const overrideSecs = Math.round((process.env.STORK_OVERRIDE_TTL_MS ? parseInt(process.env.STORK_OVERRIDE_TTL_MS, 10) : 300000) / 1000);
    res.json({
      shocked: true,
      requestedPct: pct,
      assetShocks: shockResults,
      companyReactions: results,
      note: `Shock applied: stables x${SHOCK_STABLE_DAMPING}, volatile x${SHOCK_MULTIPLIER}. Override lasts ~${overrideSecs}s.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Original endpoints (backwards compatible)
// ─────────────────────────────────────────────

// GET /api/status
router.get("/api/status", async (_req: Request, res: Response) => {
  try {
    const user = (_req.query.user as string) || store.defaultUser;
    const t = store.telemetry;
    res.json({
      agentEnabled: t.agentEnabled,
      status: t.status,
      lastReason: t.lastReason,
      nextTickAt: t.nextTickAt,
      snapshot: t.lastSnapshot,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/start
router.post("/api/agent/start", (_req: Request, res: Response) => {
  const user = store.defaultUser;
  startAgentLoop(user);
  res.json({ started: true });
});

// POST /api/agent/stop
router.post("/api/agent/stop", (_req: Request, res: Response) => {
  stopAgentLoop();
  res.json({ stopped: true });
});

// POST /api/agent/tick
router.post("/api/agent/tick", async (_req: Request, res: Response) => {
  try {
    const user = store.defaultUser;
    await agentTick(user);
    // Also tick all companies
    for (const id of store.getAllCompanyIds()) {
      await companyAgentTick(id);
    }
    res.json({ executed: true, telemetry: store.telemetry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle
router.get("/api/oracle", async (_req: Request, res: Response) => {
  try {
    const data = await stork.getPrice();
    const changePct = store.getChangePct();
    res.json({
      price: data.price,
      ts: data.ts,
      changePct,
      stale: data.stale,
      source: data.source,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/collateral/register
router.post("/api/collateral/register", async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      res.status(400).json({ error: "amount required" });
      return;
    }
    const user = store.defaultUser;
    const amountBigInt = BigInt(Math.round(parseFloat(amount) * 1e18));
    const txHash = await arc.registerCollateral(user, amountBigInt);

    store.addLog({
      ts: Date.now(),
      action: "registerCollateral",
      amountUSDC: amount,
      healthFactor: 999,
      rationale: `Registered ${amount} collateral units`,
      circleTxRef: "",
      arcTxHash: txHash,
    });

    res.json({ txHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payment/request
router.post("/api/payment/request", (req: Request, res: Response) => {
  try {
    const { to, amountUSDC } = req.body;
    if (!to || !amountUSDC) {
      res.status(400).json({ error: "to and amountUSDC required" });
      return;
    }
    const user = store.defaultUser;
    store.queuePayment({
      user,
      to,
      amountUSDC,
      createdAt: Date.now(),
    });
    res.json({ queued: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manual/borrow
router.post("/api/manual/borrow", async (req: Request, res: Response) => {
  try {
    const { user, amountUSDC } = req.body;
    if (!user || !amountUSDC) {
      res.status(400).json({ error: "user and amountUSDC required" });
      return;
    }

    let amount = parseFloat(amountUSDC);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amountUSDC must be a positive number" });
      return;
    }

    const userState = await arc.getUserState(user);
    const policy = await arc.getPolicy();
    const oracle = await stork.getPrice();
    const priceBigInt = stork.priceToBigInt(oracle.price);

    try {
      await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));
    } catch {}

    const collateralValueUSDC = computeCollateralValueUSDC(userState.collateralAmount, priceBigInt);
    const maxBorrowUSDC = computeMaxBorrow(collateralValueUSDC, policy.ltvBps);
    const healthFactor = computeHealthFactor(maxBorrowUSDC, userState.debtUSDC);
    const minHealth = bpsToRatio(policy.minHealthBps);
    const targetHealthRatio = parseFloat(process.env.TARGET_HEALTH || "1.6");
    const emergencyHealth = bpsToRatio(policy.emergencyHealthBps);

    if (healthFactor < minHealth) {
      res.status(403).json({
        error: `Borrow blocked: health factor ${healthFactor.toFixed(2)} < minHealth ${minHealth.toFixed(2)}. Repay debt first.`,
      });
      return;
    }

    if (healthFactor < emergencyHealth) {
      res.status(403).json({
        error: `Borrow blocked: health factor ${healthFactor.toFixed(2)} is in emergency zone (< ${emergencyHealth.toFixed(2)}).`,
      });
      return;
    }

    const rawPerTxMax = Number(policy.perTxMaxUSDC) > 0 ? Number(policy.perTxMaxUSDC) : 10 * 1e6;
    const perTxMax = rawPerTxMax / 1e6;
    if (perTxMax > 0 && amount > perTxMax) {
      res.status(403).json({
        error: `Borrow blocked: amount ${amount.toFixed(2)} exceeds per-transaction max ${perTxMax.toFixed(2)} USDC.`,
      });
      return;
    }

    const currentDebt = Number(userState.debtUSDC) / 1e6;
    const maxBorrow = Number(maxBorrowUSDC) / 1e6;
    const maxAllowedLtv = maxBorrow - currentDebt;
    const maxAllowedTarget = targetHealthRatio > 0
      ? (maxBorrow / targetHealthRatio) - currentDebt
      : maxAllowedLtv;
    const borrowCap = Math.min(maxAllowedLtv, maxAllowedTarget);

    if (borrowCap <= 0.01) {
      res.status(403).json({
        error: `Borrow blocked: no borrowing headroom (debt=${currentDebt.toFixed(2)}, cap=${borrowCap.toFixed(2)}).`,
      });
      return;
    }
    if (amount > borrowCap) {
      res.status(403).json({
        error: `Borrow blocked: amount ${amount.toFixed(2)} exceeds headroom ${borrowCap.toFixed(2)} USDC (targetHealth=${targetHealthRatio.toFixed(2)}).`,
      });
      return;
    }

    const amountBigInt = numberToUSDC(amount);
    const result = await circle.transfer("creditFacility", "liquidity", amount);
    const arcTxHash = await arc.recordBorrow(user, amountBigInt, result.circleTxRef);

    try {
      const rHash = rationaleHash(`Manual borrow of ${amount} USDC`);
      await arc.logDecision(
        JSON.stringify({ manual: true, amount, healthFactor: healthFactor.toFixed(4) }),
        `borrow:${amount}`,
        rHash
      );
    } catch {}

    store.addLog({
      ts: Date.now(),
      action: "borrow",
      amountUSDC: amount.toFixed(6),
      healthFactor,
      rationale: `Manual borrow of ${amount} USDC (HF=${healthFactor.toFixed(2)})`,
      circleTxRef: result.circleTxRef,
      arcTxHash,
    });

    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manual/repay
router.post("/api/manual/repay", async (req: Request, res: Response) => {
  try {
    const { user, amountUSDC } = req.body;
    if (!user || !amountUSDC) {
      res.status(400).json({ error: "user and amountUSDC required" });
      return;
    }

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);

    const state = await arc.getUserState(user);
    if (amountBigInt > state.debtUSDC) {
      const debtReadable = (Number(state.debtUSDC) / 1e6).toFixed(6);
      res
        .status(400)
        .json({ error: `Repay exceeds debt. Current debt: ${debtReadable} USDC` });
      return;
    }

    const result = await circle.transfer("liquidity", "creditFacility", amount);
    const arcTxHash = await arc.recordRepay(user, amountBigInt, result.circleTxRef);

    try {
      const rHash = rationaleHash(`Manual repay of ${amountUSDC} USDC`);
      await arc.logDecision(
        JSON.stringify({ manual: true, amount: amountUSDC }),
        `repay:${amountUSDC}`,
        rHash
      );
    } catch {}

    store.addLog({
      ts: Date.now(),
      action: "repay",
      amountUSDC,
      healthFactor: 0,
      rationale: `Manual repay of ${amountUSDC} USDC`,
      circleTxRef: result.circleTxRef,
      arcTxHash,
    });

    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/reset
router.post("/api/user/reset", async (req: Request, res: Response) => {
  try {
    const { user } = req.body;
    if (!user) {
      res.status(400).json({ error: "user required" });
      return;
    }

    const arcTxHash = await arc.resetUser(user);
    store.clearPendingPayments();

    store.addLog({
      ts: Date.now(),
      action: "resetUser",
      amountUSDC: "0",
      healthFactor: 0,
      rationale: `Reset user state for ${user}`,
      circleTxRef: "",
      arcTxHash,
    });

    res.json({ arcTxHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manual/rebalance
router.post("/api/manual/rebalance", async (req: Request, res: Response) => {
  try {
    const { user, fromBucket, toBucket, amountUSDC } = req.body;
    if (!user || !fromBucket || !toBucket || !amountUSDC) {
      res
        .status(400)
        .json({ error: "user, fromBucket, toBucket, amountUSDC required" });
      return;
    }

    const validBuckets: BucketName[] = [
      "liquidity",
      "reserve",
      "yield",
      "creditFacility",
    ];
    if (
      !validBuckets.includes(fromBucket) ||
      !validBuckets.includes(toBucket)
    ) {
      res.status(400).json({ error: "invalid bucket" });
      return;
    }

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);

    const result = await circle.transfer(fromBucket, toBucket, amount);

    const arcTxHash = await arc.recordRebalance(
      fromBucket,
      toBucket,
      amountBigInt,
      result.circleTxRef
    );

    const rationale = `Manual rebalance ${amountUSDC} from ${fromBucket} to ${toBucket}`;
    const rHash = rationaleHash(rationale);
    await arc.logDecision(
      JSON.stringify({ manual: true, amount: amountUSDC, fromBucket, toBucket }),
      `rebalance:${amountUSDC}`,
      rHash
    );

    store.addLog({
      ts: Date.now(),
      action: "rebalance",
      amountUSDC,
      healthFactor: 0,
      rationale,
      circleTxRef: result.circleTxRef,
      arcTxHash,
    });

    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs
router.get("/api/logs", (_req: Request, res: Response) => {
  res.json(store.actionLogs);
});

// POST /api/oracle/override
router.post("/api/oracle/override", (req: Request, res: Response) => {
  const { price } = req.body;
  if (typeof price !== "number" || price <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }
  stork.setSimulatedPrice(price);
  store.resetPriceHistory();
  res.json({ overridden: true, price });
});

// POST /api/oracle/override/delta
router.post("/api/oracle/override/delta", async (req: Request, res: Response) => {
  try {
    const { pct } = req.body;
    if (typeof pct !== "number" || !Number.isFinite(pct)) {
      res.status(400).json({ error: "pct (percentage) is required and must be a number" });
      return;
    }
    const current = await stork.getPrice();
    const price = current.price * (1 + pct / 100);
    if (price <= 0) {
      res.status(400).json({ error: "computed price is non-positive; choose a smaller negative pct" });
      return;
    }
    stork.setSimulatedPrice(price);
    store.resetPriceHistory();
    const overrideSecs = Math.round((process.env.STORK_OVERRIDE_TTL_MS ? parseInt(process.env.STORK_OVERRIDE_TTL_MS, 10) : 300000) / 1000);
    res.json({
      overridden: true,
      basePrice: current.price,
      pct,
      price,
      note: `Override lasts ~${overrideSecs}s (STORK_OVERRIDE_TTL_MS) before live Stork resumes`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/policy/set
router.post("/api/policy/set", async (req: Request, res: Response) => {
  try {
    const {
      ltvBps = 6000,
      minHealthBps = 14000,
      emergencyHealthBps = 12000,
      liquidityMinUSDC = 500,
      perTxMaxUSDC = 10000,
      dailyMaxUSDC = 50000,
    } = req.body;

    const txHash = await arc.setPolicy(
      ltvBps,
      minHealthBps,
      emergencyHealthBps,
      BigInt(Math.round(liquidityMinUSDC * 1e6)),
      BigInt(Math.round(perTxMaxUSDC * 1e6)),
      BigInt(Math.round(dailyMaxUSDC * 1e6))
    );
    res.json({ txHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/policy
router.get("/api/policy", async (_req: Request, res: Response) => {
  try {
    const policy = await arc.getPolicy();

    const liquidityMinUSDC = Number(policy.liquidityMinUSDC) > 0
      ? Number(policy.liquidityMinUSDC) / 1e6
      : 5;
    const perTxMaxUSDC = Number(policy.perTxMaxUSDC) > 0
      ? Number(policy.perTxMaxUSDC) / 1e6
      : 10;
    const dailyMaxUSDC = Number(policy.dailyMaxUSDC) > 0
      ? Number(policy.dailyMaxUSDC) / 1e6
      : 50;

    res.json({
      ltvBps: policy.ltvBps,
      minHealthBps: policy.minHealthBps,
      emergencyHealthBps: policy.emergencyHealthBps,
      liquidityMinUSDC,
      perTxMaxUSDC,
      dailyMaxUSDC,
      liquidityTargetRatio: parseFloat(process.env.LIQUIDITY_TARGET_RATIO || "0.25"),
      reserveRatio: parseFloat(process.env.RESERVE_RATIO || "0.30"),
      volatilityThresholdPct: parseFloat(process.env.VOL_THRESHOLD_PCT || "3"),
      targetHealthRatio: parseFloat(process.env.TARGET_HEALTH || "1.6"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/policy/update
router.post("/api/policy/update", (req: Request, res: Response) => {
  try {
    const {
      liquidityTargetRatio,
      reserveRatio,
      volatilityThresholdPct,
      targetHealthRatio,
    } = req.body;

    if (liquidityTargetRatio !== undefined) {
      const v = parseFloat(liquidityTargetRatio);
      if (v < 0 || v > 1) {
        res.status(400).json({ error: "liquidityTargetRatio must be 0-1" });
        return;
      }
      process.env.LIQUIDITY_TARGET_RATIO = v.toString();
    }
    if (reserveRatio !== undefined) {
      const v = parseFloat(reserveRatio);
      if (v < 0 || v > 1) {
        res.status(400).json({ error: "reserveRatio must be 0-1" });
        return;
      }
      process.env.RESERVE_RATIO = v.toString();
    }
    if (volatilityThresholdPct !== undefined) {
      const v = parseFloat(volatilityThresholdPct);
      if (v <= 0 || v > 100) {
        res.status(400).json({ error: "volatilityThresholdPct must be 0-100" });
        return;
      }
      process.env.VOL_THRESHOLD_PCT = v.toString();
    }
    if (targetHealthRatio !== undefined) {
      const v = parseFloat(targetHealthRatio);
      if (v < 1) {
        res.status(400).json({ error: "targetHealthRatio must be >= 1" });
        return;
      }
      process.env.TARGET_HEALTH = v.toString();
    }

    res.json({
      updated: true,
      liquidityTargetRatio: parseFloat(process.env.LIQUIDITY_TARGET_RATIO || "0.25"),
      reserveRatio: parseFloat(process.env.RESERVE_RATIO || "0.30"),
      volatilityThresholdPct: parseFloat(process.env.VOL_THRESHOLD_PCT || "3"),
      targetHealthRatio: parseFloat(process.env.TARGET_HEALTH || "1.6"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/companies/reset — reset all companies to defaults and clear oracle override
router.post("/api/companies/reset", (_req: Request, res: Response) => {
  store.resetCompanies();
  store.resetPriceHistory();
  stork.clearSimulatedPrice();
  res.json({ reset: true });
});

export default router;
