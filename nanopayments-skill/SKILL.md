---
name: nanopayments-skill
description: Build x402 buyer, seller, and facilitator using Circle x402 Batching SDK. Use when integrating @circlefin/x402-batching, setting up paid API endpoints, implementing 402 payment flows, micropayments, or following x402 buyer/seller/facilitator guides.
---

# x402 Buyer, Seller, Facilitator

## Determine the role(s)

Before starting, identify which role(s) the user is building. Infer from their request if obvious (e.g., "build a seller" → Seller). If ambiguous, ask which of the following they need:

| Role | What it does | Guide |
|------|-------------|-------|
| **Seller** | API server that charges for endpoints | [SELLER_GUIDE.md](docs/SELLER_GUIDE.md) |
| **Buyer** | Client that pays for seller endpoints | [BUYER_GUIDE.md](docs/BUYER_GUIDE.md) |
| **Facilitator** | Settlement service between seller and Circle Gateway | [FACILITATOR_INTEGRATION.md](docs/FACILITATOR_INTEGRATION.md) |

Common combinations: Seller only, Buyer only, Seller + Facilitator, all three (full-stack demo).

## Workflow

Step 1 (project setup) is always required. Then follow only the steps for the chosen role(s):

| Role | Steps to follow |
|------|----------------|
| Seller only | 1 → 3 → 5 |
| Buyer only | 1 → 4 |
| Facilitator only | 1 → 2 |
| Seller + Facilitator | 1 → 2 → 3 → 5 |
| All three | 1 → 2 → 3 → 4 → 5 |

### Step 1: Project setup

**STOP — before installing anything, verify the private registry is configured.**

The SDK is in private beta on Cloudsmith. Installation will fail without this setup. Ask the user to confirm both items before proceeding:

1. **`.npmrc` exists** in the project root with this content:

   ```ini
   @circlefin:registry=https://npm.cloudsmith.io/circle/common-private/
   //npm.cloudsmith.io/circle/common-private/:_authToken=${CLOUDSMITH_TOKEN}
   ```

2. **`CLOUDSMITH_TOKEN` env var is set.** The Circle team provides this token. Do not guess or fabricate a token. If the user doesn't have one, tell them to contact the Circle team.

Once both are confirmed, install the exact packages:

```bash
npm install @circlefin/x402-batching @x402/core viem
```

Do NOT use any other package name. The SDK is `@circlefin/x402-batching` — not `x402`, not `@x402/batching`, not `x402-batching`.

For full setup details see [QUICKSTART_GUIDE.md](docs/QUICKSTART_GUIDE.md).

### Step 2: Facilitator

Read [FACILITATOR_INTEGRATION.md](docs/FACILITATOR_INTEGRATION.md) §1–4. Install, create `BatchFacilitatorClient`, use `isBatchPayment()` to route, expose `/v1/x402/verify` and `/v1/x402/settle`. Add a `/health` endpoint for startup checks.

### Step 3: Seller

Read [SELLER_GUIDE.md](docs/SELLER_GUIDE.md) §2 for the middleware approach, §4 for facilitator routing.

**Critical:** Connect seller to facilitator with `facilitatorUrl`:

```typescript
const gateway = createGatewayMiddleware({
  sellerAddress: '0x...',
  facilitatorUrl: 'http://localhost:3001', // your facilitator
});
```

Without `facilitatorUrl`, the seller calls Circle Gateway directly and skips your facilitator.

Access payment info with the SDK type:

```typescript
import { PaymentRequest } from '@circlefin/x402-batching/server';
const { payer, amount, network } = (req as PaymentRequest).payment!;
```

### Step 4: Buyer

Read [BUYER_GUIDE.md](docs/BUYER_GUIDE.md) §2–3. `GatewayClient` handles the full 402 loop:

```typescript
const client = new GatewayClient({ chain: 'arcTestnet', privateKey: '0x...' });
await client.deposit('1'); // one-time
const { data } = await client.pay('http://localhost:3000/premium-data');
```

For POST endpoints, pass options: `client.pay(url, { method: 'POST', body: { ... } })`.

For the manual flow (custom clients), see §6 — parse the `PAYMENT-REQUIRED` header (base64 JSON), not the response body.

### Step 5: Wire and test

Start facilitator first, then seller. Wait for both `/health` to return 200 before running buyer/tests. The flow is:

```
Buyer  →  Seller  →  Facilitator  →  Circle Gateway
```

## Gotchas

- **Private registry required.** The SDK package is `@circlefin/x402-batching` on Cloudsmith, not on public npm. Without `.npmrc` and `CLOUDSMITH_TOKEN`, `npm install` will fail with 404 or auth errors. Always ask the user to confirm registry setup before installing.
- **x402 v2 uses headers, not body.** Payment requirements: `PAYMENT-REQUIRED` header (base64). Payment submission: `Payment-Signature` header (base64). Response: `PAYMENT-RESPONSE` header (base64). Body carries the resource content only.
- **`supports()` is GET-only.** For POST-only seller endpoints, skip `supports()` and call `pay()` directly with `{ method: 'POST', body }` ([BUYER_GUIDE](docs/BUYER_GUIDE.md) §5).
- **Signature validity: 4 days minimum.** Gateway rejects shorter `validBefore` windows. The middleware handles this automatically; only relevant for manual/advanced flows.
- **Prefer `settle()` over `verify()`.** The `settle()` endpoint is lower latency and guarantees settlement ([FACILITATOR_INTEGRATION](docs/FACILITATOR_INTEGRATION.md), [SELLER_GUIDE](docs/SELLER_GUIDE.md)).
- **Network must match balance.** `GatewayClient` pays on the chain it was constructed with. Buyer must have Gateway balance on that chain. See [NETWORKS.md](docs/NETWORKS.md) for chain names and deposit times.
- **Startup ordering matters.** Seller calls facilitator for verify/settle. If the facilitator isn't ready, seller returns 500. Always start facilitator first and confirm it's healthy.

## Reference docs

| Doc | What to use it for |
|-----|-------------------|
| [QUICKSTART_GUIDE.md](docs/QUICKSTART_GUIDE.md) | Registry, `.npmrc`, install, examples |
| [FACILITATOR_INTEGRATION.md](docs/FACILITATOR_INTEGRATION.md) | Building the facilitator service |
| [SELLER_GUIDE.md](docs/SELLER_GUIDE.md) | Middleware seller, advanced seller, facilitator wiring |
| [BUYER_GUIDE.md](docs/BUYER_GUIDE.md) | GatewayClient, deposit, pay, manual flow |
| [CONCEPTS.md](docs/CONCEPTS.md) | x402 v2 protocol and header format |
| [NETWORKS.md](docs/NETWORKS.md) | Supported chains, chain IDs, deposit times |
| [SDK_REFERENCE.md](docs/SDK_REFERENCE.md) | Full API surface and config options |
