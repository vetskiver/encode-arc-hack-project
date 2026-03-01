import React from "react";
import { Snapshot } from "../lib/types";
import { fmtUSD } from "../lib/format";

interface Props {
  snapshot: Snapshot | null;
  lastReason?: string;
  status?: string;
}

export default function DecisionReasoningPanel({ snapshot, lastReason, status }: Props) {
  if (!snapshot) return null;

  const oraclePrice = snapshot.oraclePrice;
  const changePct = snapshot.changePct;
  const collValue = parseFloat(snapshot.collateralValueUSDC);
  const maxBorrow = parseFloat(snapshot.maxBorrowUSDC);
  const debt = parseFloat(snapshot.debtUSDC);
  const hf = snapshot.healthFactor;
  const volatility = snapshot.volatilityPct ? parseFloat(snapshot.volatilityPct) : Math.abs(changePct);
  const volThreshold = snapshot.volatilityThreshold ?? 3;
  const targetHF = snapshot.targetHealth ?? 1.6;
  const policy = snapshot.companyPolicy;
  const minHF = policy ? policy.minHealthBps / 10000 : 1.4;
  const emergHF = policy ? policy.emergencyHealthBps / 10000 : 1.2;
  const ltvPct = policy ? (policy.ltvBps / 100) : 60;

  const isEmergency = hf < emergHF && hf < 99;
  const isWarning = hf < minHF && hf >= emergHF;
  const isVolatile = volatility > volThreshold;
  const isSafe = hf >= minHF || hf >= 99;

  const fmt = (n: number) => fmtUSD(n);

  // Determine what the agent did/will do
  let actionLabel = "MONITOR";
  let actionColor = "#10b981";
  if (isEmergency) {
    actionLabel = "EMERGENCY REPAY";
    actionColor = "#ef4444";
  } else if (isWarning) {
    actionLabel = "RISK REPAY";
    actionColor = "#f59e0b";
  } else if (isVolatile) {
    actionLabel = "VOLATILITY TIGHTENING";
    actionColor = "#f59e0b";
  }

  const statusIcon = status === "Risk Mode" ? "\u26A0\uFE0F"
    : status === "Executing" ? "\u26A1"
    : "\u2705";

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h3 style={styles.heading}>Agent Decision Chain</h3>
        <span style={{ ...styles.actionBadge, color: actionColor, borderColor: actionColor + "55", backgroundColor: actionColor + "15" }}>
          {actionLabel}
        </span>
      </div>

      <div style={styles.chain}>
        <ChainStep
          label="Oracle"
          value={`$${oraclePrice.toFixed(4)}`}
          sub={`${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% change`}
          color={Math.abs(changePct) > volThreshold ? "#f59e0b" : "#10b981"}
        />
        <Arrow />
        <ChainStep
          label="Collateral Value"
          value={fmt(collValue)}
          sub={`LTV: ${ltvPct}%`}
          color="#94a3b8"
        />
        <Arrow />
        <ChainStep
          label="Max Borrow"
          value={fmt(maxBorrow)}
          sub={`Available: ${fmt(Math.max(0, maxBorrow - debt))}`}
          color="#94a3b8"
        />
        <Arrow />
        <ChainStep
          label="Health Factor"
          value={hf >= 99 ? "\u221E" : hf.toFixed(2)}
          sub={`Min: ${minHF.toFixed(2)} | Emerg: ${emergHF.toFixed(2)}`}
          color={isEmergency ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981"}
        />
        <Arrow />
        <ChainStep
          label="Action"
          value={actionLabel}
          sub={status || "—"}
          color={actionColor}
          highlight
        />
      </div>

      {/* Signal indicators */}
      <div style={styles.signals}>
        <Signal label="Volatility" value={`${volatility.toFixed(2)}%`} threshold={`${volThreshold}%`} triggered={isVolatile} />
        <Signal label="Health Factor" value={hf >= 99 ? "\u221E" : hf.toFixed(2)} threshold={minHF.toFixed(2)} triggered={isWarning || isEmergency} />
        <Signal label="Oracle" value={snapshot.oracleSource === "stork" ? "Stork Live" : "Simulated"} threshold="Live" triggered={snapshot.oracleSource !== "stork"} />
        {policy && <Signal label="Risk Profile" value={policy.riskProfile} threshold="" triggered={false} />}
      </div>

      {/* Last reason */}
      {lastReason && (
        <div style={styles.reasonBox}>
          <span style={styles.reasonIcon}>{statusIcon}</span>
          <span style={styles.reasonText}>{lastReason}</span>
        </div>
      )}
    </div>
  );
}

function ChainStep({ label, value, sub, color, highlight }: {
  label: string; value: string; sub: string; color: string; highlight?: boolean;
}) {
  return (
    <div style={{
      ...styles.step,
      ...(highlight ? { borderColor: color + "55", backgroundColor: color + "0D" } : {}),
    }}>
      <span style={styles.stepLabel}>{label}</span>
      <span style={{ ...styles.stepValue, color }}>{value}</span>
      <span style={styles.stepSub}>{sub}</span>
    </div>
  );
}

function Arrow() {
  return <span style={styles.arrow}>{"\u2192"}</span>;
}

function Signal({ label, value, threshold, triggered }: {
  label: string; value: string; threshold: string; triggered: boolean;
}) {
  return (
    <div style={{
      ...styles.signal,
      borderColor: triggered ? "rgba(239,68,68,0.35)" : "rgba(148,163,184,0.12)",
      backgroundColor: triggered ? "rgba(239,68,68,0.06)" : "transparent",
    }}>
      <span style={styles.signalDot}>
        <span style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: triggered ? "#ef4444" : "#10b981",
        }} />
      </span>
      <span style={styles.signalLabel}>{label}</span>
      <span style={styles.signalValue}>{value}</span>
      {threshold && <span style={styles.signalThreshold}>/ {threshold}</span>}
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
    animationDelay: "0.08s",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  actionBadge: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    padding: "4px 12px",
    borderRadius: 8,
    border: "1px solid",
    textTransform: "uppercase" as const,
  },
  chain: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    overflowX: "auto" as const,
    paddingBottom: 8,
  },
  step: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.15)",
    minWidth: 100,
    textAlign: "center" as const,
    transition: "border-color 0.3s, background-color 0.3s",
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    color: "var(--muted)",
  },
  stepValue: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.15,
    fontVariantNumeric: "tabular-nums",
    transition: "color 0.3s ease",
  },
  stepSub: {
    fontSize: 10,
    color: "var(--muted)",
    opacity: 0.8,
  },
  arrow: {
    fontSize: 16,
    color: "var(--muted)",
    opacity: 0.4,
    flexShrink: 0,
  },
  signals: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap" as const,
  },
  signal: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 8,
    border: "1px solid",
    fontSize: 11,
    transition: "border-color 0.3s, background-color 0.3s",
  },
  signalDot: { flexShrink: 0 },
  signalLabel: { fontWeight: 600, color: "var(--muted)" },
  signalValue: { fontWeight: 700 },
  signalThreshold: { color: "var(--muted)", opacity: 0.6 },
  reasonBox: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 10,
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(148,163,184,0.12)",
  },
  reasonIcon: { fontSize: 14, flexShrink: 0 },
  reasonText: { fontSize: 12, lineHeight: 1.4, color: "var(--text)", opacity: 0.8 },
};
