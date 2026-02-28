# SDK Reference

This document covers all primitives exported by `@circlefin/x402-batching`.

---

## Table of Contents

- [High-Level APIs](#high-level-apis)
  - [GatewayClient (Buyer)](#gatewayclient)
  - [createGatewayMiddleware (Seller)](#creategatewaymiddleware)
- [Protocol Integration](#protocol-integration)
  - [BatchEvmScheme](#batchevmscheme)
  - [BatchFacilitatorClient](#batchfacilitatorclient)
  - [registerBatchScheme](#registerbatchscheme)
- [Utilities](#utilities)
  - [supportsBatching](#supportsbatching)
  - [isBatchPayment](#isbatchpayment)
  - [getVerifyingContract](#getverifyingcontract)
- [Configuration](#configuration)
  - [Chain Configuration](#chain-configuration)
  - [Supported Chain Names](#supported-chain-names)
  - [Constants](#constants)
- [Error Reference](#error-reference)

---

## High-Level APIs

### `GatewayClient`

**Import:** `import { GatewayClient } from '@circlefin/x402-batching/client'`

Primary client for buyers to interact with Circle Gateway. Handles deposits, payments, and withdrawals.

#### Constructor

```typescript
new GatewayClient(config: GatewayClientConfig)
```

| Parameter           | Type                 | Required | Description                                                 |
| ------------------- | -------------------- | -------- | ----------------------------------------------------------- |
| `config.chain`      | `SupportedChainName` | ✓        | Chain to connect to (e.g., `'baseSepolia'`, `'arcTestnet'`) |
| `config.privateKey` | `Hex`                | ✓        | Private key for signing (`'0x...'`)                         |
| `config.rpcUrl`     | `string`             |          | Optional custom RPC URL                                     |

#### Properties

| Property       | Type           | Description                  |
| -------------- | -------------- | ---------------------------- |
| `address`      | `Address`      | The account's wallet address |
| `chainName`    | `string`       | Human-readable chain name    |
| `domain`       | `number`       | Gateway domain identifier    |
| `publicClient` | `PublicClient` | Viem public client           |
| `walletClient` | `WalletClient` | Viem wallet client           |

#### Methods

##### `deposit(amount, options?): Promise<DepositResult>`

Deposits USDC from your wallet into the Gateway contract.

| Parameter               | Type     | Required | Description                              |
| ----------------------- | -------- | -------- | ---------------------------------------- |
| `amount`                | `string` | ✓        | Amount in decimal (e.g., `"10.5"`)       |
| `options.approveAmount` | `string` |          | Amount to approve (defaults to `amount`) |

##### `pay<T>(url, options?): Promise<PayResult<T>>`

Pays for an x402-protected resource. Handles the 402 flow automatically.

| Parameter | Type          | Required | Description                                    |
| --------- | ------------- | -------- | ---------------------------------------------- |
| `url`     | `string`      | ✓        | URL to pay for                                 |
| `options` | `RequestInit` |          | Standard fetch options (method, body, headers) |

##### `withdraw(amount, options?): Promise<WithdrawResult>`

Withdraws USDC from Gateway to your wallet. Supports same-chain or cross-chain withdrawals.

| Parameter           | Type                 | Required | Description                               |
| ------------------- | -------------------- | -------- | ----------------------------------------- |
| `amount`            | `string`             | ✓        | Amount in decimal                         |
| `options.chain`     | `SupportedChainName` |          | Destination chain (default: same chain)   |
| `options.recipient` | `Address`            |          | Recipient address (default: your address) |

##### `getBalances(address?): Promise<Balances>`

Returns both wallet USDC balance and Gateway balances.

##### `supports(url): Promise<SupportsResult>`

Checks if a URL supports Gateway batching before paying.

#### Return Types

```typescript
interface DepositResult {
  approvalTxHash?: Hex;
  depositTxHash: Hex;
  amount: bigint;
  formattedAmount: string;
}

interface PayResult<T> {
  data: T;
  amount: bigint;
  formattedAmount: string;
  transaction: string;
  status: number;
}

interface WithdrawResult {
  mintTxHash: Hex;
  amount: bigint;
  formattedAmount: string;
  sourceChain: string;
  destinationChain: string;
  recipient: Address;
}

interface Balances {
  wallet: { balance: bigint; formatted: string };
  gateway: GatewayBalance;
}

interface GatewayBalance {
  total: bigint;
  available: bigint; // Balance usable for payments/withdrawals
  withdrawing: bigint; // Locked in trustless withdrawal
  withdrawable: bigint; // Ready to finalize trustless withdrawal
  formattedTotal: string;
  formattedAvailable: string;
}

interface SupportsResult {
  supported: boolean;
  requirements?: Record<string, unknown>;
  error?: string;
}
```

---

### `createGatewayMiddleware`

**Import:** `import { createGatewayMiddleware } from '@circlefin/x402-batching/server'`

Creates Express-compatible middleware for accepting Gateway payments.

```typescript
createGatewayMiddleware(config: GatewayMiddlewareConfig): GatewayMiddleware
```

#### Configuration

| Parameter        | Type                 | Required | Description                                                                                        |
| ---------------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `sellerAddress`  | `string`             | ✓        | Your wallet address to receive payments                                                            |
| `networks`       | `string \| string[]` |          | Networks to accept (default: all)                                                                  |
| `facilitatorUrl` | `string`             |          | Custom facilitator URL for verify/settle. When set, the middleware routes through this facilitator instead of Circle Gateway directly |
| `description`    | `string`             |          | Resource description for 402 responses                                                             |

#### Methods

##### `require(price): MiddlewareFunction`

Returns Express middleware that requires payment.

| Parameter | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| `price`   | `string` | Price in USD (e.g., `'$0.01'` or `'0.01'`) |

The middleware attaches payment info to `req.payment`:

```typescript
interface PaymentInfo {
  verified: boolean;
  payer: string;
  amount: string;
  network: string;
  transaction?: string;
}
```

---

## Protocol Integration

Low-level classes for integrating with the x402 protocol libraries (`@x402/core`).

### `BatchEvmScheme`

**Import:** `import { BatchEvmScheme } from '@circlefin/x402-batching/client'`

A `SchemeNetworkClient` implementation for Circle Gateway batched payments.

#### Constructor

```typescript
new BatchEvmScheme(signer: BatchEvmSigner)
```

| Parameter | Type             | Description                                   |
| --------- | ---------------- | --------------------------------------------- |
| `signer`  | `BatchEvmSigner` | EVM signer with `address` and `signTypedData` |

#### Methods

##### `createPaymentPayload(x402Version, paymentRequirements): Promise<PaymentPayload>`

Creates a payment payload by signing EIP-3009 `TransferWithAuthorization`.

---

### `BatchFacilitatorClient`

**Import:** `import { BatchFacilitatorClient } from '@circlefin/x402-batching/server'`

A `FacilitatorClient` implementation that communicates with Circle Gateway's x402 endpoints.

#### Constructor

```typescript
new BatchFacilitatorClient(config?: BatchFacilitatorConfig)
```

#### Methods

##### `verify(payload, requirements): Promise<VerifyResponse>`

Verifies a payment signature.

##### `settle(payload, requirements): Promise<SettleResponse>`

Settles a payment.

##### `getSupported(): Promise<SupportedResponse>`

Fetches supported payment kinds (networks and contract addresses).

#### Return Types

```typescript
interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

interface SettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction: string;
}

interface SupportedResponse {
  kinds: Array<{
    x402Version: number;
    scheme: string;
    network: string;
    extra?: { verifyingContract?: string };
  }>;
}
```

---

### `CompositeEvmScheme`

**Import:** `import { CompositeEvmScheme } from '@circlefin/x402-batching/client'`

Routes payment requests between batch (Gateway) and standard (onchain) EVM schemes. Use this when your application needs to support both Gateway batched payments and standard onchain payments simultaneously.

#### Constructor

```typescript
new CompositeEvmScheme(batchScheme: BatchEvmScheme, fallbackScheme: SchemeNetworkClient)
```

| Parameter | Type | Description |
|---|---|---|
| `batchScheme` | `BatchEvmScheme` | Handles Gateway batched payments |
| `fallbackScheme` | `SchemeNetworkClient` | Handles standard onchain payments (must use `'exact'` scheme) |

#### Behavior

- If the payment requirements include `extra.name === "GatewayWalletBatched"`, delegates to `batchScheme`
- Otherwise, delegates to `fallbackScheme`
- Prevents registration conflicts when both schemes handle the same `'exact'` scheme

#### Usage

```typescript
import { CompositeEvmScheme, BatchEvmScheme } from '@circlefin/x402-batching/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';

const composite = new CompositeEvmScheme(
  new BatchEvmScheme(signer),
  new ExactEvmScheme(signer),
);

// Register once — handles both batch and standard payments
x402Client.register('eip155:*', composite);
```

---

### `GatewayEvmScheme`

**Import:** `import { GatewayEvmScheme } from '@circlefin/x402-batching/server'`

Server-side EVM scheme that extends `ExactEvmScheme` with Gateway-specific behavior. Required when using `x402ResourceServer` with `BatchFacilitatorClient`.

#### Constructor

```typescript
new GatewayEvmScheme()
```

No parameters required. On construction, it automatically registers USDC money parsers for all Gateway-supported networks.

#### Key Behaviors

1. **`enhancePaymentRequirements()`** — Merges `extra` metadata (verifyingContract, name, version) from supported kinds into payment requirements. Sets `maxTimeoutSeconds` to 345600 (4 days) for async batched settlement.

2. **USDC Money Parsers** — Automatically converts dollar amounts to USDC atomic units (6 decimals) for all supported networks using the USDC addresses from `CHAIN_CONFIGS`.

#### Usage

```typescript
import { x402ResourceServer } from '@x402/express';
import { BatchFacilitatorClient, GatewayEvmScheme } from '@circlefin/x402-batching/server';

const server = new x402ResourceServer([new BatchFacilitatorClient()]);
server.register('eip155:*', new GatewayEvmScheme());
await server.initialize();
```

---

### `registerBatchScheme`

**Import:** `import { registerBatchScheme } from '@circlefin/x402-batching/client'`

Helper to register `BatchEvmScheme` with an `x402Client`.

```typescript
registerBatchScheme(client, { signer: account });
```

---

## Utilities

### `supportsBatching`

**Import:** `import { supportsBatching } from '@circlefin/x402-batching'`

Checks if a `PaymentRequirements` object supports batched settlement.

### `isBatchPayment`

**Import:** `import { isBatchPayment } from '@circlefin/x402-batching/server'`

Server-side alias for `supportsBatching`.

### `getVerifyingContract`

**Import:** `import { getVerifyingContract } from '@circlefin/x402-batching'`

Extracts the GatewayWallet address from requirements.

---

## Configuration

### Chain Configuration

**Import:** `import { CHAIN_CONFIGS, GATEWAY_DOMAINS } from '@circlefin/x402-batching/client'`

- **`CHAIN_CONFIGS`**: Full configuration (USDC address, Gateway address, etc.) for all supported chains.
- **`GATEWAY_DOMAINS`**: Domain IDs for EIP-712 signing.

### Supported Chain Names

The `SupportedChainName` type defines all valid chain identifiers for `GatewayClient`:

**Testnets:**

| Name | Chain ID | Network (CAIP-2) |
|---|---|---|
| `arbitrumSepolia` | 421614 | `eip155:421614` |
| `arcTestnet` | 5042002 | `eip155:5042002` |
| `avalancheFuji` | 43113 | `eip155:43113` |
| `baseSepolia` | 84532 | `eip155:84532` |
| `sepolia` | 11155111 | `eip155:11155111` |
| `hyperEvmTestnet` | 998 | `eip155:998` |
| `optimismSepolia` | 11155420 | `eip155:11155420` |
| `polygonAmoy` | 80002 | `eip155:80002` |
| `seiAtlantic` | 1328 | `eip155:1328` |
| `sonicTestnet` | 14601 | `eip155:14601` |
| `unichainSepolia` | 1301 | `eip155:1301` |
| `worldChainSepolia` | 4801 | `eip155:4801` |

### Constants

**Import:** `import { CIRCLE_BATCHING_NAME, ... } from '@circlefin/x402-batching'`

- `CIRCLE_BATCHING_NAME`: `'GatewayWalletBatched'`
- `CIRCLE_BATCHING_VERSION`: `'1'`
- `CIRCLE_BATCHING_SCHEME`: `'exact'`

---

## Error Reference

### How Errors Flow

The Gateway API returns typed error codes (snake_case strings). These flow through the SDK as follows:

1. **Gateway API** returns `{ isValid: false, invalidReason: "error_code" }` (verify) or `{ success: false, errorReason: "error_code" }` (settle)
2. **BatchFacilitatorClient** passes these through unchanged
3. **Middleware** surfaces them as `{ error: "Payment verification failed", reason: "error_code" }` or `{ error: "Payment settlement failed", reason: "error_code" }`
4. **GatewayClient.pay()** throws `Error("Payment failed: ...")` with the server's error message

### Gateway API Error Codes

These are the `errorReason` (settle) and `invalidReason` (verify) values returned by the Gateway API:

| Error Code | Cause | Recovery |
|---|---|---|
| `unsupported_scheme` | Scheme is not `exact` | Only `exact` scheme is supported |
| `unsupported_network` | Network not supported for batching | Use a supported network from the networks table |
| `unsupported_asset` | Token address not recognized on this chain | Use the correct USDC address for the network |
| `invalid_payload` | Malformed payment payload | Check EIP-712 signature fields |
| `address_mismatch` | Authorization `to` address ≠ `payTo` in requirements | Ensure the payment is addressed to the correct seller |
| `amount_mismatch` | Authorization `value` ≠ required `amount` | Ensure signed amount matches the price |
| `invalid_signature` | EIP-3009 signature verification failed | Re-sign the payment; check the signing key matches `from` |
| `authorization_not_yet_valid` | Authorization `validAfter` is in the future | Wait until the authorization becomes valid |
| `authorization_expired` | Authorization `validBefore` has passed | Create a new payment with a future expiry |
| `authorization_validity_too_short` | Authorization validity window is too short for batching | Use `maxTimeoutSeconds: 345600` (4 days) |
| `self_transfer` | `from` and `to` are the same address | Buyer and seller must be different addresses |
| `insufficient_balance` | Buyer's Gateway balance is too low | Deposit more USDC before paying |
| `nonce_already_used` | Payment nonce was already submitted | Create a new payment (each payment needs a unique nonce) |
| `unsupported_domain` | Gateway domain not configured for this chain | Check network configuration |
| `wallet_not_found` | Gateway wallet contract not found on this chain | Verify contract addresses for the network |
| `unexpected_error` | Infrastructure error (HTTP 500) | Retry; contact support if persistent |

### GatewayClient Errors

All errors are thrown as standard `Error` objects with descriptive messages.

**Constructor & Configuration:**

| Error Message | Cause | Recovery |
|---|---|---|
| `Unsupported chain: {chain}` | Invalid `SupportedChainName` passed to constructor | Use a valid chain name from the table above |

**`pay()` and `supports()`:**

| Error Message | Cause | Recovery |
|---|---|---|
| `Request failed with status {N}` | Non-402, non-2xx response from server | Check server status and URL |
| `Missing PAYMENT-REQUIRED header in 402 response` | Server returned 402 without the required header | Verify server uses x402 v2 protocol |
| `No payment options in 402 response` | Empty `accepts` array in 402 response | Server may not have configured payment options |
| `No Gateway batching option available` | Server doesn't support Gateway batching | Use `supports()` to check first; server may only accept onchain payments |
| `Payment failed: {reason}` | Server rejected the payment; `reason` contains a Gateway API error code (see table above) | Check the error code and follow its recovery steps |

**`deposit()` and `depositFor()`:**

| Error Message | Cause | Recovery |
|---|---|---|
| `Insufficient USDC balance` | Wallet USDC balance < deposit amount | Get more USDC from faucet or transfer |
| `Approval transaction failed: {txHash}` | USDC approval tx reverted onchain | Check gas, wallet balance, and network status |
| `Deposit transaction failed: {txHash}` | Deposit tx reverted onchain | Check gas and contract state |

**`withdraw()` and `transfer()`:**

| Error Message | Cause | Recovery |
|---|---|---|
| `Insufficient available balance` | Gateway balance too low for withdrawal | Deposit more or reduce amount |
| `Unsupported destination chain: {chain}` | Invalid chain name for cross-chain withdrawal | Use a valid `SupportedChainName` |
| `Gateway API error: {reason}` | Gateway API returned an error | Check balances and network status |
| `Mint transaction failed: {txHash}` | Withdrawal mint tx reverted onchain | Retry; check network status |

**`getBalances()`:**

| Error Message | Cause | Recovery |
|---|---|---|
| `Gateway API balance fetch failed: {reason}` | Gateway balance API returned an error | Check API connectivity |

### Middleware Errors

| Error Message | Cause | Recovery |
|---|---|---|
| `Invalid price: {price}` | Price string could not be parsed | Use format `'$0.01'` or `'0.01'` |
| `No payment networks available` | No supported networks found (503 response) | Check Gateway API connectivity |
| `Payment verification failed` | Verify returned `isValid: false`; `reason` field contains the Gateway API error code | Check the error code in the response body |
| `Payment settlement failed` | Settle returned `success: false`; `reason` field contains the Gateway API error code | Check the error code in the response body |

### BatchFacilitatorClient Errors

| Error Message | Cause | Recovery |
|---|---|---|
| `Circle Gateway verify failed ({status}): {details}` | Gateway API verify endpoint returned non-JSON or missing `isValid` | Check payload format and API status |
| `Circle Gateway settle failed ({status}): {details}` | Gateway API settle endpoint returned non-JSON or missing `success` | Retry; contact support if persistent |
| `Circle Gateway settle returned empty response ({status})` | Empty body from settle endpoint | Retry; may indicate server issue |
| `Circle Gateway getSupported failed ({status}): {details}` | Cannot fetch supported networks | Check API connectivity and URL |

### BatchEvmScheme Errors

| Error Message | Cause | Recovery |
|---|---|---|
| `BatchEvmScheme: unsupported network format "{network}"` | Network string is not `eip155:<chainId>` format | Use CAIP-2 format, e.g., `eip155:5042002` |
| `BatchEvmScheme can only handle Circle batching options` | Payment requirements missing `extra.name="GatewayWalletBatched"` | Use this scheme only for Gateway payments |
| `Circle batching option missing extra.verifyingContract` | Payment requirements missing GatewayWallet address | Ensure server includes `verifyingContract` in the `extra` field |
