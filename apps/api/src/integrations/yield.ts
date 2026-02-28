import { randomUUID } from "crypto";

/**
 * Simple yield-rate feed.
 * - Defaults to env YIELD_RATE_PCT (percent APY)
 * - Optional simulated drift within +/- 50 bps to look dynamic
 */

export interface YieldData {
  ratePct: number; // annualized percent, e.g., 5.2
  ts: number;      // timestamp ms
  source: "env" | "sim";
  stale: boolean;
  id: string;      // unique sample id for logging/debug
}

const BASE_RATE = parseFloat(process.env.YIELD_RATE_PCT || "5");
const DRIFT_BPS = parseFloat(process.env.YIELD_DRIFT_BPS || "50"); // +/-0.50% by default
const FRESH_MS = 60_000; // consider stale after 1 minute (UI only)

let lastSample: YieldData | null = null;

function sample(): YieldData {
  const drift = DRIFT_BPS > 0 ? (Math.random() * DRIFT_BPS * 2 - DRIFT_BPS) / 100 : 0;
  const ratePct = Math.max(0, BASE_RATE + drift);
  const ts = Date.now();
  return {
    ratePct,
    ts,
    source: "env",
    stale: false,
    id: randomUUID(),
  };
}

export async function getYieldRate(): Promise<YieldData> {
  // lightweight: just resample every call; cache optional if needed
  lastSample = sample();
  return lastSample;
}

export function getCachedYieldRate(): YieldData | null {
  if (!lastSample) return null;
  const stale = Date.now() - lastSample.ts > FRESH_MS;
  return { ...lastSample, stale };
}
