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

export interface Telemetry {
  agentEnabled: boolean;
  status: "Monitoring" | "Executing" | "Risk Mode";
  lastReason: string;
  nextTickAt: number;
  lastSnapshot: any | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  address: string;
  riskProfile: "conservative" | "balanced" | "growth";
  collateralAsset: string;
  oracleSymbol: string;
  collateralUnits: number;
  debtUSDC: number;
  liquidityUSDC: number;
  reserveUSDC: number;
  yieldUSDC: number;
  dailySpentUSDC: number;
  dailyResetTs: number;
  priceHistory: { price: number; ts: number }[];
  policy: {
    ltvBps: number;
    minHealthBps: number;
    emergencyHealthBps: number;
    liquidityTargetRatio: number;
    reserveRatio: number;
    volatilityThresholdPct: number;
    targetHealthRatio: number;
    perTxMaxUSDC: number;
    dailyMaxUSDC: number;
  };
  telemetry: Telemetry;
  actionLogs: ActionLog[];
  pendingPayments: PendingPayment[];
}

const PRICE_HISTORY_SIZE = 20;

const KEYS = {
  pendingPayments: "store:pendingPayments",
  priceHistory:    "store:priceHistory",
  telemetry:       "store:telemetry",
  actionLogs:      "store:actionLogs",
  lastAddedTs:     "store:lastAddedTs",
  companies:       "store:companies",
} as const;

const DEFAULT_TELEMETRY: Telemetry = {
  agentEnabled: false,
  status: "Monitoring",
  lastReason: "Agent not started",
  nextTickAt: 0,
  lastSnapshot: null,
};

const DEFAULT_COMPANIES: CompanyProfile[] = [
  {
    id: "atlas",
    name: "Atlas Manufacturing",
    address: "0x81008ADD908c9702FA595E942e8430AECEad807F",
    riskProfile: "conservative",
    collateralAsset: "T-Bill",
    oracleSymbol: "USDCUSD",
    collateralUnits: 150,
    debtUSDC: 34,
    liquidityUSDC: 80,
    reserveUSDC: 120,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 5000,
      minHealthBps: 18000,
      emergencyHealthBps: 15000,
      liquidityTargetRatio: 0.30,
      reserveRatio: 0.40,
      volatilityThresholdPct: 2,
      targetHealthRatio: 2.2,
      perTxMaxUSDC: 0.50,
      dailyMaxUSDC: 3,
    },
    telemetry: { agentEnabled: false, status: "Monitoring", lastReason: "Agent not started", nextTickAt: 0, lastSnapshot: null },
    actionLogs: [],
    pendingPayments: [],
  },
  {
    id: "northwind",
    name: "Northwind Logistics",
    address: "0x81008ADD908c9702FA595E942e8430AECEad8080",
    riskProfile: "balanced",
    collateralAsset: "ETH",
    oracleSymbol: "ETHUSD",
    collateralUnits: 0.04,
    debtUSDC: 37,
    liquidityUSDC: 2,
    reserveUSDC: 1,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 6000,
      minHealthBps: 14000,
      emergencyHealthBps: 12000,
      liquidityTargetRatio: 0.25,
      reserveRatio: 0.30,
      volatilityThresholdPct: 3,
      targetHealthRatio: 1.6,
      perTxMaxUSDC: 1.00,
      dailyMaxUSDC: 5,
    },
    telemetry: { agentEnabled: false, status: "Monitoring", lastReason: "Agent not started", nextTickAt: 0, lastSnapshot: null },
    actionLogs: [],
    pendingPayments: [],
  },
  {
    id: "harbor",
    name: "Harbor Health Systems",
    address: "0x81008ADD908c9702FA595E942e8430AECEad8081",
    riskProfile: "growth",
    collateralAsset: "BTC",
    oracleSymbol: "BTCUSD",
    collateralUnits: 0.001,
    debtUSDC: 41,
    liquidityUSDC: 2,
    reserveUSDC: 1,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 7000,
      minHealthBps: 12500,
      emergencyHealthBps: 11000,
      liquidityTargetRatio: 0.20,
      reserveRatio: 0.25,
      volatilityThresholdPct: 5,
      targetHealthRatio: 1.35,
      perTxMaxUSDC: 1.50,
      dailyMaxUSDC: 8,
    },
    telemetry: { agentEnabled: false, status: "Monitoring", lastReason: "Agent not started", nextTickAt: 0, lastSnapshot: null },
    actionLogs: [],
    pendingPayments: [],
  },
];

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

class Store {
  readonly defaultUser: string =
    process.env.DEFAULT_COMPANY_ADDRESS ||
    "0x81008ADD908c9702FA595E942e8430AECEad807E";

  // ── Telemetry ─────────────────────────────────────────────────────────────

  async getTelemetry(): Promise<Telemetry> {
    const val = await getRedis().get<Telemetry>(KEYS.telemetry);
    return val ?? { ...DEFAULT_TELEMETRY };
  }

  async updateTelemetry(updates: Partial<Telemetry>): Promise<void> {
    const current = await this.getTelemetry();
    await getRedis().set(KEYS.telemetry, { ...current, ...updates });
  }

  // ── Action logs ───────────────────────────────────────────────────────────

  async getActionLogs(): Promise<ActionLog[]> {
    const val = await getRedis().get<ActionLog[]>(KEYS.actionLogs);
    return val ?? [];
  }

  async addLog(log: ActionLog): Promise<void> {
    const logs = await this.getActionLogs();
    logs.unshift(log);
    if (logs.length > 100) logs.pop();
    await getRedis().set(KEYS.actionLogs, logs);
  }

  // ── Price history ─────────────────────────────────────────────────────────

  async getPriceHistory(): Promise<{ price: number; ts: number }[]> {
    const val = await getRedis().get<{ price: number; ts: number }[]>(KEYS.priceHistory);
    return val ?? [];
  }

  async addPrice(price: number, ts: number): Promise<void> {
    const r = getRedis();
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
    await Promise.all([
      getRedis().set(KEYS.priceHistory, []),
      getRedis().set(KEYS.lastAddedTs, 0),
    ]);
  }

  async seedShockHistory(oldPrice: number, newPrice: number): Promise<void> {
    const now = Date.now();
    await Promise.all([
      getRedis().set(KEYS.priceHistory, [
        { price: oldPrice, ts: now - 1000 },
        { price: newPrice, ts: now },
      ]),
      getRedis().set(KEYS.lastAddedTs, now),
    ]);
  }

  // ── Pending payments ──────────────────────────────────────────────────────

  async getPendingPayments(): Promise<PendingPayment[]> {
    const val = await getRedis().get<PendingPayment[]>(KEYS.pendingPayments);
    return val ?? [];
  }

  async getPendingPayment(): Promise<PendingPayment | null> {
    const payments = await this.getPendingPayments();
    return payments.length > 0 ? payments[0] : null;
  }

  async queuePayment(payment: PendingPayment): Promise<void> {
    const payments = await this.getPendingPayments();
    payments.push(payment);
    await getRedis().set(KEYS.pendingPayments, payments);
  }

  async removePendingPayment(): Promise<void> {
    const payments = await this.getPendingPayments();
    payments.shift();
    await getRedis().set(KEYS.pendingPayments, payments);
  }

  async clearPendingPayments(): Promise<void> {
    await getRedis().set(KEYS.pendingPayments, []);
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async getCompanies(): Promise<CompanyProfile[]> {
    const val = await getRedis().get<CompanyProfile[]>(KEYS.companies);
    return val ?? JSON.parse(JSON.stringify(DEFAULT_COMPANIES));
  }

  async saveCompanies(companies: CompanyProfile[]): Promise<void> {
    await getRedis().set(KEYS.companies, companies);
  }

  async getCompany(companyId: string): Promise<CompanyProfile | undefined> {
    const companies = await this.getCompanies();
    return companies.find(c => c.id === companyId);
  }

  async getCompanyByAddress(address: string): Promise<CompanyProfile | undefined> {
    const companies = await this.getCompanies();
    return companies.find(c => c.address === address);
  }

  async getAllCompanyIds(): Promise<string[]> {
    const companies = await this.getCompanies();
    return companies.map(c => c.id);
  }

  async updateCompany(companyId: string, updates: Partial<CompanyProfile>): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    companies[idx] = { ...companies[idx], ...updates };
    await this.saveCompanies(companies);
  }

  async updateCompanyTelemetry(companyId: string, updates: Partial<Telemetry>): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    companies[idx].telemetry = { ...companies[idx].telemetry, ...updates };
    await this.saveCompanies(companies);
  }

  async addCompanyLog(companyId: string, log: ActionLog): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    log.companyId = companyId;
    companies[idx].actionLogs.unshift(log);
    if (companies[idx].actionLogs.length > 100) companies[idx].actionLogs.pop();
    await this.saveCompanies(companies);
    await this.addLog(log);
  }

  async getCompanyLogs(companyId: string): Promise<ActionLog[]> {
    const c = await this.getCompany(companyId);
    return c ? c.actionLogs : [];
  }

  async queueCompanyPayment(companyId: string, payment: PendingPayment): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    companies[idx].pendingPayments.push(payment);
    await this.saveCompanies(companies);
  }

  async getCompanyPendingPayment(companyId: string): Promise<PendingPayment | null> {
    const c = await this.getCompany(companyId);
    if (!c || c.pendingPayments.length === 0) return null;
    return c.pendingPayments[0];
  }

  async removeCompanyPendingPayment(companyId: string): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    companies[idx].pendingPayments.shift();
    await this.saveCompanies(companies);
  }

  // ── Per-company price history ─────────────────────────────────────────────

  async addCompanyPrice(companyId: string, price: number, ts: number): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    if (!companies[idx].priceHistory) companies[idx].priceHistory = [];
    const hist = companies[idx].priceHistory;
    if (hist.length > 0 && hist[hist.length - 1].ts === ts) return;
    hist.push({ price, ts });
    if (hist.length > PRICE_HISTORY_SIZE) hist.shift();
    await this.saveCompanies(companies);
  }

  async getCompanyChangePct(companyId: string): Promise<number> {
    const c = await this.getCompany(companyId);
    if (!c || !c.priceHistory || c.priceHistory.length < 2) return 0;
    const oldest = c.priceHistory[0].price;
    const newest = c.priceHistory[c.priceHistory.length - 1].price;
    if (oldest === 0) return 0;
    return ((newest - oldest) / oldest) * 100;
  }

  async seedCompanyShockHistory(companyId: string, oldPrice: number, newPrice: number): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    const now = Date.now();
    companies[idx].priceHistory = [
      { price: oldPrice, ts: now - 1000 },
      { price: newPrice, ts: now },
    ];
    await this.saveCompanies(companies);
  }

  // ── Daily spend tracking ──────────────────────────────────────────────────

  async recordCompanyDailySpend(companyId: string, amountUSDC: number): Promise<void> {
    const companies = await this.getCompanies();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx === -1) return;
    const todayMidnight = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    if (!companies[idx].dailyResetTs || companies[idx].dailyResetTs < todayMidnight) {
      companies[idx].dailySpentUSDC = 0;
      companies[idx].dailyResetTs = todayMidnight;
    }
    companies[idx].dailySpentUSDC += amountUSDC;
    await this.saveCompanies(companies);
  }

  async getCompanyDailyRemaining(companyId: string): Promise<number> {
    const c = await this.getCompany(companyId);
    if (!c) return 0;
    const todayMidnight = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const spent = (!c.dailyResetTs || c.dailyResetTs < todayMidnight) ? 0 : (c.dailySpentUSDC || 0);
    return Math.max(0, c.policy.dailyMaxUSDC - spent);
  }

  async resetCompanies(): Promise<void> {
    await getRedis().set(KEYS.companies, JSON.parse(JSON.stringify(DEFAULT_COMPANIES)));
  }
}

export const store = new Store();