import React, { useEffect, useState, useCallback } from "react";
import HeaderStatusBar from "../components/HeaderStatusBar";
import RiskOverview from "../components/RiskOverview";
import TreasuryBuckets from "../components/TreasuryBuckets";
import PaymentRequestForm from "../components/PaymentRequestForm";
import CollateralPanel from "../components/CollateralPanel";
import ActionLogTable from "../components/ActionLogTable";
import { getStatus, getLogs } from "../lib/api";
import { StatusResponse, ActionLog } from "../lib/types";

const POLL_INTERVAL = 3000;

const COMPANIES = [
  {
    name: "Atlas Manufacturing",
    address: "0x0000000000000000000000000000000000000001",
  },
  {
    name: "Northwind Logistics",
    address: "0x0000000000000000000000000000000000000002",
  },
  {
    name: "Harbor Health Systems",
    address: "0x0000000000000000000000000000000000000003",
  },
];

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [error, setError] = useState("");
  const [companyIndex, setCompanyIndex] = useState(0);
  const [companyAddress, setCompanyAddress] = useState(COMPANIES[0].address);

  const refresh = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([getStatus(), getLogs()]);
      setStatus(s);
      setLogs(l);
      setError("");
    } catch (err: any) {
      setError(err.message);
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
      {error && (
        <div style={styles.error}>
          Backend unreachable: {error}. Make sure the API is running on port 4000.
        </div>
      )}
      <div style={styles.content}>
        <div style={styles.mainCol}>
          <RiskOverview 
            snapshot={status?.snapshot || null}
            lastReason={status?.lastReason}
             />
          <TreasuryBuckets snapshot={status?.snapshot || null} />
          <ActionLogTable logs={logs} />
        </div>
        <div style={styles.sideCol}>
          <div style={styles.card}>
            <h3 style={styles.cardHeading}>Company</h3>
            <label style={styles.label}>Select Company</label>
            <select
              style={styles.select}
              value={companyIndex}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setCompanyIndex(idx);
                setCompanyAddress(COMPANIES[idx].address);
              }}
            >
              {COMPANIES.map((c, idx) => (
                <option key={c.name} value={idx}>
                  {c.name}
                </option>
              ))}
            </select>
            <label style={styles.label}>Company Wallet</label>
            <input
              style={styles.input}
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <CollateralPanel
            defaultUser={companyAddress}
            agentEnabled={status?.agentEnabled || false}
            snapshot={status?.snapshot || null}
          />
          <PaymentRequestForm defaultUser={companyAddress} />
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
  card: {
    background: "var(--card)",
    borderRadius: 14,
    padding: 20,
    color: "var(--text)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(6px)",
    animation: "fadeUp 0.6s ease both",
  },
  cardHeading: {
    margin: "0 0 12px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  label: {
    fontSize: 12,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
  },
};