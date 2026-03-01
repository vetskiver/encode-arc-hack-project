import React, { useEffect, useState, useRef } from "react";
import { StatusResponse, PlatformSummary } from "../lib/types";

interface Props {
  status: StatusResponse | null;
  platform?: PlatformSummary | null;
}

export default function HeaderStatusBar({ status, platform }: Props) {
  const [countdown, setCountdown] = useState("");
  const [flash, setFlash] = useState(false);
  const prevStatus = useRef(status?.status);

  useEffect(() => {
    if (!status?.nextTickAt) {
      setCountdown("");
      return;
    }
    const id = setInterval(() => {
      const remaining = Math.max(0, status.nextTickAt - Date.now());
      setCountdown(`${(remaining / 1000).toFixed(0)}s`);
    }, 500);
    return () => clearInterval(id);
  }, [status?.nextTickAt]);

  useEffect(() => {
    if (status?.status && status.status !== prevStatus.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      prevStatus.current = status.status;
      return () => clearTimeout(t);
    }
  }, [status?.status]);

  const agentStatus = status?.status || "Offline";

  const oraclePrice = platform?.oracle?.price ?? (status?.snapshot as any)?.oraclePrice ?? null;
  const oracleChangePct = platform?.oracle?.changePct ?? (status?.snapshot as any)?.changePct ?? null;
  const oracleSource = platform?.oracle?.source ?? (status?.snapshot as any)?.oracleSource ?? null;

  const statusColor =
    agentStatus === "Risk Mode"
      ? "var(--danger)"
      : agentStatus === "Executing"
      ? "var(--warning)"
      : agentStatus === "Offline"
      ? "var(--muted)"
      : "var(--accent)";

  const reason = status?.lastReason || "";
  const reasonIcon = reason.startsWith("Blocked")
    ? "🛑"
    : reason.startsWith("Risk")
    ? "⚠️"
    : reason.startsWith("Error")
    ? "✗"
    : reason.startsWith("Executed")
    ? "✓"
    : "·";

  return (
    <>
      <div
        className={`header${flash ? " flash" : ""}`}
        style={{ borderBottomColor: flash ? "rgba(239, 68, 68, 0.4)" : undefined }}
      >
        {/* Left: page context + last reason */}
        <div className="leftGroup">
          <span className="pageTitle">Dashboard</span>
          {reason ? (
            <div className="reasonPill">
              <span className="reasonIconSpan">{reasonIcon}</span>
              <span className="reasonText">{reason}</span>
            </div>
          ) : (
            <span className="reasonEmpty">Awaiting agent activity</span>
          )}
        </div>

        {/* Right: data cluster */}
        <div className="rightGroup">
          {oraclePrice != null && (
            <div className="oraclePill">
              <span className="oracleAsset">
                {oracleSource === "stork" ? "BTC/USD" : "SIM"}
              </span>
              <span className="oraclePrice">
                ${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {oracleChangePct != null && (
                <span
                  className="oracleChange"
                  style={{ color: oracleChangePct >= 0 ? "var(--accent)" : "var(--danger)" }}
                >
                  {oracleChangePct >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(oracleChangePct).toFixed(2)}%
                </span>
              )}
            </div>
          )}

          <div
            className="scaleBadge"
            title="All USD amounts at 1,000,000× institutional scale. Underlying testnet amounts are proportionally smaller."
          >
            Demo 1M×
          </div>

          <div className="sep" />

          <div className="statusGroup">
            <span
              className="statusDot"
              style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
            />
            <span className="statusText" style={{ color: statusColor }}>
              {agentStatus}
            </span>
            {status?.agentEnabled && countdown && (
              <span className="countdown">· {countdown}</span>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          height: 56px;
          padding: 0 24px;
          background: #0c0d11;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky;
          top: 0;
          z-index: 100;
          transition: border-color 0.5s ease;
        }

        .leftGroup {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .pageTitle {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: 0.2px;
          flex-shrink: 0;
        }

        .reasonPill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          min-width: 0;
          overflow: hidden;
        }

        .reasonIconSpan {
          font-size: 12px;
          flex-shrink: 0;
          line-height: 1;
        }

        .reasonText {
          font-size: 13px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .reasonEmpty {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.2);
          font-style: italic;
        }

        .rightGroup {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .oraclePill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
        }

        .oracleAsset {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--muted);
        }

        .oraclePrice {
          font-size: 14px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }

        .oracleChange {
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .scaleBadge {
          padding: 4px 8px;
          border-radius: 7px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
          cursor: help;
          flex-shrink: 0;
        }

        .sep {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        .statusGroup {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-shrink: 0;
        }

        .statusDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: pulse 2.5s ease-in-out infinite;
        }

        .statusText {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .countdown {
          font-size: 13px;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
