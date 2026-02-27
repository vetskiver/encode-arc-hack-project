import React, { useState } from "react";
import { requestPayment } from "../lib/api";

interface Props {
  defaultUser: string;
}

export default function PaymentRequestForm({ defaultUser }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      await requestPayment(defaultUser, to, amount);
      setMsg("Payment queued!");
      setTo("");
      setAmount("");
    } catch (err: any) {
      setMsg("Error: " + err.message);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.heading}>Request Payment</h3>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Recipient address (0x...)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        />
        <input
          style={styles.input}
          placeholder="Amount USDC"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <button type="submit" style={styles.btn}>
          Queue Payment
        </button>
      </form>
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
    margin: "0 0 12px 0",
    fontSize: 16,
    fontWeight: 600,
  },
  form: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  input: {
    flex: 1,
    minWidth: 160,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #444",
    backgroundColor: "#2a2a3e",
    color: "#fff",
    fontSize: 14,
  },
  btn: {
    padding: "8px 20px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#3b82f6",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  msg: {
    marginTop: 8,
    fontSize: 13,
    color: "#aaa",
  },
};
