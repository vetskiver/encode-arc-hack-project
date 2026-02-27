import React, { useEffect, useState } from "react";
import { StatusResponse } from "../lib/types";

interface Props {
  status: StatusResponse | null;
}

export default function HeaderStatusBar({ status }: Props) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!status?.nextTickAt) {
      setCountdown("");
      return;
    }
    const id = setInterval(() => {
      const remaining = Math.max(0, status.nextTickAt - Date.now());
      setCountdown(`${(remaining / 1000).toFixed(0)}s`);
    }, 500);
    return () => clearInterval(id);
  }, [status?.nextTickAt]);

  const statusColor =
    status?.status === "Risk Mode"
      ? "#ef4444"
      : status?.status === "Executing"
      ? "#f59e0b"
      : "#22c55e";

  return (
    <div style={styles.bar}>
      <div style={styles.title}>RWA Credit Guardian</div>
      <div style={styles.statusGroup}>
        <div
          style={{
            ...styles.statusBadge,
            backgroundColor: statusColor,
          }}
        >
          {status?.status || "Offline"}
        </div>
        {status?.agentEnabled && countdown && (
          <span style={styles.countdown}>Next tick: {countdown}</span>
        )}
      </div>
      <div style={styles.reason}>{status?.lastReason || "—"}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 20px",
    backgroundColor: "#1e1e2e",
    color: "#fff",
    borderBottom: "1px solid #333",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  statusGroup: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    padding: "4px 12px",
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
  },
  countdown: {
    fontSize: 13,
    color: "#aaa",
  },
  reason: {
    flex: 1,
    textAlign: "right" as const,
    fontSize: 13,
    color: "#aaa",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
