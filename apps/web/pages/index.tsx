import React, { useEffect, useState, useCallback } from "react";
import HeaderStatusBar from "../components/HeaderStatusBar";
import { getStatus, getLogs } from "../lib/api";
import { StatusResponse, ActionLog } from "../lib/types";
import CompanyCard from "../components/CompanyCard";
import PlatformOverview from "../components/PlatformOverview"
import PlatformActivityFeed from "../components/PlatformActivityFeed";
import SidebarNav from "../components/Sidebar";

const POLL_INTERVAL = 3000;
const HIDE_YIELD = (process.env.NEXT_PUBLIC_HIDE_YIELD || "").toLowerCase() === "true";

const DEFAULT_USER = "0x0000000000000000000000000000000000000001";
const SIDEBAR_W = 240;
const SIDEBAR_W_COLLAPSED = 72;
const SIDEBAR_MARGIN = 16;
const OFFSET_EXPANDED = SIDEBAR_W + SIDEBAR_MARGIN * 2;
const OFFSET_COLLAPSED = SIDEBAR_W_COLLAPSED + SIDEBAR_MARGIN

const COMPANIES = [
  { name: "Atlas Manufacturing", address: "0x0000000000000000000000000000000000000001" },
  { name: "Northwind Logistics", address: "0x0000000000000000000000000000000000000002" },
  { name: "Harbor Health Systems", address: "0x0000000000000000000000000000000000000003" },
];

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const leftPad = sidebarCollapsed ? 74 : 270;

  const refresh = useCallback(async () => {
    try {
      // Current API appears to return one shared status/log stream.
      // If/when it becomes per-company, store a map keyed by address.
      const [s, l] = await Promise.all([getStatus(), getLogs()]);
      setStatus(s);
      setLogs(l);
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

  return (
  <div style={{ ...styles.page, paddingLeft: leftPad }}>
    
    <SidebarNav collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
    <main
      style={{
        transition: "margin-left 180ms ease",
      }}
    />
    
    
    <HeaderStatusBar status={status} />
    <PlatformOverview status={status} />

    {error && <div style={styles.error}>Backend unreachable: {error}</div>}

    {/*  One unified layout container */}
    <div style={styles.layout}>

      {/*  Companies spans BOTH columns, sits at bottom */}
      <div style={styles.companies}>
        <div style={styles.companySectionHeader}>
          <h2 style={styles.companyTitle}>Companies</h2>
          <div style={styles.companyHint}>Use Navigation Bar to select a company</div>
        </div>

        <div style={styles.companyGrid}>
          {COMPANIES.map((c) => (
            <CompanyCard
              key={c.address}
              name={c.name}
              address={c.address}
              status={status}
              error={!!error}
            />
          ))}
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

  error: {
    padding: "10px 20px",
    backgroundColor: "rgba(127, 29, 29, 0.6)",
  },
};