export interface PendingPayment {
  user: string;
  to: string;
  amountUSDC: string; // human-readable
  createdAt: number;
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

export interface Telemetry {
  agentEnabled: boolean;
  status: "Monitoring" | "Executing" | "Risk Mode";
  lastReason: string;
  nextTickAt: number;
  lastSnapshot: any | null;
}

/** Ring buffer for last K oracle prices */
const PRICE_HISTORY_SIZE = 20;

class Store {
  pendingPayments: PendingPayment[] = [];
  priceHistory: { price: number; ts: number }[] = [];
  telemetry: Telemetry = {
    agentEnabled: false,
    status: "Monitoring",
    lastReason: "Agent not started",
    nextTickAt: 0,
    lastSnapshot: null,
  };
  actionLogs: ActionLog[] = [];

  // Default user for MVP
  defaultUser: string = "0x0000000000000000000000000000000000000001";

  addPrice(price: number, ts: number): void {
    this.priceHistory.push({ price, ts });
    if (this.priceHistory.length > PRICE_HISTORY_SIZE) {
      this.priceHistory.shift();
    }
  }

  getChangePct(): number {
    if (this.priceHistory.length < 2) return 0;
    const oldest = this.priceHistory[0].price;
    const newest = this.priceHistory[this.priceHistory.length - 1].price;
    if (oldest === 0) return 0;
    return ((newest - oldest) / oldest) * 100;
  }

  addLog(log: ActionLog): void {
    this.actionLogs.unshift(log);
    if (this.actionLogs.length > 100) {
      this.actionLogs.pop();
    }
  }

  getPendingPayment(): PendingPayment | null {
    return this.pendingPayments.length > 0 ? this.pendingPayments[0] : null;
  }

  removePendingPayment(): void {
    this.pendingPayments.shift();
  }

  queuePayment(payment: PendingPayment): void {
    this.pendingPayments.push(payment);
  }
}

export const store = new Store();
