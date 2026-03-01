export interface Snapshot {
  oraclePrice: number;
  oracleTs: number;
  oracleStale?: boolean;
  oracleSource?: "stork" | "sim";
  changePct: number;
  collateralAmount: string;
  collateralValueUSDC: string;
  debtUSDC: string;
  maxBorrowUSDC: string;
  healthFactor: number;
  liquidityUSDC: string;
  reserveUSDC: string;
  yieldUSDC: string;
  pendingPayment: { to: string; amountUSDC: string } | null;
  liquidityRatio?: string;
  reserveRatio?: string;
  volatilityPct?: string;
  targetHealth?: number;
  liquidityTargetRatio?: number;
  reserveRatioTarget?: number;
  volatilityThreshold?: number;
  yieldRatePct?: number;
  yieldRateStale?: boolean;
  maxYieldAllocPct?: number;
  minTargetYieldPct?: number;
  companyPolicy?: {
    ltvBps: number;
    minHealthBps: number;
    emergencyHealthBps: number;
    riskProfile: string;
  };
  // RWA collateral info
  collateralAsset?: string;
  oracleSymbol?: string;
  // Daily spend tracking
  dailySpentUSDC?: number;
  dailyMaxUSDC?: number;
  dailyRemainingUSDC?: number;
}

export interface StatusResponse {
  agentEnabled: boolean;
  status: "Monitoring" | "Executing" | "Risk Mode";
  lastReason: string;
  nextTickAt: number;
  snapshot: Snapshot | null;
  company?: {
    id: string;
    name: string;
    riskProfile: string;
    policy: any;
  };
}

export interface OracleResponse {
  price: number;
  ts: number;
  changePct: number;
  stale: boolean;
  source?: "stork" | "sim";
}

export interface ActionLog {
  ts: number;
  action: string;
  amountUSDC: string;
  healthFactor: number;
  rationale: string;
  circleTxRef: string;
  arcTxHash: string;
  companyId?: string;
  trigger?: string;
  policyRule?: string;
  fromBucket?: string;
  toBucket?: string;
  hfBefore?: number;
  hfAfter?: number;
  liquidityBefore?: number;
  liquidityAfter?: number;
  reserveBefore?: number;
  reserveAfter?: number;
}

export interface PolicyResponse {
  ltvBps: number;
  minHealthBps: number;
  emergencyHealthBps: number;
  liquidityMinUSDC: number;
  perTxMaxUSDC: number;
  dailyMaxUSDC: number;
  liquidityTargetRatio: number;
  reserveRatio: number;
  volatilityThresholdPct: number;
  targetHealthRatio: number;
}

export interface CompanySummary {
  id: string;
  name: string;
  riskProfile: string;
  collateralValue: number;
  debt: number;
  healthFactor: number;
  liquidity: number;
  reserve: number;
  status: string;
  lastReason: string;
}

export interface PlatformSummary {
  totalCollateralValue: number;
  totalDebt: number;
  totalLiquidity: number;
  weightedHealthFactor: number;
  worstHealthFactor: number;
  systemRisk: "healthy" | "warning" | "critical";
  companies: CompanySummary[];
  oracle: {
    price: number;
    ts: number;
    source: string;
    stale: boolean;
    changePct: number;
  };
}
