import React, { useState } from "react";
import { requestPayment } from "../lib/api";

interface Props {
  defaultUser: string;
}

export default function PaymentRequestForm({ defaultUser }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      if (requiresApproval) {
        const ok = window.confirm("Approval required. Queue anyway?");
        if (!ok) {
          setMsg("Payment not queued (approval required).");
          return;
        }
      }
      await requestPayment(defaultUser, to, amount);
      setMsg(requiresApproval ? "Payment queued (approval required)." : "Payment queued!");
      setTo("");
      setAmount("");
      setVendorName("");
      setInvoiceId("");
    } catch (err: any) {
      setMsg("Error: " + err.message);
    }
  };

  return (
    <div style={{ ...styles.card, animationDelay: "0.16s" }}>
      <h3 style={styles.heading}>Pay Vendor</h3>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Vendor name"
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Invoice ID (optional)"
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Vendor wallet (0x...)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
        />
        <input
          style={styles.input}
          placeholder="Amount (USDC)"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <label style={styles.toggle}>
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
          />
          Require approval
        </label>
        <button type="submit" style={styles.btn}>
          Queue Vendor Payment
        </button>
      </form>
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
    margin: "0 0 12px 0",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
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
    borderRadius: 10,
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontSize: 14,
    outline: "none",
  },
  btn: {
    padding: "8px 20px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
    color: "#061018",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--muted)",
  },
  msg: {
    marginTop: 8,
    fontSize: 13,
    color: "var(--muted)",
  },
};
