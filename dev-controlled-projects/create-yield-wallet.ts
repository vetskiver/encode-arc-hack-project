import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to dev-controlled-projects/.env`);
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("CIRCLE_API_KEY");
  const entitySecret = requireEnv("CIRCLE_ENTITY_SECRET");
  const walletSetId = requireEnv("CIRCLE_WALLET_SET_ID");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
  });

  console.log("\nCreating Yield wallet on ARC-TESTNET...");
  const wallet = (
    await client.createWallets({
      walletSetId,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
    })
  ).data?.wallets?.[0];

  if (!wallet) {
    throw new Error("Wallet creation failed: no wallet returned.");
  }

  const outputPath = path.join(OUTPUT_DIR, "yield-wallet.json");
  fs.writeFileSync(outputPath, JSON.stringify(wallet, null, 2), "utf-8");

  console.log("Saved yield wallet:", outputPath);
  console.log(`Yield Wallet ID: ${wallet.id}`);
  console.log(`Yield Address: ${wallet.address}`);
  console.log("\nFund this wallet on the faucet:");
  console.log("  https://faucet.circle.com (Arc Testnet)");
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
