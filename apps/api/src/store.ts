import { Redis } from "@upstash/redis";

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

export interface Telemetry {
  agentEnabled: boolean;
  status: "Monitoring" | "Executing" | "Risk Mode";
  lastReason: string;
  nextTickAt: number;
  lastSnapshot: any | null;
}

const PRICE_HISTORY_SIZE = 20;

// ---------------------------------------------------------------------------
// Redis keys
// ---------------------------------------------------------------------------
const KEYS = {
  pendingPayments: "store:pendingPayments",
  priceHistory:    "store:priceHistory",
  telemetry:       "store:telemetry",
  actionLogs:      "store:actionLogs",
  lastAddedTs:     "store:lastAddedTs",
} as const;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_TELEMETRY: Telemetry = {
  agentEnabled: false,
  status: "Monitoring",
  lastReason: "Agent not started",
  nextTickAt: 0,
  lastSnapshot: null,
};

// ---------------------------------------------------------------------------
// Redis client (lazy singleton — safe for serverless)
// ---------------------------------------------------------------------------
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Store — every method is async and talks directly to Redis.
// The synchronous `store.telemetry` / `store.actionLogs` surface used by
// routes has been replaced with async getters below.
// ---------------------------------------------------------------------------
class Store {
  readonly defaultUser: string =
    process.env.DEFAULT_COMPANY_ADDRESS ||
    "0x0000000000000000000000000000000000000001";

  // ── Telemetry ─────────────────────────────────────────────────────────────

  async getTelemetry(): Promise<Telemetry> {
    const r = getRedis();
    const val = await r.get<Telemetry>(KEYS.telemetry);
    return val ?? { ...DEFAULT_TELEMETRY };
  }

  async updateTelemetry(updates: Partial<Telemetry>): Promise<void> {
    const r = getRedis();
    const current = await this.getTelemetry();
    await r.set(KEYS.telemetry, { ...current, ...updates });
  }

  // ── Action logs ───────────────────────────────────────────────────────────

  async getActionLogs(): Promise<ActionLog[]> {
    const r = getRedis();
    const val = await r.get<ActionLog[]>(KEYS.actionLogs);
    return val ?? [];
  }

  async addLog(log: ActionLog): Promise<void> {
    const r = getRedis();
    const logs = await this.getActionLogs();
    logs.unshift(log);
    if (logs.length > 100) logs.pop();
    await r.set(KEYS.actionLogs, logs);
  }

  // ── Price history ─────────────────────────────────────────────────────────

  async getPriceHistory(): Promise<{ price: number; ts: number }[]> {
    const r = getRedis();
    const val = await r.get<{ price: number; ts: number }[]>(KEYS.priceHistory);
    return val ?? [];
  }

  async addPrice(price: number, ts: number): Promise<void> {
    const r = getRedis();

    // Deduplicate: don't add same timestamp twice
    const lastTs = (await r.get<number>(KEYS.lastAddedTs)) ?? 0;
    if (ts === lastTs) return;

    const history = await this.getPriceHistory();
    history.push({ price, ts });
    if (history.length > PRICE_HISTORY_SIZE) history.shift();

    await Promise.all([
      r.set(KEYS.priceHistory, history),
      r.set(KEYS.lastAddedTs, ts),
    ]);
  }

  async getChangePct(): Promise<number> {
    const history = await this.getPriceHistory();
    if (history.length < 2) return 0;
    const oldest = history[0].price;
    const newest = history[history.length - 1].price;
    if (oldest === 0) return 0;
    return ((newest - oldest) / oldest) * 100;
  }

  async resetPriceHistory(): Promise<void> {
    const r = getRedis();
    await Promise.all([
      r.set(KEYS.priceHistory, []),
      r.set(KEYS.lastAddedTs, 0),
    ]);
  }

  // ── Pending payments ──────────────────────────────────────────────────────

  async getPendingPayments(): Promise<PendingPayment[]> {
    const r = getRedis();
    const val = await r.get<PendingPayment[]>(KEYS.pendingPayments);
    return val ?? [];
  }

  async getPendingPayment(): Promise<PendingPayment | null> {
    const payments = await this.getPendingPayments();
    return payments.length > 0 ? payments[0] : null;
  }

  async queuePayment(payment: PendingPayment): Promise<void> {
    const r = getRedis();
    const payments = await this.getPendingPayments();
    payments.push(payment);
    await r.set(KEYS.pendingPayments, payments);
  }

  async removePendingPayment(): Promise<void> {
    const r = getRedis();
    const payments = await this.getPendingPayments();
    payments.shift();
    await r.set(KEYS.pendingPayments, payments);
  }

  async clearPendingPayments(): Promise<void> {
    await getRedis().set(KEYS.pendingPayments, []);
  }
}

export const store = new Store();