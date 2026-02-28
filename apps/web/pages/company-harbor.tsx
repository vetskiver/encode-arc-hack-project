import React, { useEffect, useState, useCallback } from "react";
import { getStatus, getLogs } from "../lib/api";
import { StatusResponse, ActionLog } from "../lib/types";
import HeaderStatusBar from "../components/HeaderStatusBar";
import PlatformActivityFeed from "../components/PlatformActivityFeed";
import RiskOverview from "../components/RiskOverview";
import TreasuryBuckets from "../components/TreasuryBuckets";
import PaymentRequestForm from "../components/PaymentRequestForm";
import CollateralPanel from "../components/CollateralPanel";
import ActionLogTable from "../components/ActionLogTable";
import SidebarNav from "../components/Sidebar";
import PlatformOverview from "../components/PlatformOverview";


const POLL_INTERVAL = 3000;

const COMPANY = {
  name: "Harbor Health Systems",
  address: "0x0000000000000000000000000000000000000001",
};

export default function CompanyHarborPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
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
  <div style={{ ...styles.page, paddingLeft: 240 }}>
    <SidebarNav />
    <HeaderStatusBar status={status} />
    <PlatformOverview status={status} />

    {error && <div style={styles.error}>Backend unreachable: {error}</div>}

    {/*  One unified layout container */}
    <div style={styles.layout}>

      <div style={styles.main}>
        <RiskOverview snapshot={status?.snapshot || null} lastReason={status?.lastReason} />
        <TreasuryBuckets snapshot={status?.snapshot || null} />
        <ActionLogTable logs={logs} />
      </div>

       <div style={styles.side}>
        <CollateralPanel
          defaultUser={COMPANY.address}
          agentEnabled={status?.agentEnabled || false}
          snapshot={status?.snapshot || null}
        />
        <PaymentRequestForm defaultUser={COMPANY.address} />
      </div> 

      <PlatformActivityFeed logs={logs} />

      
    </div>
  </div>
);
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh" },

  layout: {
    maxWidth: 1000,
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