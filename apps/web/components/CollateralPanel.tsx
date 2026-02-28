import React, { useState } from "react";
import {
  registerCollateral,
  manualBorrow,
  manualRepay,
  startAgent,
  stopAgent,
  triggerTick,
  overrideOraclePrice,
  resetUser,
} from "../lib/api";
import { Snapshot } from "../lib/types";

interface Props {
  defaultUser: string;
  agentEnabled: boolean;
  snapshot?: Snapshot | null;
}

export default function CollateralPanel({ defaultUser, agentEnabled, snapshot }: Props) {
  const [collAmount, setCollAmount] = useState("");
  const [borrowAmt, setBorrowAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [oracleOverride, setOracleOverride] = useState("");
  const [msg, setMsg] = useState("");

  // --- helpers ---
  const num = (v: string) => parseFloat(v);
  const toNumber = (s: string | undefined | null) => {
    const n = s ? parseFloat(s) : NaN;
    return isNaN(n) ? 0 : n;
  };

  const wrap = async (fn: () => Promise<any>, label: string) => {
    setMsg("");
    try {
      await fn();
      setMsg(`${label}: OK`);
      return true;
    } catch (err: any) {
      setMsg(`${label}: ${err.message}`);
      return false;
    }
  };

  // Collateral value preview
  const oraclePrice = snapshot?.oraclePrice ?? null;
  const collAmountNum = parseFloat(collAmount);
  const previewValueUSDC =
    oraclePrice && !isNaN(collAmountNum) && collAmountNum > 0
      ? collAmountNum * oraclePrice
      : null;

  // LTV preview (defaults match arc.ts: ltvBps=6000 → 60%)
  const ltvRatio = 0.6;
  const previewMaxBorrow =
    previewValueUSDC != null ? previewValueUSDC * ltvRatio : null;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div style={{ ...styles.card, animationDelay: "0.12s" }}>
      <h3 style={styles.heading}>Treasury Actions</h3>

      {/* ── Register Collateral ── */}
      <div style={styles.section}>
        <span style={styles.label}>Register RWA Collateral</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Amount (units)"
            value={collAmount}
            onChange={(e) => setCollAmount(e.target.value)}
          />
          <button
            style={styles.btn}
            onClick={async () => {
              const ok = await wrap(
                () => registerCollateral(defaultUser, collAmount),
                "Register"
              );
              if (ok) setCollAmount("");
            }}
          >
            Register
          </button>
        </div>

        {/* Value preview */}
        {previewValueUSDC != null ? (
          <div style={styles.preview}>
            <div style={styles.previewRow}>
              <span style={styles.previewLabel}>Collateral value</span>
              <span style={styles.previewValue}>${fmt(previewValueUSDC)}</span>
            </div>
            <div style={styles.previewRow}>
              <span style={styles.previewLabel}>Max borrow @ 60% LTV</span>
              <span style={{ ...styles.previewValue, color: "var(--success)" }}>
                ${fmt(previewMaxBorrow!)}
              </span>
            </div>
            {oraclePrice && (
              <div style={styles.previewSource}>
                @ ${fmt(oraclePrice)} oracle price
                {snapshot?.oracleSource === "stork" ? " · Stork" : " · Simulated"}
              </div>
            )}
          </div>
        ) : (
          oraclePrice && (
            <div style={styles.previewHint}>
              Enter units to see USDC value at ${fmt(oraclePrice)}
            </div>
          )
        )}
      </div>

      {/* ── Credit Line ── */}
      <div style={styles.section}>
        <span style={styles.label}>Credit Line Draw / Repay</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Draw USDC"
            value={borrowAmt}
            onChange={(e) => setBorrowAmt(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={async () => {
              const debt = toNumber(snapshot?.debtUSDC);
              const maxBorrow = toNumber(snapshot?.maxBorrowUSDC);
              const targetHealth = snapshot?.targetHealth ?? 0;
              const availableLtv = Math.max(0, maxBorrow - debt);
              const availableHealth =
                targetHealth > 0 ? Math.max(0, maxBorrow / targetHealth - debt) : availableLtv;
              const cap = Math.min(availableLtv, availableHealth);

              let amt = num(borrowAmt);
              if (isNaN(amt) || amt <= 0) {
                setMsg("Draw: enter a positive number");
                return;
              }
              if (cap <= 0) {
                setMsg("Draw: no headroom to borrow safely");
                return;
              }
              if (amt > cap) {
                amt = cap;
                setBorrowAmt(cap.toFixed(6));
                setMsg(`Draw capped to $${cap.toFixed(2)} (max allowed)`);
              }

              const ok = await wrap(() => manualBorrow(defaultUser, amt.toString()), "Draw");
              if (ok) setBorrowAmt("");
            }}
          >
            Draw
          </button>
          <input
            style={styles.input}
            placeholder="Repay USDC"
            value={repayAmt}
            onChange={(e) => setRepayAmt(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={async () => {
              const repayNum = parseFloat(repayAmt);
              const currentDebt = snapshot ? parseFloat(snapshot.debtUSDC || "0") : 0;
              if (isNaN(repayNum) || repayNum <= 0) {
                setMsg("Repay: enter a positive number");
                return;
              }
              if (repayNum > currentDebt) {
                const capped = currentDebt;
                setRepayAmt(capped.toFixed(6));
                setMsg(`Repay capped to current debt ($${currentDebt.toFixed(2)})`);
                return; // wait for user to click again or adjust automatically? Keep auto-cap and stop action.
              }
              const ok = await wrap(() => manualRepay(defaultUser, repayAmt), "Repay");
              if (ok) setRepayAmt("");
            }}
          >
            Repay
          </button>
        </div>
      </div>

      {/* ── Autopilot ── */}
      <div style={styles.section}>
        <span style={styles.label}>Autopilot Controls</span>
        <div style={styles.row}>
          <button
            style={agentEnabled ? styles.btnDanger : styles.btn}
            onClick={() =>
              wrap(
                agentEnabled ? stopAgent : startAgent,
                agentEnabled ? "Stop" : "Start"
              )
            }
          >
            {agentEnabled ? "Stop Autopilot" : "Start Autopilot"}
          </button>
          <button
            style={styles.btnSecondary}
            onClick={() => wrap(triggerTick, "Tick")}
          >
            Run Check Now
          </button>
        </div>
      </div>

      {/* ── Price Override ── */}
      <div style={styles.section}>
        <span style={styles.label}>Price Override (Demo)</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Price override"
            value={oracleOverride}
            onChange={(e) => setOracleOverride(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={async () => {
              const ok = await wrap(
                () => overrideOraclePrice(parseFloat(oracleOverride)),
                "Override"
              );
              if (ok) setOracleOverride("");
            }}
          >
            Override
          </button>
        </div>
      </div>

      {/* ── Reset ── */}
      <div style={styles.section}>
        <span style={styles.label}>Reset Account (Demo)</span>
        <div style={styles.row}>
          <button
            style={styles.btnDanger}
            onClick={() => {
              if (!window.confirm("Reset on-chain user state?")) {
                setMsg("Reset cancelled");
                return;
              }
              wrap(() => resetUser(defaultUser), "Reset");
            }}
          >
            Reset Account State
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          ...styles.msg,
          color: msg.includes("OK") ? "var(--success)" : "var(--danger)",
        }}>
          {msg}
        </div>
      )}
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
  section: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  row: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  input: {
    flex: 1,
    minWidth: 120,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
  },
  btn: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
    color: "#061018",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
    boxShadow: "0 6px 16px rgba(2, 132, 199, 0.25)",
  },
  btnSecondary: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  btnDanger: {
    padding: "8px 16px",
    borderRadius: 10,
    border: "1px solid rgba(244, 63, 94, 0.5)",
    backgroundColor: "rgba(244, 63, 94, 0.15)",
    color: "#fecdd3",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 13,
  },
  preview: {
    marginTop: 8,
    padding: "10px 12px",
    backgroundColor: "rgba(16, 185, 129, 0.07)",
    border: "1px solid rgba(16, 185, 129, 0.2)",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  previewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: {
    fontSize: 12,
    color: "var(--muted)",
  },
  previewValue: {
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  previewSource: {
    fontSize: 11,
    color: "var(--muted)",
    marginTop: 2,
    opacity: 0.7,
  },
  previewHint: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--muted)",
    fontStyle: "italic",
  },
  msg: {
    marginTop: 10,
    fontSize: 13,
  },
};
