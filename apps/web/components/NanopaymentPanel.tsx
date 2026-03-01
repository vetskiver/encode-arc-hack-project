import React, { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

interface HealthResponse {
  ok: boolean;
  price: string;
  sellerAddress: string;
  networks: string | string[];
  endpoints: string[];
}

export default function NanopaymentPanel() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const ping = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/paywall/health`);
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  const endpoints = [
    {
      method: "GET",
      path: "/api/paywall/oracle/:symbol",
      price: "$0.01",
      description: "Live Stork oracle price for BTC, ETH, or USDC — settled on Arc",
      example: `${API_BASE}/api/paywall/oracle/BTCUSD`,
    },
    {
      method: "GET",
      path: "/api/paywall/risk/:companyId",
      price: "$0.01",
      description: "Full AI risk report — health factor, debt, last agent decision, policy thresholds",
      example: `${API_BASE}/api/paywall/risk/harbor`,
    },
  ];

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <div style={styles.badge}>x402</div>
          <h3 style={styles.title}>Nanopayments API</h3>
          <span style={styles.subtitle}>Circle micropayments · $0.01 per query · gasless Arc settlement</span>
        </div>
        <button style={styles.pingBtn} onClick={ping} disabled={loading}>
          {loading ? "Pinging…" : "Ping Live"}
        </button>
      </div>

      {health && (
        <div style={styles.healthBar}>
          <span style={styles.healthDot} />
          <span style={styles.healthText}>
            Live · Seller: <code style={styles.code}>{health.sellerAddress}</code>
            {" · "}
            Network: <code style={styles.code}>{Array.isArray(health.networks) ? health.networks.join(", ") : health.networks}</code>
            {" · "}
            Price: <strong style={{ color: "#10b981" }}>{health.price}</strong>
          </span>
        </div>
      )}

      <div style={styles.endpointList}>
        {endpoints.map((ep) => (
          <div key={ep.path} style={styles.endpoint}>
            <div style={styles.endpointTop}>
              <span style={styles.method}>{ep.method}</span>
              <code style={styles.path}>{ep.path}</code>
              <span style={styles.priceBadge}>{ep.price}</span>
            </div>
            <div style={styles.endpointDesc}>{ep.description}</div>
            <div style={styles.exampleRow}>
              <span style={styles.exampleLabel}>Try:</span>
              <code style={styles.example}>{ep.example}</code>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        Requests without a valid x402 payment header receive <code style={styles.code}>402 Payment Required</code>.
        Payments settle gaslessly on Arc Testnet (chain <code style={styles.code}>eip155:5042002</code>) via Circle's Nanopayments SDK.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--card)",
    borderRadius: 14,
    padding: 20,
    border: "1px solid rgba(99, 102, 241, 0.25)",
    boxShadow: "0 0 0 1px rgba(99,102,241,0.08), var(--shadow)",
    backdropFilter: "blur(6px)",
    animation: "fadeUp 0.6s ease both",
    animationDelay: "0.1s",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap" as const,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
  },
  badge: {
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    background: "rgba(99,102,241,0.18)",
    color: "#818cf8",
    border: "1px solid rgba(99,102,241,0.35)",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    color: "var(--muted)",
  },
  pingBtn: {
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: "pointer",
    background: "rgba(99,102,241,0.12)",
    color: "#818cf8",
    border: "1px solid rgba(99,102,241,0.3)",
    flexShrink: 0,
  },
  healthBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    background: "rgba(16,185,129,0.06)",
    border: "1px solid rgba(16,185,129,0.2)",
    marginBottom: 14,
    fontSize: 12,
    flexWrap: "wrap" as const,
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#10b981",
    flexShrink: 0,
    boxShadow: "0 0 6px #10b981",
  },
  healthText: {
    color: "var(--text)",
    opacity: 0.85,
    lineHeight: 1.6,
  },
  endpointList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    marginBottom: 14,
  },
  endpoint: {
    padding: "12px 14px",
    borderRadius: 10,
    background: "rgba(99,102,241,0.05)",
    border: "1px solid rgba(99,102,241,0.15)",
  },
  endpointTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap" as const,
  },
  method: {
    fontSize: 10,
    fontWeight: 800,
    color: "#818cf8",
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  path: {
    fontSize: 13,
    fontFamily: "var(--font-mono)",
    color: "var(--text)",
    opacity: 0.9,
  },
  priceBadge: {
    marginLeft: "auto",
    padding: "1px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    background: "rgba(16,185,129,0.12)",
    color: "#10b981",
    border: "1px solid rgba(16,185,129,0.25)",
    flexShrink: 0,
  },
  endpointDesc: {
    fontSize: 12,
    color: "var(--muted)",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  exampleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  exampleLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  example: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    color: "#818cf8",
    background: "rgba(99,102,241,0.08)",
    padding: "2px 6px",
    borderRadius: 4,
    wordBreak: "break-all" as const,
  },
  footer: {
    fontSize: 11,
    color: "var(--muted)",
    lineHeight: 1.6,
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(148,163,184,0.1)",
  },
  code: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "rgba(99,102,241,0.08)",
    padding: "1px 4px",
    borderRadius: 3,
    color: "#818cf8",
  },
};
