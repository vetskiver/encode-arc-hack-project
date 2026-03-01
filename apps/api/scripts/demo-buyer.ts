/**
 * x402 Nanopayments Demo Buyer
 *
 * Demonstrates paying $0.01 per query for live oracle prices and AI risk reports
 * via Circle's Nanopayments SDK, settled gaslessly on Arc Testnet (~0.5s).
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx ts-node scripts/demo-buyer.ts
 *
 * The PRIVATE_KEY wallet must hold testnet USDC on Arc Testnet.
 * Get testnet USDC: https://faucet.circle.com
 *
 * On first run, pass X402_DEPOSIT=1 to deposit 1 USDC into the Gateway:
 *   PRIVATE_KEY=0x... X402_DEPOSIT=1 npx ts-node scripts/demo-buyer.ts
 */

import path from "path";
import dotenv from "dotenv";
import { GatewayClient, SupportedChainName } from "@circlefin/x402-batching/client";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const CHAIN: SupportedChainName = "arcTestnet";

function banner(text: string) {
  const line = "─".repeat(text.length + 4);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${text}  │`);
  console.log(`└${line}┘`);
}

function section(label: string) {
  console.log(`\n\x1b[36m▶ ${label}\x1b[0m`);
}

function success(msg: string) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function info(label: string, value: string | number) {
  console.log(`  \x1b[90m${label}:\x1b[0m ${value}`);
}

function paid(amount: string, txHash: string) {
  console.log(`  \x1b[35m⚡ Paid:\x1b[0m ${amount} USDC  \x1b[90m· tx:\x1b[0m \x1b[35m${txHash?.slice(0, 20)}…\x1b[0m`);
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    console.error("\x1b[31mError:\x1b[0m Set PRIVATE_KEY=0x... in your shell.");
    console.error("  Get testnet USDC at https://faucet.circle.com");
    process.exit(1);
  }

  banner("horizn · x402 Nanopayments Demo");
  console.log(`  Chain:  Arc Testnet (eip155:5042002)`);
  console.log(`  API:    ${API_BASE}`);
  console.log(`  Price:  $0.01 per query · gasless · ~0.5s settlement`);

  const client = new GatewayClient({ chain: CHAIN, privateKey });

  // ── Check / deposit balance ──────────────────────────────────────────────
  section("Gateway Balance");
  const balances = await client.getBalances();
  const available = parseFloat(balances.gateway.formattedAvailable);
  info("Available", `${balances.gateway.formattedAvailable} USDC`);
  info("Total",     `${balances.gateway.formattedTotal} USDC`);

  const depositAmount = process.env.X402_DEPOSIT;
  if (depositAmount) {
    section(`Depositing ${depositAmount} USDC into Gateway`);
    const dep = await client.deposit(depositAmount);
    success(`Deposited ${dep.formattedAmount} USDC`);
    info("Approval tx", dep.approvalTxHash || "—");
    info("Deposit tx",  dep.depositTxHash  || "—");
  } else if (available < 0.05) {
    console.warn("\n\x1b[33m⚠ Low gateway balance.\x1b[0m Run with X402_DEPOSIT=1 to fund it.");
    console.warn("  Get testnet USDC at https://faucet.circle.com\n");
  }

  // ── Query 1: Live oracle price (BTCUSD) ──────────────────────────────────
  section("Paying $0.01 — Live BTC/USD Oracle Price");
  const t1 = Date.now();
  const oracle = await client.pay(`${API_BASE}/api/paywall/oracle/BTCUSD`);
  const ms1 = Date.now() - t1;
  const oracleData = oracle.data as any;

  if (oracle.status === 200 && oracleData) {
    paid(oracle.formattedAmount, oracle.transaction || "");
    success(`Settled in ${ms1}ms`);
    info("BTC/USD",   `$${Number(oracleData.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    info("Source",    oracleData.source);
    info("Timestamp", new Date(oracleData.ts < 1e12 ? oracleData.ts * 1000 : oracleData.ts).toLocaleTimeString());
    info("Paid by",   oracleData.paid_by || "—");
    info("Network",   oracleData.network || "—");
  } else {
    console.log("  Unexpected response:", oracle);
  }

  // ── Query 2: Live oracle price (ETHUSD) ──────────────────────────────────
  section("Paying $0.01 — Live ETH/USD Oracle Price");
  const t2 = Date.now();
  const ethOracle = await client.pay(`${API_BASE}/api/paywall/oracle/ETHUSD`);
  const ms2 = Date.now() - t2;
  const ethData = ethOracle.data as any;

  if (ethOracle.status === 200 && ethData) {
    paid(ethOracle.formattedAmount, ethOracle.transaction || "");
    success(`Settled in ${ms2}ms`);
    info("ETH/USD",   `$${Number(ethData.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    info("Paid by",   ethData.paid_by || "—");
  }

  // ── Query 3: Harbor AI risk report ───────────────────────────────────────
  section("Paying $0.01 — Harbor (BTC Collateral) AI Risk Report");
  const t3 = Date.now();
  const harbor = await client.pay(`${API_BASE}/api/paywall/risk/harbor`);
  const ms3 = Date.now() - t3;
  const harborData = harbor.data as any;

  if (harbor.status === 200 && harborData) {
    paid(harbor.formattedAmount, harbor.transaction || "");
    success(`Settled in ${ms3}ms`);
    info("Company",       harborData.name);
    info("Collateral",    `${harborData.collateralAsset} (${harborData.oracleSymbol})`);
    info("Health Factor", harborData.healthFactor?.toFixed(4) ?? "—");
    info("Debt (USDC)",   harborData.debtUSDC ?? "—");
    info("Liquidity",     harborData.liquidityUSDC ?? "—");
    info("Agent Status",  harborData.agentStatus);
    if (harborData.lastDecision) {
      const d = harborData.lastDecision;
      info("Last Action",  `${d.action} ${d.amountUSDC} USDC`);
      info("Rationale",    d.rationale?.slice(0, 80) + (d.rationale?.length > 80 ? "…" : ""));
      info("Arc TX",       d.arcTxHash || "—");
      info("Circle TX",    d.circleTxRef || "—");
    }
    info("Paid by",       harborData.paid_by || "—");
  }

  // ── Query 4: Atlas risk report (conservative, T-Bill) ────────────────────
  section("Paying $0.01 — Atlas (T-Bill Collateral) AI Risk Report");
  const t4 = Date.now();
  const atlas = await client.pay(`${API_BASE}/api/paywall/risk/atlas`);
  const ms4 = Date.now() - t4;
  const atlasData = atlas.data as any;

  if (atlas.status === 200 && atlasData) {
    paid(atlas.formattedAmount, atlas.transaction || "");
    success(`Settled in ${ms4}ms`);
    info("Company",       atlasData.name);
    info("Health Factor", atlasData.healthFactor?.toFixed(4) ?? "—");
    info("Agent Status",  atlasData.agentStatus);
    info("Paid by",       atlasData.paid_by || "—");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  banner("Demo Complete");
  const total = (4 * 0.01).toFixed(2);
  console.log(`  4 queries · $${total} USDC total · all settled gaslessly on Arc Testnet`);
  console.log(`  Average latency: ${Math.round((ms1 + ms2 + ms3 + ms4) / 4)}ms per payment\n`);
}

main().catch((err) => {
  console.error("\x1b[31mError:\x1b[0m", err.message || err);
  process.exit(1);
});
