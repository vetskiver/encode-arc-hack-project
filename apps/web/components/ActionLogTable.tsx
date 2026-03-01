import React, { useState } from "react";
import { ActionLog } from "../lib/types";
import { fmtUSD } from "../lib/format";

const ARC_EXPLORER = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://explorer.testnet.arc.network";

/** Returns true if the hash looks like a real on-chain tx (0x + 64 hex chars) */
function isRealTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

interface Props {
  logs: ActionLog[];
}

export default function ActionLogTable({ logs }: Props) {
  const [expandedTx, setExpandedTx] = useState<number | null>(null);

  return (
    <div style={{ ...styles.card, animationDelay: "0.2s" }}>
      <h3 style={styles.heading}>Action Log</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>Amount (Scaled)</th>
              <th style={styles.th}>HF</th>
              <th style={styles.th}>Policy Rule</th>
              <th style={styles.th}>Trigger</th>
              <th style={styles.th}>Rationale</th>
              <th style={styles.th}>Tx Proof</th>
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
              const hfDisplay = hfBefore >= 100 ? "\u221E" : hfBefore.toFixed(2);
              const hfDelta = hfAfter !== undefined && hfAfter < 100
                ? ` \u2192 ${hfAfter.toFixed(2)}`
                : "";
              const hfColor = hfAfter !== undefined
                ? (hfAfter > hfBefore ? "#10b981" : hfAfter < hfBefore ? "#ef4444" : "inherit")
                : "inherit";

              const isExpanded = expandedTx === i;
              const hasCircle = log.circleTxRef && log.circleTxRef !== "";
              const hasArc = log.arcTxHash && log.arcTxHash !== "";

              return (
                <React.Fragment key={i}>
                  <tr>
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
                    <td style={styles.td}>{fmtUSD(parseFloat(log.amountUSDC))}</td>
                    <td style={{ ...styles.td, color: hfColor }}>
                      {hfDisplay}{hfDelta}
                    </td>
                    <td style={styles.tdRule}>
                      {log.policyRule ? (
                        <span style={styles.ruleBadge}>{log.policyRule}</span>
                      ) : "\u2014"}
                    </td>
                    <td style={styles.tdTrigger}>{log.trigger || "\u2014"}</td>
                    <td style={styles.tdRationale}>{log.rationale}</td>
                    <td style={styles.tdProof}>
                      {(hasCircle || hasArc) ? (
                        <button
                          style={styles.proofBtn}
                          onClick={() => setExpandedTx(isExpanded ? null : i)}
                        >
                          {isExpanded ? "Hide" : "View"}
                        </button>
                      ) : "\u2014"}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} style={styles.proofRow}>
                        <div style={styles.proofContent}>
                          {hasCircle && (
                            <div style={styles.proofItem}>
                              <span style={styles.proofLabel}>Circle TX:</span>
                              <code style={styles.proofCode}>{log.circleTxRef}</code>
                            </div>
                          )}
                          {hasArc && (
                            <div style={styles.proofItem}>
                              <span style={styles.proofLabel}>Arc TX:</span>
                              {isRealTxHash(log.arcTxHash) ? (
                                <a
                                  href={`${ARC_EXPLORER}/tx/${log.arcTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={styles.proofLink}
                                  title="Verify on Arc block explorer"
                                >
                                  <code style={styles.proofCode}>{log.arcTxHash.slice(0, 18)}…</code>
                                  <span style={styles.verifyBadge}>Verify ↗</span>
                                </a>
                              ) : (
                                <code style={{ ...styles.proofCode, opacity: 0.5 }}>{log.arcTxHash}</code>
                              )}
                            </div>
                          )}
                          {log.companyId && (
                            <div style={styles.proofItem}>
                              <span style={styles.proofLabel}>Company:</span>
                              <span>{log.companyId}</span>
                            </div>
                          )}
                          {log.fromBucket && (
                            <div style={styles.proofItem}>
                              <span style={styles.proofLabel}>From:</span>
                              <span>{log.fromBucket}</span>
                              <span style={styles.proofLabel}>To:</span>
                              <span>{log.toBucket}</span>
                            </div>
                          )}
                          {log.liquidityBefore !== undefined && (
                            <div style={styles.proofItem}>
                              <span style={styles.proofLabel}>Liquidity:</span>
                              <span>${log.liquidityBefore?.toFixed(2)} {"\u2192"} ${log.liquidityAfter?.toFixed(2)}</span>
                              <span style={styles.proofLabel}>Reserve:</span>
                              <span>${log.reserveBefore?.toFixed(2)} {"\u2192"} ${log.reserveAfter?.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
  tdProof: {
    padding: "8px 10px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
  },
  proofBtn: {
    background: "rgba(99, 102, 241, 0.12)",
    color: "#818cf8",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    borderRadius: 6,
    padding: "2px 10px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  proofRow: {
    padding: 0,
    borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
  },
  proofContent: {
    padding: "10px 16px",
    background: "rgba(99, 102, 241, 0.04)",
    borderTop: "1px solid rgba(99, 102, 241, 0.1)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  proofItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    flexWrap: "wrap" as const,
  },
  proofLabel: {
    fontWeight: 700,
    color: "var(--muted)",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  proofCode: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "#818cf8",
    background: "rgba(99, 102, 241, 0.08)",
    padding: "2px 6px",
    borderRadius: 4,
    wordBreak: "break-all" as const,
  },
  proofLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    textDecoration: "none",
    color: "inherit",
  },
  verifyBadge: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    color: "#10b981",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    flexShrink: 0,
  },
};
