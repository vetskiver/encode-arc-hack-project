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
const DEFAULT_USER = "0x0000000000000000000000000000000000000001";

export default function Home() {
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
          <RiskOverview snapshot={status?.snapshot || null} />
          <TreasuryBuckets snapshot={status?.snapshot || null} />
          <ActionLogTable logs={logs} />
        </div>
        <div style={styles.sideCol}>
          <CollateralPanel
            defaultUser={DEFAULT_USER}
            agentEnabled={status?.agentEnabled || false}
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
    backgroundColor: "#121220",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#fff",
  },
  error: {
    padding: "10px 20px",
    backgroundColor: "#7f1d1d",
    color: "#fca5a5",
    fontSize: 13,
  },
  content: {
    display: "flex",
    gap: 16,
    padding: 20,
    maxWidth: 1400,
    margin: "0 auto",
  },
  mainCol: {
    flex: 2,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  sideCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
};
