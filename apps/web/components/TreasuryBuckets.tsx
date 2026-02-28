import React from "react";
import { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot | null;
}

export default function TreasuryBuckets({ snapshot }: Props) {
  const liquidity = snapshot ? parseFloat(snapshot.liquidityUSDC) : 0;
  const reserve = snapshot ? parseFloat(snapshot.reserveUSDC) : 0;
  const yieldBal = snapshot ? parseFloat(snapshot.yieldUSDC || "0") : 0;
  const debt = snapshot ? parseFloat(snapshot.debtUSDC) : 0;
  const hasDebt = debt > 0;

  const fmt = (n: number) =>
    "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div style={{ ...styles.card, animationDelay: "0.1s" }}>
      <h3 style={styles.heading}>Treasury Buckets</h3>
      <div style={styles.grid}>
        <Bucket
          name="Liquidity"
          value={snapshot ? fmt(liquidity) : "—"}
          sub="Payments & operations"
        />
        <Bucket
          name="Reserve"
          value={snapshot ? fmt(reserve) : "—"}
          sub="Repay buffer"
        />
        <Bucket
          name="Yield"
          value={snapshot ? fmt(yieldBal) : "—"}
          sub="Yield allocation"
        />
        <Bucket
          name="Credit Facility"
          value={snapshot ? fmt(debt) : "—"}
          sub={hasDebt ? "Outstanding debt" : "No active debt"}
          valueStyle={hasDebt ? { color: "#f87171" } : { color: "var(--success)" }}
          highlight={hasDebt}
        />
      </div>
    </div>
  );
}

function Bucket({
  name,
  value,
  sub,
  valueStyle,
  highlight,
}: {
  name: string;
  value: string;
  sub: string;
  valueStyle?: React.CSSProperties;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        ...styles.bucket,
        ...(highlight
          ? {
              borderColor: "rgba(248,113,113,0.3)",
              backgroundColor: "rgba(248,113,113,0.06)",
            }
          : {}),
      }}
    >
      <div style={styles.bucketName}>{name}</div>
      <div style={{ ...styles.bucketValue, ...valueStyle }}>{value}</div>
      <div style={styles.bucketSub}>{sub}</div>
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
    transition: "border-color 0.3s, background-color 0.3s",
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
    transition: "color 0.3s",
  },
  bucketSub: {
    fontSize: 11,
    color: "var(--muted)",
  },
};