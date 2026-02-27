export interface Snapshot {
  oraclePrice: number;
  oracleTs: number;
  changePct: number;
  collateralAmount: string;
  collateralValueUSDC: string;
  debtUSDC: string;
  maxBorrowUSDC: string;
  healthFactor: number;
  liquidityUSDC: string;
  reserveUSDC: string;
  pendingPayment: { to: string; amountUSDC: string } | null;
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
}

export interface ActionLog {
  ts: number;
  action: string;
  amountUSDC: string;
  healthFactor: number;
  rationale: string;
  circleTxRef: string;
  arcTxHash: string;
}
