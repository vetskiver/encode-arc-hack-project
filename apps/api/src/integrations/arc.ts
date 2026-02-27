import { ethers } from "ethers";

const GUARDIAN_VAULT_ABI = [
  "function setPolicy(uint256,uint256,uint256,uint256,uint256,uint256)",
  "function setOracleSnapshot(uint256 price, uint256 ts)",
  "function registerCollateral(address user, uint256 amount)",
  "function recordBorrow(address user, uint256 amount, string circleTxRef)",
  "function recordRepay(address user, uint256 amount, string circleTxRef)",
  "function recordRebalance(string fromBucket, string toBucket, uint256 amount, string circleTxRef)",
  "function recordPayment(address user, address to, uint256 amount, string circleTxRef)",
  "function logDecision(string snapshot, string action, bytes32 rationaleHash)",
  "function resetUser(address user)",
  "function getUserState(address user) view returns (uint256, uint256, uint256, uint256)",
  "function getPolicy() view returns (uint256, uint256, uint256, uint256, uint256, uint256)",
  "function collateralAmount(address) view returns (uint256)",
  "function debtUSDC(address) view returns (uint256)",
  "function ltvBps() view returns (uint256)",
  "function minHealthBps() view returns (uint256)",
  "function emergencyHealthBps() view returns (uint256)",
  "function liquidityMinUSDC() view returns (uint256)",
  "function perTxMaxUSDC() view returns (uint256)",
  "function dailyMaxUSDC() view returns (uint256)",
  "function lastOraclePrice() view returns (uint256)",
  "function lastOracleTs() view returns (uint256)",
  "event PolicySet(uint256,uint256,uint256,uint256,uint256,uint256)",
  "event CollateralRegistered(address indexed user, uint256 amount, uint256 total)",
  "event BorrowRecorded(address indexed user, uint256 amount, string circleTxRef, uint256 newDebt)",
  "event RepayRecorded(address indexed user, uint256 amount, string circleTxRef, uint256 newDebt)",
  "event RebalanceRecorded(string fromBucket, string toBucket, uint256 amount, string circleTxRef)",
  "event PaymentRecorded(address indexed user, address indexed to, uint256 amount, string circleTxRef)",
  "event AgentDecisionLogged(string snapshot, string action, bytes32 rationaleHash)",
  "event UserReset(address indexed user)",
];

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let contract: ethers.Contract | null = null;

export function initArc(): void {
  const rpcUrl = process.env.ARC_RPC_URL;
  const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
  const contractAddress = process.env.ARC_CONTRACT_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) {
    console.warn("[Arc] Missing env vars, Arc integration will be simulated");
    return;
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);
  signer = new ethers.Wallet(privateKey, provider);
  contract = new ethers.Contract(contractAddress, GUARDIAN_VAULT_ABI, signer);
  console.log("[Arc] Initialized with contract:", contractAddress);
}

export function getContract(): ethers.Contract | null {
  return contract;
}

export function getSigner(): ethers.Wallet | null {
  return signer;
}

export interface ArcUserState {
  collateralAmount: bigint;  // 18-decimal (as stored on contract)
  debtUSDC: bigint;          // 6-decimal USDC
  dailySpent: bigint;
  dailyResetTs: bigint;
}

export interface ArcPolicy {
  ltvBps: number;
  minHealthBps: number;
  emergencyHealthBps: number;
  liquidityMinUSDC: bigint;  // 6-decimal USDC
  perTxMaxUSDC: bigint;      // 6-decimal USDC
  dailyMaxUSDC: bigint;      // 6-decimal USDC
}

// Simulated state for when Arc is not configured
const simState: ArcUserState = {
  collateralAmount: 0n,
  debtUSDC: 0n,
  dailySpent: 0n,
  dailyResetTs: 0n,
};

export async function getUserState(user: string): Promise<ArcUserState> {
  if (!contract) {
    return { ...simState };
  }
  try {
    const [coll, debt, spent, resetTs] = await contract.getUserState(user);
    return {
      collateralAmount: coll,  // 18-decimal from contract
      debtUSDC: debt,          // 6-decimal from contract
      dailySpent: spent,
      dailyResetTs: resetTs,
    };
  } catch (err: any) {
    console.error("[Arc] getUserState error:", err.message);
    return { ...simState };
  }
}

export async function getPolicy(): Promise<ArcPolicy> {
  if (!contract) {
    // defaults so agent runs without setPolicy being called
    return {
      ltvBps: 6000,
      minHealthBps: 14000,
      emergencyHealthBps: 12000,
      liquidityMinUSDC: BigInt(500 * 1e6),
      perTxMaxUSDC: BigInt(10_000 * 1e6),
      dailyMaxUSDC: BigInt(50_000 * 1e6),
    };
  }
  try {
    const [ltv, minH, emergH, liqMin, perTx, daily] = await contract.getPolicy();

    // If policy was never set/ all 0's , return defaults so agent doesn't deadlock
    if (Number(ltv) === 0) {
      console.warn("[Arc] Policy not set on contract, using defaults");
      return {
        ltvBps: 6000,
        minHealthBps: 14000,
        emergencyHealthBps: 12000,
        liquidityMinUSDC: BigInt(500 * 1e6),
        perTxMaxUSDC: BigInt(10_000 * 1e6),
        dailyMaxUSDC: BigInt(50_000 * 1e6),
      };
    }

    return {
      ltvBps: Number(ltv),
      minHealthBps: Number(minH),
      emergencyHealthBps: Number(emergH),
      liquidityMinUSDC: liqMin,
      perTxMaxUSDC: perTx,
      dailyMaxUSDC: daily,
    };
  } catch (err: any) {
    console.error("[Arc] getPolicy error:", err.message);
    return {
      ltvBps: 6000,
      minHealthBps: 14000,
      emergencyHealthBps: 12000,
      liquidityMinUSDC: BigInt(500 * 1e6),
      perTxMaxUSDC: BigInt(10_000 * 1e6),
      dailyMaxUSDC: BigInt(50_000 * 1e6),
    };
  }
}

export async function setOracleSnapshot(price: bigint, ts: number): Promise<string> {
  if (!contract) return "sim-oracle-snapshot";
  try {
    const tx = await contract.setOracleSnapshot(price, ts);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (err: any) {
    console.warn("[Arc] setOracleSnapshot failed:", err.message);
    return "sim-oracle-snapshot";
  }
}

export async function setPolicy(
  ltvBps: number,
  minHealthBps: number,
  emergencyHealthBps: number,
  liquidityMinUSDC: bigint,
  perTxMaxUSDC: bigint,
  dailyMaxUSDC: bigint
): Promise<string> {
  if (!contract) return "sim-setpolicy-" + Date.now();
  const tx = await contract.setPolicy(
    ltvBps, minHealthBps, emergencyHealthBps,
    liquidityMinUSDC, perTxMaxUSDC, dailyMaxUSDC
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function registerCollateral(user: string, amount: bigint): Promise<string> {
  if (!contract) {
    // Update sim state so getUserState reflects the registration
    simState.collateralAmount += amount;
    return "sim-register-" + Date.now();
  }
  const tx = await contract.registerCollateral(user, amount);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function recordBorrow(user: string, amount: bigint, circleTxRef: string): Promise<string> {
  if (!contract) {
    simState.debtUSDC += amount;
    return "sim-borrow-" + Date.now();
  }
  const tx = await contract.recordBorrow(user, amount, circleTxRef);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function recordRepay(user: string, amount: bigint, circleTxRef: string): Promise<string> {
  if (!contract) {
    simState.debtUSDC = simState.debtUSDC > amount ? simState.debtUSDC - amount : 0n;
    return "sim-repay-" + Date.now();
  }
  const tx = await contract.recordRepay(user, amount, circleTxRef);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function recordRebalance(
  fromBucket: string,
  toBucket: string,
  amount: bigint,
  circleTxRef: string
): Promise<string> {
  if (!contract) return "sim-rebalance-" + Date.now();
  const tx = await contract.recordRebalance(fromBucket, toBucket, amount, circleTxRef);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function recordPayment(
  user: string,
  to: string,
  amount: bigint,
  circleTxRef: string
): Promise<string> {
  if (!contract) return "sim-payment-" + Date.now();
  const tx = await contract.recordPayment(user, to, amount, circleTxRef);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function logDecision(
  snapshot: string,
  action: string,
  rationaleHashBytes: string
): Promise<string> {
  if (!contract) return "sim-log-" + Date.now();
  try {
    const tx = await contract.logDecision(snapshot, action, rationaleHashBytes);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (err: any) {
    console.warn("[Arc] logDecision failed:", err.message);
    return "sim-log-" + Date.now();
  }
}

export async function resetUser(user: string): Promise<string> {
  if (!contract) {
    simState.collateralAmount = 0n;
    simState.debtUSDC = 0n;
    return "sim-reset-" + Date.now();
  }
  const tx = await contract.resetUser(user);
  const receipt = await tx.wait();
  return receipt.hash;
}
