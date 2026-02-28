// create-wallet.ts

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
  type TokenBlockchain,
} from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");
const WALLET_SET_NAME = "Circle Wallet Onboarding";
const ENV_PATH = path.join(__dirname, ".env");

async function main(): Promise<void> {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is required. Add it to .env or set it as an environment variable."
    );
  }

  // Register Entity Secret
  console.log("Registering Entity Secret...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const entitySecret = crypto.randomBytes(32).toString("hex");
  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: OUTPUT_DIR,
  });
  fs.appendFileSync(ENV_PATH, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, "utf-8");
  console.log("Entity Secret registered.");

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  // Create Wallet Set
  console.log("\nCreating Wallet Set...");
  const walletSet = (await client.createWalletSet({ name: WALLET_SET_NAME })).data
    ?.walletSet;
  if (!walletSet?.id) {
    throw new Error("Wallet Set creation failed: no ID returned");
  }
  console.log("Wallet Set ID:", walletSet.id);
  const walletSetId = walletSet.id;

  // Create Wallet
  console.log("\nCreating Wallet on ARC-TESTNET...");
  const wallet = (
    await client.createWallets({
      walletSetId: walletSet.id,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
    })
  ).data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Wallet creation failed: no wallet returned");
  }
  console.log("Wallet ID:", wallet.id);
  console.log("Address:", wallet.address);

  fs.appendFileSync(ENV_PATH, `CIRCLE_WALLET_ADDRESS=${wallet.address}\n`, "utf-8");
  fs.appendFileSync(
    ENV_PATH,
    `CIRCLE_WALLET_BLOCKCHAIN=${wallet.blockchain}\n`,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "wallet-info.json"),
    JSON.stringify(wallet, null, 2),
    "utf-8"
  );
  console.log("Saved wallet details:", path.join(OUTPUT_DIR, "wallet-info.json"));
  console.log("\nBefore continuing, request test USDC from the faucet:");
  console.log("  1. Go to https://faucet.circle.com");
  console.log('  2. Select "Arc Testnet" network');
  console.log(`  3. Paste your wallet address: ${wallet.address}`);
  console.log('  4. Click "Send USDC"');
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
