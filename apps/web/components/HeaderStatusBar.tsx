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
      ? "var(--danger)"
      : status?.status === "Executing"
      ? "var(--warning)"
      : "var(--success)";

  return (
    <div style={styles.bar}>
      <div style={styles.title}>Treasury Credit Guardian</div>
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
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 10px 30px rgba(2, 6, 23, 0.35)",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.4,
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
    color: "#061018",
  },
  countdown: {
    fontSize: 13,
    color: "var(--muted)",
  },
  reason: {
    flex: 1,
    textAlign: "right" as const,
    fontSize: 13,
    color: "var(--muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
