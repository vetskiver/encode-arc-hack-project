import * as arc from "../integrations/arc";
import * as circle from "../integrations/circle";
import * as stork from "../integrations/stork";
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
import { usdcToNumber } from "../integrations/usdc";

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
    store.addPrice(oracle.price, oracle.ts);
    const changePct = store.getChangePct();

    // Update oracle snapshot on contract
    const priceBigInt = stork.priceToBigInt(oracle.price);
    await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));

    // 3. Read Circle balances
    const liquidityUSDC = await circle.getBalance("liquidity");
    const reserveUSDC = await circle.getBalance("reserve");
    const yieldUSDC = await circle.getBalance("yield");

    // 4. Compute snapshot metrics
    const collateralValueUSDC = computeCollateralValueUSDC(
      userState.collateralAmount,
      priceBigInt
    );
    const maxBorrowUSDC = computeMaxBorrow(collateralValueUSDC, policy.ltvBps);
    const healthFactor = computeHealthFactor(maxBorrowUSDC, userState.debtUSDC);

    const pending = store.getPendingPayment();

    const snapshot: Snapshot = {
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
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
        liquidityMinUSDC: Number(policy.liquidityMinUSDC),
        perTxMaxUSDC: Number(policy.perTxMaxUSDC),
        dailyMaxUSDC: Number(policy.dailyMaxUSDC),
      },
    };

    setLastSnapshot({
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
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
    });

    // 5. Planner proposes plan
    const proposal = planner(snapshot);
    console.log("[AgentTick] Planner proposal:", proposal.rationale);

    // 6. Safety controller validates
    const safetyResult = safetyController(snapshot, proposal);
    console.log("[AgentTick] Safety result:", safetyResult.reason, "allowed:", safetyResult.allowed);

    if (!safetyResult.allowed) {
      const status = safetyResult.riskMode ? "Risk Mode" : "Monitoring";
      setStatus(status);
      setLastReason(`Blocked: ${safetyResult.reason}`);

      // Log blocked decision on Arc
      const snapshotStr = JSON.stringify({ hf: healthFactor.toFixed(4), reason: safetyResult.reason });
      const rHash = rationaleHash(safetyResult.reason);
      await arc.logDecision(snapshotStr, "BLOCKED", rHash);

      store.addLog({
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
      console.log(`[AgentTick] Executing ${action.type}: ${action.amountUSDC} USDC`);
      await executeAction(action, snapshot, user);

      // If this was a payment, remove from pending
      if (action.type === "payment" && pending) {
        store.removePendingPayment();
      }
    }

    // 8. Update telemetry
    const volThreshold = parseFloat(process.env.VOL_THRESHOLD_PCT || "3");
    const isRisk =
      healthFactor < bpsToRatio(policy.minHealthBps) ||
      Math.abs(changePct) > volThreshold;

    if (isRisk) {
      setStatus("Risk Mode");
      setLastReason(`Risk: HF=${healthFactor.toFixed(2)}, vol=${changePct.toFixed(1)}%`);
    } else if (safetyResult.plan.actions.length > 0) {
      setStatus("Monitoring");
      setLastReason(
        `Executed ${safetyResult.plan.actions.length} action(s): ${safetyResult.plan.rationale}`
      );
    } else {
      setStatus("Monitoring");
      setLastReason(`All healthy. HF=${healthFactor.toFixed(2)}, liquidity=${liquidityUSDC.toFixed(2)}`);
    }

    console.log("[AgentTick] Tick completed");
  } catch (err: any) {
    console.error("[AgentTick] Error:", err.message);
    setStatus("Risk Mode");
    setLastReason(`Error: ${err.message}`);
  }
}
