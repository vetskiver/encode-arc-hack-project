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

  const agentStatus = status?.status || "Offline";

  const statusColor =
    agentStatus === "Risk Mode"
      ? "var(--danger)"
      : agentStatus === "Executing"
      ? "var(--warning)"
      : agentStatus === "Offline"
      ? "var(--muted)"
      : "var(--success)";

  // Prefix icon for lastReason based on content
  const reason = status?.lastReason || "";
  const reasonIcon = reason.startsWith("Blocked")
    ? "🛑"
    : reason.startsWith("Risk")
    ? "⚠️"
    : reason.startsWith("Error")
    ? "❌"
    : reason.startsWith("Executed")
    ? "✅"
    : "💬";

  return (
    <div style={styles.bar}>
      {/* Left: title */}
      <div style={styles.title}>Treasury Credit Guardian</div>

      {/* Center: status badge + countdown */}
      <div style={styles.statusGroup}>
        <span style={{ ...styles.dot, background: statusColor }} />
        <div style={{ ...styles.statusBadge, color: statusColor }}>
          {agentStatus}
        </div>
        {status?.agentEnabled && countdown && (
          <span style={styles.countdown}>· Next tick: {countdown}</span>
        )}
      </div>

      {/* Right: lastReason — now prominent with icon and full text on hover */}
      <div style={styles.reasonWrap} title={reason}>
        {reason ? (
          <>
            <span style={styles.reasonIcon}>{reasonIcon}</span>
            <span style={styles.reasonText}>{reason}</span>
          </>
        ) : (
          <span style={styles.reasonEmpty}>Agent not started</span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    padding: "10px 20px",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    backdropFilter: "blur(8px)",
    boxShadow: "0 4px 20px rgba(2, 6, 23, 0.4)",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  statusGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  countdown: {
    fontSize: 13,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
  },
  reasonWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    padding: "5px 12px",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    border: "1px solid var(--border)",
    cursor: "default",
  },
  reasonIcon: {
    fontSize: 13,
    flexShrink: 0,
  },
  reasonText: {
    fontSize: 13,
    color: "var(--text)",
    opacity: 0.75,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    minWidth: 0,
  },
  reasonEmpty: {
    fontSize: 13,
    color: "var(--muted)",
    fontStyle: "italic",
  },
};
