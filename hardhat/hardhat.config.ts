import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");
const hardhatRoot = path.resolve(__dirname);

dotenv.config({ path: path.resolve(projectRoot, ".env") });

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  paths: {
    root: projectRoot,
    sources: path.resolve(projectRoot, "contracts"),
    scripts: path.resolve(hardhatRoot, "scripts"),
    artifacts: path.resolve(hardhatRoot, "artifacts"),
    cache: path.resolve(hardhatRoot, "cache"),
  },
  networks: {
    arc: {
      url: process.env.ARC_RPC_URL || "",
      chainId: Number(process.env.ARC_CHAIN_ID) || 1,
      accounts: process.env.BACKEND_SIGNER_PRIVATE_KEY
        ? [process.env.BACKEND_SIGNER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
