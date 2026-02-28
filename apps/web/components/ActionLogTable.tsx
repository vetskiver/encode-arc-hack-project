import React from "react";
import { ActionLog } from "../lib/types";

interface Props {
  logs: ActionLog[];
}


export default function ActionLogTable({ logs }: Props) {
  return (
    <div style={{ ...styles.card, animationDelay: "0.2s" }}>
      <h3 style={styles.heading}>Action Log</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>Amount (USDC)</th>
              <th style={styles.th}>HF</th>
              <th style={styles.th}>Policy Rule</th>
              <th style={styles.th}>Trigger</th>
              <th style={styles.th}>Rationale</th>
              <th style={styles.th}>Refs</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} style={styles.empty}>
                  No actions yet
                </td>
              </tr>
            )}
            {logs.map((log, i) => {
              const hfBefore = log.hfBefore ?? log.healthFactor;
              const hfAfter = log.hfAfter;
              const hfDisplay = hfBefore >= 100 ? "∞" : hfBefore.toFixed(2);
              const hfDelta = hfAfter !== undefined && hfAfter < 100
                ? ` -> ${hfAfter.toFixed(2)}`
                : "";

              return (
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
                            ? "var(--accent)"
                            : log.action === "repay"
                            ? "var(--success)"
                            : log.action === "payment"
                            ? "var(--warning)"
                            : log.action === "BLOCKED"
                            ? "var(--danger)"
                            : log.action === "rebalance"
                            ? "var(--accent-2)"
                            : log.action === "resetUser"
                            ? "var(--danger)"
                            : "var(--muted-strong)",
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td style={styles.td}>{parseFloat(log.amountUSDC).toLocaleString()}</td>
                  <td style={styles.td}>
                    {hfDisplay}{hfDelta}
                  </td>
                  <td style={styles.tdRule}>
                    {log.policyRule ? (
                      <span style={styles.ruleBadge}>{log.policyRule}</span>
                    ) : "—"}
                  </td>
                  <td style={styles.tdTrigger}>{log.trigger || "—"}</td>
                  <td style={styles.tdRationale}>{log.rationale}</td>
                  <td style={styles.tdMono}>
                    {log.circleTxRef ? log.circleTxRef.slice(0, 10) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  heading: {
    margin: "0 0 12px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
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
    borderBottom: "1px solid var(--border)",
    color: "var(--muted)",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    verticalAlign: "top" as const,
  },
  tdRationale: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    maxWidth: 300,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: 12,
    color: "var(--muted)",
  },
  tdMono: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--muted)",
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "var(--muted)",
  },
  actionBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    color: "#061018",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
  },
  tdRule: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    fontSize: 11,
  },
  ruleBadge: {
    display: "inline-block",
    padding: "2px 6px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 600,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    color: "#818cf8",
    border: "1px solid rgba(99, 102, 241, 0.3)",
  },
  tdTrigger: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: 11,
    color: "var(--muted)",
  },
};
