import React from "react";
import { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot | null;
}

export default function RiskOverview({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div style={styles.card}>
        <h3 style={styles.heading}>Risk Overview</h3>
        <p style={styles.muted}>No data yet. Run the agent or wait for a tick.</p>
      </div>
    );
  }

  const hf = snapshot.healthFactor;
  const hfColor = hf >= 1.5 ? "#22c55e" : hf >= 1.2 ? "#f59e0b" : "#ef4444";
  const hfLabel = hf >= 1.5 ? "SAFE" : hf >= 1.2 ? "WARN" : "DANGER";

  const debtNum = parseFloat(snapshot.debtUSDC);
  const maxBorrowNum = parseFloat(snapshot.maxBorrowUSDC);
  const availableBorrow = Math.max(0, maxBorrowNum - debtNum);

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Risk Overview</h3>
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
          <span style={styles.label}>Collateral</span>
          <span style={styles.value}>{parseFloat(snapshot.collateralAmount).toLocaleString()} units</span>
          <span style={styles.sub}>Value: ${parseFloat(snapshot.collateralValueUSDC).toLocaleString()}</span>
        </div>
        <div style={styles.metric}>
          <span style={styles.label}>Debt (USDC)</span>
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
          Pending Payment: ${snapshot.pendingPayment.amountUSDC} to{" "}
          {snapshot.pendingPayment.to}
        </div>
      )}
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
    margin: "0 0 16px 0",
    fontSize: 16,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
  },
  metric: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase" as const,
  },
  value: {
    fontSize: 20,
    fontWeight: 700,
  },
  sub: {
    fontSize: 12,
    color: "#666",
  },
  muted: {
    color: "#666",
    fontSize: 14,
  },
  pending: {
    marginTop: 16,
    padding: "8px 12px",
    backgroundColor: "#332a00",
    borderRadius: 6,
    fontSize: 13,
    color: "#f59e0b",
  },
};
