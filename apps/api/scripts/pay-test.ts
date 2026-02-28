import path from "path";
import dotenv from "dotenv";
import { GatewayClient, SupportedChainName } from "@circlefin/x402-batching/client";

// Load env from repo root (../../.env) and local .env as fallback
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("Set PRIVATE_KEY=0x... in your shell (do not commit it).");
  }

  const chain = (process.env.X402_CHAIN || "arcTestnet") as SupportedChainName;
  const rpcUrl = process.env.X402_RPC_URL;
  const payUrl =
    process.env.X402_PAY_URL || "http://localhost:4000/api/paywall/hello";
  const depositAmount = process.env.X402_DEPOSIT; // optional (e.g., "1")

  const gateway = new GatewayClient(
    rpcUrl ? { chain, privateKey, rpcUrl } : { chain, privateKey }
  );

  if (depositAmount) {
    console.log(`Depositing ${depositAmount} USDC into Gateway on ${chain}...`);
    const res = await gateway.deposit(depositAmount);
    console.log("Deposit done:", {
      approvalTxHash: res.approvalTxHash,
      depositTxHash: res.depositTxHash,
      formattedAmount: res.formattedAmount,
    });
  }

  console.log(`Paying ${payUrl} via Gateway on ${chain}...`);
  const { status, formattedAmount, transaction, data } = await gateway.pay(payUrl);
  console.log({ status, formattedAmount, transaction, data });
}

main().catch((err) => {
  console.error("pay-test error:", err);
  process.exit(1);
});
