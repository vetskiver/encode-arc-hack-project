import React from "react";
import { Snapshot } from "../lib/types";
import HealthFactorGauge from "./HealthFactorGauge";

interface Props {
  snapshot: Snapshot | null;
  minHealthBps?: number;
  emergencyHealthBps?: number;
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

export default function RiskOverview({
  snapshot,
  minHealthBps = 14000,
  emergencyHealthBps = 12000,
}: Props) {
  if (!snapshot) {
    return (
      <div style={styles.card}>
        <h3 style={styles.heading}>Treasury Risk Overview</h3>
        <p style={styles.muted}>No data yet. Run the agent or wait for a tick.</p>
      </div>
    );
  } 

  const isStale = Date.now() - snapshot.oracleTs > 60_000;
  const debtNum = parseFloat(snapshot.debtUSDC);
  const maxBorrowNum = parseFloat(snapshot.maxBorrowUSDC);
  const availableBorrow = Math.max(0, maxBorrowNum - debtNum);
  const collateralUnits = formatCollateralUnits(snapshot.collateralAmount, 2);
  const collateralValueNum = parseFloat(snapshot.collateralValueUSDC);
  const sourceLabel = snapshot.oracleSource === "stork" ? "Stork" : "Simulated";
  const changePctColor = snapshot.changePct >= 0 ? "#10b981" : "#ef4444";

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Treasury Risk Overview</h3>

      <div style={styles.layout}>
        {/* Left: gauge */}
        <div style={styles.gaugeCol}>
          <HealthFactorGauge
            healthFactor={snapshot.healthFactor}
            minHealthBps={minHealthBps}
            emergencyHealthBps={emergencyHealthBps}
          />
        </div>

        {/* Right: metrics grid */}
        <div style={styles.metricsGrid}>
          <Metric
            label="Oracle Price"
            value={`$${snapshot.oraclePrice.toFixed(2)}`}
            sub={
              <>
                <span style={{ color: changePctColor }}>
                  {snapshot.changePct >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(snapshot.changePct).toFixed(2)}%
                </span>
                {" · "}
                {new Date(snapshot.oracleTs).toLocaleTimeString()}
                {" · "}
                {sourceLabel}
                {isStale && (
                  <span style={styles.staleBadge}>⚠ STALE</span>
                )}
              </>
            }
          />
          <Metric
            label="Collateral"
            value={`${collateralUnits} units`}
            sub={`Value: $${fmt(collateralValueNum)}`}
          />
          <Metric
            label="Debt (USDC)"
            value={`$${fmt(debtNum)}`}
          />
          <Metric
            label="Max Borrow"
            value={`$${fmt(maxBorrowNum)}`}
            sub={`$${fmt(availableBorrow)} available`}
          />
          <Metric
            label="Liquidity"
            value={`$${fmt(parseFloat(snapshot.liquidityUSDC))}`}
            sub="Payments & operations"
          />
          <Metric
            label="Reserve"
            value={`$${fmt(parseFloat(snapshot.reserveUSDC))}`}
            sub="Repay buffer"
          />
        </div>
      </div>

      {snapshot.pendingPayment && (
        <div style={styles.pending}>
          ⏳ Pending Vendor Payment: ${snapshot.pendingPayment.amountUSDC} →{" "}
          <span style={styles.pendingAddr}>{snapshot.pendingPayment.to}</span>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={styles.metricValue}>{value}</span>
      {sub && <span style={styles.metricSub}>{sub}</span>}
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
    animationDelay: "0.05s",
  },
  heading: {
    margin: "0 0 20px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  layout: {
    display: "flex",
    gap: 24,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  gaugeCol: {
    flexShrink: 0,
  },
  metricsGrid: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 16,
    minWidth: 0,
  },
  metric: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  },
  metricLabel: {
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    fontWeight: 600,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.15,
  },
  metricSub: {
    fontSize: 12,
    color: "var(--muted)",
  },
  muted: {
    color: "var(--muted)",
    fontSize: 14,
  },
  pending: {
    marginTop: 20,
    padding: "8px 14px",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 10,
    fontSize: 13,
    color: "#f59e0b",
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  pendingAddr: {
    fontFamily: "monospace",
    fontSize: 12,
    opacity: 0.8,
  },
  staleBadge: {
  marginLeft: 6,
  padding: "1px 7px",
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  backgroundColor: "rgba(245,158,11,0.15)",
  color: "#f59e0b",
  border: "1px solid rgba(245,158,11,0.35)",
  verticalAlign: "middle",
  },
};