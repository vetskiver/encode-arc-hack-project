import { Snapshot, Plan, PlannedAction } from "./safetyController";
import { bpsToRatio } from "../utils/math";

/**
 * Agentic Strategy Planner — V2 "Autonomous RWA Treasury Operator"
 *
 * Uses closed-form math to compute optimal actions.
 * Priority:
 *   1) Emergency repay if HF critically low
 *   2) Volatility tightening (repay + move to reserve)
 *   3) Complete pending payment if safe
 *   4) Maintain liquidityMin buffer
 *   5) Liquidity target ratio management
 *   6) Reserve ratio management
 *   7) Proactive risk tightening (move liquidity→reserve under volatility)
 *   8) Proactive repay to improve HF
 *   9) Yield automation (rescue, refill, park) gated by yield rate & max allocation
 *
 * V2 additions:
 *   - Every action carries trigger + policyRule metadata for enhanced logging
 *   - Proactive risk tightening block: when vol > threshold, strengthen reserve buffer
 *   - Formalized liquidity/reserve management with clear trigger signals
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
const DISABLE_YIELD = (process.env.DISABLE_YIELD || "true").toLowerCase() === "true";

/** Build a standard trigger string from snapshot state */
function triggerSignal(snapshot: Snapshot): string {
  return `price=${snapshot.oraclePrice.toFixed(2)}, vol=${snapshot.volatilityPct.toFixed(1)}%, HF=${snapshot.healthFactor.toFixed(2)}`;
}

export function planner(snapshot: Snapshot): Plan {
  const actions: PlannedAction[] = [];

  // Convert bigint fields to dollar floats
  const debt = Number(snapshot.debtUSDC) / 1e6;
  const maxBorrow = Number(snapshot.maxBorrowUSDC) / 1e6;
  const minHealth = bpsToRatio(snapshot.policy.minHealthBps);
  const targetHealth = snapshot.policy.targetHealthRatio || minHealth + 0.10;

  // Policy values are stored as 6-decimal raw in snapshot.policy (normalized by agentTick)
  const liquidityMin = snapshot.policy.liquidityMinUSDC / 1e6;
  const liquidityTarget = snapshot.policy.liquidityTargetRatio || 0;
  const reserveTarget = snapshot.policy.reserveRatio || 0;
  const volatilityThreshold = snapshot.policy.volatilityThresholdPct || 3;
  const maxYieldAllocPct = snapshot.policy.maxYieldAllocPct || 0.35; // fraction of total
  const minTargetYieldPct = snapshot.policy.minTargetYieldPct || 0;   // deploy only if >= this APY

  // Circle balance fields are already dollar floats — subtract gas reserve for spendable amounts
  const liquidity = snapshot.liquidityUSDC;
  const reserve = snapshot.reserveUSDC;
  const yieldBal = snapshot.yieldUSDC;
  const spendableLiquidity = Math.max(0, liquidity - GAS_RESERVE_USDC);
  const spendableReserve = Math.max(0, reserve - GAS_RESERVE_USDC);
  const hf = snapshot.healthFactor;
  const totalUSDC = snapshot.totalUSDC;
  const liquidityRatio = snapshot.liquidityRatio;
  const reserveRatio = snapshot.reserveRatio;
  const isVolatile = snapshot.volatilityPct > volatilityThreshold;

  // Yield policy knobs (fixed for now; could be env-driven if needed)
  const reserveBuffer = 0.05; // 5% above target triggers parking in yield
  const rescueLiquidityFirst = liquidity < liquidityMin;

  const sig = triggerSignal(snapshot);

  console.log(`[Planner] debt=${debt}, maxBorrow=${maxBorrow}, hf=${hf}, liquidity=${liquidity}, liquidityMin=${liquidityMin}, reserve=${reserve}, vol=${snapshot.volatilityPct.toFixed(1)}%, yieldRate=${snapshot.yieldRatePct?.toFixed(2) ?? "-"}%`);

  // --- 1) Emergency repay ---
  if (hf < minHealth && debt > 0) {
    const repayMin = Math.max(0, debt - maxBorrow / targetHealth);
    if (repayMin > 0) {
      const repayAmount = Math.min(repayMin, spendableReserve + spendableLiquidity, debt);
      if (repayAmount > 0) {
        actions.push({
          type: "repay",
          amountUSDC: repayAmount,
          rationale: `Repay ${repayAmount.toFixed(2)} USDC to restore HF from ${hf.toFixed(2)} toward ${targetHealth.toFixed(2)}.`,
          trigger: `HF=${hf.toFixed(2)} < minHealth=${minHealth.toFixed(2)}`,
          policyRule: "emergencyRepay",
        });
      }
    }
    return {
      actions,
      rationale: `Emergency: HF=${hf.toFixed(2)} below min=${minHealth.toFixed(2)}. Repaying to restore.`,
    };
  }

  // --- 2) Volatility tightening: prioritize risk reduction ---
  if (isVolatile && debt > 0 && hf < targetHealth + 0.3) {
    const repayNeed = Math.max(0, debt - maxBorrow / (targetHealth + 0.2));
    const repayAmount = Math.min(repayNeed, spendableLiquidity + spendableReserve, debt);
    if (repayAmount > 0.5) {
      actions.push({
        type: "repay",
        amountUSDC: repayAmount,
        rationale: `Volatility ${snapshot.volatilityPct.toFixed(1)}% > ${volatilityThreshold}%: repay ${repayAmount.toFixed(2)} to tighten risk.`,
        trigger: `vol=${snapshot.volatilityPct.toFixed(1)}% > threshold=${volatilityThreshold}%, HF=${hf.toFixed(2)}`,
        policyRule: "volatilityTightening",
      });
      return {
        actions,
        rationale: `Volatility high; tightening via repay ${repayAmount.toFixed(2)}.`,
      };
    }
  }

  // --- 3) Pending payment ---
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
          trigger: `pendingPayment=${paymentAmount.toFixed(2)}, liquidityShortfall=${borrowNeed.toFixed(2)}`,
          policyRule: "paymentFunding",
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
          trigger: `pendingPayment=${paymentAmount.toFixed(2)}, remaining shortfall=${stillNeed.toFixed(2)}`,
          policyRule: "paymentFunding",
        });
      }
    }

    // Always queue the payment itself
    actions.push({
      type: "payment",
      amountUSDC: paymentAmount,
      to: pending.to,
      rationale: `Execute pending payment of ${paymentAmount.toFixed(2)} USDC to ${pending.to}.`,
      trigger: sig,
      policyRule: "pendingPayment",
    });

    return {
      actions,
      rationale: `Processing pending payment of ${paymentAmount.toFixed(2)} USDC.${borrowNeed > 0 ? ` Borrowing/rebalancing ${borrowNeed.toFixed(2)} first.` : " Liquidity sufficient."}`,
    };
  }

  // --- 4) Maintain liquidity buffer ---
  if (liquidity < liquidityMin && spendableReserve > 0) {
    const deficit = liquidityMin - liquidity;
    const moveAmount = Math.min(deficit, spendableReserve);
    if (moveAmount > 0.01) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveAmount,
        from: "reserve",
        to: "liquidity",
        rationale: `Rebalance ${moveAmount.toFixed(2)} USDC reserve->liquidity. Liquidity(${liquidity.toFixed(2)}) < min(${liquidityMin.toFixed(2)}).`,
        trigger: `liquidity=${liquidity.toFixed(2)} < liquidityMin=${liquidityMin.toFixed(2)}`,
        policyRule: "liquidityMinBuffer",
      });
    }
  }

  // --- 5) Borrow to restore liquidity floor when safe ---
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
        trigger: `liquidity=${liquidity.toFixed(2)} < liquidityMin=${liquidityMin.toFixed(2)}, HF=${hf.toFixed(2)}`,
        policyRule: "liquidityMinBuffer",
      });
    }
  }

  // --- 6) Liquidity target ratio management ---
  if (totalUSDC > 0 && liquidityTarget > 0 && liquidityRatio < liquidityTarget) {
    const desiredLiquidity = totalUSDC * liquidityTarget;
    const shortfall = desiredLiquidity - liquidity;
    if (shortfall > 0.01) {
      const borrowHeadroom = Math.max(0, maxBorrow / targetHealth - debt);
      if (borrowHeadroom > 0.01 && hf >= targetHealth) {
        const borrowAmount = Math.min(shortfall, borrowHeadroom);
        actions.push({
          type: "borrow",
          amountUSDC: borrowAmount,
          rationale: `Raise liquidity to target ${(liquidityTarget * 100).toFixed(0)}% by borrowing ${borrowAmount.toFixed(2)}.`,
          trigger: `liquidityRatio=${(liquidityRatio * 100).toFixed(1)}% < target=${(liquidityTarget * 100).toFixed(0)}%`,
          policyRule: "liquidityTargetRatio",
        });
      } else if (spendableReserve > 0.01) {
        const rebalanceAmt = Math.min(shortfall, spendableReserve);
        actions.push({
          type: "rebalance",
          amountUSDC: rebalanceAmt,
          from: "reserve",
          to: "liquidity",
          rationale: `Top up liquidity to target using reserve ${rebalanceAmt.toFixed(2)}.`,
          trigger: `liquidityRatio=${(liquidityRatio * 100).toFixed(1)}% < target=${(liquidityTarget * 100).toFixed(0)}%`,
          policyRule: "liquidityTargetRatio",
        });
      }
    }
  }

  // --- 7) Yield automation: rescue ops from yield if liquidity low ---
  if (!DISABLE_YIELD && rescueLiquidityFirst && yieldBal > 0) {
    const shortfall = liquidityMin - liquidity;
    const moveAmount = Math.min(shortfall, yieldBal);
    if (moveAmount > 0.01) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveAmount,
        from: "yield",
        to: "liquidity",
        rationale: `Pull ${moveAmount.toFixed(2)} from yield to restore liquidity floor.`,
        trigger: `liquidity=${liquidity.toFixed(2)} < liquidityMin=${liquidityMin.toFixed(2)}`,
        policyRule: "liquidityMinBuffer",
      });
    }
  }

  // --- 8) Yield automation: refill reserve from yield if reserve below target ---
  if (!DISABLE_YIELD && reserveTarget > 0 && reserveRatio < reserveTarget && yieldBal > 0 && hf >= minHealth) {
    const desiredReserve = totalUSDC * reserveTarget;
    const deficit = desiredReserve - reserve;
    const moveAmount = Math.min(deficit, yieldBal);
    if (moveAmount > 0.01) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveAmount,
        from: "yield",
        to: "reserve",
        rationale: `Refill reserve using yield ${moveAmount.toFixed(2)} to reach target ${(reserveTarget * 100).toFixed(0)}%.`,
        trigger: `reserveRatio=${(reserveRatio * 100).toFixed(1)}% < target=${(reserveTarget * 100).toFixed(0)}%`,
        policyRule: "reserveRatio",
      });
    }
  }

  // --- 9) Yield automation: park excess reserve into yield when buffers met ---
  if (!DISABLE_YIELD && reserveTarget > 0 && reserveRatio > reserveTarget + reserveBuffer && hf >= targetHealth) {
    const total = Math.max(totalUSDC, 0.0001);
    const currentYieldAlloc = yieldBal / total;
    const yieldRateOk = (snapshot.yieldRatePct ?? 0) >= minTargetYieldPct;
    const allocHeadroom = Math.max(0, maxYieldAllocPct - currentYieldAlloc);

    if (yieldRateOk && allocHeadroom > 0.001) {
      const desiredReserve = totalUSDC * (reserveTarget + reserveBuffer);
      const excess = reserve - desiredReserve;
      const maxMoveByAlloc = totalUSDC * allocHeadroom;
      const moveAmount = Math.min(excess, spendableReserve, maxMoveByAlloc);

      if (moveAmount > 0.01) {
        actions.push({
          type: "rebalance",
          amountUSDC: moveAmount,
          from: "reserve",
          to: "yield",
          rationale: `Park ${moveAmount.toFixed(2)} into yield (yieldRate ${(snapshot.yieldRatePct ?? 0).toFixed(2)}% >= ${minTargetYieldPct}%, alloc ${(currentYieldAlloc * 100).toFixed(1)}% < cap ${(maxYieldAllocPct * 100).toFixed(0)}%).`,
          trigger: `reserveRatio=${(reserveRatio * 100).toFixed(1)}% > target+buffer=${((reserveTarget + reserveBuffer) * 100).toFixed(0)}%, allocHeadroom=${(allocHeadroom * 100).toFixed(1)}%`,
          policyRule: "yieldParking",
        });
      }
    }
  }

  // --- 10) Reserve ratio management: move excess liquidity to reserve ---
  if (totalUSDC > 0 && reserveTarget > 0 && reserveRatio < reserveTarget && hf >= targetHealth + 0.1) {
    const desiredReserve = totalUSDC * reserveTarget;
    const deficit = desiredReserve - reserve;
    const movable = Math.max(0, spendableLiquidity - liquidityMin);
    const moveAmount = Math.min(deficit, movable);
    if (moveAmount > 0.5) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveAmount,
        from: "liquidity",
        to: "reserve",
        rationale: `Refill reserve to ${(reserveTarget * 100).toFixed(0)}% by moving ${moveAmount.toFixed(2)} from liquidity.`,
        trigger: `reserveRatio=${(reserveRatio * 100).toFixed(1)}% < target=${(reserveTarget * 100).toFixed(0)}%, HF=${hf.toFixed(2)} >= ${(targetHealth + 0.1).toFixed(2)}`,
        policyRule: "reserveRatio",
      });
    }
  }

  // --- 11) Proactive risk tightening: under volatility, strengthen reserve buffer ---
  if (isVolatile && !rescueLiquidityFirst && spendableLiquidity > liquidityMin + 1) {
    // Move excess liquidity above min into reserve to strengthen buffer
    const excessLiquidity = spendableLiquidity - liquidityMin;
    // Move up to half of excess to reserve (don't drain liquidity aggressively)
    const moveToReserve = Math.min(excessLiquidity * 0.5, excessLiquidity);
    if (moveToReserve > 0.5) {
      actions.push({
        type: "rebalance",
        amountUSDC: moveToReserve,
        from: "liquidity",
        to: "reserve",
        rationale: `Proactive risk tightening: vol ${snapshot.volatilityPct.toFixed(1)}% > ${volatilityThreshold}%. Moving ${moveToReserve.toFixed(2)} from liquidity to reserve buffer.`,
        trigger: `vol=${snapshot.volatilityPct.toFixed(1)}% > threshold=${volatilityThreshold}%, excessLiquidity=${excessLiquidity.toFixed(2)}`,
        policyRule: "proactiveRiskTightening",
      });
    }
  }

  // --- 12) Proactive repay if HF has headroom and excess liquidity is sitting idle ---
  if (debt > 0 && hf >= minHealth && hf < targetHealth + 0.5) {
    const repayToImprove = Math.max(0, debt - maxBorrow / (targetHealth + 0.3));
    const availableForRepay = Math.max(0, spendableLiquidity - liquidityMin);
    const repayAmount = Math.min(repayToImprove, availableForRepay, debt);
    if (repayAmount > 1) {
      actions.push({
        type: "repay",
        amountUSDC: repayAmount,
        rationale: `Proactive repay ${repayAmount.toFixed(2)} USDC to improve HF from ${hf.toFixed(2)}.`,
        trigger: `HF=${hf.toFixed(2)} < targetHealth+0.5=${(targetHealth + 0.5).toFixed(2)}, excessLiquidity=${availableForRepay.toFixed(2)}`,
        policyRule: "proactiveRepay",
      });
    }
  }

  const actionSummary = actions.length > 0
    ? actions.map((a) => `${a.type}:${a.amountUSDC.toFixed(2)}`).join(", ")
    : "No actions needed";

  return {
    actions,
    rationale: `HF=${hf.toFixed(2)}, liquidity=${liquidity.toFixed(2)}, debt=${debt.toFixed(2)}, vol=${snapshot.volatilityPct.toFixed(1)}%. ${actionSummary}.`,
  };
}
