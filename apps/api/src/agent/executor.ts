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
      const fromBucket = snapshot.liquidityUSDC >= action.amountUSDC ? "liquidity" : "reserve";
      const result = await circle.transfer(
        fromBucket as circle.BucketName,
        "creditFacility",
        action.amountUSDC
      );
      circleTxRef = result.circleTxRef;
      arcTxHash = await arc.recordRepay(user, amountBigInt, circleTxRef);
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

  // Log decision on Arc
  const snapshotStr = JSON.stringify({
    hf: snapshot.healthFactor.toFixed(4),
    debt: formatUSDC(snapshot.debtUSDC),
    maxBorrow: formatUSDC(snapshot.maxBorrowUSDC),
    price: snapshot.oraclePrice,
  });
  const rHash = rationaleHash(action.rationale);
  await arc.logDecision(snapshotStr, `${action.type}:${action.amountUSDC}`, rHash);

  // Store in local action log
  const log: ActionLog = {
    ts: Date.now(),
    action: action.type,
    amountUSDC: action.amountUSDC.toFixed(6),
    healthFactor: snapshot.healthFactor,
    rationale: action.rationale,
    circleTxRef,
    arcTxHash,
  };
  store.addLog(log);

  return {
    circleTxRef,
    arcTxHash,
    action: action.type,
    amountUSDC: action.amountUSDC,
  };
}
