import axios, { AxiosInstance } from "axios";
import crypto from "node:crypto";

let client: AxiosInstance;

const CIRCLE_BASE_URL = "https://api.circle.com/v1/w3s";

// Cached RSA public key from Circle (fetched at init)
let circlePublicKey: string | null = null;

// Cached wallet blockchain addresses (walletId -> address)
const walletAddressCache: Record<string, string> = {};

// Explicit simulation mode flag — only true when CIRCLE_SIM_MODE=true
let simMode = false;

export function isSimMode(): boolean {
  return simMode;
}

export function initCircle(): void {
  const explicitSim = (process.env.CIRCLE_SIM_MODE || "").toLowerCase() === "true";
  simMode = explicitSim;

  if (explicitSim) {
    console.warn("[Circle] CIRCLE_SIM_MODE=true — running in simulation mode");
    return;
  }

  // Real mode: require all critical configuration
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("[Circle] Missing CIRCLE_API_KEY. Set CIRCLE_SIM_MODE=true for simulation, or provide credentials.");
  }

  const missing: string[] = [];
  const required = [
    { key: "CIRCLE_WALLET_LIQUIDITY_ID", label: "liquidity" },
    { key: "CIRCLE_WALLET_RESERVE_ID", label: "reserve" },
    { key: "CIRCLE_WALLET_CREDIT_FACILITY_ID", label: "creditFacility" },
  ];
  for (const r of required) {
    if (!process.env[r.key]) {
      missing.push(`${r.key} (${r.label})`);
    }
  }
  if (!process.env.USDC_TOKEN_ID_OR_ADDRESS) {
    missing.push("USDC_TOKEN_ID_OR_ADDRESS");
  }
  if (!process.env.CIRCLE_ENTITY_SECRET) {
    missing.push("CIRCLE_ENTITY_SECRET");
  }
  if (missing.length > 0) {
    throw new Error(
      `[Circle] Missing required config for real mode: ${missing.join(", ")}. ` +
      `Set CIRCLE_SIM_MODE=true for simulation, or provide all credentials.`
    );
  }

  client = axios.create({
    baseURL: CIRCLE_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  console.log("[Circle] Initialized in REAL mode");

  // Fetch public key and wallet addresses in background
  fetchPublicKey().catch((err) =>
    console.error("[Circle] Failed to fetch public key:", err.message)
  );
  resolveWalletAddresses().catch((err) =>
    console.error("[Circle] Failed to resolve wallet addresses:", err.message)
  );
}

/**
 * Fetch Circle's RSA public key for encrypting entity secret.
 */
async function fetchPublicKey(): Promise<void> {
  if (!client) return;
  const res = await client.get("/config/entity/publicKey");
  circlePublicKey = res.data?.data?.publicKey;
  if (circlePublicKey) {
    console.log("[Circle] Fetched entity public key");
  } else {
    console.warn("[Circle] No public key returned from /config/entity/publicKey");
  }
}

/**
 * Encrypt the entity secret with Circle's RSA public key (RSA-OAEP, SHA-256).
 * Must produce a fresh ciphertext for every API request.
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
  if (!client) return;
  const walletIds = [
    process.env.CIRCLE_WALLET_LIQUIDITY_ID,
    process.env.CIRCLE_WALLET_RESERVE_ID,
    process.env.CIRCLE_WALLET_YIELD_ID,
    process.env.CIRCLE_WALLET_CREDIT_FACILITY_ID,
  ].filter(Boolean) as string[];

  for (const wid of walletIds) {
    try {
      const res = await client.get(`/wallets/${wid}`);
      const address = res.data?.data?.wallet?.address;
      if (address) {
        walletAddressCache[wid] = address;
        console.log(`[Circle] Wallet ${wid} -> ${address}`);
      }
    } catch (err: any) {
      console.warn(`[Circle] Could not resolve address for wallet ${wid}:`, err.message);
    }
  }
}

export type BucketName = "liquidity" | "reserve" | "yield" | "creditFacility";

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

// Simulated balances for when Circle is not configured
const simBalances: Record<BucketName, number> = {
  liquidity: 5000,
  reserve: 10000,
  yield: 2000,
  creditFacility: 50000,
};

/**
 * Get USDC balance (human-readable number) for a bucket wallet.
 */
export async function getBalance(bucket: BucketName): Promise<number> {
  if (simMode) {
    return simBalances[bucket];
  }
  const walletId = getWalletId(bucket);
  if (!walletId) {
    throw new Error(`[Circle] No wallet ID configured for bucket "${bucket}"`);
  }
  try {
    const res = await client.get(`/wallets/${walletId}/balances`);
    const balances = res.data?.data?.tokenBalances || [];
    const usdcBal = balances.find(
      (b: any) => b.token?.symbol === "USDC" || b.token?.name === "USD Coin"
    );
    return usdcBal ? parseFloat(usdcBal.amount) : 0;
  } catch (err: any) {
    console.error(`[Circle] getBalance(${bucket}) API error (returning 0, NOT sim defaults):`, err.response?.data || err.message);
    return 0;
  }
}

export interface TransferResult {
  circleTxRef: string;
}

/**
 * Transfer USDC between wallets or to an external address.
 */
export async function transfer(
  fromBucket: BucketName,
  toBucketOrAddress: BucketName | string,
  amountUSDC: number
): Promise<TransferResult> {
  const sourceWalletId = getWalletId(fromBucket);

  // Determine destination
  let destAddress: string;
  let isBucket = false;
  if (
    toBucketOrAddress === "liquidity" ||
    toBucketOrAddress === "reserve" ||
    toBucketOrAddress === "yield" ||
    toBucketOrAddress === "creditFacility"
  ) {
    const destWalletId = getWalletId(toBucketOrAddress as BucketName);
    destAddress = walletAddressCache[destWalletId] || "";
    isBucket = true;
  } else {
    destAddress = toBucketOrAddress;
  }

  if (simMode) {
    // Simulation mode — only allowed when CIRCLE_SIM_MODE=true
    const ref = `sim-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    simBalances[fromBucket] = Math.max(0, simBalances[fromBucket] - amountUSDC);
    if (isBucket) {
      simBalances[toBucketOrAddress as BucketName] += amountUSDC;
    }
    console.log(
      `[Circle:SIM] Transfer ${amountUSDC} USDC from ${fromBucket} to ${toBucketOrAddress} -> ${ref}`
    );
    return { circleTxRef: ref };
  }

  // Real mode — all config was validated at init
  const tokenId = process.env.USDC_TOKEN_ID_OR_ADDRESS || "";
  if (!circlePublicKey) {
    throw new Error("[Circle] Public key not yet fetched. Retry after init completes.");
  }

  try {
    if (!destAddress) {
      throw new Error(
        `Missing destination address for ${toBucketOrAddress}. ` +
        (isBucket ? "Wallet address not resolved at startup." : "Empty address provided.")
      );
    }

    const idempotencyKey = crypto.randomUUID();
    const entitySecretCiphertext = encryptEntitySecret();

    // Circle W3S flat request body
    const body: Record<string, unknown> = {
      idempotencyKey,
      entitySecretCiphertext,
      walletId: sourceWalletId,
      tokenId,
      destinationAddress: destAddress,
      amounts: [amountUSDC.toFixed(6)],
      feeLevel: "LOW",
    };

    console.log(`[Circle] Sending transfer: ${fromBucket} (${sourceWalletId}) -> ${destAddress}, ${amountUSDC} USDC`);
    const res = await client.post("/developer/transactions/transfer", body);
    const txId = res.data?.data?.id || `circle-${idempotencyKey}`;
    console.log(`[Circle] Transfer ${amountUSDC} USDC: ${fromBucket} -> ${toBucketOrAddress} tx=${txId}`);
    return { circleTxRef: txId };
  } catch (err: any) {
    console.error(`[Circle] Transfer error:`, err.response?.data || err.message);
    throw new Error(`Circle transfer failed: ${err.message}`);
  }
}

/**
 * Create a wallet via Circle API (for initial setup).
 */
export async function createWallet(name: string): Promise<string> {
  if (simMode) {
    return `sim-wallet-${name}-${Date.now()}`;
  }
  try {
    const res = await client.post("/developer/wallets", {
      idempotencyKey: `wallet-${name}-${Date.now()}`,
      name,
      description: `RWA Credit Guardian - ${name}`,
    });
    return res.data?.data?.id || "";
  } catch (err: any) {
    console.error(`[Circle] createWallet error:`, err.message);
    throw err;
  }
}
