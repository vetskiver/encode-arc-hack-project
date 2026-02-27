import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying GuardianVault with agent address:", deployer.address);

  const GuardianVault = await ethers.getContractFactory("GuardianVault");
  const vault = await GuardianVault.deploy(deployer.address);
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("GuardianVault deployed to:", address);
  console.log("Set ARC_CONTRACT_ADDRESS=" + address + " in your .env");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
