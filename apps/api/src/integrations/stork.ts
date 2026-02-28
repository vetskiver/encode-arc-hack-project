import axios from "axios";
import { ethers } from "ethers";

const STORK_BASE_URL = "https://rest.jp.stork-oracle.network";
const GECKO_BASE_URL = "https://api.coingecko.com/api/v3";
const FRESHNESS_THRESHOLD_MS = 3_600_000; // 1 hour
const CACHE_TTL_MS = 15_000; // 15 seconds

const DEFAULT_ARC_STORK_ADDRESS =
  "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62";

const FEED_ID_BY_SYMBOL: Record<string, string> = {
  USDCUSD: "0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c",
  BTCUSD: "0x7404e3d104ea7841c3d9e6fd20adfe99b4ad586bc08d8f3bd3afef894cf184de",
};

let apiKey: string = "";
let assetSymbol: string = "";
let useOnchain: boolean = false;
let onchainFeedId: string = "";
let onchainAddress: string = "";
let onchainProvider: ethers.JsonRpcProvider | null = null;
let onchainContract: ethers.Contract | null = null;
let warnedMissingOnchainConfig = false;
let geckoAssetId: string = "";
let geckoVsCurrency: string = "";
export function initStork(): void {
  apiKey = process.env.STORK_API_KEY || "";
  assetSymbol = process.env.STORK_ASSET_SYMBOL || "USDCUSD";
  useOnchain =
    (process.env.STORK_USE_ONCHAIN || "").toLowerCase() === "true" ||
    process.env.STORK_USE_ONCHAIN === "1";
  onchainFeedId = process.env.STORK_FEED_ID || FEED_ID_BY_SYMBOL[assetSymbol] || "";
  onchainAddress = process.env.STORK_ONCHAIN_ADDRESS || DEFAULT_ARC_STORK_ADDRESS;
  geckoAssetId = process.env.GECKO_ASSET_ID || "bitcoin";
  geckoVsCurrency = process.env.GECKO_VS_CURRENCY || "usd";

  if (apiKey) {
    console.log("[Stork] Initialized for asset:", assetSymbol);
  } else if (!useOnchain) {
    console.warn("[Stork] Missing STORK_API_KEY, will use on-chain or fallback sources");
  }

  if (useOnchain) {
    console.log("[Stork] On-chain mode enabled");
  }
}

export interface OracleData {
  price: number;
  ts: number;
  stale: boolean;
  source: "stork" | "gecko" | "sim";
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
  let storkResult: OracleData | null = null;

  // 1) Stork: try on-chain if configured or no API key
  if (!apiKey || useOnchain) {
    storkResult = await getOnchainPrice();
  } else {
    storkResult = await getStorkApiPrice();
  }

  // If stork succeeded and is fresh, return it
  if (storkResult && !storkResult.stale) {
    return storkResult;
  }

  // 2) CoinGecko fallback when Stork missing/stale/fails
  const gecko = await getGeckoPrice();
  if (gecko) return gecko;

  // 3) If Stork existed (even stale), return it; else sim
  if (storkResult) return storkResult;

  // Simulation mode
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
    if (typeof priceStr === "string" && priceStr.length > 18) {
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
    return null;
  }
}

async function getGeckoPrice(): Promise<OracleData | null> {
  const cacheKey = `gecko:${geckoAssetId}:${geckoVsCurrency}`;
  const cached = cacheByAsset[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.data, stale: isStale(cached.data.ts) };
  }

  try {
    const url = `${GECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(
      geckoAssetId
    )}&vs_currencies=${encodeURIComponent(geckoVsCurrency)}`;
    const res = await axios.get(url);
    const price = res.data?.[geckoAssetId]?.[geckoVsCurrency];
    if (!price || price <= 0) throw new Error("Gecko price missing");
    const tsMs = Date.now();
    const result: OracleData = { price: Number(price), ts: tsMs, stale: isStale(tsMs), source: "gecko" };
    cacheByAsset[cacheKey] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err: any) {
    console.error("[Gecko] getPrice error:", err.message);
    return null;
  }
}

/**
 * Convert price number to 18-decimal bigint for contract use.
 */
export function priceToBigInt(price: number): bigint {
  return BigInt(Math.round(price * 1e18));
}
