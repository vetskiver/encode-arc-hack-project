import React, { useEffect, useRef } from "react";

// Thresholds match arc.ts defaults:
// minHealthBps = 14000 → 1.40
// emergencyHealthBps = 12000 → 1.20
const SAFE_THRESHOLD = 1.4;
const WARN_THRESHOLD = 1.2;
const NO_DEBT_SENTINEL = 99; // treat HF >= 99 as "no debt"

type HFState = "no-debt" | "safe" | "warning" | "emergency";

interface HFConfig {
  state: HFState;
  label: string;
  color: string;
  glow: string;
  trackColor: string;
  pct: number; // arc fill 0–1
}

function getHFConfig(hf: number, minHBps = 14000, emergHBps = 12000): HFConfig {
  const minH = minHBps / 10000;
  const emergH = emergHBps / 10000;

  if (hf >= NO_DEBT_SENTINEL) {
    return {
      state: "no-debt",
      label: "SAFE",
      color: "#10b981", // same green as safe
      glow: "rgba(16,185,129,0.35)",
      trackColor: "rgba(16,185,129,0.12)",
      pct: 1, // full arc
    };
  }
  if (hf >= minH) {
    // Safe: map minH–3.0 → 0.7–1.0 fill
    const pct = 0.7 + Math.min((hf - minH) / (3.0 - minH), 1) * 0.3;
    return {
      state: "safe",
      label: "SAFE",
      color: "#10b981",
      glow: "rgba(16,185,129,0.35)",
      trackColor: "rgba(16,185,129,0.12)",
      pct,
    };
  }
  if (hf >= emergH) {
    // Warning: map emergH–minH → 0.35–0.7
    const pct = 0.35 + ((hf - emergH) / (minH - emergH)) * 0.35;
    return {
      state: "warning",
      label: "WARNING",
      color: "#f59e0b",
      glow: "rgba(245,158,11,0.35)",
      trackColor: "rgba(245,158,11,0.12)",
      pct,
    };
  }
  // Emergency: map 0–emergH → 0–0.35
  const pct = Math.min(hf / emergH, 1) * 0.35;
  return {
    state: "emergency",
    label: "EMERGENCY",
    color: "#ef4444",
    glow: "rgba(239,68,68,0.4)",
    trackColor: "rgba(239,68,68,0.12)",
    pct,
  };
}

interface Props {
  healthFactor: number;
  minHealthBps?: number;
  emergencyHealthBps?: number;
}

export default function HealthFactorGauge({
  healthFactor,
  minHealthBps = 14000,
  emergencyHealthBps = 12000,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfg = getHFConfig(healthFactor, minHealthBps, emergencyHealthBps);

  // Arc geometry
  const SIZE = 200;
  const CX = SIZE / 2;
  const CY = SIZE / 2 + 10;
  const R = 74;
  const START_ANGLE = Math.PI * 0.75;      // 135°
  const END_ANGLE = Math.PI * 2.25;        // 405° (270° sweep)
  const SWEEP = END_ANGLE - START_ANGLE;
  const STROKE = 14;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Track
    ctx.beginPath();
    ctx.arc(CX, CY, R, START_ANGLE, END_ANGLE);
    ctx.strokeStyle = cfg.trackColor;
    ctx.lineWidth = STROKE;
    ctx.lineCap = "round";
    ctx.stroke();

    // Threshold tick marks
    const ticks = [
      { pct: 0.35, color: "rgba(239,68,68,0.6)" },   // emergency boundary
      { pct: 0.70, color: "rgba(245,158,11,0.6)" },   // warning boundary
    ];
    ticks.forEach(({ pct, color }) => {
      const angle = START_ANGLE + SWEEP * pct;
      const innerR = R - STROKE / 2 - 2;
      const outerR = R + STROKE / 2 + 2;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(angle) * innerR, CY + Math.sin(angle) * innerR);
      ctx.lineTo(CX + Math.cos(angle) * outerR, CY + Math.sin(angle) * outerR);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "butt";
      ctx.stroke();
    });

    if (cfg.pct <= 0) return;

    // Glow layer
    ctx.save();
    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(CX, CY, R, START_ANGLE, START_ANGLE + SWEEP * cfg.pct);
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = STROKE;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // Crisp foreground arc
    ctx.beginPath();
    ctx.arc(CX, CY, R, START_ANGLE, START_ANGLE + SWEEP * cfg.pct);
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = STROKE - 2;
    ctx.lineCap = "round";
    ctx.stroke();

    // End dot
    const endAngle = START_ANGLE + SWEEP * cfg.pct;
    const dotX = CX + Math.cos(endAngle) * R;
    const dotY = CY + Math.sin(endAngle) * R;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = cfg.glow;
    ctx.shadowBlur = 10;
    ctx.fill();
  }, [cfg.pct, cfg.color, cfg.trackColor, cfg.glow]);

  const displayValue =
    healthFactor >= NO_DEBT_SENTINEL
      ? "∞"
      : healthFactor.toFixed(2);

  return (
    <div style={styles.wrapper}>
      <div style={styles.canvasWrap}>
        <canvas ref={canvasRef} />

        {/* Center content */}
        <div style={styles.center}>
          <span style={{ ...styles.hfValue, color: cfg.color }}>
            {displayValue}
          </span>
          <span style={{ ...styles.badge, background: cfg.trackColor, color: cfg.color, borderColor: cfg.color + "55" }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Threshold legend */}
      <div style={styles.legend}>
        <LegendItem color="#10b981" label="Safe" threshold={`≥ ${(minHealthBps / 10000).toFixed(2)}`} />
        <LegendItem color="#f59e0b" label="Warning" threshold={`≥ ${(emergencyHealthBps / 10000).toFixed(2)}`} />
        <LegendItem color="#ef4444" label="Emergency" threshold={`< ${(emergencyHealthBps / 10000).toFixed(2)}`} />
      </div>
    </div>
  );
}

function LegendItem({ color, label, threshold }: { color: string; label: string; threshold: string }) {
  return (
    <div style={styles.legendItem}>
      <span style={{ ...styles.legendDot, background: color }} />
      <span style={styles.legendLabel}>{label}</span>
      <span style={styles.legendThreshold}>{threshold}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  },
  canvasWrap: {
    position: "relative",
    width: 200,
    height: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -44%)",
    pointerEvents: "none",
  },
  hfValue: {
    fontSize: 36,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: -1,
    fontVariantNumeric: "tabular-nums",
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    padding: "3px 10px",
    borderRadius: 999,
    border: "1px solid",
    textTransform: "uppercase" as const,
  },
  legend: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: 11,
    color: "var(--muted)",
    fontWeight: 500,
  },
  legendThreshold: {
    fontSize: 11,
    color: "var(--muted)",
    opacity: 0.6,
    fontVariantNumeric: "tabular-nums",
  },
};
