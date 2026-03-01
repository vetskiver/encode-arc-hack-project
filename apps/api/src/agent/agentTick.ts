import { Redis } from "@upstash/redis";
import * as arc from "../integrations/arc";
import * as circle from "../integrations/circle";
import * as stork from "../integrations/stork";
import { getYieldRate } from "../integrations/yield";
import { store } from "../store";
import { planner } from "./planner";
import { safetyController, Snapshot } from "./safetyController";
import { executeAction } from "./executor";
import { setStatus, setLastReason, setLastSnapshot } from "./telemetry";
import {
  computeCollateralValueUSDC,
  computeMaxBorrow,
  computeHealthFactor,
  formatUSDC,
  bpsToRatio,
} from "../utils/math";
import { rationaleHash } from "../utils/hash";

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

export async function agentTick(user: string): Promise<void> {
  console.log("[AgentTick] Starting tick for user:", user);
  setStatus("Executing");

  try {
    // 1. Read Arc state
    const userState = await arc.getUserState(user);
    const policy = await arc.getPolicy();

    // 2. Read Stork price + validate
    const oracle = await stork.getPrice();
    if (oracle.price <= 0) {
      setStatus("Risk Mode");
      setLastReason("Oracle returned invalid price");
      return;
    }
    if (oracle.stale) {
      console.warn("[AgentTick] Oracle data is stale, proceeding with caution");
    }

    // Store price in history
    await store.addPrice(oracle.price, oracle.ts);
    const changePct = await store.getChangePct();

    // Update oracle snapshot on contract — non-fatal
    const priceBigInt = stork.priceToBigInt(oracle.price);
    try {
      await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));
    } catch (oracleErr: any) {
      console.warn("[AgentTick] setOracleSnapshot failed (non-fatal):", oracleErr.message);
    }

    // 3. Read Circle balances
    const liquidityUSDC = await circle.getBalance("liquidity");
    const reserveUSDC = await circle.getBalance("reserve");
    const yieldUSDC = await circle.getBalance("yield");

    // 3b. Read yield rate feed
    const yieldData = await getYieldRate();

    // 4. Compute snapshot metrics
    const collateralValueUSDC = computeCollateralValueUSDC(userState.collateralAmount, priceBigInt);
    const maxBorrowUSDC = computeMaxBorrow(collateralValueUSDC, policy.ltvBps);
    const healthFactor = computeHealthFactor(maxBorrowUSDC, userState.debtUSDC);

    const pending = await store.getPendingPayment();

    // --- V2 policy extensions: read from Redis, fall back to env ---
    const redis = getRedis();
    const [ltrRaw, rrRaw, volRaw, thRaw] = await Promise.all([
      redis.get<string>("policy:liquidityTargetRatio"),
      redis.get<string>("policy:reserveRatio"),
      redis.get<string>("policy:volatilityThresholdPct"),
      redis.get<string>("policy:targetHealthRatio"),
    ]);
    const liquidityTargetRatio = parseFloat(ltrRaw ?? process.env.LIQUIDITY_TARGET_RATIO ?? "0.25");
    const reserveRatio = parseFloat(rrRaw ?? process.env.RESERVE_RATIO ?? "0.30");
    const targetHealthRatio = parseFloat(thRaw ?? process.env.TARGET_HEALTH ?? "1.6");
    const volatilityThresholdPct = parseFloat(volRaw ?? process.env.VOL_THRESHOLD_PCT ?? "3");
    const maxYieldAllocPct = parseFloat(process.env.MAX_YIELD_ALLOC_PCT || "0.35");
    const minTargetYieldPct = parseFloat(process.env.MIN_TARGET_YIELD_PCT || "3");

    // Normalize policy values
    const liquidityMinUSDC = Number(policy.liquidityMinUSDC) > 0
      ? Number(policy.liquidityMinUSDC)
      : 5 * 1e6;
    const perTxMaxUSDC = Number(policy.perTxMaxUSDC) > 0
      ? Number(policy.perTxMaxUSDC)
      : 10 * 1e6;
    const dailyMaxUSDC = Number(policy.dailyMaxUSDC) > 0
      ? Number(policy.dailyMaxUSDC)
      : 50 * 1e6;

    const totalUSDC = liquidityUSDC + reserveUSDC + yieldUSDC;

    const snapshot: Snapshot = {
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
      oracleStale: oracle.stale,
      oracleSource: oracle.source,
      changePct,
      collateralAmount: userState.collateralAmount,
      collateralValueUSDC,
      debtUSDC: userState.debtUSDC,
      maxBorrowUSDC,
      healthFactor,
      liquidityUSDC,
      reserveUSDC,
      yieldUSDC,
      pendingPayment: pending
        ? { to: pending.to, amountUSDC: parseFloat(pending.amountUSDC) }
        : null,
      policy: {
        ltvBps: policy.ltvBps,
        minHealthBps: policy.minHealthBps,
        emergencyHealthBps: policy.emergencyHealthBps,
        liquidityMinUSDC,
        perTxMaxUSDC,
        dailyMaxUSDC,
        liquidityTargetRatio,
        reserveRatio,
        volatilityThresholdPct,
        targetHealthRatio,
        maxYieldAllocPct,
        minTargetYieldPct,
      },
      totalUSDC,
      liquidityRatio: totalUSDC > 0 ? liquidityUSDC / totalUSDC : 0,
      reserveRatio: totalUSDC > 0 ? reserveUSDC / totalUSDC : 0,
      volatilityPct: Math.abs(changePct),
      yieldRatePct: yieldData.ratePct,
    };

    setLastSnapshot({
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
      oracleStale: oracle.stale,
      oracleSource: oracle.source,
      changePct,
      collateralAmount: userState.collateralAmount.toString(),
      collateralValueUSDC: formatUSDC(collateralValueUSDC),
      debtUSDC: formatUSDC(userState.debtUSDC),
      maxBorrowUSDC: formatUSDC(maxBorrowUSDC),
      healthFactor,
      liquidityUSDC: liquidityUSDC.toFixed(6),
      reserveUSDC: reserveUSDC.toFixed(6),
      yieldUSDC: yieldUSDC.toFixed(6),
      pendingPayment: pending
        ? { to: pending.to, amountUSDC: pending.amountUSDC }
        : null,
      liquidityRatio: snapshot.liquidityRatio.toFixed(4),
      reserveRatio: snapshot.reserveRatio.toFixed(4),
      volatilityPct: snapshot.volatilityPct.toFixed(2),
      targetHealth: targetHealthRatio,
      liquidityTargetRatio,
      reserveRatioTarget: reserveRatio,
      maxYieldAllocPct,
      minTargetYieldPct,
      yieldRatePct: yieldData.ratePct,
      yieldRateStale: yieldData.stale,
      volatilityThreshold: volatilityThresholdPct,
    });

    // 5. Planner proposes plan
    const proposal = planner(snapshot);
    console.log("[AgentTick] Planner proposal:", proposal.rationale);
    console.log("[AgentTick] Planner actions:", proposal.actions.length, proposal.actions.map((a: any) => `${a.type}:${a.amountUSDC}`));

    // 6. Safety controller validates
    const safetyResult = safetyController(snapshot, proposal);
    console.log("[AgentTick] Safety result:", safetyResult.reason, "allowed:", safetyResult.allowed);

    if (!safetyResult.allowed) {
      const status = safetyResult.riskMode ? "Risk Mode" : "Monitoring";
      setStatus(status);
      setLastReason(`Blocked: ${safetyResult.reason}`);

      const snapshotStr = JSON.stringify({ hf: healthFactor.toFixed(4), reason: safetyResult.reason });
      const rHash = rationaleHash(safetyResult.reason);
      try {
        await arc.logDecision(snapshotStr, "BLOCKED", rHash);
      } catch (logErr: any) {
        console.warn("[AgentTick] logDecision failed:", logErr.message);
      }

      await store.addLog({
        ts: Date.now(),
        action: "BLOCKED",
        amountUSDC: "0",
        healthFactor,
        rationale: safetyResult.reason,
        circleTxRef: "",
        arcTxHash: "",
      });
      return;
    }

    // 7. Execute actions sequentially
    for (const action of safetyResult.plan.actions) {
      console.log(`[AgentTick] Executing ${action.type}: ${action.amountUSDC} USDC (trigger: ${action.trigger || "-"}, rule: ${action.policyRule || "-"})`);
      await executeAction(action, snapshot, user);

      if (action.type === "payment" && pending) {
        await store.removePendingPayment();
      }
    }

    // 8. Post-execution snapshot refresh
    if (safetyResult.plan.actions.length > 0) {
      try {
        const postLiquidity = await circle.getBalance("liquidity");
        const postReserve = await circle.getBalance("reserve");
        const postYield = await circle.getBalance("yield");
        const postUserState = await arc.getUserState(user);
        const postCollateralValue = computeCollateralValueUSDC(postUserState.collateralAmount, priceBigInt);
        const postMaxBorrow = computeMaxBorrow(postCollateralValue, policy.ltvBps);
        const postHF = computeHealthFactor(postMaxBorrow, postUserState.debtUSDC);
        const postTotal = postLiquidity + postReserve + postYield;

        // Update recent action logs with post-execution HF
        const recentLogs = (await store.getActionLogs()).slice(0, safetyResult.plan.actions.length);
        for (const log of recentLogs) {
          log.hfAfter = postHF;
          log.liquidityAfter = postLiquidity;
          log.reserveAfter = postReserve;
        }

        const postPending = await store.getPendingPayment();

        setLastSnapshot({
          oraclePrice: oracle.price,
          oracleTs: oracle.ts,
          oracleStale: oracle.stale,
          oracleSource: oracle.source,
          changePct,
          collateralAmount: postUserState.collateralAmount.toString(),
          collateralValueUSDC: formatUSDC(postCollateralValue),
          debtUSDC: formatUSDC(postUserState.debtUSDC),
          maxBorrowUSDC: formatUSDC(postMaxBorrow),
          healthFactor: postHF,
          liquidityUSDC: postLiquidity.toFixed(6),
          reserveUSDC: postReserve.toFixed(6),
          yieldUSDC: postYield.toFixed(6),
          pendingPayment: postPending
            ? { to: postPending.to, amountUSDC: postPending.amountUSDC }
            : null,
          liquidityRatio: postTotal > 0 ? (postLiquidity / postTotal).toFixed(4) : "0",
          reserveRatio: postTotal > 0 ? (postReserve / postTotal).toFixed(4) : "0",
          volatilityPct: snapshot.volatilityPct.toFixed(2),
          targetHealth: targetHealthRatio,
          liquidityTargetRatio,
          reserveRatioTarget: reserveRatio,
          maxYieldAllocPct,
          minTargetYieldPct,
          yieldRatePct: yieldData.ratePct,
          yieldRateStale: yieldData.stale,
          volatilityThreshold: volatilityThresholdPct,
        });

        console.log(`[AgentTick] Post-execution: HF ${healthFactor.toFixed(2)} -> ${postHF.toFixed(2)}, liquidity ${liquidityUSDC.toFixed(2)} -> ${postLiquidity.toFixed(2)}, reserve ${reserveUSDC.toFixed(2)} -> ${postReserve.toFixed(2)}`);
      } catch (postErr: any) {
        console.warn("[AgentTick] Post-execution snapshot failed (non-fatal):", postErr.message);
      }
    }

    // 9. Update telemetry
    const volThreshold = parseFloat(process.env.VOL_THRESHOLD_PCT || "3");
    const isRisk =
      healthFactor < bpsToRatio(policy.minHealthBps) ||
      Math.abs(changePct) > volThreshold;

    if (isRisk) {
      setStatus("Risk Mode");
      setLastReason(`Risk: HF=${healthFactor.toFixed(2)}, vol=${changePct.toFixed(1)}%`);
    } else if (safetyResult.plan.actions.length > 0) {
      setStatus("Monitoring");
      setLastReason(`Executed ${safetyResult.plan.actions.length} action(s): ${safetyResult.plan.rationale}`);
    } else {
      setStatus("Monitoring");
      setLastReason(`All healthy. HF=${healthFactor.toFixed(2)}, liquidity=${liquidityUSDC.toFixed(2)}`);
    }

    console.log("[AgentTick] Tick completed successfully");
  } catch (err: any) {
    console.error("[AgentTick] Fatal error:", err.message, err.stack);
    setStatus("Risk Mode");
    setLastReason(`Error: ${err.message}`);
  }
}
