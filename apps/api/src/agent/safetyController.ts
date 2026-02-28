import { bpsToRatio } from "../utils/math";

export interface Snapshot {
  oraclePrice: number;
  oracleTs: number;
  oracleStale: boolean;
  oracleSource?: "stork" | "sim";
  changePct: number;
  collateralAmount: bigint;
  collateralValueUSDC: bigint;
  debtUSDC: bigint;
  maxBorrowUSDC: bigint;
  healthFactor: number;
  liquidityUSDC: number;   // plain dollar float from Circle
  reserveUSDC: number;     // plain dollar float from Circle
  yieldUSDC: number;
  pendingPayment: { to: string; amountUSDC: number } | null;
  policy: {
    ltvBps: number;
    minHealthBps: number;
    emergencyHealthBps: number;
    liquidityMinUSDC: number;   // 6-decimal raw (normalized by agentTick)
    perTxMaxUSDC: number;       // 6-decimal raw
    dailyMaxUSDC: number;       // 6-decimal raw
    liquidityTargetRatio: number; // 0-1
    reserveRatio: number;         // 0-1
    volatilityThresholdPct: number; // percent
    targetHealthRatio: number;    // e.g., 1.6
    maxYieldAllocPct?: number;    // 0-1 fraction
    minTargetYieldPct?: number;   // percent APY threshold
  };
  totalUSDC: number;
  liquidityRatio: number;
  reserveRatio: number;
  volatilityPct: number;
  yieldRatePct?: number; // latest APY
}

export type ActionType = "borrow" | "repay" | "rebalance" | "payment";

export interface PlannedAction {
  type: ActionType;
  amountUSDC: number;  // dollar float
  from?: string;
  to?: string;
  rationale: string;
  // V2 enhanced logging metadata
  trigger?: string;      // what triggered this action
  policyRule?: string;   // which policy rule activated
}

export interface Plan {
  actions: PlannedAction[];
  rationale: string;
}

export interface SafetyResult {
  allowed: boolean;
  plan: Plan;
  reason: string;
  riskMode: boolean;
}

export function safetyController(snapshot: Snapshot, proposal: Plan): SafetyResult {
  const minHealth = bpsToRatio(snapshot.policy.minHealthBps);
  const emergencyHealth = bpsToRatio(snapshot.policy.emergencyHealthBps);
  const hf = snapshot.healthFactor;
  const changePctAbs = Math.abs(snapshot.changePct);
  const volThreshold = snapshot.policy.volatilityThresholdPct || parseFloat(process.env.VOL_THRESHOLD_PCT || "3");
  const oracleTrusted = !snapshot.oracleStale && snapshot.oracleSource !== "sim";
  const oracleUntrusted = !oracleTrusted;

  // Convert 6-decimal policy values to dollar floats for comparison
  const basePerTxMax = snapshot.policy.perTxMaxUSDC / 1e6;
  const perTxMax = basePerTxMax > 0
    ? basePerTxMax * (changePctAbs > volThreshold ? 0.5 : 1) // tighten under volatility
    : 0;
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;
  const liquidityTarget = snapshot.policy.liquidityTargetRatio || 0;
  const reserveTarget = snapshot.policy.reserveRatio || 0;
  const targetHealth = snapshot.policy.targetHealthRatio || minHealth;
  const maxYieldAllocPct = snapshot.policy.maxYieldAllocPct ?? parseFloat(process.env.MAX_YIELD_ALLOC_PCT || "0.35");
  const minTargetYieldPct = snapshot.policy.minTargetYieldPct ?? parseFloat(process.env.MIN_TARGET_YIELD_PCT || "3");
  const disableYield = (process.env.DISABLE_YIELD || "true").toLowerCase() === "true";

  const isVolatile = changePctAbs > volThreshold;
  const isRiskMode = hf < minHealth || isVolatile;

  // Rule 2: Emergency — override plan with forced repay
  if (hf < emergencyHealth && Number(snapshot.debtUSDC) > 0) {
    const emergencyTargetHealth = minHealth + 0.10;
    const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
    const debt = Number(snapshot.debtUSDC) / 1e6;

    // Desired repay to restore health
    const desiredRepay = Math.min(
      Math.max(0, debt - maxBorrow / emergencyTargetHealth),
      debt
    );

    // Cap to spendable balances (liquidity + reserve minus gas buffer each)
    const GAS_RESERVE = 0.5;
    const spendable = Math.max(0, snapshot.liquidityUSDC - GAS_RESERVE)
                    + Math.max(0, snapshot.reserveUSDC - GAS_RESERVE);
    // Use max available if desired amount exceeds spendable; debt must stay >= 0
    const repayAmount = Math.min(desiredRepay, spendable, debt);

    if (repayAmount > 0.01) {
      const shortfall = desiredRepay > spendable
        ? ` (capped by available cash: spendable=${spendable.toFixed(2)}, desired=${desiredRepay.toFixed(2)})`
        : "";
      console.log(`[Safety] Emergency repay triggered: HF=${hf.toFixed(2)}, repay=${repayAmount.toFixed(2)}${shortfall}`);
      return {
        allowed: true,
        plan: {
          actions: [
            {
              type: "repay",
              amountUSDC: repayAmount,
              rationale: `Emergency repay: HF=${hf.toFixed(2)} < emergency=${emergencyHealth.toFixed(2)}. Repaying ${repayAmount.toFixed(2)} to restore target HF=${emergencyTargetHealth.toFixed(2)}.${shortfall}`,
            },
          ],
          rationale: `Emergency: HF critically low at ${hf.toFixed(2)}`,
        },
        reason: `Emergency repay triggered: HF=${hf.toFixed(2)}`,
        riskMode: true,
      };
    }
  }

  // Rule 1: Block debt-increasing actions if HF < minHealth
  if (hf < minHealth) {
    const repayActions = proposal.actions.filter(
      (a) => a.type === "repay" || a.type === "rebalance"
    );

    if (repayActions.length === 0) {
      return {
        allowed: false,
        plan: { actions: [], rationale: "Blocked: HF below minHealth" },
        reason: `Blocked: HF=${hf.toFixed(2)} < minHealth=${minHealth.toFixed(2)}. Only repay allowed.`,
        riskMode: true,
      };
    }

    return {
      allowed: true,
      plan: {
        actions: repayActions,
        rationale: proposal.rationale + " (borrow/payment removed by safety controller)",
      },
      reason: `Filtered to repay-only: HF=${hf.toFixed(2)} < minHealth=${minHealth.toFixed(2)}`,
      riskMode: true,
    };
  }

  // V2: Increase liquidity floor dynamically during high volatility
  const effectiveLiquidityMin = isVolatile ? liquidityMin * 1.5 : liquidityMin;

  // V2: Under volatility, further reduce borrow headroom (in addition to perTx cap reduction)
  const volatilityBorrowMultiplier = isVolatile ? 0.7 : 1.0;

  // Validate each proposed action
  const validatedActions: PlannedAction[] = [];
  for (const action of proposal.actions) {
    let a = { ...action };

    // If oracle is stale or simulated, block debt-increasing actions
    if (oracleUntrusted && (a.type === "borrow" || a.type === "payment")) {
      console.log("[Safety] Blocking borrow/payment due to stale or simulated oracle");
      continue;
    }

    // Rule 5: Per-tx spending cap (dollar comparison)
    if (perTxMax > 0 && a.amountUSDC > perTxMax) {
      a.amountUSDC = perTxMax;
      a.rationale += ` (capped to perTxMax=$${perTxMax.toFixed(2)})`;
    }

    // Rule 3: LTV check for borrows
    if (a.type === "borrow") {
      const currentDebt = Number(snapshot.debtUSDC) / 1e6;
      const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
      const maxAllowedLtv = maxBorrow - currentDebt;
      const maxAllowedTarget = targetHealth > 0 ? (maxBorrow / targetHealth) - currentDebt : maxAllowedLtv;
      // V2: Apply volatility multiplier to further reduce borrow headroom
      const borrowCap = Math.min(maxAllowedLtv, maxAllowedTarget) * volatilityBorrowMultiplier;

      if (borrowCap <= 0.01) {
        console.log(`[Safety] Borrow blocked: at max LTV/targetHF (debt=${currentDebt.toFixed(2)}, cap=${borrowCap.toFixed(2)})`);
        continue;
      }
      if (a.amountUSDC > borrowCap) {
        a.amountUSDC = borrowCap;
        a.rationale += ` (reduced to $${borrowCap.toFixed(2)} for LTV/targetHF${isVolatile ? "/volatility" : ""})`;
      }
    }

    // Rule 4: Liquidity minimum — don't let rebalances-out drop below floor
    // V2: Allow proactive risk tightening (liquidity→reserve) even when tight,
    //     but enforce hard floor at 50% of liquidityMin
    if (a.type === "rebalance" && a.from === "liquidity") {
      const afterBalance = snapshot.liquidityUSDC - a.amountUSDC;
      const hardFloor = liquidityMin * 0.5;
      const isRiskTightening = a.policyRule === "proactiveRiskTightening";

      if (afterBalance < hardFloor) {
        // Never go below hard floor
        const maxMove = Math.max(0, snapshot.liquidityUSDC - hardFloor);
        if (maxMove < 0.01) {
          console.log(`[Safety] Rebalance from liquidity blocked: would breach hard floor`);
          continue;
        }
        a.amountUSDC = maxMove;
        a.rationale += ` (capped to ${maxMove.toFixed(2)} to respect hard floor)`;
      } else if (!isRiskTightening && (afterBalance < effectiveLiquidityMin || snapshot.liquidityRatio < liquidityTarget)) {
        console.log(`[Safety] Rebalance from liquidity blocked: would drop below min/target`);
        continue;
      }
    }

    // Protect reserve when already below target (but allow risk tightening moves INTO reserve)
    if (a.type === "rebalance" && a.from === "reserve") {
      const afterReserve = snapshot.reserveUSDC - a.amountUSDC;
      const totalAfter = snapshot.totalUSDC - a.amountUSDC;
      const afterRatio = totalAfter > 0 ? afterReserve / totalAfter : 0;
      const hardFloorRatio = reserveTarget * 0.5;
      if (afterRatio < hardFloorRatio && snapshot.reserveRatio < reserveTarget) {
        console.log("[Safety] Rebalance from reserve blocked: would breach reserve hard floor");
        continue;
      }
      if (afterRatio < reserveTarget && snapshot.reserveRatio < reserveTarget && a.policyRule !== "paymentFunding") {
        console.log("[Safety] Rebalance from reserve blocked: reserve below target");
        continue;
      }
    }

    // Yield allocation cap and minimum rate enforcement
    if (a.type === "rebalance" && a.to === "yield") {
      if (disableYield) {
        console.log("[Safety] Blocking yield move: DISABLE_YIELD=true");
        continue;
      }
      const total = Math.max(snapshot.totalUSDC, 0.0001);
      const currentAlloc = snapshot.yieldUSDC / total;
      const allocHeadroom = Math.max(0, maxYieldAllocPct - currentAlloc);
      const maxMove = total * allocHeadroom;
      const yieldRate = snapshot.yieldRatePct ?? 0;

      if (yieldRate < minTargetYieldPct) {
        console.log(`[Safety] Blocking yield move: rate ${yieldRate.toFixed(2)}% < minTarget ${minTargetYieldPct}%`);
        continue;
      }
      if (allocHeadroom <= 0.0001 || maxMove <= 0.01) {
        console.log("[Safety] Blocking yield move: allocation cap reached");
        continue;
      }
      if (a.amountUSDC > maxMove) {
        a.amountUSDC = maxMove;
        a.rationale += ` (capped by yield allocation headroom ${(maxYieldAllocPct * 100).toFixed(0)}%)`;
      }
    }

    // Skip zero/dust amounts
    if (a.amountUSDC < 0.01) {
      console.log(`[Safety] Skipping dust action: ${a.type} ${a.amountUSDC}`);
      continue;
    }

    validatedActions.push(a);
  }

  // allowed = true if there were no proposed actions (nothing to do = healthy)
  //         OR if at least some actions passed validation
  const nothingProposed = proposal.actions.length === 0;
  const someActionsApproved = validatedActions.length > 0;

  return {
    allowed: nothingProposed || someActionsApproved,
    plan: { actions: validatedActions, rationale: proposal.rationale },
    reason: isRiskMode
      ? `Risk Mode: HF=${hf.toFixed(2)}, vol=${changePctAbs.toFixed(1)}%`
      : oracleUntrusted
        ? "Oracle stale/simulated: borrow/payment blocked"
        : nothingProposed
          ? "All healthy, no actions needed"
          : `Approved ${validatedActions.length} of ${proposal.actions.length} actions`,
    riskMode: isRiskMode || oracleUntrusted,
  };
}
