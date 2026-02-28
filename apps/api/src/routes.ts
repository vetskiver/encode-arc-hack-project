import { Router, Request, Response } from "express";
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

    let amount = parseFloat(amountUSDC);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amountUSDC must be a positive number" });
      return;
    }

    // --- Safety checks: same rules as agent ---
    const userState = await arc.getUserState(user);
    const policy = await arc.getPolicy();

    // Get current oracle price to compute health factor
    const oracle = await stork.getPrice();
    const priceBigInt = stork.priceToBigInt(oracle.price);

    // Update oracle snapshot on contract (non-fatal)
    try {
      await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));
    } catch {}

    const collateralValueUSDC = computeCollateralValueUSDC(
      userState.collateralAmount,
      priceBigInt
    );
    const maxBorrowUSDC = computeMaxBorrow(collateralValueUSDC, policy.ltvBps);
    const healthFactor = computeHealthFactor(maxBorrowUSDC, userState.debtUSDC);
    const minHealth = bpsToRatio(policy.minHealthBps);
    const targetHealthRatio = parseFloat(process.env.TARGET_HEALTH || "1.6");
    const emergencyHealthBps = policy.emergencyHealthBps;
    const emergencyHealth = bpsToRatio(emergencyHealthBps);

    // Block borrow if HF < minHealth or in emergency
    if (healthFactor < minHealth) {
      res.status(403).json({
        error: `Borrow blocked: health factor ${healthFactor.toFixed(2)} < minHealth ${minHealth.toFixed(2)}. Repay debt first.`,
      });
      return;
    }

    // Block borrow in emergency mode
    if (healthFactor < emergencyHealth) {
      res.status(403).json({
        error: `Borrow blocked: health factor ${healthFactor.toFixed(2)} is in emergency zone (< ${emergencyHealth.toFixed(2)}).`,
      });
      return;
    }

    // Per-tx max check
    const rawPerTxMax = Number(policy.perTxMaxUSDC) > 0
      ? Number(policy.perTxMaxUSDC)
      : 10 * 1e6;
    const perTxMax = rawPerTxMax / 1e6;
    if (perTxMax > 0 && amount > perTxMax) {
      res.status(403).json({
        error: `Borrow blocked: amount ${amount.toFixed(2)} exceeds per-transaction max ${perTxMax.toFixed(2)} USDC.`,
      });
      return;
    }

    // targetHealth headroom check — cap borrow to maintain targetHealth
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

    // --- Safety passed — execute borrow ---
    const amountBigInt = numberToUSDC(amount);

    // Circle transfer: CreditFacility -> Liquidity
    const result = await circle.transfer("creditFacility", "liquidity", amount);

    // Record on Arc
    const arcTxHash = await arc.recordBorrow(user, amountBigInt, result.circleTxRef);

    // Log decision (non-fatal)
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

    // Pre-check to avoid revert: don’t let user repay more than current debt
    const state = await arc.getUserState(user);
    if (amountBigInt > state.debtUSDC) {
      const debtReadable = (Number(state.debtUSDC) / 1e6).toFixed(6);
      res
        .status(400)
        .json({ error: `Repay exceeds debt. Current debt: ${debtReadable} USDC` });
      return;
    }

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
    // Also clear any pending vendor payments locally so UI matches on-chain reset
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

// POST /api/oracle/override/delta — apply percentage drift for 60s (pauses Stork fetch)
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

// GET /api/policy — V2: return current policy parameters (on-chain + env)
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

// POST /api/policy/update — V2: update env-driven policy parameters at runtime
router.post("/api/policy/update", (req: Request, res: Response) => {
  try {
    const {
      liquidityTargetRatio,
      reserveRatio,
      volatilityThresholdPct,
      targetHealthRatio,
    } = req.body;

    // Validate and apply updates
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

export default router;
