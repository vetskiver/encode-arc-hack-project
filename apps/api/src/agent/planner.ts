import { Snapshot, Plan, PlannedAction } from "./safetyController";
import { bpsToRatio } from "../utils/math";

/**
 * Agentic Strategy Planner
 *
 * Uses closed-form math to compute optimal actions.
 * Priority:
 *   1) Complete pending payment if safe
 *   2) Maintain liquidityMin buffer
 *   3) Maintain target health buffer
 *   4) Minimize number of transfers
 */
export function planner(snapshot: Snapshot): Plan {
  const actions: PlannedAction[] = [];

  const debt = Number(snapshot.debtUSDC) / 1e6;
  const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
  const minHealth = bpsToRatio(snapshot.policy.minHealthBps);
  const targetHealth = minHealth + 0.10;
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;
  const liquidity = snapshot.liquidityUSDC;
  const reserve = snapshot.reserveUSDC;
  const hf = snapshot.healthFactor;

  // --- Check if emergency repay needed ---
  if (hf < minHealth && debt > 0) {
    // repayMinToTarget: repay >= debt - maxBorrow / targetHealth
    const repayMin = Math.max(0, debt - maxBorrow / targetHealth);
    if (repayMin > 0) {
      const repayAmount = Math.min(repayMin, reserve + liquidity, debt);
      if (repayAmount > 0) {
        actions.push({
          type: "repay",
          amountUSDC: repayAmount,
          rationale: `Repay ${repayAmount.toFixed(2)} USDC to restore HF from ${hf.toFixed(2)} toward ${targetHealth.toFixed(2)}. Formula: repay >= debt(${debt.toFixed(2)}) - maxBorrow(${maxBorrow.toFixed(2)})/targetHF(${targetHealth.toFixed(2)}) = ${repayMin.toFixed(2)}`,
        });
      }
    }
    return {
      actions,
      rationale: `Emergency: HF=${hf.toFixed(2)} below min=${minHealth.toFixed(2)}. Repaying to restore.`,
    };
  }

  // --- Pending payment ---
  const pending = snapshot.pendingPayment;
  if (pending) {
    const paymentAmount = pending.amountUSDC;

    // borrowNeed: max(0, payment + liquidityMin - liquidityUSDC)
    const borrowNeed = Math.max(0, paymentAmount + liquidityMin - liquidity);

    if (borrowNeed > 0) {
      // borrowMaxSafe: debt + borrow <= maxBorrow / targetHealth
      const borrowMaxSafe = Math.max(0, maxBorrow / targetHealth - debt);
      const borrowAmount = Math.min(borrowNeed, borrowMaxSafe);

      if (borrowAmount > 0) {
        actions.push({
          type: "borrow",
          amountUSDC: borrowAmount,
          rationale: `Borrow ${borrowAmount.toFixed(2)} USDC to fund payment. borrowNeed=${borrowNeed.toFixed(2)}, borrowMaxSafe=${borrowMaxSafe.toFixed(2)}`,
        });
      }

      // If borrow isn't enough, try rebalance from reserve
      const remaining = borrowNeed - borrowAmount;
      if (remaining > 0 && reserve > 0) {
        const rebalanceAmt = Math.min(remaining, reserve);
        actions.push({
          type: "rebalance",
          amountUSDC: rebalanceAmt,
          from: "reserve",
          to: "liquidity",
          rationale: `Rebalance ${rebalanceAmt.toFixed(2)} USDC from reserve to liquidity to cover payment shortfall.`,
        });
      }
    }

    // Execute payment
    actions.push({
      type: "payment",
      amountUSDC: paymentAmount,
      to: pending.to,
      rationale: `Execute pending payment of ${paymentAmount.toFixed(2)} USDC to ${pending.to}.`,
    });

    return {
      actions,
      rationale: `Processing pending payment of ${paymentAmount.toFixed(2)} USDC. ${borrowNeed > 0 ? `Need to borrow/rebalance ${borrowNeed.toFixed(2)} first.` : "Liquidity sufficient."}`,
    };
  }

  // --- Maintain liquidity buffer ---
  if (liquidity < liquidityMin && reserve > 0) {
    const deficit = liquidityMin - liquidity;
    const moveAmount = Math.min(deficit, reserve);
    actions.push({
      type: "rebalance",
      amountUSDC: moveAmount,
      from: "reserve",
      to: "liquidity",
      rationale: `Rebalance ${moveAmount.toFixed(2)} USDC from reserve to liquidity. Liquidity(${liquidity.toFixed(2)}) < min(${liquidityMin.toFixed(2)}).`,
    });
  }

  // --- Maintain health buffer: if HF is great and excess liquidity, consider repaying to buffer ---
  if (debt > 0 && hf < targetHealth + 0.5 && hf >= minHealth) {
    const repayToImprove = Math.max(0, debt - maxBorrow / (targetHealth + 0.3));
    const availableForRepay = Math.max(0, liquidity - liquidityMin);
    const repayAmount = Math.min(repayToImprove, availableForRepay, debt);
    if (repayAmount > 1) {
      actions.push({
        type: "repay",
        amountUSDC: repayAmount,
        rationale: `Proactive repay ${repayAmount.toFixed(2)} USDC to improve HF from ${hf.toFixed(2)} toward ${(targetHealth + 0.3).toFixed(2)}.`,
      });
    }
  }

  const actionSummary = actions.length > 0
    ? actions.map((a) => `${a.type}:${a.amountUSDC.toFixed(2)}`).join(", ")
    : "No actions needed";

  return {
    actions,
    rationale: `HF=${hf.toFixed(2)}, liquidity=${liquidity.toFixed(2)}, debt=${debt.toFixed(2)}. ${actionSummary}.`,
  };
}
