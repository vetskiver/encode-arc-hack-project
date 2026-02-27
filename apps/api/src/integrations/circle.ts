import axios, { AxiosInstance } from "axios";

let client: AxiosInstance;

const CIRCLE_BASE_URL = "https://api.circle.com/v1/w3s";

export function initCircle(): void {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    console.warn("[Circle] Missing CIRCLE_API_KEY, Circle integration will be simulated");
    return;
  }
  client = axios.create({
    baseURL: CIRCLE_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  console.log("[Circle] Initialized");
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
  const walletId = getWalletId(bucket);
  if (!client || !walletId) {
    return simBalances[bucket];
  }
  try {
    const res = await client.get(`/wallets/${walletId}/balances`);
    const balances = res.data?.data?.tokenBalances || [];
    const usdcBal = balances.find(
      (b: any) => b.token?.symbol === "USDC" || b.token?.name === "USD Coin"
    );
    return usdcBal ? parseFloat(usdcBal.amount) : 0;
  } catch (err: any) {
    console.error(`[Circle] getBalance(${bucket}) error:`, err.message);
    return simBalances[bucket];
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
  let destinationAddress: string;
  let isBucket = false;
  if (
    toBucketOrAddress === "liquidity" ||
    toBucketOrAddress === "reserve" ||
    toBucketOrAddress === "yield" ||
    toBucketOrAddress === "creditFacility"
  ) {
    destinationAddress = getWalletId(toBucketOrAddress as BucketName);
    isBucket = true;
  } else {
    destinationAddress = toBucketOrAddress;
  }

  if (!client || !sourceWalletId) {
    // Simulation mode
    const ref = `sim-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Update sim balances
    simBalances[fromBucket] = Math.max(0, simBalances[fromBucket] - amountUSDC);
    if (isBucket) {
      simBalances[toBucketOrAddress as BucketName] += amountUSDC;
    }
    console.log(
      `[Circle:SIM] Transfer ${amountUSDC} USDC from ${fromBucket} to ${toBucketOrAddress} -> ${ref}`
    );
    return { circleTxRef: ref };
  }

  try {
    const tokenId = process.env.USDC_TOKEN_ID_OR_ADDRESS || "";
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const body: any = {
      idempotencyKey,
      source: { type: "wallet", id: sourceWalletId },
      amount: { amount: amountUSDC.toFixed(6), currency: "USD" },
      tokenId,
    };

    if (isBucket && destinationAddress) {
      body.destination = { type: "wallet", id: destinationAddress };
    } else {
      body.destination = {
        type: "blockchain",
        address: destinationAddress,
        chain: "ARC",
      };
    }

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
  if (!client) {
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
