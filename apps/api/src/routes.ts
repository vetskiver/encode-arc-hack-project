import { Router, Request, Response } from "express";
import { Redis } from "@upstash/redis";
import { store } from "./store";
import { startAgentLoop, stopAgentLoop } from "./agent/agentLoop";
import { agentTick } from "./agent/agentTick";
import { companyAgentTick } from "./agent/companyAgentTick";
import * as arc from "./integrations/arc";
import * as circle from "./integrations/circle";
import * as stork from "./integrations/stork";
import x402Routes from "./x402Routes";
import { numberToUSDC } from "./integrations/usdc";
import { rationaleHash } from "./utils/hash";
import {
  computeCollateralValueUSDC,
  computeMaxBorrow,
  computeHealthFactor,
  bpsToRatio,
} from "./utils/math";

const router = Router();
router.use(x402Routes);
type BucketName = "liquidity" | "reserve" | "yield" | "creditFacility";

const SHOCK_MULTIPLIER = parseFloat(process.env.SHOCK_MULTIPLIER || "1.5");
const SHOCK_STABLE_DAMPING = parseFloat(process.env.SHOCK_STABLE_DAMPING || "1");

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// GET /api/companies
router.get("/api/companies", async (_req: Request, res: Response) => {
  try {
    const companies = await store.getCompanies();
    res.json(companies.map(c => ({
      id: c.id, name: c.name, address: c.address, riskProfile: c.riskProfile, telemetry: c.telemetry,
    })));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/company/:id/status
router.get("/api/company/:id/status", async (req: Request, res: Response) => {
  try {
    const company = await store.getCompany(req.params.id);
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    const t = company.telemetry;
    res.json({
      agentEnabled: t.agentEnabled, status: t.status, lastReason: t.lastReason,
      nextTickAt: t.nextTickAt, snapshot: t.lastSnapshot,
      company: { id: company.id, name: company.name, riskProfile: company.riskProfile, policy: company.policy },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/company/:id/logs
router.get("/api/company/:id/logs", async (req: Request, res: Response) => {
  try {
    const logs = await store.getCompanyLogs(req.params.id);
    res.json(logs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/company/:id/tick
router.post("/api/company/:id/tick", async (req: Request, res: Response) => {
  try {
    const companyId = req.params.id;
    const company = await store.getCompany(companyId);
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }
    await companyAgentTick(companyId);
    const updated = await store.getCompany(companyId);
    res.json({ executed: true, telemetry: updated?.telemetry });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/platform/summary
router.get("/api/platform/summary", async (_req: Request, res: Response) => {
  try {
    const companies = await store.getCompanies();
    const oraclesBySymbol: Record<string, any> = {};
    await Promise.all(companies.map(async c => {
      const sym = c.oracleSymbol || "USDCUSD";
      if (!oraclesBySymbol[sym]) oraclesBySymbol[sym] = await stork.getPriceForSymbol(sym);
    }));

    let totalCollateralValue = 0, totalDebt = 0, totalLiquidity = 0, totalReserve = 0, totalYield = 0, worstHF = 999;
    let anyRiskMode = false;

    const companySummaries = companies.map(c => {
      const sym = c.oracleSymbol || "USDCUSD";
      const oracle = oraclesBySymbol[sym];
      const collValue = c.collateralUnits * (oracle?.price ?? 1);
      const maxBorrow = collValue * (c.policy.ltvBps / 10000);
      const hf = c.debtUSDC > 0.01 ? maxBorrow / c.debtUSDC : 999;
      totalCollateralValue += collValue; totalDebt += c.debtUSDC;
      totalLiquidity += c.liquidityUSDC; totalReserve += c.reserveUSDC; totalYield += c.yieldUSDC;
      if (hf < worstHF) worstHF = hf;
      if (c.telemetry.status === "Risk Mode") anyRiskMode = true;
      return {
        id: c.id, name: c.name, riskProfile: c.riskProfile, collateralValue: collValue,
        collateralAsset: c.collateralAsset || "RWA", oracleSymbol: sym, oraclePrice: oracle?.price ?? 1,
        debt: c.debtUSDC, healthFactor: hf, liquidity: c.liquidityUSDC, reserve: c.reserveUSDC,
        status: c.telemetry.status, lastReason: c.telemetry.lastReason,
        dailySpentUSDC: c.dailySpentUSDC || 0, dailyMaxUSDC: c.policy.dailyMaxUSDC,
      };
    });

    const weightedHF = totalDebt > 0.01 ? (totalCollateralValue * (6000 / 10000)) / totalDebt : 999;
    const platformOracle = oraclesBySymbol["BTCUSD"] || oraclesBySymbol["ETHUSD"] || oraclesBySymbol["USDCUSD"] || { price: 1, ts: Date.now(), source: "sim", stale: false };
    const refCompany = companies.find(c => c.oracleSymbol === "BTCUSD") || companies.find(c => c.oracleSymbol === "ETHUSD") || companies[0];
    const platformChangePct = refCompany ? await store.getCompanyChangePct(refCompany.id) : 0;

    res.json({
      totalCollateralValue, totalDebt, totalLiquidity: totalLiquidity + totalReserve + totalYield,
      weightedHealthFactor: weightedHF, worstHealthFactor: worstHF,
      systemRisk: anyRiskMode ? "critical" : worstHF < 1.4 ? "warning" : "healthy",
      companies: companySummaries,
      oracle: { price: platformOracle.price, ts: platformOracle.ts, source: platformOracle.source, stale: platformOracle.stale, changePct: platformChangePct },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/demo/shock
router.post("/api/demo/shock", async (req: Request, res: Response) => {
  try {
    const { pct } = req.body;
    if (typeof pct !== "number" || !Number.isFinite(pct)) {
      res.status(400).json({ error: "pct (percentage) is required, e.g. -15 for a 15% drop" }); return;
    }
    const companies = await store.getCompanies();
    const symbols = [...new Set(companies.map(c => c.oracleSymbol || "USDCUSD"))];
    const shockResults: Record<string, { base: number; shocked: number; symbol: string }> = {};

    for (const sym of symbols) {
      const current = await stork.getPriceForSymbol(sym);
      const effectivePct = sym === "USDCUSD" ? pct * SHOCK_STABLE_DAMPING : pct * SHOCK_MULTIPLIER;
      const shockedPrice = current.price * (1 + effectivePct / 100);
      if (shockedPrice <= 0) continue;
      stork.setSimulatedPriceForSymbol(sym, shockedPrice);
      shockResults[sym] = { base: current.price, shocked: shockedPrice, symbol: sym };
    }

    for (const c of companies) {
      const r = shockResults[c.oracleSymbol || "USDCUSD"];
      if (r) await store.seedCompanyShockHistory(c.id, r.base, r.shocked);
    }

    const results: any[] = [];
    for (const id of await store.getAllCompanyIds()) {
      try {
        const c = await store.getCompany(id);
        if (!c) continue;
        const sym = c.oracleSymbol || "USDCUSD";
        const r = shockResults[sym];
        if (r) {
          const hf = c.debtUSDC > 0.01 ? (c.collateralUnits * r.shocked * (c.policy.ltvBps / 10000)) / c.debtUSDC : 999;
          if (hf < c.policy.minHealthBps / 10000) {
            await store.updateCompanyTelemetry(id, { status: "Risk Mode", lastReason: `Price shock ${pct}% (${sym}): HF dropped to ${hf.toFixed(2)}` });
          }
        }
        await companyAgentTick(id);
        const updated = await store.getCompany(id);
        if (!updated) continue;
        results.push({
          id: updated.id, name: updated.name, collateralAsset: updated.collateralAsset || "RWA",
          oracleSymbol: updated.oracleSymbol, shockedPrice: shockResults[updated.oracleSymbol || "USDCUSD"]?.shocked,
          status: updated.telemetry.status, lastReason: updated.telemetry.lastReason,
          healthFactor: updated.telemetry.lastSnapshot?.healthFactor,
        });
      } catch (err: any) { results.push({ id, error: err.message }); }
    }

    const overrideSecs = Math.round((process.env.STORK_OVERRIDE_TTL_MS ? parseInt(process.env.STORK_OVERRIDE_TTL_MS, 10) : 300000) / 1000);
    res.json({ shocked: true, requestedPct: pct, assetShocks: shockResults, companyReactions: results, note: `Override lasts ~${overrideSecs}s.` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/status
router.get("/api/status", async (_req: Request, res: Response) => {
  try {
    const t = await store.getTelemetry();
    res.json({ agentEnabled: t.agentEnabled, status: t.status, lastReason: t.lastReason, nextTickAt: t.nextTickAt, snapshot: t.lastSnapshot });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/start
router.post("/api/agent/start", async (_req: Request, res: Response) => {
  try { startAgentLoop(store.defaultUser); await store.updateTelemetry({ agentEnabled: true }); res.json({ started: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/stop
router.post("/api/agent/stop", async (_req: Request, res: Response) => {
  try { stopAgentLoop(); await store.updateTelemetry({ agentEnabled: false }); res.json({ stopped: true }); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/agent/tick
router.post("/api/agent/tick", async (_req: Request, res: Response) => {
  try {
    await agentTick(store.defaultUser);
    for (const id of await store.getAllCompanyIds()) await companyAgentTick(id);
    const telemetry = await store.getTelemetry();
    res.json({ executed: true, telemetry });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/oracle
router.get("/api/oracle", async (_req: Request, res: Response) => {
  try {
    const data = await stork.getPrice();
    const changePct = await store.getChangePct();
    res.json({ price: data.price, ts: data.ts, changePct, stale: data.stale, source: data.source });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/collateral/register
router.post("/api/collateral/register", async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    if (!amount) { res.status(400).json({ error: "amount required" }); return; }
    const txHash = await arc.registerCollateral(store.defaultUser, BigInt(Math.round(parseFloat(amount) * 1e18)));
    await store.addLog({ ts: Date.now(), action: "registerCollateral", amountUSDC: amount, healthFactor: 999, rationale: `Registered ${amount} collateral units`, circleTxRef: "", arcTxHash: txHash });
    res.json({ txHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/payment/request
router.post("/api/payment/request", async (req: Request, res: Response) => {
  try {
    const { to, amountUSDC } = req.body;
    if (!to || !amountUSDC) { res.status(400).json({ error: "to and amountUSDC required" }); return; }
    await store.queuePayment({ user: store.defaultUser, to, amountUSDC, createdAt: Date.now() });
    res.json({ queued: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/manual/borrow
router.post("/api/manual/borrow", async (req: Request, res: Response) => {
  try {
    const { user, amountUSDC } = req.body;
    if (!user || !amountUSDC) { res.status(400).json({ error: "user and amountUSDC required" }); return; }
    const amount = parseFloat(amountUSDC);
    if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "amountUSDC must be a positive number" }); return; }

    const userState = await arc.getUserState(user);
    const policy = await arc.getPolicy();
    const oracle = await stork.getPrice();
    const priceBigInt = stork.priceToBigInt(oracle.price);
    try { await arc.setOracleSnapshot(priceBigInt, Math.floor(oracle.ts / 1000)); } catch {}

    const collateralValueUSDC = computeCollateralValueUSDC(userState.collateralAmount, priceBigInt);
    const maxBorrowUSDC = computeMaxBorrow(collateralValueUSDC, policy.ltvBps);
    const healthFactor = computeHealthFactor(maxBorrowUSDC, userState.debtUSDC);
    const minHealth = bpsToRatio(policy.minHealthBps);
    const emergencyHealth = bpsToRatio(policy.emergencyHealthBps);
    const targetHealthRatio = parseFloat(process.env.TARGET_HEALTH || "1.6");

    if (healthFactor < minHealth) { res.status(403).json({ error: `Borrow blocked: HF ${healthFactor.toFixed(2)} < min ${minHealth.toFixed(2)}` }); return; }
    if (healthFactor < emergencyHealth) { res.status(403).json({ error: `Borrow blocked: HF ${healthFactor.toFixed(2)} in emergency zone` }); return; }

    const perTxMax = (Number(policy.perTxMaxUSDC) > 0 ? Number(policy.perTxMaxUSDC) : 10 * 1e6) / 1e6;
    if (perTxMax > 0 && amount > perTxMax) { res.status(403).json({ error: `Borrow blocked: exceeds per-tx max ${perTxMax.toFixed(2)} USDC` }); return; }

    const currentDebt = Number(userState.debtUSDC) / 1e6;
    const maxBorrow = Number(maxBorrowUSDC) / 1e6;
    const borrowCap = Math.min(maxBorrow - currentDebt, targetHealthRatio > 0 ? (maxBorrow / targetHealthRatio) - currentDebt : maxBorrow - currentDebt);
    if (borrowCap <= 0.01) { res.status(403).json({ error: `Borrow blocked: no headroom (cap=${borrowCap.toFixed(2)})` }); return; }
    if (amount > borrowCap) { res.status(403).json({ error: `Borrow blocked: ${amount.toFixed(2)} exceeds headroom ${borrowCap.toFixed(2)} USDC` }); return; }

    const amountBigInt = numberToUSDC(amount);
    const result = await circle.transfer("creditFacility", "liquidity", amount);
    const arcTxHash = await arc.recordBorrow(user, amountBigInt, result.circleTxRef);
    try { await arc.logDecision(JSON.stringify({ manual: true, amount, healthFactor: healthFactor.toFixed(4) }), `borrow:${amount}`, rationaleHash(`Manual borrow of ${amount} USDC`)); } catch {}
    await store.addLog({ ts: Date.now(), action: "borrow", amountUSDC: amount.toFixed(6), healthFactor, rationale: `Manual borrow of ${amount} USDC (HF=${healthFactor.toFixed(2)})`, circleTxRef: result.circleTxRef, arcTxHash });
    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/manual/repay
router.post("/api/manual/repay", async (req: Request, res: Response) => {
  try {
    const { user, amountUSDC } = req.body;
    if (!user || !amountUSDC) { res.status(400).json({ error: "user and amountUSDC required" }); return; }
    const amount = parseFloat(amountUSDC);
    if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: "amountUSDC must be a positive number" }); return; }

    const amountBigInt = numberToUSDC(amount);
    const state = await arc.getUserState(user);
    if (amountBigInt > state.debtUSDC) { res.status(400).json({ error: `Repay exceeds debt. Current debt: ${(Number(state.debtUSDC) / 1e6).toFixed(6)} USDC` }); return; }

    const result = await circle.transfer("liquidity", "creditFacility", amount);
    const arcTxHash = await arc.recordRepay(user, amountBigInt, result.circleTxRef);
    try { await arc.logDecision(JSON.stringify({ manual: true, amount }), `repay:${amount}`, rationaleHash(`Manual repay of ${amount} USDC`)); } catch {}
    await store.addLog({ ts: Date.now(), action: "repay", amountUSDC: amount.toFixed(6), healthFactor: 0, rationale: `Manual repay of ${amount} USDC`, circleTxRef: result.circleTxRef, arcTxHash });
    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/user/reset
router.post("/api/user/reset", async (req: Request, res: Response) => {
  try {
    const { user } = req.body;
    if (!user) { res.status(400).json({ error: "user required" }); return; }
    const arcTxHash = await arc.resetUser(user);
    await store.clearPendingPayments();
    await store.addLog({ ts: Date.now(), action: "resetUser", amountUSDC: "0", healthFactor: 0, rationale: `Reset user state for ${user}`, circleTxRef: "", arcTxHash });
    res.json({ arcTxHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/manual/rebalance
router.post("/api/manual/rebalance", async (req: Request, res: Response) => {
  try {
    const { user, fromBucket, toBucket, amountUSDC } = req.body;
    if (!user || !fromBucket || !toBucket || !amountUSDC) { res.status(400).json({ error: "user, fromBucket, toBucket, amountUSDC required" }); return; }
    const validBuckets: BucketName[] = ["liquidity", "reserve", "yield", "creditFacility"];
    if (!validBuckets.includes(fromBucket) || !validBuckets.includes(toBucket)) { res.status(400).json({ error: "invalid bucket" }); return; }

    const amount = parseFloat(amountUSDC);
    const amountBigInt = numberToUSDC(amount);
    const result = await circle.transfer(fromBucket, toBucket, amount);
    const arcTxHash = await arc.recordRebalance(fromBucket, toBucket, amountBigInt, result.circleTxRef);
    const rationale = `Manual rebalance ${amountUSDC} from ${fromBucket} to ${toBucket}`;
    await arc.logDecision(JSON.stringify({ manual: true, amount: amountUSDC, fromBucket, toBucket }), `rebalance:${amountUSDC}`, rationaleHash(rationale));
    await store.addLog({ ts: Date.now(), action: "rebalance", amountUSDC, healthFactor: 0, rationale, circleTxRef: result.circleTxRef, arcTxHash });
    res.json({ circleTxRef: result.circleTxRef, arcTxHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/logs
router.get("/api/logs", async (_req: Request, res: Response) => {
  try { res.json(await store.getActionLogs()); }
  catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/oracle/override
router.post("/api/oracle/override", async (req: Request, res: Response) => {
  try {
    const { price } = req.body;
    if (typeof price !== "number" || price <= 0) { res.status(400).json({ error: "price must be a positive number" }); return; }
    stork.setSimulatedPrice(price);
    await store.resetPriceHistory();
    res.json({ overridden: true, price });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/oracle/override/delta
router.post("/api/oracle/override/delta", async (req: Request, res: Response) => {
  try {
    const { pct } = req.body;
    if (typeof pct !== "number" || !Number.isFinite(pct)) { res.status(400).json({ error: "pct is required and must be a number" }); return; }
    const current = await stork.getPrice();
    const price = current.price * (1 + pct / 100);
    if (price <= 0) { res.status(400).json({ error: "computed price is non-positive" }); return; }
    stork.setSimulatedPrice(price);
    await store.resetPriceHistory();
    const overrideSecs = Math.round((process.env.STORK_OVERRIDE_TTL_MS ? parseInt(process.env.STORK_OVERRIDE_TTL_MS, 10) : 300000) / 1000);
    res.json({ overridden: true, basePrice: current.price, pct, price, note: `Override lasts ~${overrideSecs}s` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/policy/set
router.post("/api/policy/set", async (req: Request, res: Response) => {
  try {
    const { ltvBps = 6000, minHealthBps = 14000, emergencyHealthBps = 12000, liquidityMinUSDC = 500, perTxMaxUSDC = 10000, dailyMaxUSDC = 50000 } = req.body;
    const txHash = await arc.setPolicy(ltvBps, minHealthBps, emergencyHealthBps, BigInt(Math.round(liquidityMinUSDC * 1e6)), BigInt(Math.round(perTxMaxUSDC * 1e6)), BigInt(Math.round(dailyMaxUSDC * 1e6)));
    res.json({ txHash });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/policy
router.get("/api/policy", async (_req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const policy = await arc.getPolicy();
    const liquidityMinUSDC = Number(policy.liquidityMinUSDC) > 0 ? Number(policy.liquidityMinUSDC) / 1e6 : 5;
    const perTxMaxUSDC = Number(policy.perTxMaxUSDC) > 0 ? Number(policy.perTxMaxUSDC) / 1e6 : 10;
    const dailyMaxUSDC = Number(policy.dailyMaxUSDC) > 0 ? Number(policy.dailyMaxUSDC) / 1e6 : 50;
    const [ltrRaw, rrRaw, volRaw, thRaw] = await Promise.all([
      redis.get<string>("policy:liquidityTargetRatio"), redis.get<string>("policy:reserveRatio"),
      redis.get<string>("policy:volatilityThresholdPct"), redis.get<string>("policy:targetHealthRatio"),
    ]);
    res.json({
      ltvBps: policy.ltvBps, minHealthBps: policy.minHealthBps, emergencyHealthBps: policy.emergencyHealthBps,
      liquidityMinUSDC, perTxMaxUSDC, dailyMaxUSDC,
      liquidityTargetRatio: parseFloat(ltrRaw ?? process.env.LIQUIDITY_TARGET_RATIO ?? "0.25"),
      reserveRatio: parseFloat(rrRaw ?? process.env.RESERVE_RATIO ?? "0.30"),
      volatilityThresholdPct: parseFloat(volRaw ?? process.env.VOL_THRESHOLD_PCT ?? "3"),
      targetHealthRatio: parseFloat(thRaw ?? process.env.TARGET_HEALTH ?? "1.6"),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/policy/update
router.post("/api/policy/update", async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const { liquidityTargetRatio, reserveRatio, volatilityThresholdPct, targetHealthRatio } = req.body;
    if (liquidityTargetRatio !== undefined) {
      const v = parseFloat(liquidityTargetRatio);
      if (v < 0 || v > 1) { res.status(400).json({ error: "liquidityTargetRatio must be 0-1" }); return; }
      await redis.set("policy:liquidityTargetRatio", v.toString());
    }
    if (reserveRatio !== undefined) {
      const v = parseFloat(reserveRatio);
      if (v < 0 || v > 1) { res.status(400).json({ error: "reserveRatio must be 0-1" }); return; }
      await redis.set("policy:reserveRatio", v.toString());
    }
    if (volatilityThresholdPct !== undefined) {
      const v = parseFloat(volatilityThresholdPct);
      if (v <= 0 || v > 100) { res.status(400).json({ error: "volatilityThresholdPct must be 0-100" }); return; }
      await redis.set("policy:volatilityThresholdPct", v.toString());
    }
    if (targetHealthRatio !== undefined) {
      const v = parseFloat(targetHealthRatio);
      if (v < 1) { res.status(400).json({ error: "targetHealthRatio must be >= 1" }); return; }
      await redis.set("policy:targetHealthRatio", v.toString());
    }
    const [ltrRaw, rrRaw, volRaw, thRaw] = await Promise.all([
      redis.get<string>("policy:liquidityTargetRatio"), redis.get<string>("policy:reserveRatio"),
      redis.get<string>("policy:volatilityThresholdPct"), redis.get<string>("policy:targetHealthRatio"),
    ]);
    res.json({
      updated: true,
      liquidityTargetRatio: parseFloat(ltrRaw ?? process.env.LIQUIDITY_TARGET_RATIO ?? "0.25"),
      reserveRatio: parseFloat(rrRaw ?? process.env.RESERVE_RATIO ?? "0.30"),
      volatilityThresholdPct: parseFloat(volRaw ?? process.env.VOL_THRESHOLD_PCT ?? "3"),
      targetHealthRatio: parseFloat(thRaw ?? process.env.TARGET_HEALTH ?? "1.6"),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/companies/reset
router.post("/api/companies/reset", async (_req: Request, res: Response) => {
  try {
    await store.resetCompanies();
    await store.resetPriceHistory();
    stork.clearSimulatedPrice();
    res.json({ reset: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;