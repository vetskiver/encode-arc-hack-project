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
 *
 * UNITS NOTE:
 *   - debtUSDC, maxBorrowUSDC, collateralValueUSDC: bigint from Arc (6 decimals)
 *   - liquidityUSDC, reserveUSDC: plain float from Circle (e.g. 5000.0 = $5000)
 *   - policy.liquidityMinUSDC, perTxMaxUSDC, dailyMaxUSDC: raw from contract (6 decimals)
 *     → agentTick normalizes these to 6-decimal raw form; divide by 1e6 here for dollar amounts
 *   - pendingPayment.amountUSDC: plain float dollar amount
 */

// Gas buffer: on ARC-TESTNET, USDC is the native token so gas is paid in USDC.
// Never transfer a wallet's entire balance; leave headroom for gas fees.
const GAS_RESERVE_USDC = 0.5;

export function planner(snapshot: Snapshot): Plan {
  const actions: PlannedAction[] = [];

  // Convert bigint fields to dollar floats
  const debt = Number(snapshot.debtUSDC) / 1e6;
  const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
  const minHealth = bpsToRatio(snapshot.policy.minHealthBps);
  const targetHealth = minHealth + 0.10;

  // Policy values are stored as 6-decimal raw in snapshot.policy (normalized by agentTick)
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;

  // Circle balance fields are already dollar floats — subtract gas reserve for spendable amounts
  const liquidity = snapshot.liquidityUSDC;
  const reserve = snapshot.reserveUSDC;
  const spendableLiquidity = Math.max(0, liquidity - GAS_RESERVE_USDC);
  const spendableReserve = Math.max(0, reserve - GAS_RESERVE_USDC);
  const hf = snapshot.healthFactor;

  console.log(`[Planner] debt=${debt}, maxBorrow=${maxBorrow}, hf=${hf}, liquidity=${liquidity}, liquidityMin=${liquidityMin}, reserve=${reserve}`);

  // --- Emergency repay ---
  if (hf < minHealth && debt > 0) {
    const repayMin = Math.max(0, debt - maxBorrow / targetHealth);
    if (repayMin > 0) {
      const repayAmount = Math.min(repayMin, spendableReserve + spendableLiquidity, debt);
      if (repayAmount > 0) {
        actions.push({
          type: "repay",
          amountUSDC: repayAmount,
          rationale: `Repay ${repayAmount.toFixed(2)} USDC to restore HF from ${hf.toFixed(2)} toward ${targetHealth.toFixed(2)}.`,
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
    const paymentAmount = pending.amountUSDC; // already a dollar float

    // How much extra USDC do we need in liquidity to cover payment + keep buffer?
    const borrowNeed = Math.max(0, paymentAmount + liquidityMin - liquidity);

    if (borrowNeed > 0) {
      // How much can we safely borrow without breaching targetHealth?
      const borrowMaxSafe = Math.max(0, maxBorrow / targetHealth - debt);
      const borrowAmount = Math.min(borrowNeed, borrowMaxSafe);

      if (borrowAmount > 0.01) {
        actions.push({
          type: "borrow",
          amountUSDC: borrowAmount,
          rationale: `Borrow ${borrowAmount.toFixed(2)} USDC to fund payment. borrowNeed=${borrowNeed.toFixed(2)}, borrowMaxSafe=${borrowMaxSafe.toFixed(2)}`,
        });
      }

      // If borrow isn't enough, rebalance from reserve
      const covered = borrowAmount;
      const stillNeed = borrowNeed - covered;
      if (stillNeed > 0.01 && spendableReserve > 0) {
        const rebalanceAmt = Math.min(stillNeed, spendableReserve);
        actions.push({
          type: "rebalance",
          amountUSDC: rebalanceAmt,
          from: "reserve",
          to: "liquidity",
          rationale: `Rebalance ${rebalanceAmt.toFixed(2)} USDC from reserve to cover payment shortfall.`,
        });
      }
    }

    // Always queue the payment itself
    actions.push({
      type: "payment",
      amountUSDC: paymentAmount,
      to: pending.to,
      rationale: `Execute pending payment of ${paymentAmount.toFixed(2)} USDC to ${pending.to}.`,
    });

    return {
      actions,
      rationale: `Processing pending payment of ${paymentAmount.toFixed(2)} USDC.${borrowNeed > 0 ? ` Borrowing/rebalancing ${borrowNeed.toFixed(2)} first.` : " Liquidity sufficient."}`,
    };
  }

  // --- Maintain liquidity buffer ---
  if (liquidity < liquidityMin && spendableReserve > 0) {
    const deficit = liquidityMin - liquidity;
    const moveAmount = Math.min(deficit, spendableReserve);
    if (moveAmount > 0.01) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveAmount,
        from: "reserve",
        to: "liquidity",
        rationale: `Rebalance ${moveAmount.toFixed(2)} USDC reserve→liquidity. Liquidity(${liquidity.toFixed(2)}) < min(${liquidityMin.toFixed(2)}).`,
      });
    }
  }

  // --- Borrow to restore liquidity floor when safe ---
  if (liquidity < liquidityMin && hf >= minHealth) {
    const shortfall = liquidityMin - liquidity;
    const currentDebt = debt;
    const borrowHeadroom = Math.max(0, maxBorrow / targetHealth - currentDebt);
    const perTxMax = snapshot.policy.perTxMaxUSDC / 1e6;
    const borrowAmount = Math.min(shortfall, borrowHeadroom, perTxMax > 0 ? perTxMax : shortfall);

    if (borrowAmount > 0.01) {
      actions.push({
        type: "borrow",
        amountUSDC: borrowAmount,
        rationale: `Borrow ${borrowAmount.toFixed(2)} USDC to restore liquidity floor (${liquidityMin.toFixed(2)}).`,
      });
    }
  }

  // --- Proactive repay if HF has headroom and excess liquidity is sitting idle ---
  if (debt > 0 && hf >= minHealth && hf < targetHealth + 0.5) {
    const repayToImprove = Math.max(0, debt - maxBorrow / (targetHealth + 0.3));
    const availableForRepay = Math.max(0, spendableLiquidity - liquidityMin);
    const repayAmount = Math.min(repayToImprove, availableForRepay, debt);
    if (repayAmount > 1) {
      actions.push({
        type: "repay",
        amountUSDC: repayAmount,
        rationale: `Proactive repay ${repayAmount.toFixed(2)} USDC to improve HF from ${hf.toFixed(2)}.`,
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
