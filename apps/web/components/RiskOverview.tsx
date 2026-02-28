import React from "react";
import { Snapshot } from "../lib/types";
import HealthFactorGauge from "./HealthFactorGauge";

interface Props {
  snapshot: Snapshot | null;
  lastReason?: string;
  minHealthBps?: number;
  emergencyHealthBps?: number;
}

const HIDE_YIELD = (process.env.NEXT_PUBLIC_HIDE_YIELD || "").toLowerCase() === "true";

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
  lastReason,
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
 
  
    const sourceLabel = snapshot.oracleSource === "stork"
      ? "Stork"
      : "Simulated";
  const changePctColor = snapshot.changePct >= 0 ? "#10b981" : "#ef4444";
  const volatilityPct = snapshot.volatilityPct ? parseFloat(snapshot.volatilityPct) : Math.abs(snapshot.changePct);
  const volatilityThreshold = snapshot.volatilityThreshold ?? 3;
  const isVolatile = volatilityPct > volatilityThreshold;
  const liquidityRatio = snapshot.liquidityRatio ? parseFloat(snapshot.liquidityRatio) : 0;
  const reserveRatio = snapshot.reserveRatio ? parseFloat(snapshot.reserveRatio) : 0;
  const liquidityTarget = snapshot.liquidityTargetRatio ?? 0.25;
  const reserveTarget = snapshot.reserveRatioTarget ?? 0.3;
  const targetHealth = snapshot.targetHealth ?? 1.6;
  const safeHeadroom = Math.max(
    0,
    targetHealth > 0 ? maxBorrowNum / targetHealth - debtNum : availableBorrow
  );

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
            label="Borrow Now (keeps HF≥target)"
            value={`$${fmt(safeHeadroom)}`}
            sub={`Target HF ${targetHealth.toFixed(2)} gate`}
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
          <Metric
            label="Liquidity Ratio"
            value={`${(liquidityRatio * 100).toFixed(1)}%`}
            sub={`Target ${(liquidityTarget * 100).toFixed(0)}%`}
          />
          <Metric
            label="Reserve Ratio"
            value={`${(reserveRatio * 100).toFixed(1)}%`}
            sub={`Target ${(reserveTarget * 100).toFixed(0)}%`}
          />
          <Metric
            label="Volatility"
            value={`${volatilityPct.toFixed(2)}%`}
            sub={
              <>
                Threshold {volatilityThreshold.toFixed(1)}%
                {isVolatile && (
                  <span style={styles.volBadge}>TIGHTENING</span>
                )}
              </>
            }
          />
          <Metric
            label="Target Health"
            value={`${targetHealth.toFixed(2)}`}
            sub="Borrow gating threshold"
          />
        </div>
      </div>

      {lastReason && (
        <div style={{
          ...styles.lastDecision,
          ...(lastReason.startsWith("Blocked") || lastReason.startsWith("Risk")
            ? styles.lastDecisionRisk
            : lastReason.startsWith("Executed")
            ? styles.lastDecisionSuccess
            : styles.lastDecisionNeutral),
        }}>
          <span style={styles.lastDecisionIcon}>
            {lastReason.startsWith("Blocked") ? "🛑"
              : lastReason.startsWith("Risk") ? "⚠️"
              : lastReason.startsWith("Error") ? "❌"
              : lastReason.startsWith("Executed") ? "✅"
              : "💬"}
          </span>
          <div style={styles.lastDecisionText}>
            <span style={styles.lastDecisionLabel}>Last decision</span>
            <span style={styles.lastDecisionReason}>{lastReason}</span>
          </div>
        </div>
      )}

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
  lastDecision: {
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 10,
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    border: "1px solid",
  },
  lastDecisionNeutral: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "var(--border)",
  },
  lastDecisionSuccess: {
    backgroundColor: "rgba(16,185,129,0.07)",
    borderColor: "rgba(16,185,129,0.25)",
  },
  lastDecisionRisk: {
    backgroundColor: "rgba(239,68,68,0.07)",
    borderColor: "rgba(239,68,68,0.25)",
  },
  lastDecisionIcon: {
    fontSize: 15,
    flexShrink: 0,
    marginTop: 1,
  },
  lastDecisionText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    minWidth: 0,
  },
  lastDecisionLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    color: "var(--muted)",
  },
  lastDecisionReason: {
    fontSize: 13,
    color: "var(--text)",
    opacity: 0.85,
    lineHeight: 1.4,
  },
  volBadge: {
    marginLeft: 6,
    padding: "1px 7px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    backgroundColor: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.35)",
    verticalAlign: "middle",
  },
};
