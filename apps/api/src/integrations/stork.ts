import axios from "axios";

const STORK_BASE_URL = "https://rest.jp.stork-oracle.network";
const FRESHNESS_THRESHOLD_MS = 120_000; // 2 minutes
const CACHE_TTL_MS = 15_000; // 15 seconds

let apiKey: string = "";
let assetSymbol: string = "";

export function initStork(): void {
  apiKey = process.env.STORK_API_KEY || "";
  assetSymbol = process.env.STORK_ASSET_SYMBOL || "BTCUSD"; // default for testing
  if (!apiKey) {
    console.warn("[Stork] Missing STORK_API_KEY, oracle will return simulated data");
  } else {
    console.log("[Stork] Initialized for asset:", assetSymbol);
  }
}

export interface OracleData {
  price: number;
  ts: number;
  stale: boolean;
  source: "stork" | "sim";
}

// Simulated price for when Stork is not configured
let simPrice = 100.0;
let simTs = Date.now();

type CacheEntry = {
  data: OracleData;
  fetchedAt: number;
};

const cacheByAsset: Record<string, CacheEntry | undefined> = {};

function isStale(ts: number): boolean {
  return Date.now() - ts > FRESHNESS_THRESHOLD_MS;
}

export function setSimulatedPrice(price: number): void {
  simPrice = price;
  simTs = Date.now();
}

export async function getPrice(): Promise<OracleData> {
  if (!apiKey) {
    // Simulation mode
    return {
      price: simPrice,
      ts: simTs,
      stale: true,
      source: "sim",
    };
  }

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

    // Stork prices may be in a quantized format; parse appropriately
    let price: number;
    if (typeof priceStr === "string" && priceStr.length > 18) {
      // Large integer format: divide by 1e18
      price = Number(BigInt(priceStr)) / 1e18;
    } else {
      price = parseFloat(priceStr);
    }

    const timestamp =
      assetData?.stork_signed_price?.timestamped_signature?.timestamp ||
      assetData?.timestamp ||
      Date.now();

    const tsMs = typeof timestamp === "number" && timestamp < 1e12
      ? timestamp * 1000
      : Number(timestamp);

    const stale = isStale(tsMs);

    if (price <= 0) {
      throw new Error(`Invalid price: ${price}`);
    }

    const result: OracleData = { price, ts: tsMs, stale, source: "stork" };
    cacheByAsset[symbol] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err: any) {
    console.error("[Stork] getPrice error:", err.message);
    // Fallback to simulated
    return { price: simPrice, ts: Date.now(), stale: true, source: "sim" };
  }
}

/**
 * Convert price number to 18-decimal bigint for contract use.
 */
export function priceToBigInt(price: number): bigint {
  return BigInt(Math.round(price * 1e18));
}
