# **Circle x402 Batching SDK: Early Access Guide**

Last updated: January 2026

## **Overview**

Circle's x402 Batching SDK enables gasless, batched settlement for payments via Circle Gateway. It allows you to add micropayments to your API without forcing buyers to pay gas fees for every request.

The SDK is powered by:

- **Circle Gateway** for batched on-chain settlement
- **x402 Protocol** for standard HTTP payment negotiation

This guide explains how to use the SDK and run the included examples.

## **Prerequisites**

- Node.js v20 or later
- npm v8+
- An EVM private key (for testing the buyer flow)
- **Cloudsmith Entitlement Token** (Provided by the Circle team)

## **Installation & Setup**

1. **Unzip the package**

   Extract the zip file to a directory of your choice.

2. **Configure Authentication**

   Set your Cloudsmith entitlement token as an environment variable. This allows npm to authenticate and download the private beta package.

   ```bash
   export CLOUDSMITH_TOKEN=your_token_here
   ```

   > **Private Beta:** This token is provided by the Circle team. If you haven't received one, please contact the team.
   >
   > 💡 **Tip:** Add `CLOUDSMITH_TOKEN=your_token_here` to a `.env` file in your project and load it before running npm commands.

3. **Configure npm Registry**

   Create a `.npmrc` file in your project root to point npm at the private registry:

   ```ini
   @circlefin:registry=https://npm.cloudsmith.io/circle/common-private/
   //npm.cloudsmith.io/circle/common-private/:_authToken=${CLOUDSMITH_TOKEN}
   ```

   This tells npm to fetch `@circlefin/*` packages from the Cloudsmith registry using your token.

4. **Install the SDK**

   You can now install the SDK in your own project:

   ```bash
   npm install @circlefin/x402-batching @x402/core viem
   ```

---

## **AI-Assisted Development (Optional)**

This package includes an AI agent skill (`nanopayments-skill.zip`) that works with **Cursor** and **Claude Code**. The skill teaches your AI coding assistant how to build buyers, sellers, and facilitators using the SDK docs.

To install:

```bash
unzip nanopayments-skill.zip
mkdir -p ~/.agents/skills
cp -r nanopayments-skill ~/.agents/skills/

# Symlink into the tools you use:
mkdir -p ~/.cursor/skills && ln -s ~/.agents/skills/nanopayments-skill ~/.cursor/skills/nanopayments-skill
mkdir -p ~/.claude/skills && ln -s ~/.agents/skills/nanopayments-skill ~/.claude/skills/nanopayments-skill
```

Restart Cursor or start a new Claude Code session, then ask your agent something like "Build an x402 seller with Express."

This is entirely optional — you can use the docs and examples directly without the skill.

---

## **Explore the Concepts**

Before diving into the code, we highly recommend reading the **Concepts Guide** included in this package:

📄 **[docs/CONCEPTS.md](./docs/CONCEPTS.md)**

It explains the core architecture:

1. **Deposit**: Moving funds to Gateway
2. **Spend**: Signing off-chain intents (gasless)
3. **Settle**: Batched on-chain settlement
4. **Withdraw**: Instant cross-chain liquidity

---

## **Quick Start Examples**

This package includes two pre-built examples in the `examples/` folder:

1. **Basic Paywall**: A simple Express server and client script.
2. **Digital Dungeon**: An interactive CLI game powered by micropayments.

### Example 1: Basic Paywall

Located in: `examples/basic-paywall/`

#### Setup

1. Navigate to the example directory and install dependencies:

   ```shell
   cd examples/basic-paywall
   npm install
   ```

2. **Configure your Wallet**:

   You need an EVM private key (starting with `0x`).

   Export it as an environment variable:

   ```shell
   export PRIVATE_KEY=your_private_key_here
   ```

   _(Windows users: use `set PRIVATE_KEY=...` or create a `.env` file)_

   > **Note (Generating a fresh key):** If you want to generate a new **EVM private key** (32-byte `0x`-prefixed hex, compatible with standard EVM wallets), run:
   >
   > ```shell
   > npm run -s gen:private-key
   > ```
   >
   > You can also export it in one step:
   >
   > ```shell
   > export PRIVATE_KEY="$(npm run -s gen:private-key)"
   > ```

3. **Fund your Wallet**:
   - Get USDC from [Circle Faucet](https://faucet.circle.com/) (Select "Arc Testnet")

   > 💡 **Need more funds?**
   > The public faucet has daily limits. For higher limits, sign up for a [Circle Developer Console](https://console.circle.com) account and use the API:
   >
   > ```bash
   > curl --request POST \
   >      --url https://api.circle.com/v1/faucet/drips \
   >      --header 'Accept: application/json' \
   >      --header 'Authorization: Bearer YOUR_TEST_API_KEY' \
   >      --header 'Content-Type: application/json' \
   >      --data '{"address": "0x...", "blockchain": "ARC", "usdc": true}'
   > ```
   >
   > See [Faucet Documentation](https://developers.circle.com/w3s/developer-console-faucet#fund-a-wallet-programmatically) for details.

#### Running The Code

You will need two terminal windows.

1. **Terminal 1: Start the Seller (Server)**

   ```shell
   npm run server
   ```

   _The server will start on [http://localhost:3002](http://localhost:3002)_

2. **Terminal 2: Run the Buyer (Client)**

   First, deposit funds into the Gateway (one-time setup):

   ```shell
   npm run deposit
   ```

   Then, run the client to purchase content gaslessly:

   ```shell
   npm run client
   ```

#### Validating The Example

1. In the **Client Terminal**, you will see:
   - "Paying for /paid endpoint..."
   - "✅ Paid 0.01 USDC!"
   - A transaction hash for the burn intent.

2. In the **Server Terminal**, you will see the request being processed and the signature verified.

---

### Example 2: Digital Dungeon

Located in: `examples/digital-dungeon/`

This example demonstrates a fun interactive use case where every move in a text-adventure game requires a micropayment.

#### Setup

1. Navigate to the dungeon directory:

   ```shell
   cd ../digital-dungeon
   npm install
   ```

2. Ensure your `PRIVATE_KEY` is still set (or set it again if in a new terminal):

   ```shell
   export PRIVATE_KEY=your_private_key_here
   ```

#### Running The Game

1. **Terminal 1: Start the Game Server**

   ```shell
   npm run server
   ```

2. **Terminal 2: Start the Player Client**

   ```shell
   npm run client
   ```

3. Follow the on-screen prompts to play. Each choice you make signs a micropayment instantly!

---

## **Documentation & Resources**

The package includes comprehensive documentation in the `docs/` folder. We recommend reading them in this order:

1. **[Concepts](./docs/CONCEPTS.md)** (`docs/CONCEPTS.md`) - Understand the "why" and "how"
2. **[Seller Guide](./docs/SELLER_GUIDE.md)** (`docs/SELLER_GUIDE.md`) - How to monetize your API
3. **[Buyer Guide](./docs/BUYER_GUIDE.md)** (`docs/BUYER_GUIDE.md`) - How to pay for resources
4. **[SDK Reference](./docs/SDK_REFERENCE.md)** (`docs/SDK_REFERENCE.md`) - Full API details
