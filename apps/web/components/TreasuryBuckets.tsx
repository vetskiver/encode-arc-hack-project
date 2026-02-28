import React from "react";
import { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot | null;
}

export default function TreasuryBuckets({ snapshot }: Props) {
  const liquidity = snapshot ? parseFloat(snapshot.liquidityUSDC) : 0;
  const reserve = snapshot ? parseFloat(snapshot.reserveUSDC) : 0;
  const yieldBal = snapshot ? parseFloat(snapshot.yieldUSDC || "0") : 0;

  return (
    <div style={{ ...styles.card, animationDelay: "0.1s" }}>
      <h3 style={styles.heading}>Treasury Buckets</h3>
      <div style={styles.grid}>
        <div style={styles.bucket}>
          <div style={styles.bucketName}>Liquidity</div>
          <div style={styles.bucketValue}>${liquidity.toLocaleString()}</div>
          <div style={styles.bucketSub}>Payments & operations</div>
        </div>
        <div style={styles.bucket}>
          <div style={styles.bucketName}>Reserve</div>
          <div style={styles.bucketValue}>${reserve.toLocaleString()}</div>
          <div style={styles.bucketSub}>Repay buffer</div>
        </div>
        <div style={styles.bucket}>
          <div style={styles.bucketName}>Yield</div>
          <div style={styles.bucketValue}>${yieldBal.toLocaleString()}</div>
          <div style={styles.bucketSub}>Yield allocation</div>
        </div>
        <div style={styles.bucket}>
          <div style={styles.bucketName}>Credit Facility</div>
          <div style={styles.bucketValue}>—</div>
          <div style={styles.bucketSub}>Borrow source / repay sink</div>
        </div>
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
    margin: "0 0 16px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  bucket: {
    backgroundColor: "var(--surface)",
    borderRadius: 12,
    padding: 16,
    textAlign: "center" as const,
    border: "1px solid var(--border)",
  },
  bucketName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 8,
  },
  bucketValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text)",
    marginBottom: 4,
  },
  bucketSub: {
    fontSize: 11,
    color: "var(--muted)",
  },
};
