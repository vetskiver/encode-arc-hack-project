import React from "react";
import { ActionLog } from "../lib/types";

interface Props {
  logs: ActionLog[];
}

export default function ActionLogTable({ logs }: Props) {
  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Action Log</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>Amount (USDC)</th>
              <th style={styles.th}>HF</th>
              <th style={styles.th}>Rationale</th>
              <th style={styles.th}>Circle Ref</th>
              <th style={styles.th}>Arc Tx</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} style={styles.empty}>
                  No actions yet
                </td>
              </tr>
            )}
            {logs.map((log, i) => (
              <tr key={i}>
                <td style={styles.td}>
                  {new Date(log.ts).toLocaleTimeString()}
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.actionBadge,
                      backgroundColor:
                        log.action === "borrow"
                          ? "#3b82f6"
                          : log.action === "repay"
                          ? "#22c55e"
                          : log.action === "payment"
                          ? "#f59e0b"
                          : log.action === "BLOCKED"
                          ? "#ef4444"
                          : "#6366f1",
                    }}
                  >
                    {log.action}
                  </span>
                </td>
                <td style={styles.td}>{parseFloat(log.amountUSDC).toLocaleString()}</td>
                <td style={styles.td}>
                  {log.healthFactor >= 100 ? "∞" : log.healthFactor.toFixed(2)}
                </td>
                <td style={styles.tdRationale}>{log.rationale}</td>
                <td style={styles.tdMono}>
                  {log.circleTxRef ? log.circleTxRef.slice(0, 12) + "..." : "—"}
                </td>
                <td style={styles.tdMono}>
                  {log.arcTxHash ? log.arcTxHash.slice(0, 12) + "..." : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#1e1e2e",
    borderRadius: 8,
    padding: 20,
    color: "#fff",
  },
  heading: {
    margin: "0 0 12px 0",
    fontSize: 16,
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: "auto" as const,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left" as const,
    padding: "8px 10px",
    borderBottom: "1px solid #333",
    color: "#888",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid #2a2a3e",
    verticalAlign: "top" as const,
  },
  tdRationale: {
    padding: "8px 10px",
    borderBottom: "1px solid #2a2a3e",
    maxWidth: 300,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: 12,
    color: "#aaa",
  },
  tdMono: {
    padding: "8px 10px",
    borderBottom: "1px solid #2a2a3e",
    fontFamily: "monospace",
    fontSize: 11,
    color: "#888",
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#555",
  },
  actionBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
};
