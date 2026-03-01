import React from "react";
import { StatusResponse, PlatformSummary } from "../lib/types";
import { fmtUSD, fmtUSDC } from "../lib/format";

type Props = {
  status: StatusResponse | null;
  platform?: PlatformSummary | null;
  title?: string;
};

function riskFromHF(hf?: number | null) {
  if (hf == null) return { label: "Unknown", tone: "muted" as const };
  if (hf >= 1.4) return { label: "Green (Safe)", tone: "good" as const };
  if (hf >= 1.2) return { label: "Amber (Warning)", tone: "warn" as const };
  return { label: "Red (Emergency)", tone: "bad" as const };
}

function secondsUntil(nextTickAt: any): number | null {
  if (nextTickAt == null) return null;
  if (typeof nextTickAt === "number" && nextTickAt < 1e9) return Math.max(0, Math.round(nextTickAt));
  const t = typeof nextTickAt === "number" ? nextTickAt : new Date(nextTickAt).getTime();
  if (!Number.isFinite(t)) return null;
  const delta = Math.round((t - Date.now()) / 1000);
  return Math.max(0, delta);
}

function systemRiskLabel(risk?: string) {
  if (risk === "critical") return { label: "Red (Critical)", tone: "bad" as const };
  if (risk === "warning") return { label: "Amber (Warning)", tone: "warn" as const };
  if (risk === "healthy") return { label: "Green (Healthy)", tone: "good" as const };
  return { label: "Unknown", tone: "muted" as const };
}

export default function PlatformOverview({ status, platform, title }: Props) {
  const titleText = title ?? "Platform Overview";
  const agentActive = status?.agentEnabled ?? false;
  const nextEvalSeconds = secondsUntil((status as any)?.nextTickAt);

  // Use real aggregate data from platform summary when available
  const totalLiquidity = platform?.totalLiquidity ?? 0;
  const totalDebt = platform?.totalDebt ?? 0;
  const totalCollateral = platform?.totalCollateralValue ?? 0;
  const sysRisk = platform
    ? systemRiskLabel(platform.systemRisk)
    : riskFromHF(platform?.worstHealthFactor ?? null);
  const oracleSource = platform?.oracle?.source === "stork" ? "Stork (Live)" : platform?.oracle?.source === "sim" ? "Simulated" : "Stork (Live)";

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <h2 style={styles.headerTitle}>{titleText}</h2>
        <span style={styles.scaleBadge}>1:1,000,000 Institutional Scale</span>
      </div>

      <div style={styles.grid}>
        <MetricCard
          title="Total Platform Liquidity (USDC)"
          value={fmtUSDC(totalLiquidity)}
        />
        <MetricCard
          title="Total Outstanding Credit"
          value={fmtUSDC(totalDebt)}
        />
        <MetricCard
          title="Aggregate Collateral Value"
          value={fmtUSD(totalCollateral)}
        />
        <MetricCard
          title="System Risk Status"
          value={sysRisk.label}
          tone={sysRisk.tone}
          rightDot
        />
      </div>

      <div style={styles.subline}>
        <div style={styles.subItem}>
          <span style={styles.subLabel}>Agent Engine:</span>{" "}
          <span style={agentActive ? styles.good : styles.muted}>
            {agentActive ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>

        <div style={styles.subItem}>
          <span style={styles.subLabel}>Oracle Source:</span> <span>{oracleSource}</span>
        </div>

        {platform?.oracle && (
          <div style={styles.subItem}>
            <span style={styles.subLabel}>Oracle Price:</span>{" "}
            <span>${platform.oracle.price.toFixed(4)}</span>
            {platform.oracle.changePct !== 0 && (
              <span style={{ color: platform.oracle.changePct >= 0 ? "#10b981" : "#ef4444", marginLeft: 4, fontSize: 11 }}>
                {platform.oracle.changePct >= 0 ? "+" : ""}{platform.oracle.changePct.toFixed(2)}%
              </span>
            )}
          </div>
        )}

        <div style={styles.subItem}>
          <span style={styles.subLabel}>Next Evaluation:</span>{" "}
          <span>{nextEvalSeconds == null ? "\u2014" : `${nextEvalSeconds}s`}</span>
        </div>

        {platform && (
          <div style={styles.subItem}>
            <span style={styles.subLabel}>Companies:</span>{" "}
            <span>{platform.companies.length} active</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone = "default",
  rightDot = false,
}: {
  title: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad" | "muted";
  rightDot?: boolean;
}) {
  const toneStyle =
    tone === "good"
      ? styles.good
      : tone === "warn"
      ? styles.warn
      : tone === "bad"
      ? styles.bad
      : tone === "muted"
      ? styles.muted
      : undefined;

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={styles.cardTitle}>{title}</div>
        {rightDot && <span style={{ ...styles.dot, ...dotTone(tone) }} />}
      </div>
      <div style={{ ...styles.cardValue, ...(toneStyle || {}) }}>{value}</div>
    </div>
  );
}

function dotTone(tone: "default" | "good" | "warn" | "bad" | "muted") {
  if (tone === "good") return { background: "rgba(16,185,129,0.9)" };
  if (tone === "warn") return { background: "rgba(245,158,11,0.9)" };
  if (tone === "bad") return { background: "rgba(239,68,68,0.9)" };
  if (tone === "muted") return { background: "rgba(148,163,184,0.8)" };
  return { background: "rgba(99,102,241,0.9)" };
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 1400,
    margin: "12px auto 0",
    padding: "0 20px",
  },

  headerRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 0.3,
    opacity: 0.85,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(15, 23, 42, 0.65)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    backdropFilter: "blur(10px)",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    color: "rgba(226, 232, 240, 0.75)",
  },
  cardValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: 0.3,
    color: "rgba(248, 250, 252, 0.95)",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
    flex: "0 0 auto",
  },

  subline: {
    marginTop: 10,
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(15, 23, 42, 0.35)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    color: "rgba(226, 232, 240, 0.8)",
    fontSize: 12,
    fontWeight: 600,
  },
  subItem: { display: "flex", gap: 6, alignItems: "center" },
  subLabel: { color: "rgba(226, 232, 240, 0.55)" },

  scaleBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    padding: "3px 8px",
    borderRadius: 6,
    backgroundColor: "rgba(99,102,241,0.12)",
    border: "1px solid rgba(99,102,241,0.25)",
    color: "rgba(129,140,248,0.9)",
  },

  good: { color: "rgba(16,185,129,0.95)" },
  warn: { color: "rgba(245,158,11,0.95)" },
  bad: { color: "rgba(239,68,68,0.95)" },
  muted: { color: "rgba(148,163,184,0.9)" },
};
