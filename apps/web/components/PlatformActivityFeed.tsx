import React, { useEffect, useMemo, useRef } from "react";
import { ActionLog } from "../lib/types";
import { DISPLAY_SCALE } from "../lib/format";

type Props = {
  logs: ActionLog[];
  title?: string;
  maxItems?: number;
};

function fmtTime(ts: any) {
  // supports: number(ms), string ISO, Date
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function fmtAmount(n: any) {
  const num = typeof n === "string" ? Number(n) : n;
  if (num == null || Number.isNaN(num)) return "—";
  const scaled = num * DISPLAY_SCALE;
  if (scaled >= 1_000_000) return `$${(scaled / 1_000_000).toFixed(1)}M`;
  return `$${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(scaled)}`;
}

function shortTx(tx?: string) {
  if (!tx) return "—";
  if (tx.length <= 14) return tx;
  return `${tx.slice(0, 8)}…${tx.slice(-4)}`;
}

export default function PlatformActivityFeed({
  logs,
  title = "Platform Activity Feed",
  maxItems = 50,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // newest last -> feels like a scrolling feed
  const items = useMemo(() => {
    const copy = [...(logs ?? [])];

    return copy.slice(Math.max(0, copy.length - maxItems));
  }, [logs, maxItems]);

  // Auto-scroll to bottom whenever new items arrive
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length]);

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>{title}</h2>
        <div style={styles.hint}>Live scrolling log • newest at top</div>
      </div>

      <div ref={listRef} style={styles.feed}>
        {items.length === 0 ? (
          <div style={styles.empty}>No activity yet.</div>
        ) : (
          items.map((l: any, idx: number) => {
            // 🔧 Map these to your ActionLog fields:
            const time = l.time ?? l.ts ?? l.timestamp ?? l.createdAt;
            const company = l.company ?? l.companyName ?? l.userLabel ?? l.actor ?? "";
            const action = l.action ?? l.type ?? l.event ?? "Action";
            const amount = l.amountUSDC ?? l.amount ?? l.usdc ?? null;
            const rationale = l.rationale ?? l.reason ?? "";
            const hfAfter = l.hf ?? l.healthFactor ?? l.hfAfter ?? null;
            const tx = l.arcTx ?? l.tx ?? l.txHash ?? l.transaction ?? l.circleRef ?? "";

            const isNewest = idx === items.length - 1;

            return (
              <div key={l.id ?? `${idx}-${tx}`} style={{ ...styles.item, ...(isNewest ? styles.newest : {}) }}>
                <div style={styles.itemTop}>
                  <div style={styles.left}>
                    <span style={styles.time}>{fmtTime(time)}</span>
                    <span style={styles.company}>{company ? `[${company}]` : ""}</span>
                    <span style={styles.action}>{action}</span>
                    {amount != null && (
                      <span style={styles.amount}>{fmtAmount(amount)}</span>
                    )}
                  </div>

                  <div style={styles.right}>
                    <span style={styles.tx}>{shortTx(tx)}</span>
                  </div>
                </div>

                {(rationale || hfAfter != null) && (
                  <div style={styles.meta}>
                    {rationale && <div style={styles.reason}>Reason: {rationale}</div>}
                    {hfAfter != null && <div style={styles.hf}>HF after: {hfAfter}</div>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={styles.footerNote}>
        Each entry includes time, action, amount, and tx reference — auditable & real.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 1400,
    margin: "18px auto 40px",
    padding: "0 20px",
  },
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 16, fontWeight: 900 },
  hint: { fontSize: 12, opacity: 0.75, fontWeight: 600 },

  feed: {
    height: 260,
    overflow: "auto",
    borderRadius: 14,
    padding: 10,
    background: "rgba(15, 23, 42, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    backdropFilter: "blur(10px)",
  },
  empty: {
    padding: 14,
    opacity: 0.7,
    fontSize: 13,
    fontWeight: 600,
  },

  item: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148, 163, 184, 0.10)",
    background: "rgba(2, 6, 23, 0.20)",
    marginBottom: 10,
  },
  newest: {
    border: "1px solid rgba(34, 211, 238, 0.28)",
    boxShadow: "0 0 0 1px rgba(34, 211, 238, 0.10) inset",
  },

  itemTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  left: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  right: { display: "flex", gap: 8, alignItems: "center" },

  time: { fontSize: 12, opacity: 0.75, fontWeight: 700 },
  company: { fontSize: 12, opacity: 0.9, fontWeight: 800 },
  action: { fontSize: 12, fontWeight: 800 },
  amount: { fontSize: 12, fontWeight: 900, opacity: 0.95 },
  tx: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "rgba(2, 6, 23, 0.25)",
  },

  meta: { marginTop: 8, display: "flex", flexWrap: "wrap", gap: 14 },
  reason: { fontSize: 12, opacity: 0.8, fontWeight: 600 },
  hf: { fontSize: 12, opacity: 0.8, fontWeight: 700 },

  footerNote: { marginTop: 8, fontSize: 12, opacity: 0.7, fontWeight: 600 },
};