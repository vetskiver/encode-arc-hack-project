# Concepts: Understanding Gasless Payments

This SDK enables you to add micropayments to your API without forcing buyers to pay gas fees for every request.

## The Challenge: Micropayments on Blockchain

Blockchains allow for the transfer of value at scales rarely seen in the fiat world. USDC, for example, supports transactions as small as $0.000001 (6 decimals).

However, settling these tiny amounts directly on-chain creates an economic problem: **Gas Fees**.

1.  **Disproportionate Cost**: If a transaction is $0.01 but gas costs $0.005 (or even $0.001), the fees are a massive percentage of the value transferred.
2.  **Friction**: For high-frequency use cases (like AI agents paying per query or gamers buying items), signing and broadcasting a transaction for every interaction is slow and inefficient.

**Result:** Micropayments become impractical on-chain, even if the token supports them.

## The Solution: x402 + Circle Gateway

We solve this by moving the high-frequency activity off-chain while keeping settlement on-chain.

1.  **Buyer Requests**: A user or AI agent requests a paid resource.
2.  **Instant Signing**: The buyer signs a message authorizing payment. This is instant and free (zero gas).
3.  **Immediate Access**: The API verifies the signature locally and serves the content immediately.
4.  **Batched Settlement**: Circle Gateway collects these signatures and settles them in bulk on-chain later.

## How it Works

The flow uses standard HTTP error codes (`402 Payment Required`) to negotiate payment.

```text
       BUYER (User/Agent)                    SELLER (API)
            |                                     |
            |   1. GET /premium-resource          |
            |------------------------------------>|
            |                                     |
            |   2. 402 Payment Required           |
            |   (Price: 0.01 USDC)                |
            |<------------------------------------|
            |                                     |
    [Signs Message]                               |
            |                                     |
            |   3. GET /premium-resource          |
            |   Header: Payment-Signature         |
            |------------------------------------>|
            |                                     |
            |        [Verifies Signature]         |
            |                                     |
            |   4. 200 OK (Content)               |
            |<------------------------------------|
            |                                     |
                                                  |    (Later)
                                                  |-------+
                                                  |       |
                                                  v       |
                                            [Circle Gateway]
                                            (Settles Funds)
```

## Key Terms

| Term               | Definition                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Gateway Wallet** | A smart contract where Buyers deposit USDC. This balance is used to pay for things gaslessly. |
| **Burn Intent**    | The "check" the buyer signs. It authorizes Gateway to burn their deposited USDC.              |
| **Batching**       | The process of grouping many Burn Intents together to settle them efficiently.                |

## Lifecycle of a Payment

1.  **Deposit**: The Buyer moves USDC from their personal wallet into the Gateway Wallet. This is a one-time on-chain transaction.
2.  **Spend**: The Buyer spends this balance by signing messages. These are off-chain and free.
3.  **Settle**: Gateway aggregates these signatures and performs an on-chain transfer directly into the Seller's Gateway Balance.
4.  **Withdraw (Liquidity)**: The Seller receives the funds in their Gateway Balance. They can now instantly withdraw this balance to their regular wallet on any Gateway-supported chain, enabling instant cross-chain liquidity.

## Protocol Details: The 402 Flow

The x402 v2 protocol uses HTTP headers (not response bodies) for payment negotiation.

### Step 1: Server Returns 402

When a request lacks payment, the server returns:

- **Status:** `402 Payment Required`
- **Header:** `PAYMENT-REQUIRED` (base64-encoded JSON)
- **Body:** Empty `{}`

The decoded `PAYMENT-REQUIRED` header contains:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "/premium-data",
    "description": "Paid resource",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:5042002",
      "asset": "0x3600000000000000000000000000000000000000",
      "amount": "10000",
      "payTo": "0xSELLER_ADDRESS",
      "maxTimeoutSeconds": 345600,
      "extra": {
        "name": "GatewayWalletBatched",
        "version": "1",
        "verifyingContract": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
      }
    }
  ]
}
```

### Step 2: Client Signs and Retries

The client signs the payment off-chain and retries with:

- **Header:** `Payment-Signature` (base64-encoded JSON)

The decoded `Payment-Signature` header contains the signed payload plus the accepted requirements.

### Step 3: Server Settles and Responds

On successful settlement, the server returns:

- **Status:** `200 OK`
- **Header:** `PAYMENT-RESPONSE` (base64-encoded JSON)
- **Body:** The requested resource

The decoded `PAYMENT-RESPONSE` header contains:

```json
{
  "success": true,
  "transaction": "0xTRANSACTION_HASH",
  "network": "eip155:5042002",
  "payer": "0xBUYER_ADDRESS"
}
```

> **Note:** The `transaction` field is a settlement reference returned by Circle Gateway. For batched payments, this may be a settlement identifier rather than an immediate on-chain transaction hash, since settlements are aggregated and processed in batches.

> **Important:** Payment data is exchanged via headers, not the response body. This allows the body to carry the actual resource content.
