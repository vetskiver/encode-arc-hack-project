import axios from "axios";
import { ethers } from "ethers";

const STORK_BASE_URL = "https://rest.jp.stork-oracle.network";
const FRESHNESS_THRESHOLD_MS = 3_600_000; // 1 hour
const CACHE_TTL_MS = 15_000; // 15 seconds

const DEFAULT_ARC_STORK_ADDRESS =
  "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62";

const FEED_ID_BY_SYMBOL: Record<string, string> = {
  USDCUSD: "0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c",
  BTCUSD: "0x7404e3d104ea7841c3d9e6fd20adfe99b4ad586bc08d8f3bd3afef894cf184de",
};

const OVERRIDE_TTL_MS = 60_000; // 1 minute pause on live fetches after override
const DRIFT_PROB = parseFloat(process.env.STORK_DRIFT_PROB || "0"); // 0..1 chance per getPrice call
const DRIFT_UP_MAX = parseFloat(process.env.STORK_DRIFT_UP_MAX || "0.05"); // e.g., 0.05 => +5% max
const DRIFT_DOWN_MAX = parseFloat(process.env.STORK_DRIFT_DOWN_MAX || "0.10"); // e.g., 0.10 => -10% max

let apiKey: string = "";
let assetSymbol: string = "";
let useOnchain: boolean = false;
let onchainFeedId: string = "";
let onchainAddress: string = "";
let onchainProvider: ethers.JsonRpcProvider | null = null;
let onchainContract: ethers.Contract | null = null;
let warnedMissingOnchainConfig = false;

// Track the last on-chain Stork timestamp we actually used, so we only switch
// back to Stork when a newer oracle update arrives.
let lastStorkTsUsed = 0;

// Override cache
let overridePrice: number | null = null;
let overrideTs: number = 0;

export function initStork(): void {
  apiKey = process.env.STORK_API_KEY || "";
  assetSymbol = process.env.STORK_ASSET_SYMBOL || "USDCUSD";
  useOnchain =
    (process.env.STORK_USE_ONCHAIN || "").toLowerCase() === "true" ||
    process.env.STORK_USE_ONCHAIN === "1";
  onchainFeedId = process.env.STORK_FEED_ID || FEED_ID_BY_SYMBOL[assetSymbol] || "";
  onchainAddress = process.env.STORK_ONCHAIN_ADDRESS || DEFAULT_ARC_STORK_ADDRESS;

  const hasStorkApi = !!apiKey;
  const hasOnchain = useOnchain && !!onchainFeedId;

  if (!hasStorkApi && !hasOnchain) {
    console.error(
      "[Stork] CRITICAL: No oracle source configured. " +
      "Set STORK_API_KEY or enable STORK_USE_ONCHAIN. " +
      "Agent will operate in risk mode with simulated prices."
    );
  }

  if (hasStorkApi) {
    console.log("[Stork] Initialized for asset:", assetSymbol);
  } else if (hasOnchain) {
    console.log("[Stork] On-chain mode enabled for feed:", assetSymbol);
  }
}

export interface OracleData {
  price: number;
  ts: number;
  stale: boolean;
  source: "stork" | "sim";
}

// Simulated price for when Stork is not configured (keep near-par to avoid volatility spikes)
let simPrice = 1.0;
let simTs = Date.now();
let lastGood: OracleData | null = null;

type CacheEntry = {
  data: OracleData;
  fetchedAt: number;
};

const cacheByAsset: Record<string, CacheEntry | undefined> = {};

function toNumber(val: number | string | bigint | undefined): number {
  if (val === undefined) return NaN;
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  return Number(val);
}

function normalizeTimestampMs(raw: number | string | bigint | undefined): number {
  const ts = toNumber(raw);
  if (!Number.isFinite(ts)) return Date.now();

  // Heuristic: >1e15 => nanoseconds, >1e12 => milliseconds, else seconds.
  if (ts > 1e15) return ts / 1e6;
  if (ts > 1e12) return ts;
  return ts * 1000;
}

// Occasionally inject a simulated drift to mimic market shocks; lasts OVERRIDE_TTL_MS.
function maybeInjectRandomDrift(): void {
  if (DRIFT_PROB <= 0) return;
  if (overridePrice !== null && Date.now() - overrideTs < OVERRIDE_TTL_MS) return;
  if (Math.random() >= DRIFT_PROB) return;

  const base = Number.isFinite(lastGood?.price) ? lastGood!.price : simPrice;
  const biasDown = 0.6; // skew toward negative shocks
  const isDown = Math.random() < biasDown;
  const maxPct = isDown ? DRIFT_DOWN_MAX : DRIFT_UP_MAX;
  if (maxPct <= 0) return;

  // Mild randomness with occasional larger shock
  let pct = Math.random() * maxPct;
  const shock = Math.random() < 0.25;
  if (shock) pct *= 1.5;
  if (isDown) pct *= -1;

  const price = base * (1 + pct);
  if (price <= 0) return;

  overridePrice = price;
  overrideTs = Date.now();
  console.log(`[Stork] Injected drift ${ (pct * 100).toFixed(2) }% -> ${price.toFixed(6)} (base ${base.toFixed(6)})`);
}

function isStale(ts: number): boolean {
  return Date.now() - ts > FRESHNESS_THRESHOLD_MS;
}

export function setSimulatedPrice(price: number): void {
  simPrice = price;
  simTs = Date.now();
  overridePrice = price;
  overrideTs = Date.now();
}

export async function getPrice(): Promise<OracleData> {
  // Allow probabilistic drift injection for demo/testing
  maybeInjectRandomDrift();

  // If an override was set recently, return it and skip live fetches
  if (overridePrice !== null && Date.now() - overrideTs < OVERRIDE_TTL_MS) {
    return {
      price: overridePrice,
      ts: overrideTs,
      stale: false,
      source: "sim",
    };
  }

  // 1) Fetch Stork (on-chain or API).
  let storkData: OracleData | null = null;
  if (useOnchain) {
    storkData = await getOnchainPrice();
  } else {
    storkData = await getStorkApiPrice();
  }

  // 2) Choose freshest Stork data, else last good, else simulated.
  if (storkData) {
    lastStorkTsUsed = storkData.ts;
    lastGood = storkData;
    return { ...storkData, stale: isStale(storkData.ts) };
  }

  // Fallback to last good, else simulated.
  if (lastGood) {
    return { ...lastGood, stale: true };
  }
  return {
    price: simPrice,
    ts: simTs,
    stale: true,
    source: "sim",
  };
}

async function getOnchainPrice(): Promise<OracleData | null> {
  try {
    if (!onchainFeedId) {
      if (!warnedMissingOnchainConfig) {
        console.warn("[Stork] Missing STORK_FEED_ID (or unknown STORK_ASSET_SYMBOL).");
        warnedMissingOnchainConfig = true;
      }
      return null;
    }
    const rpcUrl = process.env.ARC_RPC_URL || "";
    if (!rpcUrl) {
      if (!warnedMissingOnchainConfig) {
        console.warn("[Stork] Missing ARC_RPC_URL for on-chain oracle.");
        warnedMissingOnchainConfig = true;
      }
      return null;
    }

    const cacheKey = `onchain:${onchainFeedId}`;
    const cached = cacheByAsset[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.data, stale: isStale(cached.data.ts) };
    }

    if (!onchainProvider) {
      onchainProvider = new ethers.JsonRpcProvider(rpcUrl);
    }
    if (!onchainContract) {
      const abi = [
        "function getTemporalNumericValueUnsafeV1(bytes32 id) view returns (tuple(uint64 timestampNs,int192 quantizedValue))",
      ];
      onchainContract = new ethers.Contract(onchainAddress, abi, onchainProvider);
    }

    const value = await onchainContract.getTemporalNumericValueUnsafeV1(onchainFeedId);
    const timestampNs = value.timestampNs ?? value[0];
    const quantizedValue = value.quantizedValue ?? value[1];

    const tsMs = Number(timestampNs) / 1e6;
    const price = Number(quantizedValue) / 1e18;
    const stale = isStale(tsMs);

    if (!Number.isFinite(price) || price <= 0) return null;

    const result: OracleData = { price, ts: tsMs, stale, source: "stork" };
    cacheByAsset[cacheKey] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err: any) {
    console.error("[Stork] on-chain getPrice error:", err?.message || err);
    return null;
  }
}

async function getStorkApiPrice(): Promise<OracleData | null> {
  const symbol = assetSymbol;
  const cached = cacheByAsset[symbol];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ...cached.data,
      stale: isStale(cached.data.ts),
    };
  }

  try {
    const res = await axios.get(
      `${STORK_BASE_URL}/v1/prices/latest?assets=${symbol}`,
      {
        headers: {
          Authorization: `Basic ${apiKey}`,
        },
      }
    );

    const data = res.data?.data;
    if (!data || !data[symbol]) {
      throw new Error(`No price data for ${symbol}`);
    }

    const assetData = data[symbol];
    const priceStr =
      assetData?.stork_signed_price?.price ||
      assetData?.price ||
      "0";

    let price: number;
    // Some feeds return 18-decimal fixed-point integers as strings (e.g., "999994997750000000").
    // Treat length >= 18 as fixed-point wei and scale down; also guard absurd values.
    if (typeof priceStr === "string" && priceStr.length >= 18) {
      price = Number(BigInt(priceStr)) / 1e18;
    } else {
      price = parseFloat(priceStr);
    }
    // Clamp clearly invalid parse results
    if (!Number.isFinite(price) || price <= 0 || price > 1e6) {
      throw new Error(`Invalid parsed price: ${priceStr} -> ${price}`);
    }

    const timestamp =
      assetData?.stork_signed_price?.timestamped_signature?.timestamp ||
      assetData?.timestamp ||
      Date.now();
    const tsMs = normalizeTimestampMs(timestamp);

    const stale = isStale(tsMs);

    if (price <= 0) {
      throw new Error(`Invalid price: ${price}`);
    }

    const result: OracleData = { price, ts: tsMs, stale, source: "stork" };
    cacheByAsset[symbol] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err: any) {
    console.error("[Stork] getPrice error:", err.message);
    return null;
  }
}

/**
 * Convert price number to 18-decimal bigint for contract use.
 */
export function priceToBigInt(price: number): bigint {
  return BigInt(Math.round(price * 1e18));
}
