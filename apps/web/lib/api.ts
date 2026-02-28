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

export function getStatus() {
  return fetchJSON<any>("/api/status");
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
