import React from "react";
import Link from "next/link";
import { fmtUSD } from "../lib/format";

interface Props {
  companyId: string;
  name: string;
  riskProfile: string;
  collateralValue: number;
  debt: number;
  healthFactor: number;
  liquidity: number;
  reserve: number;
  agentStatus: string;
  lastReason: string;
  error?: boolean;
}

const PROFILE_COLORS: Record<string, { color: string; bg: string }> = {
  conservative: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  balanced: { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  growth: { color: "#f97316", bg: "rgba(249,115,22,0.12)" },
};

const COMPANY_ROUTES: Record<string, string> = {
  atlas: "/company-atlas",
  northwind: "/company-northwind",
  harbor: "/company-harbor",
};

function getHFState(hf: number) {
  if (hf >= 99) return { label: "No Debt", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  if (hf >= 1.4) return { label: "Safe", color: "#10b981", bg: "rgba(16,185,129,0.1)" };
  if (hf >= 1.2) return { label: "Warning", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" };
  return { label: "Emergency", color: "#ef4444", bg: "rgba(239,68,68,0.1)" };
}

export default function CompanyCard({
  companyId,
  name,
  riskProfile,
  collateralValue,
  debt,
  healthFactor,
  liquidity,
  reserve,
  agentStatus,
  lastReason,
  error,
}: Props) {
  const hf = healthFactor;
  const hfState = getHFState(hf);
  const profile = PROFILE_COLORS[riskProfile] || PROFILE_COLORS.balanced;

  const fmt = (n: number) => fmtUSD(n);

  const agentStatusColor =
    agentStatus === "Risk Mode" ? "#ef4444"
    : agentStatus === "Executing" ? "#f59e0b"
    : agentStatus === "Monitoring" ? "#10b981"
    : "#6b7280";

  const route = COMPANY_ROUTES[companyId] || `/company-${companyId}`;

  return (
    <div style={{ ...styles.card, borderColor: hfState.color + "33" }}>
      {/* Header */}
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.companyName}>{name}</div>
          <div style={{ ...styles.profileBadge, color: profile.color, backgroundColor: profile.bg }}>
            {riskProfile || "—"}
          </div>
        </div>
        <div style={{ ...styles.agentBadge, color: agentStatusColor, borderColor: agentStatusColor + "44" }}>
          <span style={{ ...styles.dot, background: agentStatusColor }} className="agent-dot" />
          {agentStatus || "Offline"}
        </div>
      </div>

      {/* HF prominent display */}
      <div style={{ ...styles.hfBlock, background: hfState.bg }}>
        <span style={styles.hfLabel}>Health Factor</span>
        <span style={{ ...styles.hfValue, color: hfState.color }}>
          {hf >= 99 ? "\u221E" : hf.toFixed(2)}
        </span>
        <span style={{ ...styles.hfBadge, color: hfState.color }}>
          {hfState.label}
        </span>
      </div>

      {/* Metrics grid */}
      {collateralValue > 0 || debt > 0 ? (
        <div style={styles.metricsGrid}>
          <Stat label="Collateral Value" value={fmt(collateralValue)} />
          <Stat label="Debt" value={fmt(debt)} />
          <Stat label="Liquidity" value={fmt(liquidity)} />
          <Stat label="Reserve" value={fmt(reserve)} />
        </div>
      ) : (
        <div style={styles.noData}>
          {error ? "Backend unreachable" : "No data yet"}
        </div>
      )}

      {/* Last reason */}
      {lastReason && (
        <div style={styles.reasonBar}>
          <span style={styles.reasonText}>{lastReason}</span>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <Link href={route} style={{ textDecoration: "none" }}>
          <span style={styles.footerLink}>View cockpit &rarr;</span>
        </Link>
      </div>

      <style jsx global>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .agent-dot {
          animation: agentPulse 2s ease-in-out infinite;
        }
      `}</style>
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
    cursor: "default",
    transition: "transform 0.15s, box-shadow 0.15s",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
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
  profileBadge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    padding: "2px 8px",
    borderRadius: 6,
    marginTop: 4,
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
    transition: "background 0.5s ease",
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
    transition: "color 0.3s ease",
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
  reasonBar: {
    padding: "6px 10px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(148,163,184,0.1)",
  },
  reasonText: {
    fontSize: 11,
    color: "var(--muted)",
    lineHeight: 1.4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    display: "block",
  },
  footer: {
    borderTop: "1px solid var(--border)",
    paddingTop: 12,
    marginTop: 2,
  },
  footerLink: {
    fontSize: 12,
    color: "var(--muted)",
    fontWeight: 600,
    cursor: "pointer",
  },
};
