import React, { useEffect, useState, useCallback } from "react";
import HeaderStatusBar from "../components/HeaderStatusBar";
import { getStatus, getLogs, getPlatformSummary, triggerMarketShock, resetCompanies } from "../lib/api";
import { StatusResponse, ActionLog, PlatformSummary } from "../lib/types";
import CompanyCard from "../components/CompanyCard";
import PlatformOverview from "../components/PlatformOverview"
import PlatformActivityFeed from "../components/PlatformActivityFeed";
import SidebarNav from "../components/Sidebar";

const POLL_INTERVAL = 3000;

const SIDEBAR_W = 276;
const SIDEBAR_W_COLLAPSED = 78;
const SIDEBAR_MARGIN = 16;

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [platform, setPlatform] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shockLoading, setShockLoading] = useState(false);
  const [shockResult, setShockResult] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const leftPad = (sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W) + SIDEBAR_MARGIN;

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

  const handleReset = async () => {
    if (!confirm("Reset all companies to default state? This clears all logs and debt.")) return;
    setResetLoading(true);
    try {
      await resetCompanies();
      setShockResult("Demo reset complete — all companies restored to initial state.");
      refresh();
    } catch (err: any) {
      setShockResult(`Reset error: ${err.message}`);
    } finally {
      setResetLoading(false);
      setTimeout(() => setShockResult(null), 5000);
    }
  };

  const handleShock = async (pct: number) => {
    setShockLoading(true);
    setShockResult(null);
    try {
      const result = await triggerMarketShock(pct);
      const reactions = result.companyReactions
        ?.map((r: any) => `${r.name || r.id}: ${r.status}`)
        .join(" | ");
      setShockResult(`Price ${pct > 0 ? "+" : ""}${pct}% applied. ${reactions || ""}`);
      refresh();
    } catch (err: any) {
      setShockResult(`Error: ${err.message}`);
    } finally {
      setShockLoading(false);
      setTimeout(() => setShockResult(null), 8000);
    }
  };

  return (
  <div style={{ ...styles.page, paddingLeft: leftPad, transition: "padding-left 240ms cubic-bezier(0.4, 0, 0.2, 1)" }}>

    <SidebarNav collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
    <HeaderStatusBar status={status} platform={platform} title="Dashboard" />
    <PlatformOverview status={status} platform={platform} />

    {error && <div style={styles.error}>Backend unreachable: {error}</div>}

    <div style={styles.layout}>

      {/* Market Shock Controls */}
      <div style={styles.shockSection}>
        <div style={styles.shockHeader}>
          <h3 style={styles.shockTitle}>Market Scenario Controls</h3>
          <span style={styles.shockHint}>Simulate oracle price movements to observe agent reactions</span>
        </div>
        <div style={styles.shockButtons}>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnMild }}
            onClick={() => handleShock(-5)}
            disabled={shockLoading}
          >
            -5% Dip
          </button>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnModerate }}
            onClick={() => handleShock(-10)}
            disabled={shockLoading}
          >
            -10% Drop
          </button>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnSevere }}
            onClick={() => handleShock(-15)}
            disabled={shockLoading}
          >
            -15% Crash
          </button>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnRecovery }}
            onClick={() => handleShock(5)}
            disabled={shockLoading}
          >
            +5% Recovery
          </button>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnRecovery }}
            onClick={() => handleShock(10)}
            disabled={shockLoading}
          >
            +10% Rally
          </button>
          <button
            style={{ ...styles.shockBtn, ...styles.shockBtnReset }}
            onClick={handleReset}
            disabled={resetLoading || shockLoading}
          >
            {resetLoading ? "Resetting..." : "Reset Demo"}
          </button>
        </div>
        {shockResult && (
          <div style={styles.shockResult}>{shockResult}</div>
        )}
      </div>

      {/* Companies */}
      <div style={styles.companies}>
        <div style={styles.companySectionHeader}>
          <h2 style={styles.companyTitle}>Companies</h2>
          <div style={styles.companyHint}>Each company operates with distinct risk parameters</div>
        </div>

        <div style={styles.companyGrid}>
          {platform?.companies ? (
            platform.companies.map((c) => (
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
            ))
          ) : (
            [
              { name: "Atlas Manufacturing", id: "atlas" },
              { name: "Northwind Logistics", id: "northwind" },
              { name: "Harbor Health Systems", id: "harbor" },
            ].map((c) => (
              <CompanyCard
                key={c.id}
                companyId={c.id}
                name={c.name}
                riskProfile=""
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
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "stretch",
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

  error: {
    padding: "10px 20px",
    backgroundColor: "rgba(127, 29, 29, 0.6)",
  },

  shockSection: {
    background: "rgba(15, 23, 42, 0.65)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: 14,
    padding: "16px 20px",
    marginBottom: 16,
    backdropFilter: "blur(10px)",
  },
  shockHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap" as const,
  },
  shockTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  shockHint: {
    fontSize: 11,
    color: "rgba(226, 232, 240, 0.55)",
  },
  shockButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  shockBtn: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    transition: "transform 0.12s, box-shadow 0.12s",
  },
  shockBtnMild: {
    background: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    color: "#f59e0b",
  },
  shockBtnModerate: {
    background: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
    color: "#ef4444",
  },
  shockBtnSevere: {
    background: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.5)",
    color: "#ef4444",
  },
  shockBtnRecovery: {
    background: "rgba(16, 185, 129, 0.12)",
    borderColor: "rgba(16, 185, 129, 0.35)",
    color: "#10b981",
  },
  shockBtnReset: {
    background: "rgba(148, 163, 184, 0.08)",
    borderColor: "rgba(148, 163, 184, 0.3)",
    color: "rgba(226, 232, 240, 0.7)",
    marginLeft: "auto",
  },
  shockResult: {
    marginTop: 10,
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    color: "rgba(226, 232, 240, 0.8)",
  },
};
