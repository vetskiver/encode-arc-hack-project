import { Router, Request, Response } from "express";
import { store } from "./store";
import { startAgentLoop, stopAgentLoop } from "./agent/agentLoop";
import { agentTick } from "./agent/agentTick";
import * as arc from "./integrations/arc";
import * as circle from "./integrations/circle";
import * as stork from "./integrations/stork";
import { parseUSDC, formatUSDC, numberToUSDC } from "./integrations/usdc";
import { rationaleHash } from "./utils/hash";
import {
  computeCollateralValueUSDC,
  computeMaxBorrow,
  computeHealthFactor,
} from "./utils/math";

const router = Router();

// GET /api/status
router.get("/api/status", async (_req: Request, res: Response) => {
  try {
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
    res.json({ executed: true, telemetry: store.telemetry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle
router.get("/api/oracle", async (_req: Request, res: Response) => {
  try {
    const data = await stork.getPrice();
    store.addPrice(data.price, data.ts);
    const changePct = store.getChangePct();
    res.json({
      price: data.price,
      ts: data.ts,
      changePct,
      stale: data.stale,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/collateral/register
router.post("/api/collateral/register", async (req: Request, res: Response) => {
  try {
    const { user, amount } = req.body;
    if (!user || !amount) {
      res.status(400).json({ error: "user and amount required" });
      return;
    }
    // amount is in human-readable units (e.g., "1000" = 1000 tokens with 18 decimals)
    const amountBigInt = BigInt(Math.round(parseFloat(amount) * 1e18));
    const txHash = await arc.registerCollateral(user, amountBigInt);

    // Update default user if needed
    store.defaultUser = user;

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
    const { user, to, amountUSDC } = req.body;
    if (!user || !to || !amountUSDC) {
      res.status(400).json({ error: "user, to, and amountUSDC required" });
      return;
    }
    store.queuePayment({
      user,
      to,
      amountUSDC,
      createdAt: Date.now(),
    });
    store.defaultUser = user;
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

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);

    // Set oracle snapshot first
    const oracle = await stork.getPrice();
    const priceBigInt = stork.priceToBigInt(oracle.price);
    await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));

    // Circle transfer: CreditFacility -> Liquidity
    const result = await circle.transfer("creditFacility", "liquidity", amount);

    // Record on Arc
    const arcTxHash = await arc.recordBorrow(user, amountBigInt, result.circleTxRef);

    // Log decision
    const rHash = rationaleHash(`Manual borrow of ${amountUSDC} USDC`);
    await arc.logDecision(
      JSON.stringify({ manual: true, amount: amountUSDC }),
      `borrow:${amountUSDC}`,
      rHash
    );

    store.addLog({
      ts: Date.now(),
      action: "borrow",
      amountUSDC,
      healthFactor: 0,
      rationale: `Manual borrow of ${amountUSDC} USDC`,
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

    // Circle transfer: Liquidity -> CreditFacility
    const result = await circle.transfer("liquidity", "creditFacility", amount);

    // Record on Arc
    const arcTxHash = await arc.recordRepay(user, amountBigInt, result.circleTxRef);

    // Log decision
    const rHash = rationaleHash(`Manual repay of ${amountUSDC} USDC`);
    await arc.logDecision(
      JSON.stringify({ manual: true, amount: amountUSDC }),
      `repay:${amountUSDC}`,
      rHash
    );

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

// GET /api/logs
router.get("/api/logs", (_req: Request, res: Response) => {
  res.json(store.actionLogs);
});

// POST /api/oracle/override — for demo purposes
router.post("/api/oracle/override", (req: Request, res: Response) => {
  const { price } = req.body;
  if (typeof price !== "number" || price <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }
  stork.setSimulatedPrice(price);
  res.json({ overridden: true, price });
});

export default router;
