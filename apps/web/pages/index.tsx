import React, { useEffect, useState, useCallback } from "react";
import HeaderStatusBar from "../components/HeaderStatusBar";
import RiskOverview from "../components/RiskOverview";
import TreasuryBuckets from "../components/TreasuryBuckets";
import PaymentRequestForm from "../components/PaymentRequestForm";
import CollateralPanel from "../components/CollateralPanel";
import ActionLogTable from "../components/ActionLogTable";
import { getStatus, getLogs } from "../lib/api";
import { StatusResponse, ActionLog } from "../lib/types";
import CompanyCard from "../components/CompanyCard";

const POLL_INTERVAL = 3000;

const DEFAULT_USER = "0x0000000000000000000000000000000000000001";

const COMPANIES = [
  { name: "Atlas Manufacturing", address: "0x0000000000000000000000000000000000000001" },
  { name: "Northwind Logistics", address: "0x0000000000000000000000000000000000000002" },
  { name: "Harbor Health Systems", address: "0x0000000000000000000000000000000000000003" },
];

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState("");

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
    <div style={styles.page}>
      <HeaderStatusBar status={status} />

      {/* Companies grid: exactly 3 columns (1 company per column) */}
      <div style={styles.companySection}>
        <div style={styles.companySectionHeader}>
          <h2 style={styles.companyTitle}>Companies</h2>
          <div style={styles.companyHint}>Click a card to open its cockpit →</div>
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

      {error && (
        <div style={styles.error}>
          Backend unreachable: {error}. Make sure the API is running on port 4000.
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.mainCol}>
          <RiskOverview snapshot={status?.snapshot || null} lastReason={status?.lastReason} />
          <TreasuryBuckets snapshot={status?.snapshot || null} />
          <ActionLogTable logs={logs} />
        </div>

        <div style={styles.sideCol}>
          <CollateralPanel
            defaultUser={DEFAULT_USER}
            agentEnabled={status?.agentEnabled || false}
            snapshot={status?.snapshot || null}
          />
          <PaymentRequestForm defaultUser={DEFAULT_USER} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    color: "var(--text)",
  },
  error: {
    padding: "10px 20px",
    backgroundColor: "rgba(127, 29, 29, 0.6)",
    color: "#fecaca",
    fontSize: 13,
    borderBottom: "1px solid rgba(248, 113, 113, 0.4)",
  },

  companySection: {
    maxWidth: 1400,
    margin: "12px auto 0",
    padding: "0 20px",
  },
  companySectionHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap" as const,
  },
  companyTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  companyHint: {
    fontSize: 12,
    color: "var(--muted)",
    fontWeight: 600,
  },

  companyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 16,
  },

  content: {
    display: "flex",
    gap: 16,
    padding: 20,
    maxWidth: 1400,
    margin: "0 auto",
    flexWrap: "wrap" as const,
  },
  mainCol: {
    flex: 2,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    minWidth: 320,
  },
  sideCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    minWidth: 280,
  },
};