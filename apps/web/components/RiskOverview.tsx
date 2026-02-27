import React from "react";
import { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot | null;
}

function formatCollateralUnits(raw: string, decimals: number): string {
  try {
    const value = BigInt(raw);
    const base = 10n ** 18n;
    const whole = value / base;
    const frac = value % base;
    if (decimals <= 0) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
    return `${whole.toString()}.${fracStr}`;
  } catch {
    return raw;
  }
}

export default function RiskOverview({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div style={{ ...styles.card, animationDelay: "0.05s" }}>
        <h3 style={styles.heading}>Treasury Risk Overview</h3>
        <p style={styles.muted}>No data yet. Run the agent or wait for a tick.</p>
      </div>
    );
  }

  const hf = snapshot.healthFactor;
  const hfColor =
    hf >= 1.5 ? "var(--success)" : hf >= 1.2 ? "var(--warning)" : "var(--danger)";
  const hfLabel = hf >= 1.5 ? "SAFE" : hf >= 1.2 ? "WARN" : "DANGER";

  const debtNum = parseFloat(snapshot.debtUSDC);
  const maxBorrowNum = parseFloat(snapshot.maxBorrowUSDC);
  const availableBorrow = Math.max(0, maxBorrowNum - debtNum);
  const collateralUnits = formatCollateralUnits(snapshot.collateralAmount, 2);

  return (
    <div style={{ ...styles.card, animationDelay: "0.05s" }}>
      <h3 style={styles.heading}>Treasury Risk Overview</h3>
      <div style={styles.grid}>
        <div style={styles.metric}>
          <span style={styles.label}>Oracle Price</span>
          <span style={styles.value}>${snapshot.oraclePrice.toFixed(2)}</span>
          <span style={styles.sub}>
            Updated: {new Date(snapshot.oracleTs).toLocaleTimeString()}
            {" | "}
            Change: {snapshot.changePct.toFixed(2)}%
          </span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>Health Factor</span>
          <span style={{ ...styles.value, color: hfColor, fontSize: 28 }}>
            {hf >= 100 ? "∞" : hf.toFixed(2)}
          </span>
          <span style={{ ...styles.sub, color: hfColor }}>{hfLabel}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>RWA Collateral</span>
          <span style={styles.value}>{collateralUnits} units</span>
          <span style={styles.sub}>
            Value: ${parseFloat(snapshot.collateralValueUSDC).toLocaleString()}
          </span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>Credit Line Debt</span>
          <span style={styles.value}>${debtNum.toLocaleString()}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>Max Borrow</span>
          <span style={styles.value}>${maxBorrowNum.toLocaleString()}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>Available Borrow</span>
          <span style={styles.value}>${availableBorrow.toLocaleString()}</span>
        </div>
      </div>
      {snapshot.pendingPayment && (
        <div style={styles.pending}>
          Pending Vendor Payment: ${snapshot.pendingPayment.amountUSDC} to{" "}
          {snapshot.pendingPayment.to}
        </div>
      )}
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
    margin: "0 0 16px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  metric: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
  },
  value: {
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  sub: {
    fontSize: 12,
    color: "var(--muted)",
  },
  muted: {
    color: "var(--muted)",
    fontSize: 14,
  },
  pending: {
    marginTop: 16,
    padding: "8px 12px",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--warning)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
  },
};
