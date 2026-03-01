import React from "react";

interface PolicyInfo {
  ltvBps: number;
  minHealthBps: number;
  emergencyHealthBps: number;
  riskProfile?: string;
}

interface Props {
  name: string;
  riskProfile: string;
  policy: PolicyInfo | null;
  address: string;
}

const PROFILE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  conservative: { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
  balanced:     { bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.35)", text: "#818cf8" },
  growth:       { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", text: "#fbbf24" },
};

export default function CompanyProfileCard({ name, riskProfile, policy, address }: Props) {
  const colors = PROFILE_COLORS[riskProfile] || PROFILE_COLORS.balanced;
  const ltvPct = policy ? (policy.ltvBps / 100).toFixed(0) : "—";
  const minHF = policy ? (policy.minHealthBps / 10000).toFixed(2) : "—";
  const emergencyHF = policy ? (policy.emergencyHealthBps / 10000).toFixed(2) : "—";

  return (
    <div style={styles.card}>
      <div style={styles.top}>
        <div>
          <div style={styles.name}>{name}</div>
          <div style={styles.addr}>{address.slice(0, 10)}…{address.slice(-6)}</div>
        </div>
        <span style={{ ...styles.badge, backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}>
          {riskProfile.charAt(0).toUpperCase() + riskProfile.slice(1)}
        </span>
      </div>
      <div style={styles.grid}>
        <PolicyStat label="Max LTV" value={`${ltvPct}%`} />
        <PolicyStat label="Min Health Factor" value={minHF} highlight={true} />
        <PolicyStat label="Emergency HF" value={emergencyHF} danger={true} />
      </div>
    </div>
  );
}

function PolicyStat({ label, value, highlight, danger }: {
  label: string; value: string; highlight?: boolean; danger?: boolean;
}) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{
        ...styles.statValue,
        color: danger ? "#ef4444" : highlight ? "#10b981" : "var(--text)",
      }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--card)",
    borderRadius: 14,
    padding: "14px 20px",
    color: "var(--text)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(6px)",
    animation: "fadeUp 0.5s ease both",
  },
  top: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  addr: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "var(--muted)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    padding: "3px 10px",
    borderRadius: 6,
    border: "1px solid",
    flexShrink: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    padding: "8px 10px",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(148,163,184,0.1)",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    color: "var(--muted)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
  },
};
