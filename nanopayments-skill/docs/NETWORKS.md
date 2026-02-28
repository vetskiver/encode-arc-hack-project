# Supported Networks

Circle Gateway connects multiple blockchains, allowing you to move USDC between them and pay for resources gaslessly.

## 1. Gateway Networks (Gasless Payments, Deposits & Withdrawals)

All Gateway-supported EVM chains support **gasless batched payments** using this SDK. You can deposit USDC on any of these chains and make gas-free payments on the **same chain**.

> **Important:** Deposits and payments must be on the same chain. If you deposit on Arc Testnet, you pay on Arc Testnet. To avoid deposit wait times on slow-finality chains, consider using [Circle BridgeKit](https://developers.circle.com/bridge-kit/quickstarts/bridge-usdc-between-evm-chains) to bridge USDC to a faster chain first.

### Testnets

| Network | Chain ID | SupportedChainName | USDC Address | Deposit Time |
|---|---|---|---|---|
| **Arbitrum Sepolia** | `421614` | `arbitrumSepolia` | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | ~13-19 min |
| **Arc Testnet** | `5042002` | `arcTestnet` | `0x3600000000000000000000000000000000000000` | ~0.5 sec |
| **Avalanche Fuji** | `43113` | `avalancheFuji` | `0x5425890298aed601595a70AB815c96711a31Bc65` | ~8 sec |
| **Base Sepolia** | `84532` | `baseSepolia` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | ~13-19 min |
| **Ethereum Sepolia** | `11155111` | `sepolia` | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | ~13-19 min |
| **HyperEVM Testnet** | `998` | `hyperEvmTestnet` | `0x2B3370eE501B4a559b57D449569354196457D8Ab` | ~5 sec |
| **Optimism Sepolia** | `11155420` | `optimismSepolia` | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` | ~13-19 min |
| **Polygon Amoy** | `80002` | `polygonAmoy` | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` | ~8 sec |
| **Sei Atlantic** | `1328` | `seiAtlantic` | `0x4fCF1784B31630811181f670Aea7A7bEF803eaED` | ~5 sec |
| **Sonic Testnet** | `14601` | `sonicTestnet` | `0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51` | ~8 sec |
| **Unichain Sepolia** | `1301` | `unichainSepolia` | `0x31d0220469e10c4E71834a79b1f276d740d3768F` | ~13-19 min |
| **World Chain Sepolia** | `4801` | `worldChainSepolia` | `0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88` | ~13-19 min |

> **Deposit Time** is how long the Gateway API waits for block confirmations before your balance is available. For chains with long finality (~13-19 min), consider depositing on a fast chain like Arc Testnet (~0.5 sec) or Avalanche Fuji (~8 sec) instead. See [Gateway Supported Blockchains](https://developers.circle.com/gateway/references/supported-blockchains) for details.

---

## Contract Addresses (Testnet)

| Contract | Address |
|---|---|
| **GatewayWallet** | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| **GatewayMinter** | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

---

## Faucets

- [**Circle Faucet**](https://faucet.circle.com) - Get testnet USDC for most supported networks.
