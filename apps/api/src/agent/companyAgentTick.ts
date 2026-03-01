/**
 * Per-company agent tick that operates on the company's simulated state.
 * Uses the same planner + safety controller but with per-company risk parameters.
 * Circle/Arc calls go through the shared infrastructure (single contract, shared wallets)
 * but state is tracked per-company in the store.
 */
import * as stork from "../integrations/stork";
import * as arc from "../integrations/arc";
import * as circle from "../integrations/circle";
import { store, ActionLog, CompanyProfile } from "../store";
import { planner } from "./planner";
import { safetyController, Snapshot, PlannedAction } from "./safetyController";
import { rationaleHash } from "../utils/hash";

export async function companyAgentTick(companyId: string): Promise<void> {
  const company = store.getCompany(companyId);
  if (!company) {
    console.warn(`[CompanyTick] Unknown company: ${companyId}`);
    return;
  }

  store.updateCompanyTelemetry(companyId, { status: "Executing" });

  try {
    // 1. Read per-company Stork price (uses company's collateral oracle symbol)
    const oracleSymbol = company.oracleSymbol || "USDCUSD";
    const oracle = await stork.getPriceForSymbol(oracleSymbol);
    if (oracle.price <= 0) {
      store.updateCompanyTelemetry(companyId, {
        status: "Risk Mode",
        lastReason: "Oracle returned invalid price",
      });
      return;
    }

    // Track per-company price history (for per-company volatility)
    store.addCompanyPrice(companyId, oracle.price, oracle.ts);
    const changePct = store.getCompanyChangePct(companyId);
    // Also update shared history (for backwards-compat / platform overview)
    store.addPrice(oracle.price, oracle.ts);

    // Push oracle price on-chain so Arc contract has up-to-date data (non-fatal)
    try {
      const priceBigInt = stork.priceToBigInt(oracle.price);
      await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000));
    } catch (oracleErr: any) {
      console.warn(`[CompanyTick:${companyId}] setOracleSnapshot failed (non-fatal):`, oracleErr.message);
    }

    // 2. Compute metrics from per-company state
    const collateralValueUSDC = company.collateralUnits * oracle.price;
    const maxBorrowUSDC = collateralValueUSDC * (company.policy.ltvBps / 10000);
    const debtUSDC = company.debtUSDC;
    const healthFactor = debtUSDC > 0.01 ? maxBorrowUSDC / debtUSDC : 999;

    const totalUSDC = company.liquidityUSDC + company.reserveUSDC + company.yieldUSDC;
    const liquidityRatio = totalUSDC > 0 ? company.liquidityUSDC / totalUSDC : 0;
    const reserveRatioActual = totalUSDC > 0 ? company.reserveUSDC / totalUSDC : 0;

    const pending = store.getCompanyPendingPayment(companyId);

    const p = company.policy;

    const dailyRemaining = store.getCompanyDailyRemaining(companyId);
    const dailySpent = company.dailySpentUSDC || 0;

    const snapshot: Snapshot = {
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
      oracleStale: oracle.stale,
      oracleSource: oracle.source,
      changePct,
      collateralAmount: BigInt(Math.round(company.collateralUnits * 1e18)),
      collateralValueUSDC: BigInt(Math.round(collateralValueUSDC * 1e6)),
      debtUSDC: BigInt(Math.round(debtUSDC * 1e6)),
      maxBorrowUSDC: BigInt(Math.round(maxBorrowUSDC * 1e6)),
      healthFactor,
      liquidityUSDC: company.liquidityUSDC,
      reserveUSDC: company.reserveUSDC,
      yieldUSDC: company.yieldUSDC,
      pendingPayment: pending
        ? { to: pending.to, amountUSDC: parseFloat(pending.amountUSDC) }
        : null,
      policy: {
        ltvBps: p.ltvBps,
        minHealthBps: p.minHealthBps,
        emergencyHealthBps: p.emergencyHealthBps,
        liquidityMinUSDC: 5 * 1e6,
        perTxMaxUSDC: p.perTxMaxUSDC * 1e6,
        dailyMaxUSDC: p.dailyMaxUSDC * 1e6,
        liquidityTargetRatio: p.liquidityTargetRatio,
        reserveRatio: p.reserveRatio,
        volatilityThresholdPct: p.volatilityThresholdPct,
        targetHealthRatio: p.targetHealthRatio,
        maxYieldAllocPct: 0,
        minTargetYieldPct: 99,
      },
      dailySpentUSDC: dailySpent,
      totalUSDC,
      liquidityRatio,
      reserveRatio: reserveRatioActual,
      volatilityPct: Math.abs(changePct),
      yieldRatePct: 0,
    };

    // Save snapshot to telemetry
    const snapshotForUI = {
      oraclePrice: oracle.price,
      oracleTs: oracle.ts,
      oracleStale: oracle.stale,
      oracleSource: oracle.source,
      changePct,
      collateralAmount: (company.collateralUnits * 1e18).toString(),
      collateralValueUSDC: collateralValueUSDC.toFixed(6),
      debtUSDC: debtUSDC.toFixed(6),
      maxBorrowUSDC: maxBorrowUSDC.toFixed(6),
      healthFactor,
      liquidityUSDC: company.liquidityUSDC.toFixed(6),
      reserveUSDC: company.reserveUSDC.toFixed(6),
      yieldUSDC: company.yieldUSDC.toFixed(6),
      pendingPayment: pending
        ? { to: pending.to, amountUSDC: pending.amountUSDC }
        : null,
      liquidityRatio: liquidityRatio.toFixed(4),
      reserveRatio: reserveRatioActual.toFixed(4),
      volatilityPct: Math.abs(changePct).toFixed(2),
      targetHealth: p.targetHealthRatio,
      liquidityTargetRatio: p.liquidityTargetRatio,
      reserveRatioTarget: p.reserveRatio,
      volatilityThreshold: p.volatilityThresholdPct,
      // Company-specific policy (for UI display)
      companyPolicy: {
        ltvBps: p.ltvBps,
        minHealthBps: p.minHealthBps,
        emergencyHealthBps: p.emergencyHealthBps,
        riskProfile: company.riskProfile,
      },
      // RWA collateral asset info
      collateralAsset: company.collateralAsset || "RWA",
      oracleSymbol: oracleSymbol,
      // Daily spend info for UI
      dailySpentUSDC: dailySpent,
      dailyMaxUSDC: p.dailyMaxUSDC,
      dailyRemainingUSDC: dailyRemaining,
    };
    store.updateCompanyTelemetry(companyId, { lastSnapshot: snapshotForUI });

    // 3. Planner proposes actions
    const proposal = planner(snapshot);

    // 4. Safety controller validates
    const safetyResult = safetyController(snapshot, proposal);

    if (!safetyResult.allowed) {
      const status = safetyResult.riskMode ? "Risk Mode" : "Monitoring";
      store.updateCompanyTelemetry(companyId, {
        status,
        lastReason: `Blocked: ${safetyResult.reason}`,
      });

      store.addCompanyLog(companyId, {
        ts: Date.now(),
        action: "BLOCKED",
        amountUSDC: "0",
        healthFactor,
        rationale: safetyResult.reason,
        circleTxRef: "",
        arcTxHash: "",
        trigger: `price=${oracle.price.toFixed(4)}, vol=${Math.abs(changePct).toFixed(1)}%, HF=${healthFactor.toFixed(2)}`,
        policyRule: "safetyBlock",
        hfBefore: healthFactor,
      });
      return;
    }

    // 5. Execute actions (real Circle USDC transfers + Arc on-chain recording)
    for (const action of safetyResult.plan.actions) {
      await executeCompanyAction(companyId, action, snapshot);
    }

    // 6. Post-execution: recompute HF
    const postCompany = store.getCompany(companyId)!;
    const postCollValue = postCompany.collateralUnits * oracle.price;
    const postMaxBorrow = postCollValue * (p.ltvBps / 10000);
    const postHF = postCompany.debtUSDC > 0.01 ? postMaxBorrow / postCompany.debtUSDC : 999;

    // Update recent logs with post-execution HF
    const recentLogs = postCompany.actionLogs.slice(0, safetyResult.plan.actions.length);
    for (const log of recentLogs) {
      log.hfAfter = postHF;
      log.liquidityAfter = postCompany.liquidityUSDC;
      log.reserveAfter = postCompany.reserveUSDC;
    }

    // Update snapshot with post values
    store.updateCompanyTelemetry(companyId, {
      lastSnapshot: {
        ...snapshotForUI,
        debtUSDC: postCompany.debtUSDC.toFixed(6),
        healthFactor: postHF,
        liquidityUSDC: postCompany.liquidityUSDC.toFixed(6),
        reserveUSDC: postCompany.reserveUSDC.toFixed(6),
        maxBorrowUSDC: postMaxBorrow.toFixed(6),
        collateralValueUSDC: postCollValue.toFixed(6),
        liquidityRatio: ((postCompany.liquidityUSDC + postCompany.reserveUSDC + postCompany.yieldUSDC) > 0
          ? postCompany.liquidityUSDC / (postCompany.liquidityUSDC + postCompany.reserveUSDC + postCompany.yieldUSDC)
          : 0).toFixed(4),
        reserveRatio: ((postCompany.liquidityUSDC + postCompany.reserveUSDC + postCompany.yieldUSDC) > 0
          ? postCompany.reserveUSDC / (postCompany.liquidityUSDC + postCompany.reserveUSDC + postCompany.yieldUSDC)
          : 0).toFixed(4),
      },
    });

    // 7. Update telemetry status — use PRE-execution HF so risk events are always surfaced
    const minHealth = p.minHealthBps / 10000;
    const preIsRisk = healthFactor < minHealth || Math.abs(changePct) > p.volatilityThresholdPct;

    if (preIsRisk) {
      store.updateCompanyTelemetry(companyId, {
        status: "Risk Mode",
        lastReason: `Risk: HF ${healthFactor.toFixed(2)} → ${postHF.toFixed(2)}, vol=${changePct.toFixed(1)}%, executed ${safetyResult.plan.actions.length} action(s)`,
      });
    } else if (safetyResult.plan.actions.length > 0) {
      store.updateCompanyTelemetry(companyId, {
        status: "Monitoring",
        lastReason: `Executed ${safetyResult.plan.actions.length} action(s): ${safetyResult.plan.rationale}`,
      });
    } else {
      store.updateCompanyTelemetry(companyId, {
        status: "Monitoring",
        lastReason: `All healthy. HF=${postHF.toFixed(2)}, liq=$${postCompany.liquidityUSDC.toFixed(2)}`,
      });
    }

    console.log(`[CompanyTick:${companyId}] Done. HF=${postHF.toFixed(2)}, actions=${safetyResult.plan.actions.length}`);
  } catch (err: any) {
    console.error(`[CompanyTick:${companyId}] Error:`, err.message);
    store.updateCompanyTelemetry(companyId, {
      status: "Risk Mode",
      lastReason: `Error: ${err.message}`,
    });
  }
}

async function executeCompanyAction(
  companyId: string,
  action: PlannedAction,
  snapshot: Snapshot
): Promise<void> {
  const company = store.getCompany(companyId)!;
  const amount = action.amountUSDC;
  const amountBigInt = BigInt(Math.round(amount * 1e6));
  const companyAddress = company.address;

  let circleTxRef = `sim-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let arcTxHash = `sim-arc-${companyId}-${Date.now().toString(16)}`;

  switch (action.type) {
    case "borrow": {
      // Real Circle: creditFacility -> liquidity
      try {
        const result = await circle.transfer("creditFacility", "liquidity", amount);
        circleTxRef = result.circleTxRef;
        console.log(`[CompanyTick:${companyId}] Circle borrow tx: ${circleTxRef}`);
      } catch (circleErr: any) {
        console.warn(`[CompanyTick:${companyId}] Circle borrow failed (using sim ref):`, circleErr.message);
      }

      // Update in-memory state
      company.debtUSDC += amount;
      company.liquidityUSDC += amount;

      // Real Arc: record borrow on-chain
      try {
        arcTxHash = await arc.recordBorrow(companyAddress, amountBigInt, circleTxRef);
        console.log(`[CompanyTick:${companyId}] Arc recordBorrow: ${arcTxHash}`);
      } catch (arcErr: any) {
        console.warn(`[CompanyTick:${companyId}] Arc recordBorrow failed (non-fatal):`, arcErr.message);
      }
      break;
    }

    case "repay": {
      const GAS_RESERVE = 0.5;
      const spendableLiq = Math.max(0, company.liquidityUSDC - GAS_RESERVE);
      const spendableRes = Math.max(0, company.reserveUSDC - GAS_RESERVE);
      const actualRepay = Math.min(amount, spendableLiq + spendableRes);

      if (actualRepay < 0.01) break;

      const fromLiquidity = Math.min(actualRepay, spendableLiq);
      const fromReserve = actualRepay - fromLiquidity;
      const txRefs: string[] = [];

      // Real Circle: liquidity -> creditFacility (and/or reserve -> creditFacility)
      try {
        if (fromLiquidity >= 0.01) {
          const r1 = await circle.transfer("liquidity", "creditFacility", fromLiquidity);
          txRefs.push(r1.circleTxRef);
        }
        if (fromReserve >= 0.01) {
          const r2 = await circle.transfer("reserve", "creditFacility", fromReserve);
          txRefs.push(r2.circleTxRef);
        }
        if (txRefs.length > 0) {
          circleTxRef = txRefs.join("+");
          console.log(`[CompanyTick:${companyId}] Circle repay tx: ${circleTxRef}`);
        }
      } catch (circleErr: any) {
        console.warn(`[CompanyTick:${companyId}] Circle repay failed (using sim ref):`, circleErr.message);
      }

      // Update in-memory state
      company.liquidityUSDC = Math.max(0, company.liquidityUSDC - Math.max(0, fromLiquidity));
      company.reserveUSDC = Math.max(0, company.reserveUSDC - fromReserve);
      company.debtUSDC = Math.max(0, company.debtUSDC - actualRepay);

      // Real Arc: record repay on-chain
      try {
        arcTxHash = await arc.recordRepay(companyAddress, BigInt(Math.round(actualRepay * 1e6)), circleTxRef);
        console.log(`[CompanyTick:${companyId}] Arc recordRepay: ${arcTxHash}`);
      } catch (arcErr: any) {
        console.warn(`[CompanyTick:${companyId}] Arc recordRepay failed (non-fatal):`, arcErr.message);
      }
      break;
    }

    case "rebalance": {
      const from = action.from || "reserve";
      const to = action.to || "liquidity";
      const available = getBucketBalance(company, from) - 0.5;
      const transferAmt = Math.min(amount, Math.max(0, available));

      if (transferAmt < 0.01) break;

      // Real Circle: bucket-to-bucket transfer
      try {
        const result = await circle.transfer(
          from as circle.BucketName,
          to as circle.BucketName,
          transferAmt
        );
        circleTxRef = result.circleTxRef;
        console.log(`[CompanyTick:${companyId}] Circle rebalance tx: ${circleTxRef}`);
      } catch (circleErr: any) {
        console.warn(`[CompanyTick:${companyId}] Circle rebalance failed (using sim ref):`, circleErr.message);
      }

      // Update in-memory state
      subtractBucket(company, from, transferAmt);
      addBucket(company, to, transferAmt);

      // Real Arc: record rebalance on-chain
      try {
        arcTxHash = await arc.recordRebalance(from, to, BigInt(Math.round(transferAmt * 1e6)), circleTxRef);
        console.log(`[CompanyTick:${companyId}] Arc recordRebalance: ${arcTxHash}`);
      } catch (arcErr: any) {
        console.warn(`[CompanyTick:${companyId}] Arc recordRebalance failed (non-fatal):`, arcErr.message);
      }
      break;
    }

    case "payment": {
      const recipient = action.to || "0x0";
      const payAmt = Math.min(amount, Math.max(0, company.liquidityUSDC - 0.5));

      if (payAmt < 0.01) break;

      // Real Circle: liquidity -> external recipient
      try {
        const result = await circle.transfer("liquidity", recipient, payAmt);
        circleTxRef = result.circleTxRef;
        console.log(`[CompanyTick:${companyId}] Circle payment tx: ${circleTxRef} -> ${recipient}`);
      } catch (circleErr: any) {
        console.warn(`[CompanyTick:${companyId}] Circle payment failed (using sim ref):`, circleErr.message);
      }

      // Update in-memory state
      company.liquidityUSDC = Math.max(0, company.liquidityUSDC - payAmt);
      store.removeCompanyPendingPayment(companyId);

      // Real Arc: record payment on-chain
      try {
        arcTxHash = await arc.recordPayment(companyAddress, recipient, BigInt(Math.round(payAmt * 1e6)), circleTxRef);
        console.log(`[CompanyTick:${companyId}] Arc recordPayment: ${arcTxHash}`);
      } catch (arcErr: any) {
        console.warn(`[CompanyTick:${companyId}] Arc recordPayment failed (non-fatal):`, arcErr.message);
      }
      break;
    }
  }

  // Persist updated company state
  store.updateCompany(companyId, {
    debtUSDC: company.debtUSDC,
    liquidityUSDC: company.liquidityUSDC,
    reserveUSDC: company.reserveUSDC,
    yieldUSDC: company.yieldUSDC,
  });

  // Record daily spend for borrow and payment actions
  if (action.type === "borrow" || action.type === "payment") {
    store.recordCompanyDailySpend(companyId, amount);
  }

  // Log decision on Arc with full context
  try {
    const snapshotStr = JSON.stringify({
      hf: snapshot.healthFactor.toFixed(4),
      debt: (Number(snapshot.debtUSDC) / 1e6).toFixed(2),
      price: snapshot.oraclePrice,
      vol: snapshot.volatilityPct.toFixed(1),
      trigger: action.trigger || "",
      rule: action.policyRule || action.type,
      company: companyId,
    });
    const rHash = rationaleHash(action.rationale);
    const decisionHash = await arc.logDecision(snapshotStr, `${action.type}:${amount.toFixed(2)}`, rHash);
    if (!arcTxHash.startsWith("sim-")) {
      // Keep the recordBorrow/Repay/etc hash as primary; logDecision is supplementary
    } else {
      arcTxHash = decisionHash;
    }
  } catch (arcErr: any) {
    console.warn(`[CompanyTick:${companyId}] Arc logDecision failed (non-fatal):`, arcErr.message);
  }

  // Log the action
  const log: ActionLog = {
    ts: Date.now(),
    action: action.type,
    amountUSDC: amount.toFixed(6),
    healthFactor: snapshot.healthFactor,
    rationale: action.rationale,
    circleTxRef,
    arcTxHash,
    companyId,
    trigger: action.trigger || `price=${snapshot.oraclePrice.toFixed(4)}, vol=${snapshot.volatilityPct.toFixed(1)}%, HF=${snapshot.healthFactor.toFixed(2)}`,
    policyRule: action.policyRule || action.type,
    fromBucket: action.from,
    toBucket: action.to,
    hfBefore: snapshot.healthFactor,
    liquidityBefore: snapshot.liquidityUSDC,
    reserveBefore: snapshot.reserveUSDC,
  };
  store.addCompanyLog(companyId, log);
}

function getBucketBalance(company: CompanyProfile, bucket: string): number {
  switch (bucket) {
    case "liquidity": return company.liquidityUSDC;
    case "reserve": return company.reserveUSDC;
    case "yield": return company.yieldUSDC;
    default: return 0;
  }
}

function subtractBucket(company: CompanyProfile, bucket: string, amount: number): void {
  switch (bucket) {
    case "liquidity": company.liquidityUSDC = Math.max(0, company.liquidityUSDC - amount); break;
    case "reserve": company.reserveUSDC = Math.max(0, company.reserveUSDC - amount); break;
    case "yield": company.yieldUSDC = Math.max(0, company.yieldUSDC - amount); break;
  }
}

function addBucket(company: CompanyProfile, bucket: string, amount: number): void {
  switch (bucket) {
    case "liquidity": company.liquidityUSDC += amount; break;
    case "reserve": company.reserveUSDC += amount; break;
    case "yield": company.yieldUSDC += amount; break;
  }
}
