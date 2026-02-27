# RWA Credit Guardian — Encode × Arc Enterprise & DeFi Hackathon MVP
Track (must match exactly): “Best Agentic Commerce Powered by Real-World Assets on Arc”

Goal: Ship a clean working MVP in ~3 hours that demonstrates:
- An autonomous agent managing USDC-denominated credit backed by RWA collateral (tokenized Treasuries)
- BORROW + REPAY + REBALANCE against RWA collateral
- Autonomous treasury management and USDC payments
- Clear deterministic decision logic tied to Stork oracle signals
- Mandatory tools used: Circle Wallets, Arc, USDC, Circle Contracts, Stork

This repo must contain:
- Working frontend (Next.js dashboard)
- Working backend (Node agent loop + API)
- Arc smart contract(s) for state + logs
- Circle Wallets integration for USDC movement
- Stork oracle integration for collateral price + volatility proxy
- Documentation + demo plan

## 1) Product Summary
RWA Credit Guardian is an autonomous treasury + credit manager. A user registers RWA collateral (tokenized Treasury representation) on Arc. The user requests USDC payments. The agent monitors collateral price via Stork, manages a USDC credit line, borrows USDC when liquidity is needed and safe, repays debt when risk rises, and rebalances USDC across treasury buckets. All USDC transfers execute through Circle Wallets and every action is recorded on Arc with Circle transaction references.

Design principle: Agentic where it should be agentic, deterministic where it must be deterministic.
Two-layer agent:
- Layer A: Deterministic Safety Controller (hard constraints, always enforced)
- Layer B: Agentic Strategy Planner (chooses actions/amounts within safety constraints; no hard-coded “repay 20%”)

## 2) System Architecture (End-to-End)

### Components
Frontend (Next.js)
- Dashboard: collateral, debt, health factor, oracle price, bucket balances, agent status, logs
- UI actions: register collateral, request payment, start/stop agent, run agent now, manual borrow/repay

Backend (Node.js)
- Runs agent loop every 15s and exposes REST API
- Integrates Circle Wallets for USDC balances + transfers
- Integrates Stork oracle for collateral price feed
- Reads/writes Arc contract state and logs
- Stores MVP runtime state in memory: pendingPayments queue, telemetry, price history ring buffer

Arc (EVM on Arc)
- Smart contract stores: collateralAmount[user], debtUSDC[user], policy params
- Contract records: borrow/repay/rebalance/payment records, decision logs
- Contract emits events consumed by frontend for action history
- Note: Actual USDC movement is via Circle Wallets; contract is canonical audit + state tracking

Mandatory tool usage
- Circle Wallets: custody + transfers for treasury buckets and payments
- Arc: onchain state + event logs
- USDC: settlement asset for debt, payments, rebalances
- Circle Contracts: used to deploy Arc contracts (and optionally an ERC20 placeholder for RWA collateral)
- Stork: oracle price feed and volatility signal

### Onchain vs Offchain Responsibilities
Onchain (Arc):
- Store collateral and debt accounting
- Store policy thresholds
- Record all actions with Circle tx references
- Emit events for indexing

Offchain (Backend):
- Oracle fetching, price freshness validation, volatility proxy
- Deterministic computations (HF, maxBorrow)
- Strategy planning + safety enforcement
- Execute USDC transfers via Circle Wallets
- Telemetry and queueing

### Sequence Flows
(a) Register collateral
1) UI -> POST /api/collateral/register
2) Backend -> Arc contract registerCollateral
3) Event -> CollateralRegistered

(b) Borrow USDC (agent or manual)
1) Backend computes maxBorrow and HF using Stork price
2) Backend executes Circle transfer: CreditFacilityWallet -> LiquidityWallet (USDC)
3) Backend records on Arc: recordBorrow(amount, circleTxRef) + logDecision(snapshot,...)

(c) Repay USDC
1) Backend executes Circle transfer: Reserve/Liquidity -> CreditFacilityWallet (USDC)
2) Backend records on Arc: recordRepay(amount, circleTxRef) + logDecision

(d) Execute payment
1) UI -> POST /api/payment/request (queues pending payment)
2) Agent tick borrows if needed and safe
3) Backend executes Circle transfer: LiquidityWallet -> recipient
4) Backend records on Arc: recordPayment(to, amount, circleTxRef) + logDecision

(e) Agent tick loop (every 15s + manual trigger)
1) Fetch Arc state (collateral, debt, policy)
2) Fetch Stork price + validate
3) Fetch Circle bucket balances
4) Compute snapshot metrics (HF, buffers)
5) Planner proposes plan + rationale
6) Safety controller validates/edits/blocks
7) Execute Circle transfers
8) Record results on Arc
9) Update telemetry (status, lastReason, nextTickAt)

### Secrets / Key Handling (Dev)
- Backend-only env vars (.env.local, gitignored):
  - ARC_RPC_URL
  - ARC_CHAIN_ID
  - ARC_CONTRACT_ADDRESS
  - BACKEND_SIGNER_PRIVATE_KEY (for Arc tx signing)
  - CIRCLE_API_KEY
  - CIRCLE_ENV (sandbox)
  - CIRCLE_WALLET_LIQUIDITY_ID
  - CIRCLE_WALLET_RESERVE_ID
  - CIRCLE_WALLET_YIELD_ID
  - CIRCLE_WALLET_CREDIT_FACILITY_ID
  - USDC_TOKEN_ID_OR_ADDRESS (depending on Circle API usage / Arc address for ABI checks)
  - STORK_API_KEY
  - STORK_ASSET_SYMBOL
  - AGENT_TICK_MS=15000

Frontend env vars (public):
  - NEXT_PUBLIC_API_BASE_URL (if needed)

### What’s Stored Where
Arc:
- collateralAmount[user]
- debtUSDC[user]
- policy params
- action records + decision logs (events)

Backend (in-memory for MVP):
- pendingPayments: [{user,to,amountUSDC,createdAt}]
- priceHistory: last K oracle prices for change_pct
- telemetry: {agentEnabled,status,lastReason,nextTickAt,lastSnapshot}

Upgrade path:
- Replace in-memory with Redis/Postgres for pendingPayments + telemetry + price history without changing contract ABI.

## 3) Architecture Diagram (Text)
[Next.js Dashboard]
  -> HTTP -> [Node Backend: API + Agent Loop]
      -> RPC -> [Arc Contract: GuardianVault (state + logs)]
      -> REST -> [Stork Oracle (price feed)]
      -> REST -> [Circle Wallets API (USDC custody + transfers)]
              -> controls -> [Liquidity Wallet] [Reserve Wallet] [Yield Wallet] [Credit Facility Wallet]
      -> (deploy) -> [Circle Contracts (deploy GuardianVault + optional RWA token)]

## 4) Diagram Spec for Excalidraw/draw.io (nodes + edges)
NODES
1. FE: Next.js Dashboard
2. BE: Node Backend (Agent Loop + API)
3. ARC: Arc Smart Contract (GuardianVault)
4. STORK: Stork Oracle (REST)
5. CIRCLE: Circle Wallets API
6. WAL_LIQ: Liquidity Bucket Wallet
7. WAL_RES: Reserve Bucket Wallet
8. WAL_YIELD: Yield Bucket Wallet
9. WAL_CREDIT: Credit Facility Wallet (borrow source / repay sink)
10. USDC: USDC on Arc (address referenced by backend + docs)
11. CC: Circle Contracts (deploy)

EDGES
1. FE -> BE : /api/* commands + telemetry
2. BE -> ARC : read state + write records + logs
3. BE -> STORK : GET latest price + ts
4. BE -> CIRCLE : balances + transfers (USDC)
5. CIRCLE -> WAL_LIQ : custody/control
6. CIRCLE -> WAL_RES : custody/control
7. CIRCLE -> WAL_YIELD : custody/control
8. CIRCLE -> WAL_CREDIT : custody/control
9. BE -> USDC : ABI checks (decimals/address verification)
10. BE -> CC : deploy GuardianVault (+ optional ERC20 RWA token)

## 5) Smart Contract Design (Arc) — GuardianVault
Requirements:
- Collateral registration (RWA token placeholder)
- Debt tracking (USDC-denominated)
- Action logging with Circle tx refs
- Policy params (LTV, minHealth, emergencyHealth, liquidityMin, spending caps)

State:
- collateralAmount[user]
- debtUSDC[user]
- policy params:
  - ltvBps (e.g., 6000 = 60%)
  - minHealthBps (e.g., 14000 = 1.40)
  - emergencyHealthBps (e.g., 12000 = 1.20)
  - liquidityMinUSDC (6 decimals)
  - perTxMaxUSDC (6 decimals)
  - dailyMaxUSDC (6 decimals)

Methods (exact names):
- setPolicy(params)
- registerCollateral(amount)
- recordBorrow(amount, circleTxRef)
- recordRepay(amount, circleTxRef)
- recordRebalance(fromBucket, toBucket, amount, circleTxRef)
- recordPayment(to, amount, circleTxRef)
- logDecision(snapshot, action, rationaleHash)

Events:
- PolicySet
- CollateralRegistered
- BorrowRecorded
- RepayRecorded
- RebalanceRecorded
- PaymentRecorded
- AgentDecisionLogged

Consistency rules:
- recordRepay cannot exceed current debt
- recordBorrow cannot exceed LTV-derived maxBorrow from the latest oracle snapshot submitted by agent
- recordPayment enforces per-tx and daily limits
- Only backend agent address can call record* and logDecision (prevents spam logs)

Implement one contract in `contracts/GuardianVault.sol` and deploy via Circle Contracts.

## 6) Backend Agent Design (Two-Layer)

Core computed values:
- oraclePrice (from Stork)
- collateralValueUSDC = collateralAmount * oraclePrice
- maxBorrowUSDC = collateralValueUSDC * LTV
- healthFactor = maxBorrowUSDC / max(debtUSDC, 1)
- liquidityUSDC (Circle balance in Liquidity wallet)
- reserveUSDC (Circle balance in Reserve wallet)
- pendingPayments: MVP supports 1 pending payment

A) Deterministic Safety Controller (hard constraints)
Inputs: snapshot + proposed plan
Output: ALLOW/BLOCK + edited plan

Rules:
1) If healthFactor < minHealth: block any action that increases debt or reduces liquidity buffer; allow repay only.
2) If healthFactor < emergencyHealth: force repay to restore targetHealth = minHealth + 0.10.
3) Never exceed LTV (debtUSDC <= maxBorrowUSDC).
4) Enforce minimum liquidity: liquidityUSDC >= liquidityMin after actions unless emergency repay required.
5) Spending constraints: perTxMaxUSDC and dailyMaxUSDC enforced.
6) Risk Mode if HF below minHealth OR abs(change_pct) above VOL_THRESHOLD.

B) Agentic Strategy Planner (optimizer/scoring, not hard-coded)
Approach: scoring planner with closed-form calculations.
Objective priority:
1) Complete pending payment if safe.
2) Maintain liquidityMin buffer.
3) Maintain target health buffer.
4) Minimize number of transfers.

Closed-form:
- repayMinToTarget:
  repay >= debt - maxBorrow/targetHealth
- borrowMaxSafe:
  debt + borrow <= maxBorrow/targetHealth
- borrowNeed:
  max(0, payment + liquidityMin - liquidityUSDC)
- rebalance to satisfy liquidityMin:
  move min(liquidityMin - liquidityUSDC, reserveUSDC) from Reserve -> Liquidity

LLM is used only to generate a rationale string for UI; safety controller can override.

Agent UX telemetry (must expose via API):
- status: Monitoring | Executing | Risk Mode
- lastReason: human string
- nextTickAt: timestamp in ms

## 7) Backend API Spec (exact routes)

GET /api/status
Response:
{
  "agentEnabled": boolean,
  "status": "Monitoring"|"Executing"|"Risk Mode",
  "lastReason": string,
  "nextTickAt": number,
  "snapshot": {
    "oraclePrice": number,
    "oracleTs": number,
    "changePct": number,
    "collateralAmount": string,
    "collateralValueUSDC": string,
    "debtUSDC": string,
    "maxBorrowUSDC": string,
    "healthFactor": number,
    "liquidityUSDC": string,
    "reserveUSDC": string,
    "pendingPayment": null | {"to": string, "amountUSDC": string}
  }
}

POST /api/agent/start
POST /api/agent/stop
POST /api/agent/tick

GET /api/oracle
Response: { "price": number, "ts": number, "changePct": number, "stale": boolean }

POST /api/collateral/register
Body: { "user": string, "amount": string }
Response: { "txHash": string }

POST /api/payment/request
Body: { "user": string, "to": string, "amountUSDC": string }
Response: { "queued": true }

POST /api/manual/borrow
Body: { "user": string, "amountUSDC": string }
Response: { "circleTxRef": string, "arcTxHash": string }

POST /api/manual/repay
Body: { "user": string, "amountUSDC": string }
Response: { "circleTxRef": string, "arcTxHash": string }

GET /api/logs
Response: [{ "ts": number, "action": string, "amountUSDC": string, "healthFactor": number, "rationale": string, "circleTxRef": string, "arcTxHash": string }]

## 8) Agent Tick Pseudocode (must implement exactly)
function agentTick(user):
  set status="Executing"
  read Arc state: collateralAmount, debtUSDC, policy
  read Stork price: price, ts; validate freshness and non-zero
  compute changePct using last K prices
  read Circle balances: liquidityUSDC, reserveUSDC, yieldUSDC
  compute collateralValueUSDC, maxBorrowUSDC, healthFactor
  snapshot = {all values + pendingPayment}
  proposal = planner(snapshot) => actions + rationale
  approvedPlan = safetyController(snapshot, proposal) => allow/block + edits
  if blocked:
     status = Risk Mode if HF<minHealth or abs(changePct)>VOL else Monitoring
     lastReason = "Blocked: <reason>"
     logDecision on Arc
     return
  execute actions sequentially through Circle Wallets:
     for each action:
       circleTxRef = circle.transfer(...)
       record on Arc: recordBorrow/recordRepay/recordRebalance/recordPayment
       logDecision on Arc (snapshot + action + rationaleHash)
  update telemetry: status, lastReason, nextTickAt

## 9) Treasury Model (Buckets)
Create 4 Circle wallets:
- Liquidity bucket (payments)
- Reserve bucket (repay buffer)
- Yield bucket (dummy for V1)
- Credit facility wallet (borrow source / repay destination)

Rebalance = Circle USDC transfer between bucket wallets.
All transfers are recorded on Arc with circleTxRef.

## 10) Frontend Dashboard Requirements (Next.js)
Must display:
- Stork oracle price + last updated time
- Collateral amount + collateral value
- Debt (USDC)
- Max borrow + available borrow
- Health factor with states (safe/warn/danger)
- Liquidity + Reserve balances
- Agent status + last reason + countdown to nextTickAt
- Action log table (ts, action, amount, HF, rationale, circleTxRef)

UI actions:
- Register collateral
- Request payment
- Start/Stop agent loop
- Run agent now
- Manual Borrow
- Manual Repay

Component map:
- HeaderStatusBar
- RiskOverview
- TreasuryBuckets
- PaymentRequestForm
- CollateralPanel
- ActionLogTable

## 11) Video Demo Script (2–3 min)
1) Open dashboard: show collateral, debt=0, HF safe, oracle price, agent Monitoring.
2) Click Start Agent, show countdown ticking.
3) Request USDC payment that exceeds liquidity.
4) Show agent tick: borrows USDC into liquidity (Circle tx ref) then executes payment (Circle tx ref).
5) Show Arc logs updating (BorrowRecorded + PaymentRecorded + AgentDecisionLogged).
6) Simulate oracle drop by toggling backend “oracle override” endpoint or by changing feed symbol/test mode:
   - Show Risk Mode.
   - Agent repays debt automatically and rebalances to restore buffers.
7) Close: “Programmable money + real-world collateral + autonomous risk-managed commerce in USDC.”

## 12) Implementation Plan (3 hours)

Exact file structure to generate:
/
  README.md
  package.json
  apps/
    web/
      package.json
      next.config.js
      pages/
        index.tsx
      components/
        HeaderStatusBar.tsx
        RiskOverview.tsx
        TreasuryBuckets.tsx
        PaymentRequestForm.tsx
        CollateralPanel.tsx
        ActionLogTable.tsx
      lib/
        api.ts
        types.ts
    api/
      package.json
      src/
        index.ts
        routes.ts
        store.ts
        agent/
          agentLoop.ts
          agentTick.ts
          planner.ts
          safetyController.ts
          executor.ts
          telemetry.ts
        integrations/
          arc.ts
          circle.ts
          stork.ts
          usdc.ts
        utils/
          math.ts
          hash.ts
  contracts/
    GuardianVault.sol
  hardhat/
    hardhat.config.ts
    scripts/
      deploy.ts
  .env.example

Timeboxes:
0:00–0:15 scaffold repo + env + types
0:15–0:45 contract + deploy (Circle Contracts or Hardhat)
0:45–1:25 Circle wallets + balances + transfers
1:25–1:45 Stork oracle module + /api/oracle
1:45–2:20 agent loop + safety + planner + Arc logging
2:20–2:55 frontend dashboard + polling + logs table
2:55–3:00 demo checklist pass

Minimal env vars (.env.example):
ARC_RPC_URL=
ARC_CHAIN_ID=
ARC_CONTRACT_ADDRESS=
BACKEND_SIGNER_PRIVATE_KEY=
CIRCLE_API_KEY=
CIRCLE_ENV=sandbox
CIRCLE_WALLET_LIQUIDITY_ID=
CIRCLE_WALLET_RESERVE_ID=
CIRCLE_WALLET_YIELD_ID=
CIRCLE_WALLET_CREDIT_FACILITY_ID=
STORK_API_KEY=
STORK_ASSET_SYMBOL=
AGENT_TICK_MS=15000
VOL_THRESHOLD_PCT=3

Demo readiness checklist:
- Oracle endpoint returns price + ts + changePct
- Circle balances show on dashboard
- Payment request queues and appears on status
- Agent tick borrows then pays when liquidity insufficient
- Agent tick repays when HF below minHealth OR volatility spike
- Every Circle transfer produces an Arc log record with circleTxRef
- Action log table updates live

## 13) Build Instructions (local)
- Install deps: pnpm i (or npm)
- Start backend: cd apps/api && pnpm dev
- Start frontend: cd apps/web && pnpm dev
- Visit: http://localhost:3000

---

## IMPLEMENTATION TASK FOR CLAUDE/CODEX
Generate the full repo structure and code to satisfy every requirement above.

Hard requirements:
- Use Next.js for frontend and Node.js for backend.
- Backend runs agent loop every 15 seconds and supports manual tick.
- Use Circle Wallets API for:
  - querying balances
  - transferring USDC between bucket wallets
  - transferring USDC to recipient
  - return circleTxRef for every transfer
- Use Stork REST API for oracle price; enforce freshness and non-zero price; compute changePct over last K ticks.
- Use Arc smart contract (GuardianVault) to store collateral/debt/policy and record logs for borrow/repay/rebalance/payment + agent decisions.
- Contract must prevent nonsense logs (repay > debt; borrow beyond latest maxBorrow snapshot; spending caps).
- Frontend must display all required fields and include all required UI actions.
- Provide clean TypeScript types and minimal UI styling.
- No overengineering. Make it run.

Output format:
1) Print the full file tree.
2) For each file, print its full contents.
3) Ensure code compiles and endpoints match this README.
