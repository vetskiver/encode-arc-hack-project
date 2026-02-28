# Facilitator Guide: Adding Gasless Payments

This guide explains how to integrate Circle Gateway into your x402 facilitator to offer **gasless, batched payments** alongside your existing settlement methods.

> **Target Audience:** Infrastructure providers and payment processors running x402 facilitators.
> If you are building a dApp (Buyer or Seller), see the [Seller Guide](./SELLER_GUIDE.md).

---

## Why Integrate Gateway?

By adding Gateway as an upstream settlement provider, you empower your ecosystem:

1.  **Gasless Payments**: Enable buyers to pay by signing messages, not transactions.
2.  **Batched Settlement**: Gateway aggregates payments and settles them in bulk, reducing on-chain overhead.
3.  **Liquidity Consolidation**: Receive batch payments from multiple chains and consolidate liquidity onto a single chain instantly using withdraw.
4.  **Zero Maintenance**: Automatically support new chains as Gateway expands, without code changes.

### Important Technical Notes

- **x402 Version**: Gateway currently supports **x402 v2**. If you need **v1 support**, please reach out—we are happy to prioritize it based on demand.
- **Signature Validity**: Payment signatures must have **at least 4 days of validity**. Ensure the `validBefore` timestamp is set to at least 4 days in the future. Signatures with shorter validity periods will be rejected.
- **Settlement Priority**: We discourage relying on `verify()` for settlement flows, as the Gateway `settle()` endpoint is optimized for low latency and guarantees settlement. However, if you have specific verification needs, we are happy to discuss your use case.

---

## Architecture

Your facilitator acts as a **router**. It delegates payment verification and settlement based on the payment type.

- **Standard Payments**: Routed to your existing on-chain logic.
- **Batched Payments**: Routed to Circle Gateway.

We detect Gateway payments using the `extra` metadata:
`extra.name === "GatewayWalletBatched"`

---

## Integration Steps

### 1. Install the SDK

```bash
npm install @circlefin/x402-batching @x402/core viem
```

> **Peer dependencies:** `@x402/core` and `viem` are required peer dependencies of `@circlefin/x402-batching`.

### 2. Initialize the Client

The `BatchFacilitatorClient` handles all communication with Circle Gateway.

```typescript
import { BatchFacilitatorClient } from '@circlefin/x402-batching/server';

// Connects to Gateway and auto-fetches supported networks
const gatewayClient = new BatchFacilitatorClient();
```

### 3. Route Payments

In your facilitator's logic, use `isBatchPayment()` to route requests.

```typescript
import { isBatchPayment } from '@circlefin/x402-batching/server';

// 1. VERIFY Handler
async function handleVerify(payload, requirements) {
  if (isBatchPayment(requirements)) {
    // Route to Gateway
    return gatewayClient.verify(payload, requirements);
  }
  // Route to your existing logic
  return existingOnChainHandler.verify(payload, requirements);
}

// 2. SETTLE Handler
async function handleSettle(payload, requirements) {
  if (isBatchPayment(requirements)) {
    // Route to Gateway (Low latency, guaranteed settlement)
    return gatewayClient.settle(payload, requirements);
  }
  // Route to your existing logic
  return existingOnChainHandler.settle(payload, requirements);
}

// 3. SUPPORTED Handler
async function handleSupported() {
  // Merge Gateway networks with your existing ones
  const gateway = await gatewayClient.getSupported();
  const existing = await existingOnChainHandler.getSupported();

  return {
    kinds: [...existing.kinds, ...gateway.kinds],
    extensions: [...existing.extensions, ...gateway.extensions],
    signers: { ...existing.signers, ...gateway.signers },
  };
}
```

### 4. Expose API Handlers

Wire up your HTTP endpoints to use the routing logic.

```typescript
// POST /v1/x402/verify
app.post('/v1/x402/verify', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  const response = await handleVerify(paymentPayload, paymentRequirements);
  res.json(response);
});

// POST /v1/x402/settle
app.post('/v1/x402/settle', async (req, res) => {
  const { paymentPayload, paymentRequirements } = req.body;
  const response = await handleSettle(paymentPayload, paymentRequirements);
  res.json(response);
});
```

---

## Seller Consumption

Once you integrate Gateway, it becomes effortless for your sellers to support gasless payments. They simply connect to your facilitator as usual, and **automatically** gain access to both standard and gasless payment options.

**Using `x402ResourceServer`:**

```typescript
// Seller code example
const server = new x402ResourceServer([
  // Connect to YOUR facilitator service
  new HTTPFacilitatorClient({ url: 'https://your-facilitator-service.com' }),
]);

await server.initialize();
```

**Using `createGatewayMiddleware`:**

Sellers using the Gateway middleware can optionally route verify/settle through your facilitator by setting `facilitatorUrl`:

```typescript
import { createGatewayMiddleware } from '@circlefin/x402-batching/server';

const gateway = createGatewayMiddleware({
  sellerAddress: '0xSELLER_ADDRESS',
  facilitatorUrl: 'https://your-facilitator-service.com',
});
```

---

## Enabling Instant Liquidity

A key benefit for your sellers is **Liquidity Consolidation**. Even if they receive payments from buyers on 5 different chains, the funds accumulate in their Gateway Balance.

They can then withdraw this consolidated balance to **any** supported chain instantly.

> See [**Buyer Guide: Withdrawing Funds**](./BUYER_GUIDE.md#4-withdrawing-funds) for the withdrawal code examples (Sellers use the same `GatewayClient` or smart contract logic to withdraw).

---

## Option: Gasless-Only Facilitator

If you are building a new facilitator and only want to support gasless payments (without immediate on-chain settlement), integration is even simpler. You can use `BatchFacilitatorClient` directly with `x402ResourceServer`.

> **Additional packages:** These examples use `@x402/core` and `@x402/express`. Install them alongside the SDK:
>
> ```bash
> npm install @x402/core @x402/express @x402/evm
> ```

```typescript
import { x402ResourceServer } from '@x402/core/server';
import { BatchFacilitatorClient } from '@circlefin/x402-batching/server';

const server = new x402ResourceServer([
  // Gateway client handles all supported networks automatically
  new BatchFacilitatorClient(),
]);

await server.initialize();
```

---

## Option: Using GatewayEvmScheme with x402ResourceServer

If you are using `x402ResourceServer` with `@x402/express` or `@x402/core`, you need `GatewayEvmScheme` to properly handle Gateway payment requirements. This scheme extends the standard `ExactEvmScheme` to:

1. **Preserve `extra` metadata** (verifyingContract, name, version) that Gateway clients need for EIP-712 signing
2. **Set appropriate timeout** (4 days for async batched settlement)
3. **Register USDC money parsers** for all Gateway-supported networks

```typescript
import { x402ResourceServer } from '@x402/express';
import {
  BatchFacilitatorClient,
  GatewayEvmScheme,
} from '@circlefin/x402-batching/server';

// 1. Create the facilitator client
const circleClient = new BatchFacilitatorClient();

// 2. Create the resource server with the facilitator
const server = new x402ResourceServer([circleClient]);

// 3. Register GatewayEvmScheme for all EVM networks
// This ensures payment requirements include the verifyingContract
// that Gateway clients need for signing
server.register('eip155:*', new GatewayEvmScheme());

// 4. Initialize (fetches supported networks from Gateway)
await server.initialize();
```

> **Why is GatewayEvmScheme needed?** The base `ExactEvmScheme` discards the `extra` field from supported kinds when building payment requirements. Gateway clients require `extra.verifyingContract` to construct valid EIP-712 signatures. `GatewayEvmScheme` preserves this data.

---

## API Reference

### `BatchFacilitatorClient`

The primary class for server-side Gateway interaction.

```typescript
class BatchFacilitatorClient {
  constructor(config?: BatchFacilitatorConfig);

  /**
   * Get supported payment kinds from Gateway.
   * Returns all Gateway-supported networks with their contract addresses.
   */
  getSupported(): Promise<SupportedResponse>;

  /**
   * Verify a payment signature via Gateway API.
   * Note: Consider using settle() directly for production flows.
   */
  verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse>;

  /**
   * Submit a payment for batched settlement via Gateway API.
   * Recommended: Gateway settle has very low latency and guarantees settlement.
   */
  settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse>;
}
```
