import { Router, Request, Response } from "express";
import { store } from "./store";
import { startAgentLoop, stopAgentLoop } from "./agent/agentLoop";
import { agentTick } from "./agent/agentTick";
import * as arc from "./integrations/arc";
import * as circle from "./integrations/circle";
import * as stork from "./integrations/stork";
import { numberToUSDC } from "./integrations/usdc";
import { rationaleHash } from "./utils/hash";

const router = Router();
type BucketName = "liquidity" | "reserve" | "yield" | "creditFacility";

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
    res.json({ executed: true, telemetry: store.telemetry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle
router.get("/api/oracle", async (_req: Request, res: Response) => {
  try {
    const data = await stork.getPrice();
    // NOTE: do NOT call store.addPrice here — agentTick already does it.
    // Calling it here too causes double-entries and inflated changePct.
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
    // amount readable units -> store as 18-decimal bigint on contract
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

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);

    // Update oracle snapshot (non-fatal)
    try {
      const oracle = await stork.getPrice();
      const priceBigInt = stork.priceToBigInt(oracle.price);
      await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));
    } catch {}

    // Circle transfer: CreditFacility -> Liquidity
    const result = await circle.transfer("creditFacility", "liquidity", amount);

    // Record on Arc
    const arcTxHash = await arc.recordBorrow(user, amountBigInt, result.circleTxRef);

    // Log decision (non-fatal)
    try {
      const rHash = rationaleHash(`Manual borrow of ${amountUSDC} USDC`);
      await arc.logDecision(
        JSON.stringify({ manual: true, amount: amountUSDC }),
        `borrow:${amountUSDC}`,
        rHash
      );
    } catch {}

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

    // Log decision (non-fatal)
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

    // Circle transfer between buckets
    const result = await circle.transfer(fromBucket, toBucket, amount);

    // Record on Arc
    const arcTxHash = await arc.recordRebalance(
      fromBucket,
      toBucket,
      amountBigInt,
      result.circleTxRef
    );

    // Log decision
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

// POST /api/oracle/override —  demo purposes
// *CHECK* also resets price history so changePct doesn't spike from old prices
router.post("/api/oracle/override", (req: Request, res: Response) => {
  const { price } = req.body;
  if (typeof price !== "number" || price <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }
  stork.setSimulatedPrice(price);
  // Reset price history so the change is computed cleanly from this new base
  store.resetPriceHistory();
  res.json({ overridden: true, price });
});

// POST /api/policy/set — for demo setup, sets policy on contract
router.post("/api/policy/set", async (req: Request, res: Response) => {
  try {
    const {
      ltvBps = 6000,
      minHealthBps = 14000,
      emergencyHealthBps = 12000,
      liquidityMinUSDC = 500,   // dollar amount
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

router.post("/api/user/reset", async (req: Request, res: Response) => {
  try {
    const user = req.body.user || store.defaultUser;
    const txHash = await arc.resetUser(user);
    store.addLog({
      ts: Date.now(), action: "RESET", amountUSDC: "0",
      healthFactor: 999, rationale: `User state reset`,
      circleTxRef: "", arcTxHash: txHash,
    });
    res.json({ txHash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
