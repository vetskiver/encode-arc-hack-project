import React from "react";
import { Snapshot } from "../lib/types";

interface Props {
  snapshot: Snapshot | null;
}


export default function TreasuryBuckets({ snapshot }: Props) {
  const liquidity = snapshot ? parseFloat(snapshot.liquidityUSDC) : 0;
  const reserve = snapshot ? parseFloat(snapshot.reserveUSDC) : 0;
  const debt = snapshot ? parseFloat(snapshot.debtUSDC) : 0;
  const hasDebt = debt > 0;
  const liquidityRatio = snapshot?.liquidityRatio ? parseFloat(snapshot.liquidityRatio) : 0;
  const reserveRatio = snapshot?.reserveRatio ? parseFloat(snapshot.reserveRatio) : 0;
  const liquidityTarget = snapshot?.liquidityTargetRatio ?? 0.25;
  const reserveTarget = snapshot?.reserveRatioTarget ?? 0.3;

  // V2: Determine if ratios are below target for visual indicators
  const liquidityBelowTarget = liquidityRatio < liquidityTarget;
  const reserveBelowTarget = reserveRatio < reserveTarget;
  const liquidityHealthy = liquidityRatio >= liquidityTarget;
  const reserveHealthy = reserveRatio >= reserveTarget;

  const fmt = (n: number) =>
    "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  // V2: Progress bar helper
  const ratioBar = (current: number, target: number) => {
    const pct = Math.min(100, (current / Math.max(target, 0.01)) * 100);
    const color = current >= target ? "#10b981" : current >= target * 0.5 ? "#f59e0b" : "#ef4444";
    return (
      <div style={styles.barContainer}>
        <div style={{ ...styles.barFill, width: `${pct}%`, backgroundColor: color }} />
      </div>
    );
  };

  return (
    <div style={{ ...styles.card, animationDelay: "0.1s" }}>
      <h3 style={styles.heading}>Treasury Vaults</h3>
      <div style={styles.grid}>
        <Bucket
          name="Liquidity Vault"
          value={snapshot ? fmt(liquidity) : "---"}
          sub={`${(liquidityRatio * 100).toFixed(1)}% of total`}
          target={`Target ${(liquidityTarget * 100).toFixed(0)}%`}
          ratioBar={snapshot ? ratioBar(liquidityRatio, liquidityTarget) : null}
          highlight={liquidityBelowTarget}
          healthy={liquidityHealthy}
        />
        <Bucket
          name="Reserve Vault"
          value={snapshot ? fmt(reserve) : "---"}
          sub={`${(reserveRatio * 100).toFixed(1)}% of total`}
          target={`Target ${(reserveTarget * 100).toFixed(0)}%`}
          ratioBar={snapshot ? ratioBar(reserveRatio, reserveTarget) : null}
          highlight={reserveBelowTarget}
          healthy={reserveHealthy}
        />
        <Bucket
          name="Credit Facility"
          value={snapshot ? fmt(debt) : "---"}
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
  target,
  ratioBar,
  valueStyle,
  highlight,
  healthy,
}: {
  name: string;
  value: string;
  sub: string;
  target?: string;
  ratioBar?: React.ReactNode;
  valueStyle?: React.CSSProperties;
  highlight?: boolean;
  healthy?: boolean;
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
          : healthy
          ? {
              borderColor: "rgba(16,185,129,0.3)",
              backgroundColor: "rgba(16,185,129,0.04)",
            }
          : {}),
      }}
    >
      <div style={styles.bucketName}>{name}</div>
      <div style={{ ...styles.bucketValue, ...valueStyle }}>{value}</div>
      <div style={styles.bucketSub}>{sub}</div>
      {ratioBar}
      {target && <div style={styles.bucketTarget}>{target}</div>}
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
    marginBottom: 6,
  },
  bucketTarget: {
    fontSize: 10,
    color: "var(--muted)",
    fontWeight: 600,
    marginTop: 4,
  },
  barContainer: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.5s ease, background-color 0.3s",
  },
};
