import axios, { AxiosInstance } from "axios";
import crypto from "node:crypto";

const CIRCLE_BASE_URL = "https://api.circle.com/v1/w3s";

export type BucketName = "liquidity" | "reserve" | "yield" | "creditFacility";

export interface TransferResult {
  circleTxRef: string;
}

// Cached client + RSA public key
let client: AxiosInstance | null = null;
let circlePublicKey: string | null = null;

// Cached wallet blockchain addresses (walletId -> address)
const walletAddressCache: Record<string, string> = {};

// In-memory simulated balances (hackathon/demo)
// NOTE: On Vercel serverless, memory may reset between invocations.
const simBalances: Record<BucketName, number> = {
  liquidity: 5000,
  reserve: 10000,
  yield: 2000,
  creditFacility: 50000,
};

/**
 * Explicit simulation mode flag — reads env every time.
 * This avoids cases where serverless boot order causes stale values.
 */
function explicitSimEnabled(): boolean {
  return (process.env.CIRCLE_SIM_MODE || "").toLowerCase() === "true";
}

/**
 * Returns true if we should simulate:
 * - explicit CIRCLE_SIM_MODE=true, OR
 * - missing required real-mode config
 */
function shouldSimulate(): boolean {
  if (explicitSimEnabled()) return true;

  // If any required real-mode config is missing, fallback to SIM
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const tokenId = process.env.USDC_TOKEN_ID_OR_ADDRESS;

  const liq = process.env.CIRCLE_WALLET_LIQUIDITY_ID;
  const res = process.env.CIRCLE_WALLET_RESERVE_ID;
  const cf = process.env.CIRCLE_WALLET_CREDIT_FACILITY_ID;

  if (!apiKey || !entitySecret || !tokenId) return true;
  if (!liq || !res || !cf) return true;

  return false;
}

export function isSimMode(): boolean {
  return shouldSimulate();
}

/**
 * Initialize Circle client in REAL mode if config is present.
 * Safe to call multiple times; no-ops in SIM mode.
 */
export function initCircle(): void {
  if (shouldSimulate()) {
    if (explicitSimEnabled()) {
      console.warn("[Circle] CIRCLE_SIM_MODE=true — running in simulation mode");
    } else {
      console.warn("[Circle] Missing Circle config — falling back to simulation mode");
    }
    client = null;
    circlePublicKey = null;
    return;
  }

  const apiKey = process.env.CIRCLE_API_KEY!;
  client = axios.create({
    baseURL: CIRCLE_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  console.log("[Circle] Initialized in REAL mode");

  // Fetch public key and wallet addresses in background (non-fatal if they fail)
  fetchPublicKey().catch((err) =>
    console.error("[Circle] Failed to fetch public key:", err?.message ?? err)
  );
  resolveWalletAddresses().catch((err) =>
    console.error("[Circle] Failed to resolve wallet addresses:", err?.message ?? err)
  );
}

function getWalletId(bucket: BucketName): string {
  switch (bucket) {
    case "liquidity":
      return process.env.CIRCLE_WALLET_LIQUIDITY_ID || "";
    case "reserve":
      return process.env.CIRCLE_WALLET_RESERVE_ID || "";
    case "yield":
      return process.env.CIRCLE_WALLET_YIELD_ID || "";
    case "creditFacility":
      return process.env.CIRCLE_WALLET_CREDIT_FACILITY_ID || "";
  }
}

/**
 * Ensure client is ready in REAL mode; if config missing, we’ll simulate instead.
 */
function ensureRealClient(): AxiosInstance {
  if (shouldSimulate()) {
    throw new Error("[Circle] ensureRealClient called in SIM mode (caller should simulate).");
  }
  if (!client) {
    // Lazily init in case initCircle wasn't called
    initCircle();
  }
  if (!client) {
    throw new Error("[Circle] Failed to initialize client in real mode.");
  }
  return client;
}

/**
 * Fetch Circle's RSA public key for encrypting entity secret.
 */
async function fetchPublicKey(): Promise<void> {
  if (shouldSimulate()) return;
  const c = ensureRealClient();
  const res = await c.get("/config/entity/publicKey");
  circlePublicKey = res.data?.data?.publicKey || null;
  if (circlePublicKey) {
    console.log("[Circle] Fetched entity public key");
  } else {
    console.warn("[Circle] No public key returned from /config/entity/publicKey");
  }
}

/**
 * Encrypt the entity secret with Circle's RSA public key (RSA-OAEP, SHA-256).
 */
function encryptEntitySecret(): string {
  const entitySecretHex = process.env.CIRCLE_ENTITY_SECRET || "";
  if (!circlePublicKey || !entitySecretHex) {
    throw new Error("Missing Circle public key or entity secret");
  }

  const entitySecretBuf = Buffer.from(entitySecretHex, "hex");
  const encrypted = crypto.publicEncrypt(
    {
      key: circlePublicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    entitySecretBuf
  );
  return encrypted.toString("base64");
}

/**
 * Look up the blockchain address for each configured wallet and cache it.
 */
async function resolveWalletAddresses(): Promise<void> {
  if (shouldSimulate()) return;
  const c = ensureRealClient();

  const walletIds = [
    process.env.CIRCLE_WALLET_LIQUIDITY_ID,
    process.env.CIRCLE_WALLET_RESERVE_ID,
    process.env.CIRCLE_WALLET_YIELD_ID,
    process.env.CIRCLE_WALLET_CREDIT_FACILITY_ID,
  ].filter(Boolean) as string[];

  for (const wid of walletIds) {
    try {
      const res = await c.get(`/wallets/${wid}`);
      const address = res.data?.data?.wallet?.address;
      if (address) {
        walletAddressCache[wid] = address;
        console.log(`[Circle] Wallet ${wid} -> ${address}`);
      }
    } catch (err: any) {
      console.warn(
        `[Circle] Could not resolve address for wallet ${wid}:`,
        err?.message ?? err
      );
    }
  }
}

/**
 * Get USDC balance (human-readable) for a bucket wallet.
 * SIM mode uses simBalances.
 */
export async function getBalance(bucket: BucketName): Promise<number> {
  if (shouldSimulate()) {
    return simBalances[bucket];
  }

  const walletId = getWalletId(bucket);
  if (!walletId) {
    // Should never happen in real mode due to shouldSimulate(), but keep safe:
    console.warn(`[Circle] Missing wallet ID for "${bucket}". Returning 0.`);
    return simBalances[bucket] || 0;
  }

  try {
    const c = ensureRealClient();
    const res = await c.get(`/wallets/${walletId}/balances`);
    const balances = res.data?.data?.tokenBalances || [];
    const usdcBal = balances.find(
      (b: any) => b.token?.symbol === "USDC" || b.token?.name === "USD Coin"
    );
    return usdcBal ? parseFloat(usdcBal.amount) : 0;
  } catch (err: any) {
    console.error(
      `[Circle] getBalance(${bucket}) API error (returning 0):`,
      err?.response?.data || err?.message || err
    );
    return 0;
  }
}

/**
 * Transfer USDC between wallets (buckets) or to an external address.
 * SIM mode adjusts simBalances and returns a simulated tx ref.
 */
export async function transfer(
  fromBucket: BucketName,
  toBucketOrAddress: BucketName | string,
  amountUSDC: number
): Promise<TransferResult> {
  // SIM / fallback mode
  if (shouldSimulate()) {
    const ref = `sim-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    simBalances[fromBucket] = Math.max(0, simBalances[fromBucket] - amountUSDC);

    const isBucket =
      toBucketOrAddress === "liquidity" ||
      toBucketOrAddress === "reserve" ||
      toBucketOrAddress === "yield" ||
      toBucketOrAddress === "creditFacility";

    if (isBucket) {
      simBalances[toBucketOrAddress as BucketName] += amountUSDC;
    }

    console.log(
      `[Circle:SIM] Transfer ${amountUSDC} USDC from ${fromBucket} to ${toBucketOrAddress} -> ${ref}`
    );
    return { circleTxRef: ref };
  }

  // REAL mode
  const tokenId = process.env.USDC_TOKEN_ID_OR_ADDRESS || "";
  const sourceWalletId = getWalletId(fromBucket);
  if (!sourceWalletId) {
    throw new Error(`[Circle] Missing source wallet ID for "${fromBucket}"`);
  }

  // Determine destination address
  let destAddress: string;
  const isBucket =
    toBucketOrAddress === "liquidity" ||
    toBucketOrAddress === "reserve" ||
    toBucketOrAddress === "yield" ||
    toBucketOrAddress === "creditFacility";

  if (isBucket) {
    const destWalletId = getWalletId(toBucketOrAddress as BucketName);
    if (!destWalletId) {
      throw new Error(`[Circle] Missing destination wallet ID for "${toBucketOrAddress}"`);
    }

    // Try cache; if missing, attempt to resolve once
    destAddress = walletAddressCache[destWalletId] || "";
    if (!destAddress) {
      await resolveWalletAddresses();
      destAddress = walletAddressCache[destWalletId] || "";
    }
  } else {
    destAddress = toBucketOrAddress;
  }

  if (!circlePublicKey) {
    // Try fetching once if init order raced
    await fetchPublicKey();
  }
  if (!circlePublicKey) {
    throw new Error("[Circle] Public key not yet fetched. Retry after init completes.");
  }

  if (!destAddress) {
    throw new Error(
      `Missing destination address for ${toBucketOrAddress}. ` +
        (isBucket ? "Wallet address not resolved." : "Empty address provided.")
    );
  }

  const c = ensureRealClient();

  try {
    const idempotencyKey = crypto.randomUUID();
    const entitySecretCiphertext = encryptEntitySecret();

    const body: Record<string, unknown> = {
      idempotencyKey,
      entitySecretCiphertext,
      walletId: sourceWalletId,
      tokenId,
      destinationAddress: destAddress,
      amounts: [amountUSDC.toFixed(6)],
      feeLevel: "LOW",
    };

    console.log(
      `[Circle] Sending transfer: ${fromBucket} (${sourceWalletId}) -> ${destAddress}, ${amountUSDC} USDC`
    );

    const res = await c.post("/developer/transactions/transfer", body);
    const txId = res.data?.data?.id || `circle-${idempotencyKey}`;

    console.log(
      `[Circle] Transfer ${amountUSDC} USDC: ${fromBucket} -> ${toBucketOrAddress} tx=${txId}`
    );

    return { circleTxRef: txId };
  } catch (err: any) {
    console.error("[Circle] Transfer error:", err?.response?.data || err?.message || err);
    throw new Error(`Circle transfer failed: ${err?.message ?? String(err)}`);
  }
}

/**
 * Create a wallet via Circle API (for initial setup).
 */
export async function createWallet(name: string): Promise<string> {
  if (shouldSimulate()) {
    return `sim-wallet-${name}-${Date.now()}`;
  }

  try {
    const c = ensureRealClient();
    const res = await c.post("/developer/wallets", {
      idempotencyKey: `wallet-${name}-${Date.now()}`,
      name,
      description: `RWA Credit Guardian - ${name}`,
    });
    return res.data?.data?.id || "";
  } catch (err: any) {
    console.error("[Circle] createWallet error:", err?.message ?? err);
    throw err;
  }
}