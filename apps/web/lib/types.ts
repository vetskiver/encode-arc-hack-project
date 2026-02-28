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
  // V2: volatility threshold surfaced from policy
  volatilityThreshold?: number;
  // V3: yield policy surfaces
  yieldRatePct?: number;
  yieldRateStale?: boolean;
  maxYieldAllocPct?: number;
  minTargetYieldPct?: number;
}

export interface StatusResponse {
  agentEnabled: boolean;
  status: "Monitoring" | "Executing" | "Risk Mode";
  lastReason: string;
  nextTickAt: number;
  snapshot: Snapshot | null;
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
  // V2 enhanced logging
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

// V2: Policy response from GET /api/policy
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
