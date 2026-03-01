import { StatusResponse, PlatformSummary } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

async function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// --- Per-company endpoints ---

export async function getCompanyStatus(companyId: string): Promise<StatusResponse> {
  const res = await fetch(`${BASE}/api/company/${companyId}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getCompanyLogs(companyId: string) {
  return fetchJSON<any[]>(`/api/company/${companyId}/logs`);
}

export async function triggerCompanyTick(companyId: string) {
  return fetchJSON<any>(`/api/company/${companyId}/tick`, { method: "POST" });
}

// --- Platform aggregate ---

export async function getPlatformSummary(): Promise<PlatformSummary> {
  return fetchJSON<PlatformSummary>("/api/platform/summary");
}

// --- Market shock (demo) ---

export async function triggerMarketShock(pct: number) {
  return fetchJSON<any>("/api/demo/shock", {
    method: "POST",
    body: JSON.stringify({ pct }),
  });
}

// --- Original endpoints (backwards compat) ---

export async function getStatus(user?: string): Promise<StatusResponse> {
  const url = user
    ? `${BASE}/api/status?user=${encodeURIComponent(user)}`
    : `${BASE}/api/status`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function getOracle() {
  return fetchJSON<any>("/api/oracle");
}

export function getLogs() {
  return fetchJSON<any[]>("/api/logs");
}

export function startAgent() {
  return fetchJSON<any>("/api/agent/start", { method: "POST" });
}

export function stopAgent() {
  return fetchJSON<any>("/api/agent/stop", { method: "POST" });
}

export function triggerTick() {
  return fetchJSON<any>("/api/agent/tick", { method: "POST" });
}

export function registerCollateral(user: string, amount: string) {
  return fetchJSON<any>("/api/collateral/register", {
    method: "POST",
    body: JSON.stringify({ user, amount }),
  });
}

export function requestPayment(user: string, to: string, amountUSDC: string) {
  return fetchJSON<any>("/api/payment/request", {
    method: "POST",
    body: JSON.stringify({ user, to, amountUSDC }),
  });
}

export function manualBorrow(user: string, amountUSDC: string) {
  return fetchJSON<any>("/api/manual/borrow", {
    method: "POST",
    body: JSON.stringify({ user, amountUSDC }),
  });
}

export function manualRepay(user: string, amountUSDC: string) {
  return fetchJSON<any>("/api/manual/repay", {
    method: "POST",
    body: JSON.stringify({ user, amountUSDC }),
  });
}

export function manualRebalance(
  user: string,
  fromBucket: string,
  toBucket: string,
  amountUSDC: string
) {
  return fetchJSON<any>("/api/manual/rebalance", {
    method: "POST",
    body: JSON.stringify({ user, fromBucket, toBucket, amountUSDC }),
  });
}

export function overrideOraclePrice(price: number) {
  return fetchJSON<any>("/api/oracle/override", {
    method: "POST",
    body: JSON.stringify({ price }),
  });
}

export function resetUser(user: string) {
  return fetchJSON<any>("/api/user/reset", {
    method: "POST",
    body: JSON.stringify({ user }),
  });
}

export function getPolicy() {
  return fetchJSON<any>("/api/policy");
}

export function updatePolicy(params: {
  liquidityTargetRatio?: number;
  reserveRatio?: number;
  volatilityThresholdPct?: number;
  targetHealthRatio?: number;
}) {
  return fetchJSON<any>("/api/policy/update", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function resetCompanies() {
  return fetchJSON<any>("/api/companies/reset", { method: "POST" });
}
