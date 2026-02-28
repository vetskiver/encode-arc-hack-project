export interface PendingPayment {
  user: string;
  to: string;
  amountUSDC: string;
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
  // V2 enhanced logging
  trigger?: string;       // what triggered this action (e.g. "volatility 5.2% > threshold 3%")
  policyRule?: string;    // which policy rule activated (e.g. "liquidityTargetRatio", "reserveRatio")
  fromBucket?: string;    // source bucket for rebalance
  toBucket?: string;      // destination bucket for rebalance
  hfBefore?: number;      // health factor before action
  hfAfter?: number;       // health factor after action (if available)
  liquidityBefore?: number;
  liquidityAfter?: number;
  reserveBefore?: number;
  reserveAfter?: number;
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

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

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
  defaultUser: string = process.env.DEFAULT_COMPANY_ADDRESS || "0x0000000000000000000000000000000000000001";

  // Track last ts added to prevent double-adds (agentTick + /api/oracle both call addPrice)
  private _lastAddedTs: number = 0;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, "utf-8");
        const data = JSON.parse(raw);
        this.pendingPayments = data.pendingPayments || [];
        this.priceHistory = data.priceHistory || [];
        this.telemetry = data.telemetry || this.telemetry;
        this.actionLogs = data.actionLogs || [];
        this._lastAddedTs = data._lastAddedTs || 0;
      }
    } catch (err: any) {
      console.warn("[Store] Failed to load persisted state:", err.message);
    }
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload = {
        pendingPayments: this.pendingPayments,
        priceHistory: this.priceHistory,
        telemetry: this.telemetry,
        actionLogs: this.actionLogs,
        _lastAddedTs: this._lastAddedTs,
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err: any) {
      console.warn("[Store] Failed to persist state:", err.message);
    }
  }

  addPrice(price: number, ts: number): void {
    // Deduplicate: don't add same timestamp twice
    if (ts === this._lastAddedTs) return;
    this._lastAddedTs = ts;

    this.priceHistory.push({ price, ts });
    if (this.priceHistory.length > PRICE_HISTORY_SIZE) {
      this.priceHistory.shift();
    }
    this.persist();
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
    this.persist();
  }

  getPendingPayment(): PendingPayment | null {
    return this.pendingPayments.length > 0 ? this.pendingPayments[0] : null;
  }

  removePendingPayment(): void {
    this.pendingPayments.shift();
    this.persist();
  }

  clearPendingPayments(): void {
    this.pendingPayments = [];
    this.persist();
  }

  queuePayment(payment: PendingPayment): void {
    this.pendingPayments.push(payment);
    this.persist();
  }

  resetPriceHistory(): void {
    this.priceHistory = [];
    this._lastAddedTs = 0;
    this.persist();
  }

  updateTelemetry(updates: Partial<Telemetry>): void {
    this.telemetry = { ...this.telemetry, ...updates };
    this.persist();
  }
}

export const store = new Store();
