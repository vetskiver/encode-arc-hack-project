import React, { useState } from "react";
import {
  registerCollateral,
  manualBorrow,
  manualRepay,
  startAgent,
  stopAgent,
  triggerTick,
  overrideOraclePrice,
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
      const res = await fn();
      setMsg(`${label}: OK`);
    } catch (err: any) {
      setMsg(`${label}: ${err.message}`);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Actions</h3>

      <div style={styles.section}>
        <span style={styles.label}>Register Collateral</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Amount (units)"
            value={collAmount}
            onChange={(e) => setCollAmount(e.target.value)}
          />
          <button
            style={styles.btn}
            onClick={() =>
              wrap(
                () => registerCollateral(defaultUser, collAmount),
                "Register"
              )
            }
          >
            Register
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Manual Borrow / Repay</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Borrow USDC"
            value={borrowAmt}
            onChange={(e) => setBorrowAmt(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={() =>
              wrap(() => manualBorrow(defaultUser, borrowAmt), "Borrow")
            }
          >
            Borrow
          </button>
          <input
            style={styles.input}
            placeholder="Repay USDC"
            value={repayAmt}
            onChange={(e) => setRepayAmt(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={() =>
              wrap(() => manualRepay(defaultUser, repayAmt), "Repay")
            }
          >
            Repay
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Agent Controls</span>
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
            {agentEnabled ? "Stop Agent" : "Start Agent"}
          </button>
          <button
            style={styles.btnSecondary}
            onClick={() => wrap(triggerTick, "Tick")}
          >
            Run Agent Now
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Oracle Override (Demo)</span>
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Price override"
            value={oracleOverride}
            onChange={(e) => setOracleOverride(e.target.value)}
          />
          <button
            style={styles.btnSecondary}
            onClick={() =>
              wrap(
                () => overrideOraclePrice(parseFloat(oracleOverride)),
                "Override"
              )
            }
          >
            Override
          </button>
        </div>
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#1e1e2e",
    borderRadius: 8,
    padding: 20,
    color: "#fff",
  },
  heading: {
    margin: "0 0 16px 0",
    fontSize: 16,
    fontWeight: 600,
  },
  section: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase" as const,
    display: "block",
    marginBottom: 6,
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
    borderRadius: 6,
    border: "1px solid #444",
    backgroundColor: "#2a2a3e",
    color: "#fff",
    fontSize: 14,
  },
  btn: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#3b82f6",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  btnSecondary: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid #555",
    backgroundColor: "#2a2a3e",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  btnDanger: {
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#ef4444",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  msg: {
    marginTop: 10,
    fontSize: 13,
    color: "#aaa",
  },
};
