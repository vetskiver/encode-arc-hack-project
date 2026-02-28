import React from "react";
import { useRouter } from "next/router";
import { StatusResponse } from "../lib/types";

interface Props {
  name: string;
  address: string;
  status: StatusResponse | null;
  error?: boolean;
}

function getHFState(hf: number) {
  if (hf >= 99) return { label: "No Debt", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  if (hf >= 1.4) return { label: "Safe", color: "#10b981", bg: "rgba(16,185,129,0.1)" };
  if (hf >= 1.2) return { label: "Warning", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
  return { label: "Emergency", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
}

export default function CompanyCard({ name, address, status, error }: Props) {
  const router = useRouter();
  const snap = status?.snapshot;
  const hf = snap?.healthFactor ?? 999;
  const hfState = getHFState(hf);

  const fmt = (n: number) =>
    "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const agentStatusColor =
    status?.status === "Risk Mode" ? "#ef4444"
    : status?.status === "Executing" ? "#f59e0b"
    : "#10b981";

  return (
    <div
      style={{ ...styles.card, borderColor: hfState.color + "33" }}
      onClick={() => router.push(`/company/${address}`)}
    >
      {/* Header */}
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.companyName}>{name}</div>
          <div style={styles.address}>{address.slice(0, 6)}...{address.slice(-4)}</div>
        </div>
        <div style={{ ...styles.agentBadge, color: agentStatusColor, borderColor: agentStatusColor + "44" }}>
          <span style={{ ...styles.dot, background: agentStatusColor }} />
          {status?.status || "Offline"}
        </div>
      </div>

      {/* HF prominent display */}
      <div style={{ ...styles.hfBlock, background: hfState.bg }}>
        <span style={styles.hfLabel}>Health Factor</span>
        <span style={{ ...styles.hfValue, color: hfState.color }}>
          {hf >= 99 ? "∞" : hf.toFixed(2)}
        </span>
        <span style={{ ...styles.hfBadge, color: hfState.color }}>
          {hfState.label}
        </span>
      </div>

      {/* Metrics grid */}
      {snap ? (
        <div style={styles.metricsGrid}>
          <Stat label="Collateral Value" value={fmt(parseFloat(snap.collateralValueUSDC))} />
          <Stat label="Debt" value={fmt(parseFloat(snap.debtUSDC))} />
          <Stat label="Liquidity" value={fmt(parseFloat(snap.liquidityUSDC))} />
          <Stat label="Reserve" value={fmt(parseFloat(snap.reserveUSDC))} />
        </div>
      ) : (
        <div style={styles.noData}>
          {error ? "Backend unreachable" : "No data yet"}
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerLink}>View cockpit →</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--card)",
    borderRadius: 16,
    border: "1px solid",
    padding: 20,
    cursor: "pointer",
    transition: "transform 0.15s, box-shadow 0.15s",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  companyName: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  address: {
    fontSize: 11,
    color: "var(--muted)",
    fontFamily: "monospace",
    marginTop: 2,
  },
  agentBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 99,
    border: "1px solid",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  hfBlock: {
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  hfLabel: {
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    fontWeight: 600,
    flex: 1,
  },
  hfValue: {
    fontSize: 24,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
  hfBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  statLabel: {
    fontSize: 10,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    fontWeight: 600,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  noData: {
    fontSize: 13,
    color: "var(--muted)",
    fontStyle: "italic",
    textAlign: "center" as const,
    padding: "12px 0",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
    marginTop: 4,
  },
  footerLink: {
    fontSize: 12,
    color: "var(--muted)",
    fontWeight: 600,
  },
};