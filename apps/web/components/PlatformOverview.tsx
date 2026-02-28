import React from "react";
import { StatusResponse } from "../lib/types";

type Props = {
  status: StatusResponse | null;
  title?: string;
};

function formatNumber(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, opts).format(n);
}

function formatUSDC(n: number) {
  return `${formatNumber(n, { maximumFractionDigits: 0 })} USDC`;
}

function formatUSD(n: number) {
  return `$${formatNumber(n, { maximumFractionDigits: 0 })}`;
}

function riskFromHF(hf?: number | null) {
  if (hf == null) return { label: "Unknown", tone: "muted" as const };
  if (hf >= 1.4) return { label: "Green (Safe)", tone: "good" as const };
  if (hf >= 1.2) return { label: "Amber (Warning)", tone: "warn" as const };
  return { label: "Red (Emergency)", tone: "bad" as const };
}

function secondsUntil(nextTickAt: any): number | null {
  if (nextTickAt == null) return null;

  // If it’s already a number and looks like "seconds remaining"
  if (typeof nextTickAt === "number" && nextTickAt < 1e9) return Math.max(0, Math.round(nextTickAt));

  // Otherwise treat it like a timestamp (ms or ISO string)
  const t = typeof nextTickAt === "number" ? nextTickAt : new Date(nextTickAt).getTime();
  if (!Number.isFinite(t)) return null;

  const delta = Math.round((t - Date.now()) / 1000);
  return Math.max(0, delta);
}

export default function PlatformOverview({ status, title }: Props) {
  const snap: any = status?.snapshot ?? null;
  const titleText = title ?? "Platform Overview";

  // 🔧 Map these to your real fields if needed:
  const liquidityPoolUSDC =
    snap?.liquidityPoolUSDC ??
    (snap?.liquidity ?? 0) + (snap?.reserve ?? 0) + (snap?.yield ?? 0);

  const outstandingCreditUSDC = snap?.debtUSDC ?? snap?.debt ?? 0;

  const aggregateCollateralUSD =
    snap?.aggregateCollateralUSD ?? snap?.collateralValueUSD ?? snap?.collateralValue ?? 0;

  const hf = snap?.healthFactor ?? snap?.hf ?? null;
  const risk = riskFromHF(hf);

  const agentActive = status?.agentEnabled ?? false;
  const oracleSource = (status as any)?.oracleSource ?? "STORK (Live)";

  // Your file shows nextTickAt exists — show countdown if it’s a timestamp.
  const nextEvalSeconds = secondsUntil((status as any)?.nextTickAt);

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <h2 style={styles.headerTitle}>{titleText}</h2>
      </div>

      <div style={styles.grid}>
        <MetricCard
          title="Total Platform Liquidity Pool (USDC)"
          value={formatUSDC(liquidityPoolUSDC)}
        />
        <MetricCard
          title="Total Outstanding Credit"
          value={formatUSDC(outstandingCreditUSDC)}
        />
        <MetricCard
          title="Aggregate Collateral Value"
          value={formatUSD(aggregateCollateralUSD)}
        />
        <MetricCard
          title="System Risk Status"
          value={risk.label}
          tone={risk.tone}
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

        <div style={styles.subItem}>
          <span style={styles.subLabel}>Next Evaluation Cycle:</span>{" "}
          <span>{nextEvalSeconds == null ? "—" : `${nextEvalSeconds}s`}</span>
        </div>
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

  good: { color: "rgba(16,185,129,0.95)" },
  warn: { color: "rgba(245,158,11,0.95)" },
  bad: { color: "rgba(239,68,68,0.95)" },
  muted: { color: "rgba(148,163,184,0.9)" },
};