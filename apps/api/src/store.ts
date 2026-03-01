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

export interface CompanyProfile {
  id: string;
  name: string;
  address: string;
  riskProfile: "conservative" | "balanced" | "growth";
  // RWA collateral asset info
  collateralAsset: string;   // e.g. "T-Bill", "ETH", "BTC"
  oracleSymbol: string;      // Stork feed symbol, e.g. "USDCUSD", "ETHUSD", "BTCUSD"
  // Simulated per-company state
  collateralUnits: number;   // in readable units (not 18-dec)
  debtUSDC: number;          // in readable units (not 6-dec)
  liquidityUSDC: number;
  reserveUSDC: number;
  yieldUSDC: number;
  // Daily spend tracking (resets at UTC midnight)
  dailySpentUSDC: number;
  dailyResetTs: number;      // UTC timestamp of the day this counter applies to (ms)
  // Per-company price history for volatility calculation
  priceHistory: { price: number; ts: number }[];
  // Per-company policy overrides
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

/** Ring buffer for last K oracle prices */
const PRICE_HISTORY_SIZE = 20;

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// Company definitions with differentiated RWA collateral profiles
// Atlas:     T-Bill collateral (USDC-priced, near-stable). Conservative.
// Northwind: ETH collateral (ETHUSD feed). Balanced. ~0.04 ETH ≈ $100 at $2,500 ETH.
// Harbor:    BTC collateral (BTCUSD feed). Growth. ~0.001 BTC ≈ $85 at $85,000 BTC.
const DEFAULT_COMPANIES: CompanyProfile[] = [
  {
    id: "atlas",
    name: "Atlas Manufacturing",
    address: "0x81008ADD908c9702FA595E942e8430AECEad807F",
    riskProfile: "conservative",
    collateralAsset: "T-Bill",
    oracleSymbol: "USDCUSD",
    // T-Bill collateral: 150 units × $1.00 = $150 value. 50% LTV → $75 max borrow.
    // Debt $34 → HF = 75/34 ≈ 2.20 (very healthy). Stable oracle means slow drift only.
    collateralUnits: 150,
    debtUSDC: 34,
    liquidityUSDC: 80,
    reserveUSDC: 120,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 5000,             // 50% LTV — conservative
      minHealthBps: 18000,       // 1.80 min HF
      emergencyHealthBps: 15000, // 1.50 emergency
      liquidityTargetRatio: 0.30,
      reserveRatio: 0.40,
      volatilityThresholdPct: 2,
      targetHealthRatio: 2.2,
      perTxMaxUSDC: 0.50,
      dailyMaxUSDC: 3,
    },
    telemetry: {
      agentEnabled: false,
      status: "Monitoring",
      lastReason: "Agent not started",
      nextTickAt: 0,
      lastSnapshot: null,
    },
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
    // ETH collateral: 0.04 ETH × $2,500 = $100 value. 60% LTV → $60 max borrow.
    // Debt $37 → HF = 60/37 ≈ 1.62 (healthy). A -15% ETH drop → HF drops to ~1.37 < min 1.40.
    collateralUnits: 0.04,
    debtUSDC: 37,
    // Keep liquidity buffers lean so a 15% shock visibly stresses the system.
    liquidityUSDC: 2,
    reserveUSDC: 1,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 6000,             // 60% LTV — balanced
      minHealthBps: 14000,       // 1.40 min HF
      emergencyHealthBps: 12000, // 1.20 emergency
      liquidityTargetRatio: 0.25,
      reserveRatio: 0.30,
      volatilityThresholdPct: 3,
      targetHealthRatio: 1.6,
      perTxMaxUSDC: 1.00,
      dailyMaxUSDC: 5,
    },
    telemetry: {
      agentEnabled: false,
      status: "Monitoring",
      lastReason: "Agent not started",
      nextTickAt: 0,
      lastSnapshot: null,
    },
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
    // BTC collateral: 0.001 BTC × $85,000 = $85 value. 70% LTV → $59.5 max borrow.
    // Debt $41 → HF = 59.5/41 ≈ 1.45 (close to target). A -20% BTC drop → HF drops to ~1.16 < min 1.25.
    collateralUnits: 0.001,
    debtUSDC: 41,
    liquidityUSDC: 2,
    reserveUSDC: 1,
    yieldUSDC: 0,
    dailySpentUSDC: 0,
    dailyResetTs: 0,
    priceHistory: [],
    policy: {
      ltvBps: 7000,             // 70% LTV — aggressive
      minHealthBps: 12500,       // 1.25 min HF
      emergencyHealthBps: 11000, // 1.10 emergency
      liquidityTargetRatio: 0.20,
      reserveRatio: 0.25,
      volatilityThresholdPct: 5,
      targetHealthRatio: 1.35,
      perTxMaxUSDC: 1.50,
      dailyMaxUSDC: 8,
    },
    telemetry: {
      agentEnabled: false,
      status: "Monitoring",
      lastReason: "Agent not started",
      nextTickAt: 0,
      lastSnapshot: null,
    },
    actionLogs: [],
    pendingPayments: [],
  },
];

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

  // Multi-company state
  companies: CompanyProfile[] = JSON.parse(JSON.stringify(DEFAULT_COMPANIES));

  // Default user for MVP (backwards compat)
  defaultUser: string = process.env.DEFAULT_COMPANY_ADDRESS || "0x81008ADD908c9702FA595E942e8430AECEad807E";

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
        // Load per-company state if persisted
        if (data.companies && Array.isArray(data.companies) && data.companies.length === DEFAULT_COMPANIES.length) {
          this.companies = data.companies;
          // Migrate: ensure new fields have defaults for older persisted state
          this.migrateCompanies();
        }
      }
    } catch (err: any) {
      console.warn("[Store] Failed to load persisted state:", err.message);
    }
  }

  /** Apply defaults for fields added in newer versions (backwards compat). */
  private migrateCompanies(): void {
    const migrations: Record<string, Partial<CompanyProfile>> = {
      atlas:     { collateralAsset: "T-Bill", oracleSymbol: "USDCUSD", collateralUnits: 150 },
      northwind: { collateralAsset: "ETH",    oracleSymbol: "ETHUSD",  collateralUnits: 0.04 },
      harbor:    { collateralAsset: "BTC",    oracleSymbol: "BTCUSD",  collateralUnits: 0.001 },
    };
    for (const c of this.companies) {
      const m = migrations[c.id];
      if (!m) continue;
      if (!c.collateralAsset) c.collateralAsset = m.collateralAsset!;
      if (!c.oracleSymbol)    c.oracleSymbol    = m.oracleSymbol!;
      // If collateral units look like old scale (e.g. 100, 80 for ETH/BTC), reset to correct values
      if (c.id !== "atlas" && c.collateralUnits > 1) c.collateralUnits = m.collateralUnits!;
      if (c.dailySpentUSDC === undefined) c.dailySpentUSDC = 0;
      if (c.dailyResetTs === undefined)   c.dailyResetTs   = 0;
      if (!c.priceHistory)                c.priceHistory   = [];
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
        companies: this.companies,
      };
      fs.writeFileSync(STORE_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err: any) {
      console.warn("[Store] Failed to persist state:", err.message);
    }
  }

  // --- Company helpers ---

  getCompany(companyId: string): CompanyProfile | undefined {
    return this.companies.find(c => c.id === companyId);
  }

  getCompanyByAddress(address: string): CompanyProfile | undefined {
    return this.companies.find(c => c.address === address);
  }

  getAllCompanyIds(): string[] {
    return this.companies.map(c => c.id);
  }

  updateCompany(companyId: string, updates: Partial<CompanyProfile>): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    Object.assign(c, updates);
    this.persist();
  }

  updateCompanyTelemetry(companyId: string, updates: Partial<Telemetry>): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    c.telemetry = { ...c.telemetry, ...updates };
    this.persist();
  }

  addCompanyLog(companyId: string, log: ActionLog): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    log.companyId = companyId;
    c.actionLogs.unshift(log);
    if (c.actionLogs.length > 100) c.actionLogs.pop();
    // Also add to global logs
    this.actionLogs.unshift(log);
    if (this.actionLogs.length > 300) this.actionLogs.pop();
    this.persist();
  }

  getCompanyLogs(companyId: string): ActionLog[] {
    const c = this.getCompany(companyId);
    return c ? c.actionLogs : [];
  }

  queueCompanyPayment(companyId: string, payment: PendingPayment): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    c.pendingPayments.push(payment);
    this.persist();
  }

  getCompanyPendingPayment(companyId: string): PendingPayment | null {
    const c = this.getCompany(companyId);
    if (!c || c.pendingPayments.length === 0) return null;
    return c.pendingPayments[0];
  }

  removeCompanyPendingPayment(companyId: string): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    c.pendingPayments.shift();
    this.persist();
  }

  // --- Shared oracle ---

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

  /** Seed two price entries so changePct reflects a shock transition (old → new). */
  seedShockHistory(oldPrice: number, newPrice: number): void {
    const now = Date.now();
    this.priceHistory = [
      { price: oldPrice, ts: now - 1000 },
      { price: newPrice, ts: now },
    ];
    this._lastAddedTs = now;
    this.persist();
  }

  getChangePct(): number {
    if (this.priceHistory.length < 2) return 0;
    const oldest = this.priceHistory[0].price;
    const newest = this.priceHistory[this.priceHistory.length - 1].price;
    if (oldest === 0) return 0;
    return ((newest - oldest) / oldest) * 100;
  }

  // --- Backwards-compatible global methods ---

  addLog(log: ActionLog): void {
    this.actionLogs.unshift(log);
    if (this.actionLogs.length > 300) {
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

  // --- Per-company price history ---

  addCompanyPrice(companyId: string, price: number, ts: number): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    if (!c.priceHistory) c.priceHistory = [];
    // Deduplicate by ts
    if (c.priceHistory.length > 0 && c.priceHistory[c.priceHistory.length - 1].ts === ts) return;
    c.priceHistory.push({ price, ts });
    if (c.priceHistory.length > PRICE_HISTORY_SIZE) c.priceHistory.shift();
    this.persist();
  }

  getCompanyChangePct(companyId: string): number {
    const c = this.getCompany(companyId);
    if (!c || !c.priceHistory || c.priceHistory.length < 2) return 0;
    const oldest = c.priceHistory[0].price;
    const newest = c.priceHistory[c.priceHistory.length - 1].price;
    if (oldest === 0) return 0;
    return ((newest - oldest) / oldest) * 100;
  }

  seedCompanyShockHistory(companyId: string, oldPrice: number, newPrice: number): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    const now = Date.now();
    c.priceHistory = [
      { price: oldPrice, ts: now - 1000 },
      { price: newPrice, ts: now },
    ];
    this.persist();
  }

  // --- Daily spend tracking ---

  /** Accumulate daily spend; automatically resets counter at UTC midnight. */
  recordCompanyDailySpend(companyId: string, amountUSDC: number): void {
    const c = this.getCompany(companyId);
    if (!c) return;
    const todayMidnightUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    );
    if (!c.dailyResetTs || c.dailyResetTs < todayMidnightUtc) {
      c.dailySpentUSDC = 0;
      c.dailyResetTs = todayMidnightUtc;
    }
    c.dailySpentUSDC += amountUSDC;
    this.persist();
  }

  /** Get remaining daily budget in USDC. Returns Infinity if no daily limit set. */
  getCompanyDailyRemaining(companyId: string): number {
    const c = this.getCompany(companyId);
    if (!c) return 0;
    const todayMidnightUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    );
    const spent = (!c.dailyResetTs || c.dailyResetTs < todayMidnightUtc) ? 0 : (c.dailySpentUSDC || 0);
    const limit = c.policy.dailyMaxUSDC;
    return Math.max(0, limit - spent);
  }

  // Reset companies to default state
  resetCompanies(): void {
    this.companies = JSON.parse(JSON.stringify(DEFAULT_COMPANIES));
    this.persist();
  }
}

export const store = new Store();
