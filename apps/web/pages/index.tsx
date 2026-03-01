import React, { useEffect, useState, useCallback } from "react";
import HeaderStatusBar from "../components/HeaderStatusBar";
import { getStatus, getLogs, getPlatformSummary, triggerMarketShock, resetCompanies } from "../lib/api";
import { StatusResponse, ActionLog, PlatformSummary } from "../lib/types";
import CompanyCard from "../components/CompanyCard";
import PlatformOverview from "../components/PlatformOverview"
import PlatformActivityFeed from "../components/PlatformActivityFeed";
import SidebarNav from "../components/Sidebar";

const POLL_INTERVAL = 3000;

const SIDEBAR_W = 240;
const SIDEBAR_W_COLLAPSED = 72;
const SIDEBAR_MARGIN = 16;

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [platform, setPlatform] = useState<PlatformSummary | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shockLoading, setShockLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const leftPad = sidebarCollapsed ? 74 : 270;

  const refresh = useCallback(async () => {
    try {
      const [s, l, p] = await Promise.all([getStatus(), getLogs(), getPlatformSummary()]);
      setStatus(s);
      setLogs(l);
      setPlatform(p);
      setError("");
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const handleShock = async (pct: number) => {
    setShockLoading(true);
    try {
      await triggerMarketShock(pct);
      await refresh();
    } catch (e) {
      console.error("Shock failed", e);
    } finally {
      setShockLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all company state to defaults?")) return;
    setResetLoading(true);
    try {
      await resetCompanies();
      await refresh();
    } catch (e) {
      console.error("Reset failed", e);
    } finally {
      setResetLoading(false);
    }
  };

  const companies = platform?.companies ?? [];

  return (
  <div style={{ ...styles.page, paddingLeft: leftPad }}>

    <SidebarNav collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
    <main
      style={{
        transition: "margin-left 180ms ease",
      }}
    />


    <HeaderStatusBar status={status} platform={platform} />
    <PlatformOverview status={status} platform={platform} />

    {error && <div style={styles.error}>Backend unreachable: {error}</div>}

    {/*  One unified layout container */}
    <div style={styles.layout}>

      {/*  Companies spans BOTH columns, sits at bottom */}
      <div style={styles.companies}>
        <div style={styles.companySectionHeader}>
          <h2 style={styles.companyTitle}>Companies</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={styles.companyHint}>Use Navigation Bar to select a company</div>
            <button
              style={{ ...styles.shockBtn, opacity: shockLoading ? 0.6 : 1 }}
              disabled={shockLoading}
              onClick={() => handleShock(-15)}
            >
              {shockLoading ? "…" : "−15% Crash"}
            </button>
            <button
              style={{ ...styles.shockBtn, ...styles.shockBtnUp, opacity: shockLoading ? 0.6 : 1 }}
              disabled={shockLoading}
              onClick={() => handleShock(15)}
            >
              {shockLoading ? "…" : "+15% Rally"}
            </button>
            <button
              style={{ ...styles.shockBtn, ...styles.shockBtnReset, opacity: resetLoading ? 0.6 : 1 }}
              disabled={resetLoading}
              onClick={handleReset}
            >
              {resetLoading ? "…" : "Reset Demo"}
            </button>
          </div>
        </div>

        <div style={styles.companyGrid}>
          {companies.length > 0 ? companies.map((c) => (
            <CompanyCard
              key={c.id}
              companyId={c.id}
              name={c.name}
              riskProfile={c.riskProfile}
              collateralValue={c.collateralValue}
              debt={c.debt}
              healthFactor={c.healthFactor}
              liquidity={c.liquidity}
              reserve={c.reserve}
              agentStatus={c.status}
              lastReason={c.lastReason}
              error={!!error}
            />
          )) : (
            // fallback while platform data loads
            [
              { id: "atlas", name: "Atlas Manufacturing" },
              { id: "northwind", name: "Northwind Logistics" },
              { id: "harbor", name: "Harbor Health Systems" },
            ].map((c) => (
              <CompanyCard
                key={c.id}
                companyId={c.id}
                name={c.name}
                riskProfile="balanced"
                collateralValue={0}
                debt={0}
                healthFactor={999}
                liquidity={0}
                reserve={0}
                agentStatus="Offline"
                lastReason=""
                error={!!error}
              />
            ))
          )}
        </div>
      </div>


      <PlatformActivityFeed logs={logs} />


    </div>
  </div>
);
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh" },

  layout: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 20,
    display: "column",
    gridTemplateColumns: "2fr 1fr",
    gap: 16,
    gridTemplateAreas: `
      "main side"
      "companies companies"
    `,
    alignItems: "start",
  },

  main: { gridArea: "main", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  side: { gridArea: "side", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },

  companies: { gridArea: "companies", marginTop: 8 },

  companySectionHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  companyTitle: { margin: 0, fontSize: 16, fontWeight: 800 },
  companyHint: { fontSize: 12, opacity: 0.75 },

  companyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
  },

  shockBtn: {
    padding: "5px 12px",
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  shockBtnUp: {
    border: "1px solid rgba(16,185,129,0.4)",
    background: "rgba(16,185,129,0.1)",
    color: "#34d399",
  },
  shockBtnReset: {
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(148,163,184,0.06)",
    color: "var(--muted)",
  },

  error: {
    padding: "10px 20px",
    backgroundColor: "rgba(127, 29, 29, 0.6)",
  },
};
