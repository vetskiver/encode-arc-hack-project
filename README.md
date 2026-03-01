# RWA Credit Guardian
Platform that lets companies post real-world assets as collateral, borrow USDC, and autonomously stay within risk limits. An agent runs every 15 seconds to check prices, rebalance Circle wallets, and log every action to the Arc blockchain.

## Features
- **Autonomous treasury agent**: Observe → decide → act loop with 12 decision rules and 10 safety guardrails (see `ARCHITECTURE.md` for visuals).
- **Multi-company demo**: Atlas (T-Bills, conservative), Northwind (ETH, balanced), Harbor (BTC, growth) share the same engine with different policies.
- **Circle + Stork + Arc**: Uses Circle W3S wallets for real USDC moves, Stork oracles for prices, and the `GuardianVault` contract (`contracts/GuardianVault.sol`) for on-chain audit + policy enforcement.
- **Paid API option**: Circle x402 batching can gate selected endpoints (configure `X402_*` env vars).
- **Dashboard**: Next.js UI polls the API every 3s to show balances, health factors, actions, and pending payments.

## Repo Layout
- `apps/api` — Express API + agent loop (`npm run dev:api`, port 4000). Persists state to `apps/api/data/store.json`.
- `apps/web` — Next.js dashboard (`npm run dev:web`, port 3000).
- `contracts/GuardianVault.sol` — Arc ledger + guardrails. Deploy via `hardhat/scripts/deploy.ts`.
- `hardhat` — Hardhat config/artifacts for Arc deployments (`npm run deploy` from repo root).
- Docs: `ARCHITECTURE.md` (deep dive) and `QUICKSTART_GUIDE.md` (Circle x402).

## Prerequisites
- Node.js 20+ and npm 8+.
- Arc RPC access + funded signer for testnet transactions.
- Circle Sandbox API key and wallet IDs (or set `CIRCLE_SIM_MODE=true` for dry-run).
- Stork API key for price feeds.
- If the bundled `.npmrc` token is rotated, export `CLOUDSMITH_TOKEN` for `@circlefin/*` packages.

## Setup
1) Install deps (workspace-aware):
```bash
npm install
```
2) Configure environment:
```bash
cp .env.example .env
```
Fill at minimum: `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_*_ID`, `USDC_TOKEN_ID_OR_ADDRESS`, `STORK_API_KEY`, `ARC_RPC_URL`, `ARC_CONTRACT_ADDRESS` (defaults to `0x10F29AA6BFF6E3154f09bf1122D64fE63AfC1911` on Arc testnet), `BACKEND_SIGNER_PRIVATE_KEY`, and `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:4000/`). Set `CIRCLE_SIM_MODE=true` to avoid real Circle calls.

## Run Locally
1) **API + Agent** (terminal 1):
```bash
npm run dev:api
```
- Starts on `http://localhost:4000`.
- Auto-sets on-chain policy on startup (if signer permitted) and auto-starts the agent loop for the default user (`DEFAULT_COMPANY_ADDRESS`).

2) **Web Dashboard** (terminal 2):
```bash
npm run dev:web
```
- Opens on `http://localhost:3000` and polls the API every 3 seconds.

## Deploying the Contract
To deploy `GuardianVault` to Arc via Hardhat (requires `ARC_RPC_URL` + signer in `.env`):
```bash
npm run deploy
```
Copy the printed address into `ARC_CONTRACT_ADDRESS` for both API and agent.

## Useful Notes
- State is persisted at `apps/api/data/store.json`; delete it to reset demo balances/logs.
- The agent tick interval is controlled by `AGENT_TICK_MS` (default 15000 ms).
- `ARCHITECTURE.md` includes mermaid diagrams of the data flow and decision logic.
- Paid endpoints via Circle x402 are configured in `.env` (`X402_*` keys) and routed in `apps/api/src/x402Routes.ts`.
