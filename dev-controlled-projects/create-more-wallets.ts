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

  console.log("\nCreating 2 more wallets on ARC-TESTNET...");
  const walletsRes = await client.createWallets({
    walletSetId,
    blockchains: ["ARC-TESTNET"],
    count: 2,
    accountType: "EOA",
  });

  const wallets = walletsRes.data?.wallets || [];
  if (wallets.length < 2) {
    throw new Error("Wallet creation failed: expected 2 wallets.");
  }

  const outputPath = path.join(OUTPUT_DIR, "extra-wallets.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ walletSetId, wallets }, null, 2),
    "utf-8"
  );

  console.log("Saved extra wallet details:", outputPath);
  console.log("Wallet IDs:");
  for (const w of wallets) {
    console.log(`- ${w.id}  ${w.address}`);
  }
  console.log("\nFund these wallets on the faucet:");
  console.log("  https://faucet.circle.com (Arc Testnet)");
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
