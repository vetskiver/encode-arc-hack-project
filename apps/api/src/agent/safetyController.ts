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
  };
}

export type ActionType = "borrow" | "repay" | "rebalance" | "payment";

export interface PlannedAction {
  type: ActionType;
  amountUSDC: number;  // dollar float
  from?: string;
  to?: string;
  rationale: string;
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

const VOL_THRESHOLD = parseFloat(process.env.VOL_THRESHOLD_PCT || "3");

export function safetyController(snapshot: Snapshot, proposal: Plan): SafetyResult {
  const minHealth = bpsToRatio(snapshot.policy.minHealthBps);
  const emergencyHealth = bpsToRatio(snapshot.policy.emergencyHealthBps);
  const hf = snapshot.healthFactor;
  const changePctAbs = Math.abs(snapshot.changePct);
  const oracleUntrusted = snapshot.oracleStale || snapshot.oracleSource === "sim";

  // Convert 6-decimal policy values to dollar floats for comparison
  const perTxMax = snapshot.policy.perTxMaxUSDC / 1e6;
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;

  const isVolatile = changePctAbs > VOL_THRESHOLD;
  const isRiskMode = hf < minHealth || isVolatile;

  // Rule 2: Emergency — override plan with forced repay
  if (hf < emergencyHealth && Number(snapshot.debtUSDC) > 0) {
    const targetHealth = minHealth + 0.10;
    const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
    const debt = Number(snapshot.debtUSDC) / 1e6;
    const repayAmount = Math.min(
      Math.max(0, debt - maxBorrow / targetHealth),
      debt
    );

    if (repayAmount > 0.01) {
      console.log(`[Safety] Emergency repay triggered: HF=${hf.toFixed(2)}, repay=${repayAmount.toFixed(2)}`);
      return {
        allowed: true,
        plan: {
          actions: [
            {
              type: "repay",
              amountUSDC: repayAmount,
              rationale: `Emergency repay: HF=${hf.toFixed(2)} < emergency=${emergencyHealth.toFixed(2)}. Repaying ${repayAmount.toFixed(2)} to restore target HF=${targetHealth.toFixed(2)}.`,
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
      const maxAllowed = maxBorrow - currentDebt;
      if (maxAllowed <= 0.01) {
        console.log(`[Safety] Borrow blocked: at max LTV (debt=${currentDebt.toFixed(2)}, maxBorrow=${maxBorrow.toFixed(2)})`);
        continue;
      }
      if (currentDebt + a.amountUSDC > maxBorrow) {
        a.amountUSDC = maxAllowed;
        a.rationale += ` (reduced to $${maxAllowed.toFixed(2)} to stay within LTV)`;
      }
    }

    // Rule 4: Liquidity minimum — don't let rebalances-out drop below floor
    if (a.type === "rebalance" && a.from === "liquidity") {
      const afterBalance = snapshot.liquidityUSDC - a.amountUSDC;
      if (afterBalance < liquidityMin) {
        console.log(`[Safety] Rebalance from liquidity blocked: would drop below min`);
        continue;
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
