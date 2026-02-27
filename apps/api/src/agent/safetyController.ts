import { bpsToRatio } from "../utils/math";

export interface Snapshot {
  oraclePrice: number;
  oracleTs: number;
  changePct: number;
  collateralAmount: bigint;
  collateralValueUSDC: bigint;
  debtUSDC: bigint;
  maxBorrowUSDC: bigint;
  healthFactor: number;
  liquidityUSDC: number;
  reserveUSDC: number;
  yieldUSDC: number;
  pendingPayment: { to: string; amountUSDC: number } | null;
  policy: {
    ltvBps: number;
    minHealthBps: number;
    emergencyHealthBps: number;
    liquidityMinUSDC: number;
    perTxMaxUSDC: number;
    dailyMaxUSDC: number;
  };
}

export type ActionType = "borrow" | "repay" | "rebalance" | "payment";

export interface PlannedAction {
  type: ActionType;
  amountUSDC: number;
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
  const perTxMax = snapshot.policy.perTxMaxUSDC / 1e6;
  const dailyMax = snapshot.policy.dailyMaxUSDC / 1e6;
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;

  const isVolatile = changePctAbs > VOL_THRESHOLD;
  const isRiskMode = hf < minHealth || isVolatile;

  // Rule 2: Emergency — force repay to target
  if (hf < emergencyHealth && Number(snapshot.debtUSDC) > 0) {
    const targetHealth = minHealth + 0.10;
    const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
    const debt = Number(snapshot.debtUSDC) / 1e6;
    const repayAmount = Math.max(0, debt - maxBorrow / targetHealth);

    if (repayAmount > 0) {
      return {
        allowed: true,
        plan: {
          actions: [
            {
              type: "repay",
              amountUSDC: Math.min(repayAmount, debt),
              rationale: `Emergency repay: HF=${hf.toFixed(2)} < emergency=${emergencyHealth.toFixed(2)}. Repaying to restore target HF=${targetHealth.toFixed(2)}.`,
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
    const filtered = proposal.actions.filter((a) => {
      if (a.type === "borrow" || a.type === "payment") return false;
      return true; // allow repay and rebalance
    });

    if (filtered.length === 0) {
      return {
        allowed: false,
        plan: { actions: [], rationale: "Blocked: HF below minHealth, only repay allowed" },
        reason: `Blocked: HF=${hf.toFixed(2)} < minHealth=${minHealth.toFixed(2)}`,
        riskMode: true,
      };
    }

    return {
      allowed: true,
      plan: { actions: filtered, rationale: proposal.rationale + " (debt-increasing actions removed by safety)" },
      reason: `Actions filtered: HF=${hf.toFixed(2)} < minHealth`,
      riskMode: true,
    };
  }

  // Validate each action
  const validatedActions: PlannedAction[] = [];
  for (const action of proposal.actions) {
    // Rule 5: Spending caps
    if (action.amountUSDC > perTxMax) {
      action.amountUSDC = perTxMax;
      action.rationale += ` (capped to perTxMax=${perTxMax})`;
    }

    // Rule 3: LTV check for borrows
    if (action.type === "borrow") {
      const currentDebt = Number(snapshot.debtUSDC) / 1e6;
      const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
      if (currentDebt + action.amountUSDC > maxBorrow) {
        const safeAmount = Math.max(0, maxBorrow - currentDebt);
        if (safeAmount <= 0) continue;
        action.amountUSDC = safeAmount;
        action.rationale += ` (reduced to stay within LTV)`;
      }
    }

    // Rule 4: Liquidity minimum check
    if (action.type === "payment" || (action.type === "rebalance" && action.from === "liquidity")) {
      const remainingLiquidity = snapshot.liquidityUSDC - action.amountUSDC;
      if (remainingLiquidity < liquidityMin && action.type !== "payment") {
        continue; // skip this rebalance
      }
    }

    validatedActions.push(action);
  }

  return {
    allowed: validatedActions.length > 0 || proposal.actions.length === 0,
    plan: { actions: validatedActions, rationale: proposal.rationale },
    reason: isRiskMode
      ? `Risk Mode: HF=${hf.toFixed(2)}, vol=${changePctAbs.toFixed(1)}%`
      : `Allowed: ${validatedActions.length} actions`,
    riskMode: isRiskMode,
  };
}
