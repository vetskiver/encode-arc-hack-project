# Seller Guide: Monetize your API

This guide shows you how to accept gasless USDC payments for your API endpoints.

## Why use this?

1.  **Gasless for Buyers**: Your users don't pay gas fees, increasing conversion rates.
2.  **Instant Liquidity for You**: Get paid on **any chain**. You can withdraw your earnings to supported EVM chain instantly, regardless of where the buyer paid from.

> ⚠️ **Important Notes**
>
> - **x402 Version**: Circle Gateway currently supports **x402 v2**. If you need **v1 support**, please reach out—we are happy to prioritize it based on demand.
> - **Signature Validity**: Payment signatures must have **at least 4 days of validity**. Ensure the `validBefore` timestamp is set to at least 4 days in the future. Signatures with shorter validity periods will be rejected. -**Settlement Priority**: We discourage relying on `verify()` for settlement flows, as the Gateway `settle()` endpoint is optimized for low latency and guarantees settlement. However, if you have specific verification needs, we are happy to discuss your use case.

## 1. Installation

```bash
npm install @circlefin/x402-batching express @x402/core viem
```

> **Peer dependencies:** `@x402/core` and `viem` are required peer dependencies of `@circlefin/x402-batching`.

## 2. The Easy Way (Middleware)

The easiest way to integrate is using our Express middleware. It handles the entire `402 Payment Required` negotiation loop for you.

```typescript
import express from 'express';
import { createGatewayMiddleware, PaymentRequest } from '@circlefin/x402-batching/server';

const app = express();

// 1. Configure Gateway
// By default, this accepts payments from ALL supported Gateway chains.
const gateway = createGatewayMiddleware({
  sellerAddress: '0xYOUR_WALLET_ADDRESS', // Where you want to receive USDC
});

// 2. Protect a route
// This will automatically return 402 if no payment is provided,
// and 200 (with next()) if a valid payment signature is found.
app.get('/premium-data', gateway.require('$0.01'), (req, res) => {
  // Payment info is attached to the request by the middleware
  const { payer, amount, network } = (req as PaymentRequest).payment!;

  console.log(`Paid ${amount} USDC by ${payer} on ${network}`);

  res.json({
    secret: 'The treasure is hidden under the doormat.',
    paid_by: payer,
  });
});

app.listen(3000); // The basic-paywall example uses port 3002
```

---

## 3. Advanced Integration

If you aren't using Express, or need complex logic (e.g. dynamic pricing, custom headers), use the `BatchFacilitatorClient`.

```typescript
import { BatchFacilitatorClient } from '@circlefin/x402-batching/server';

const facilitator = new BatchFacilitatorClient();

// Fetch supported networks on startup to build payment requirements
const supported = await facilitator.getSupported();

async function handleRequest(req, res) {
  const signature = req.headers['payment-signature'];

  // Case 1: No Payment provided -> Ask for it
  // x402 v2: payment info goes in the PAYMENT-REQUIRED header (base64), body is {}
  if (!signature) {
    const paymentRequired = {
      x402Version: 2,
      accepts: supported.kinds.map((kind) => ({
        scheme: 'exact',
        network: kind.network,
        asset: kind.extra?.asset,
        amount: '10000', // 0.01 USDC (6 decimals)
        maxTimeoutSeconds: 345600, // 4 days
        payTo: '0xYOUR_ADDRESS',
        extra: {
          name: 'GatewayWalletBatched',
          version: '1',
          verifyingContract: kind.extra?.verifyingContract,
        },
      })),
    };

    res.statusCode = 402;
    res.setHeader(
      'PAYMENT-REQUIRED',
      Buffer.from(JSON.stringify(paymentRequired)).toString('base64'),
    );
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({}));
  }

  // Case 2: Verify & Settle Payment
  const { accepted, ...payload } = JSON.parse(
    Buffer.from(signature, 'base64').toString(),
  );

  // Settle (Submit to Gateway — recommended over verify for production)
  const settlement = await facilitator.settle(payload, accepted);
  if (!settlement.success) {
    return res.status(402).json({ error: 'Settlement failed', reason: settlement.errorReason });
  }

  // Success — attach PAYMENT-RESPONSE header
  const paymentResponse = Buffer.from(
    JSON.stringify({
      success: true,
      transaction: settlement.transaction,
      network: accepted.network,
      payer: settlement.payer,
    }),
  ).toString('base64');
  res.setHeader('PAYMENT-RESPONSE', paymentResponse);

  res.json({ data: '...' });
}
```

---

## 4. Optional: Routing Through a Custom Facilitator

By default, the middleware communicates directly with Circle Gateway for verify/settle. If you are running your own facilitator (see [Facilitator Guide](./FACILITATOR_INTEGRATION.md)), you can route payments through it instead:

```typescript
const gateway = createGatewayMiddleware({
  sellerAddress: '0xYOUR_WALLET_ADDRESS',
  facilitatorUrl: 'https://your-facilitator.com', // Optional: route through your facilitator
});
```

---

## 5. Customization: Supported Networks

By default, the middleware accepts payments from **any** chain supported by Circle Gateway.

**We recommend keeping the default configuration.** This ensures:

1.  **Maximum Reach**: Any buyer with a Gateway balance can pay you.
2.  **Flexible Liquidity**: You receive USDC in your Gateway balance, which you can withdraw to **any** supported chain instantly.

However, if you strictly need to limit payments to specific networks:

```typescript
const gateway = createGatewayMiddleware({
  sellerAddress: '0x...',
  networks: ['eip155:5042002'], // Only accept Arc Testnet
});
```

## 6. Checking Your Balance and Settlement

### Viewing Seller Balance

After buyers pay for your resources, funds accumulate in your Gateway balance. Use `GatewayClient` to check:

```typescript
import { GatewayClient } from '@circlefin/x402-batching/client';

const client = new GatewayClient({
  chain: 'arcTestnet',
  privateKey: '0xYOUR_PRIVATE_KEY',
});

const balances = await client.getBalances();

console.log('Gateway Balance:');
console.log(`  Total:     ${balances.gateway.formattedTotal} USDC`);
console.log(`  Available: ${balances.gateway.formattedAvailable} USDC`);
```

### Balance Fields

| Field | Description |
|---|---|
| `total` | Total USDC in your Gateway balance |
| `available` | USDC available for withdrawal or spending |

### Settlement Timeline

When a buyer's payment is settled through Gateway:

1. **Immediate**: The payment signature is verified and accepted
2. **Batched Settlement**: Gateway aggregates payments and settles them on-chain in batches
3. **Balance Updated**: Your Gateway `available` balance increases after settlement completes

> **Note:** Settlement is handled automatically by Gateway. You do not need to trigger it manually. The `settle()` call in the middleware submits the payment for batched processing.

### Withdrawing Earnings

Once funds are in your Gateway balance, withdraw to any supported chain:

```typescript
// Withdraw to your wallet on the same chain
await client.withdraw('50');

// Withdraw to a different chain (e.g., Base)
await client.withdraw('50', { chain: 'base' });
```

See the [Buyer Guide: Withdrawing Funds](./BUYER_GUIDE.md#4-withdrawing-funds) for more withdrawal examples.
