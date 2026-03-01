import { Router, Request, Response } from "express";
import { Redis } from "@upstash/redis";
import { store } from "./store";
import { startAgentLoop, stopAgentLoop } from "./agent/agentLoop";
import { agentTick } from "./agent/agentTick";
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

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// GET /api/status
router.get("/api/status", async (_req: Request, res: Response) => {
  try {
    const t = await store.getTelemetry();
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
router.post("/api/agent/start", async (_req: Request, res: Response) => {
  const user = store.defaultUser;
  startAgentLoop(user);
  await store.updateTelemetry({ agentEnabled: true });
  res.json({ started: true });
});

// POST /api/agent/stop
router.post("/api/agent/stop", async (_req: Request, res: Response) => {
  stopAgentLoop();
  await store.updateTelemetry({ agentEnabled: false });
  res.json({ stopped: true });
});

// POST /api/agent/tick
router.post("/api/agent/tick", async (_req: Request, res: Response) => {
  try {
    const user = store.defaultUser;
    await agentTick(user);
    const telemetry = await store.getTelemetry();
    res.json({ executed: true, telemetry });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/oracle
router.get("/api/oracle", async (_req: Request, res: Response) => {
  try {
    const data = await stork.getPrice();
    const changePct = await store.getChangePct();
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

    await store.addLog({
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
router.post("/api/payment/request", async (req: Request, res: Response) => {
  try {
    const { to, amountUSDC } = req.body;
    if (!to || !amountUSDC) {
      res.status(400).json({ error: "to and amountUSDC required" });
      return;
    }
    const user = store.defaultUser;
    await store.queuePayment({
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

    await store.addLog({
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
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amountUSDC must be a positive number" });
      return;
    }

    const amountBigInt = numberToUSDC(amount);
    const result = await circle.transfer("liquidity", "creditFacility", amount);
    const arcTxHash = await arc.recordRepay(user, amountBigInt, result.circleTxRef);

    try {
      const rHash = rationaleHash(`Manual repay of ${amount} USDC`);
      await arc.logDecision(
        JSON.stringify({ manual: true, amount }),
        `repay:${amount}`,
        rHash
      );
    } catch {}

    await store.addLog({
      ts: Date.now(),
      action: "repay",
      amountUSDC: amount.toFixed(6),
      healthFactor: 0,
      rationale: `Manual repay of ${amount} USDC`,
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
    await store.clearPendingPayments();

    await store.addLog({
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
      res.status(400).json({ error: "user, fromBucket, toBucket, amountUSDC required" });
      return;
    }

    const validBuckets: BucketName[] = ["liquidity", "reserve", "yield", "creditFacility"];
    if (!validBuckets.includes(fromBucket) || !validBuckets.includes(toBucket)) {
      res.status(400).json({ error: "invalid bucket" });
      return;
    }

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);
    const result = await circle.transfer(fromBucket, toBucket, amount);
    const arcTxHash = await arc.recordRebalance(fromBucket, toBucket, amountBigInt, result.circleTxRef);

    const rationale = `Manual rebalance ${amountUSDC} from ${fromBucket} to ${toBucket}`;
    const rHash = rationaleHash(rationale);
    await arc.logDecision(
      JSON.stringify({ manual: true, amount: amountUSDC, fromBucket, toBucket }),
      `rebalance:${amountUSDC}`,
      rHash
    );

    await store.addLog({
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
router.get("/api/logs", async (_req: Request, res: Response) => {
  try {
    const logs = await store.getActionLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/oracle/override
router.post("/api/oracle/override", async (req: Request, res: Response) => {
  try {
    const { price } = req.body;
    if (typeof price !== "number" || price <= 0) {
      res.status(400).json({ error: "price must be a positive number" });
      return;
    }
    stork.setSimulatedPrice(price);
    await store.resetPriceHistory();
    res.json({ overridden: true, price });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
    await store.resetPriceHistory();
    res.json({
      overridden: true,
      basePrice: current.price,
      pct,
      price,
      note: "Override lasts ~60s (OVERRIDE_TTL_MS) before live Stork resumes",
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
    const redis = getRedis();
    const policy = await arc.getPolicy();

    const liquidityMinUSDC = Number(policy.liquidityMinUSDC) > 0 ? Number(policy.liquidityMinUSDC) / 1e6 : 5;
    const perTxMaxUSDC = Number(policy.perTxMaxUSDC) > 0 ? Number(policy.perTxMaxUSDC) / 1e6 : 10;
    const dailyMaxUSDC = Number(policy.dailyMaxUSDC) > 0 ? Number(policy.dailyMaxUSDC) / 1e6 : 50;

    const [ltrRaw, rrRaw, volRaw, thRaw] = await Promise.all([
      redis.get<string>("policy:liquidityTargetRatio"),
      redis.get<string>("policy:reserveRatio"),
      redis.get<string>("policy:volatilityThresholdPct"),
      redis.get<string>("policy:targetHealthRatio"),
    ]);

    res.json({
      ltvBps: policy.ltvBps,
      minHealthBps: policy.minHealthBps,
      emergencyHealthBps: policy.emergencyHealthBps,
      liquidityMinUSDC,
      perTxMaxUSDC,
      dailyMaxUSDC,
      liquidityTargetRatio: parseFloat(ltrRaw ?? process.env.LIQUIDITY_TARGET_RATIO ?? "0.25"),
      reserveRatio: parseFloat(rrRaw ?? process.env.RESERVE_RATIO ?? "0.30"),
      volatilityThresholdPct: parseFloat(volRaw ?? process.env.VOL_THRESHOLD_PCT ?? "3"),
      targetHealthRatio: parseFloat(thRaw ?? process.env.TARGET_HEALTH ?? "1.6"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/policy/update — persists to Redis so it survives across serverless invocations
router.post("/api/policy/update", async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const { liquidityTargetRatio, reserveRatio, volatilityThresholdPct, targetHealthRatio } = req.body;

    if (liquidityTargetRatio !== undefined) {
      const v = parseFloat(liquidityTargetRatio);
      if (v < 0 || v > 1) { res.status(400).json({ error: "liquidityTargetRatio must be 0-1" }); return; }
      await redis.set("policy:liquidityTargetRatio", v.toString());
    }
    if (reserveRatio !== undefined) {
      const v = parseFloat(reserveRatio);
      if (v < 0 || v > 1) { res.status(400).json({ error: "reserveRatio must be 0-1" }); return; }
      await redis.set("policy:reserveRatio", v.toString());
    }
    if (volatilityThresholdPct !== undefined) {
      const v = parseFloat(volatilityThresholdPct);
      if (v <= 0 || v > 100) { res.status(400).json({ error: "volatilityThresholdPct must be 0-100" }); return; }
      await redis.set("policy:volatilityThresholdPct", v.toString());
    }
    if (targetHealthRatio !== undefined) {
      const v = parseFloat(targetHealthRatio);
      if (v < 1) { res.status(400).json({ error: "targetHealthRatio must be >= 1" }); return; }
      await redis.set("policy:targetHealthRatio", v.toString());
    }

    const [ltrRaw, rrRaw, volRaw, thRaw] = await Promise.all([
      redis.get<string>("policy:liquidityTargetRatio"),
      redis.get<string>("policy:reserveRatio"),
      redis.get<string>("policy:volatilityThresholdPct"),
      redis.get<string>("policy:targetHealthRatio"),
    ]);

    res.json({
      updated: true,
      liquidityTargetRatio: parseFloat(ltrRaw ?? process.env.LIQUIDITY_TARGET_RATIO ?? "0.25"),
      reserveRatio: parseFloat(rrRaw ?? process.env.RESERVE_RATIO ?? "0.30"),
      volatilityThresholdPct: parseFloat(volRaw ?? process.env.VOL_THRESHOLD_PCT ?? "3"),
      targetHealthRatio: parseFloat(thRaw ?? process.env.TARGET_HEALTH ?? "1.6"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
