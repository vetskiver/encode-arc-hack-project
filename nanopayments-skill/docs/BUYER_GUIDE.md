# Buyer Guide: Paying for Resources

This guide shows you how to pay for x402-protected resources using Circle Gateway.

## Prerequisites

To make gasless payments, you must have:

1.  **An EVM Wallet** (Private Key).
2.  **USDC deposited in the Gateway Contract** (One-time setup).

## 1. Installation

```bash
npm install @circlefin/x402-batching viem @x402/core
```

> **Peer dependencies:** `@x402/core` and `viem` are required peer dependencies. `@x402/evm` is optional (needed only if using `CompositeEvmScheme` with standard onchain payments).

## 2. Setup & Deposit

Before you can pay, you need to move some USDC into the Gateway system.

```typescript
import { GatewayClient } from '@circlefin/x402-batching/client';

const client = new GatewayClient({
  chain: 'arcTestnet', // or 'baseSepolia', etc.
  privateKey: '0x...',
});

// 1. Check balances
const balances = await client.getBalances();
console.log(`Gateway Balance: ${balances.gateway.formattedAvailable}`);

// 2. Deposit (requires gas + on-chain transaction)
// Only needed once!
if (balances.gateway.available < 1000000n) {
  console.log('Depositing 1 USDC...');
  await client.deposit('1');
}
```

## 3. Paying for Resources (Gasless)

Once you have a balance, paying is instant and free (no gas).

> **Don't have a seller URL yet?**
> Set up your own test API in 2 minutes using the [Seller Guide](./SELLER_GUIDE.md).

```typescript
// This URL is protected by x402 (run the example seller locally)
const url = 'http://localhost:3000/premium-data';

// .pay() handles the 402 negotiation automatically:
// 1. Calls URL -> gets 402
// 2. Signs payment intent (offline)
// 3. Calls URL again with signature header
const { data, status } = await client.pay(url);

console.log('Success:', data);
```

## 4. Withdrawing Funds

You can exit Gateway at any time.

- **Instant Withdrawal (Same Chain):** Moving funds back to your wallet on the _same chain_ you are connected to is instant.
- **Cross-Chain Withdrawal:** Moving funds to a _different chain_ is also instant, but requires gas on the destination chain to mint the USDC.

```typescript
// Withdraw 5 USDC to my wallet on Arc Testnet
await client.withdraw('5');

// Withdraw 5 USDC to Base Sepolia
// (Requires ETH on Base Sepolia to pay for minting gas)
await client.withdraw('5', { chain: 'baseSepolia' });
```

## 5. Best Practices: Checking Support

Before attempting a payment, it's good practice to check if the URL supports Gateway batching. This prevents errors if the seller only accepts standard on-chain payments.

```typescript
// Check before paying
const support = await client.supports(url);

if (!support.supported) {
  console.error('This URL does not support Gateway payments');
  return;
}

// Proceed with payment
const payment = await client.pay(url);
```

## Deposit Finality and Wait Times

When you deposit USDC into Gateway, the API waits for a certain number of block confirmations before your balance becomes available. This wait time depends on the chain's finality:

| Chain | Deposit Time |
|---|---|
| Arc Testnet | ~0.5 sec |
| Avalanche Fuji | ~8 sec |
| HyperEVM Testnet, Sei Atlantic | ~5 sec |
| Polygon Amoy, Sonic Testnet | ~8 sec |
| Arbitrum Sepolia, Base Sepolia, Ethereum Sepolia, Optimism Sepolia, Unichain Sepolia, World Chain Sepolia | ~13-19 min |

See [Gateway Supported Blockchains](https://developers.circle.com/gateway/references/supported-blockchains) for the latest confirmation requirements.

### Checking Balance Availability

Always verify your available balance before paying:

```typescript
const balances = await client.getBalances();

// 'available' is the balance you can spend right now
console.log(`Available: ${balances.gateway.formattedAvailable} USDC`);

// 'total' includes funds still settling
console.log(`Total: ${balances.gateway.formattedTotal} USDC`);
```

### Avoiding Long Wait Times with BridgeKit

If you have USDC on a slow-finality chain (e.g., Base Sepolia) and want to avoid the ~13-19 min deposit wait, you can use [Circle BridgeKit](https://developers.circle.com/bridge-kit/quickstarts/bridge-usdc-between-evm-chains) to bridge your USDC to a fast-finality chain first, then deposit there.

```typescript
// Example: Bridge USDC from Base Sepolia to Arc Testnet using BridgeKit,
// then deposit on Arc Testnet for near-instant availability.
//
// See BridgeKit docs for full setup:
// https://developers.circle.com/bridge-kit/quickstarts/bridge-usdc-between-evm-chains
import { BridgeKit } from '@circle-fin/bridge-kit';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';

const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({ privateKey });

// Step 1: Bridge USDC from slow chain to fast chain
const { steps } = await kit.bridge({
  from: { adapter, chain: 'Base_Sepolia' },
  to: { adapter, chain: 'Arc_Testnet' },
  amount: '10',
});

// Step 2: Deposit on Arc Testnet (fast finality — ~0.5 sec)
const client = new GatewayClient({ chain: 'arcTestnet', privateKey });
await client.deposit('10');
```

> **Note:** BridgeKit is a separate Circle SDK. Refer to the [BridgeKit Quickstart](https://developers.circle.com/bridge-kit/quickstarts/bridge-usdc-between-evm-chains) for installation and setup.

## 6. Advanced Integration (Manual Flow)

If you already have an x402 client (like `@x402/core`) or need to integrate payment signing into a custom workflow, you can use the `BatchEvmScheme` directly.

This allows you to construct the payment payload manually without triggering the full `fetch` loop.

```typescript
import { BatchEvmScheme } from '@circlefin/x402-batching/client';

// 1. Initialize the scheme
const batchScheme = new BatchEvmScheme({
  address: account.address,
  // Your signing provider (e.g., wallet client, browser provider)
  signTypedData: async (params) => walletClient.signTypedData(params),
});

// 2. Get requirements from a 402 response (manually)
// x402 v2: payment info is in the PAYMENT-REQUIRED header, not the body
const response = await fetch(url);
const paymentRequiredHeader = response.headers.get('PAYMENT-REQUIRED');
const { x402Version, accepts } = JSON.parse(
  Buffer.from(paymentRequiredHeader!, 'base64').toString('utf-8'),
);
const gatewayOption = accepts.find((opt: any) => opt.extra?.name === 'GatewayWalletBatched');

// 3. Create the payment payload
const paymentPayload = await batchScheme.createPaymentPayload(x402Version, gatewayOption);

// 4. Use the payload in your custom request
const finalResponse = await fetch(url, {
  headers: {
    'Payment-Signature': Buffer.from(
      JSON.stringify({
        ...paymentPayload,
        accepted: gatewayOption,
      }),
    ).toString('base64'),
  },
});
```
