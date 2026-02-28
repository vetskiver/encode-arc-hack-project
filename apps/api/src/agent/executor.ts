import { PlannedAction, Snapshot } from "./safetyController";
import * as circle from "../integrations/circle";
import * as arc from "../integrations/arc";
import { rationaleHash } from "../utils/hash";
import { numberToUSDC, formatUSDC } from "../integrations/usdc";
import { store, ActionLog } from "../store";

export interface ExecutionResult {
  circleTxRef: string;
  arcTxHash: string;
  action: string;
  amountUSDC: number;
}

export async function executeAction(
  action: PlannedAction,
  snapshot: Snapshot,
  user: string
): Promise<ExecutionResult> {
  let circleTxRef = "";
  let arcTxHash = "";
  const amountBigInt = numberToUSDC(action.amountUSDC);

  switch (action.type) {
    case "borrow": {
      // Transfer from CreditFacility -> Liquidity
      const result = await circle.transfer("creditFacility", "liquidity", action.amountUSDC);
      circleTxRef = result.circleTxRef;
      arcTxHash = await arc.recordBorrow(user, amountBigInt, circleTxRef);
      break;
    }
    case "repay": {
      // Transfer from Liquidity/Reserve -> CreditFacility
      // Split across buckets: draw from liquidity first, then reserve for remainder.
      // Leave GAS_RESERVE (0.5 USDC) in each bucket to cover gas fees.
      const GAS_RESERVE = 0.5;
      const spendableLiq = Math.max(0, snapshot.liquidityUSDC - GAS_RESERVE);
      const spendableRes = Math.max(0, snapshot.reserveUSDC - GAS_RESERVE);
      const totalSpendable = spendableLiq + spendableRes;

      // Cap repay to what's actually available to prevent overdraft
      const repayAmount = Math.min(action.amountUSDC, totalSpendable);
      if (repayAmount < 0.01) {
        throw new Error(
          `Repay failed: insufficient spendable balance. ` +
          `Requested=${action.amountUSDC.toFixed(2)}, spendable=${totalSpendable.toFixed(2)}`
        );
      }

      const fromLiquidity = Math.min(repayAmount, spendableLiq);
      const fromReserve = repayAmount - fromLiquidity;
      const txRefs: string[] = [];

      if (fromLiquidity >= 0.01) {
        const r1 = await circle.transfer("liquidity", "creditFacility", fromLiquidity);
        txRefs.push(r1.circleTxRef);
      }
      if (fromReserve >= 0.01) {
        const r2 = await circle.transfer("reserve", "creditFacility", fromReserve);
        txRefs.push(r2.circleTxRef);
      }

      circleTxRef = txRefs.join("+");
      const repayBigInt = numberToUSDC(repayAmount);
      arcTxHash = await arc.recordRepay(user, repayBigInt, circleTxRef);
      break;
    }
    case "rebalance": {
      const from = (action.from || "reserve") as circle.BucketName;
      const to = (action.to || "liquidity") as circle.BucketName;
      const result = await circle.transfer(from, to, action.amountUSDC);
      circleTxRef = result.circleTxRef;
      arcTxHash = await arc.recordRebalance(
        action.from || "reserve",
        action.to || "liquidity",
        amountBigInt,
        circleTxRef
      );
      break;
    }
    case "payment": {
      const recipient = action.to || "0x0";
      const result = await circle.transfer("liquidity", recipient, action.amountUSDC);
      circleTxRef = result.circleTxRef;
      arcTxHash = await arc.recordPayment(user, recipient, amountBigInt, circleTxRef);
      break;
    }
  }

  // Log decision on Arc with V2 enhanced context
  const snapshotStr = JSON.stringify({
    hf: snapshot.healthFactor.toFixed(4),
    debt: formatUSDC(snapshot.debtUSDC),
    maxBorrow: formatUSDC(snapshot.maxBorrowUSDC),
    price: snapshot.oraclePrice,
    volatilityPct: snapshot.volatilityPct,
    liquidityRatio: snapshot.liquidityRatio,
    reserveRatio: snapshot.reserveRatio,
    trigger: action.trigger || "",
    policyRule: action.policyRule || "",
  });
  const rHash = rationaleHash(action.rationale);
  await arc.logDecision(snapshotStr, `${action.type}:${action.amountUSDC}`, rHash);

  // Store in local action log with V2 enhanced fields
  const log: ActionLog = {
    ts: Date.now(),
    action: action.type,
    amountUSDC: action.amountUSDC.toFixed(6),
    healthFactor: snapshot.healthFactor,
    rationale: action.rationale,
    circleTxRef,
    arcTxHash,
    // V2 enhanced logging
    trigger: action.trigger || `price=${snapshot.oraclePrice.toFixed(2)}, vol=${snapshot.volatilityPct.toFixed(1)}%, HF=${snapshot.healthFactor.toFixed(2)}`,
    policyRule: action.policyRule || action.type,
    fromBucket: action.from,
    toBucket: action.to,
    hfBefore: snapshot.healthFactor,
    liquidityBefore: snapshot.liquidityUSDC,
    reserveBefore: snapshot.reserveUSDC,
  };
  store.addLog(log);

  return {
    circleTxRef,
    arcTxHash,
    action: action.type,
    amountUSDC: action.amountUSDC,
  };
}
