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

interface Props {
  defaultUser: string;
  agentEnabled: boolean;
}

export default function CollateralPanel({ defaultUser, agentEnabled }: Props) {
  const [collAmount, setCollAmount] = useState("");
  const [borrowAmt, setBorrowAmt] = useState("");
  const [repayAmt, setRepayAmt] = useState("");
  const [oracleOverride, setOracleOverride] = useState("");
  const [msg, setMsg] = useState("");

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

  return (
    <div style={{ ...styles.card, animationDelay: "0.12s" }}>
      <h3 style={styles.heading}>Treasury Actions</h3>

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
      </div>

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
              const ok = await wrap(() => manualBorrow(defaultUser, borrowAmt), "Draw");
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
              const ok = await wrap(() => manualRepay(defaultUser, repayAmt), "Repay");
              if (ok) setRepayAmt("");
            }}
          >
            Repay
          </button>
        </div>
      </div>

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

      {msg && <div style={styles.msg}>{msg}</div>}
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
  msg: {
    marginTop: 10,
    fontSize: 13,
    color: "var(--muted)",
  },
};
