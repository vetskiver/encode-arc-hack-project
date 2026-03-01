# RWA Credit Guardian — Encode × Arc Hackathon MVP
Track: “Best Agentic Commerce Powered by Real-World Assets on Arc”

## 1) Product Summary
Horizn RWA Credit Guardian runs per-company autonomous agents on Arc Testnet that manage USDC credit against BTC collateral. Three personas share the same engine but use different risk policies: Atlas (conservative), Northwind (balanced), Harbor (aggressive). Policy knobs (LTV, min/emergency HF, target health, liquidity/reserve ratios, per‑tx and daily caps, volatility thresholds) directly control how much each can borrow, when borrowing is blocked, and how fast it must repay under stress. Live Stork oracle prices drive the loop; a shock lab applies ±5–15% price moves to show real‑time agent responses. A Circle Nanopayments x402 paywall monetizes the AI risk reports and live oracle endpoint at $0.01/query (demoed via `npm run demo:buyer`), but the core focus is oracle‑driven, policy‑bound RWA credit automation.

## 2) System Architecture (MVP)
- **Frontend (Next.js):** Dashboard with platform overview, company cards, shock controls, activity feed, Nanopayment panel, and per-company cockpit.  
- **Backend (Node.js/Express, TypeScript):** Agent loop (15s) + REST API; uses Stork for prices; simulates Circle transfers for borrow/repay/rebalance; per‑company state and telemetry in memory. Agents auto-start on server boot.  
- **Stork:** Live BTC/ETH/USDC oracle feeds (primary BTC).  
- **Circle Nanopayments (x402):** Paywall for premium endpoints (oracle price, AI risk report) at $0.01/query; free `/api/paywall/health`.  
- **Arc Testnet context:** Runtime network; contract writes are stubbed in this MVP, but the data model mirrors on-chain storage for later migration.

### Agent Tick (implemented)
1) Fetch Stork price + changePct.  
2) Compute collateral value, maxBorrow, health factor, liquidity/reserve ratios, volatility.  
3) Planner proposes actions (borrow/repay/rebalance/payment) per policy.  
4) Safety controller enforces LTV, min/emergency HF, per‑tx/daily caps, liquidity floor, volatility threshold; blocks/edits if unsafe.  
5) Execute simulated Circle transfers across buckets; update state, telemetry, and activity logs (trigger, policy rule, HF before/after).  

### Shock Lab
Shock buttons (-5/-10/-15, +5/+10) apply per-asset overrides with TTL, seed price history, run a tick immediately, and display HF/status changes live. Configurable multipliers and longer TTL make stress effects visible.

## 3) Demo Script (2 minutes)
1) Load dashboard (agents auto-start). Show company cards: Atlas safe HF, Northwind warning, Harbor emergency.  
2) Click “-15% Crash”; watch Harbor drop first, Atlas stay safer (policy headroom).  
3) Open Activity Feed: blocked/repay/rebalance entries showing HF and trigger.  
4) (Optional) Run `npm run demo:buyer` to show $0.01 x402 paid oracle/risk calls settling gaslessly on Arc.

## 4) Build & Run
- Install: `npm install` (root).  
- Backend: `cd apps/api && npm run dev` (API on :4000, agents auto-start).  
- Frontend: `cd apps/web && npm run dev` (UI on :3000).  
- Env: copy `.env.example` → `.env`; set Stork key, Arc RPC, Circle keys (or use sim). Key vars:  
  - `STORK_API_KEY`, `STORK_ASSET_SYMBOL=BTCUSD`, `STORK_OVERRIDE_TTL_MS=300000`  
  - `SHOCK_MULTIPLIER=1.5`, `SHOCK_STABLE_DAMPING=1`  
  - `ARC_RPC_URL`, `ARC_CHAIN_ID`, `BACKEND_SIGNER_PRIVATE_KEY` (for future on-chain)  
  - `CIRCLE_API_KEY`, `CIRCLE_ENV=sandbox`, bucket wallet IDs (sim ok)  
  - `AGENT_TICK_MS=15000`, `VOL_THRESHOLD_PCT=3`

## 5) What to Show (judging criteria)
- Agents that borrow/repay/rebalance USDC against BTC collateral, differentiated by risk policy.  
- Autonomous spending/treasury mgmt: liquidity/reserve moves and blocked actions under volatility or low HF.  
- Clear decision logic tied to oracle signals (HF/vol thresholds) with auditable feed entries.  
- Circle x402 integration for monetized oracle/risk endpoints (secondary).  
- Shock lab proving real-time risk response.

## 6) Notes on On-Chain Path
Current MVP keeps state in-process and simulates Circle transfers; the model mirrors a GuardianVault-style contract (collateral/debt/policy/logs) for migration to Arc + Circle Contracts. Telemetry/log formats are already structured for on-chain/event emission.
