import axios from "axios";

const STORK_BASE_URL = "https://rest.jp.stork-oracle.network";
const FRESHNESS_THRESHOLD_MS = 120_000; // 2 minutes

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
}

// Simulated price for when Stork is not configured
let simPrice = 100.0;
let simTs = Date.now();

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
      stale: false,
    };
  }

  try {
    const res = await axios.get(
      `${STORK_BASE_URL}/v1/prices/latest?assets=${assetSymbol}`,
      {
        headers: {
          Authorization: `Basic ${apiKey}`,
        },
      }
    );

    const data = res.data?.data;
    if (!data || !data[assetSymbol]) {
      throw new Error(`No price data for ${assetSymbol}`);
    }

    const assetData = data[assetSymbol];
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

    const stale = Date.now() - tsMs > FRESHNESS_THRESHOLD_MS;

    if (price <= 0) {
      throw new Error(`Invalid price: ${price}`);
    }

    return { price, ts: tsMs, stale };
  } catch (err: any) {
    console.error("[Stork] getPrice error:", err.message);
    // Fallback to simulated
    return { price: simPrice, ts: Date.now(), stale: true };
  }
}

/**
 * Convert price number to 18-decimal bigint for contract use.
 */
export function priceToBigInt(price: number): bigint {
  return BigInt(Math.round(price * 1e18));
}
