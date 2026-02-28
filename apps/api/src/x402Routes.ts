import { Router } from "express";
import { createGatewayMiddleware } from "@circlefin/x402-batching/server";
import type { PaymentRequest } from "@circlefin/x402-batching/server";
import { store } from "./store";

/**
 * x402 paywalled routes using Circle Gateway batching middleware.
 *
 * - Responds with HTTP 402 until the client pays via Gateway.
 * - After payment, middleware verifies and settles automatically, then
 *   attaches `req.payment` with payer/amount/tx info.
 */
const router = Router();

// Seller wallet that receives payments (EVM address)
const sellerAddress =
  process.env.X402_SELLER_ADDRESS ||
  process.env.DEFAULT_COMPANY_ADDRESS ||
  store.defaultUser;

// Optional comma-separated CAIP-2 network list, e.g. "eip155:5042002,eip155:84532"
const networks = (process.env.X402_NETWORKS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const facilitatorUrl = process.env.X402_FACILITATOR_URL; // optional override
const description =
  process.env.X402_DESCRIPTION || "Paid endpoint protected by Circle Gateway x402 batching";
const price = process.env.X402_PRICE || "$0.01";

// Create Gateway middleware (defaults to all Gateway-supported networks when none provided)
const gateway = createGatewayMiddleware({
  sellerAddress,
  networks: networks.length > 0 ? networks : undefined,
  facilitatorUrl,
  description,
});

// Simple paid resource
router.get("/api/paywall/hello", gateway.require(price), (req, res) => {
  const payment = (req as PaymentRequest).payment;
  res.json({
    message: "Paid content unlocked",
    payer: payment?.payer,
    amount: payment?.amount,
    network: payment?.network,
    transaction: payment?.transaction,
  });
});

// Health endpoint (no payment)
router.get("/api/paywall/health", (_req, res) => {
  res.json({ ok: true, price, sellerAddress, networks: networks.length > 0 ? networks : "all" });
});

export default router;
