import React, { useEffect, useState, useCallback } from "react";
import { getCompanyStatus, getCompanyLogs, getPlatformSummary } from "../lib/api";
import { StatusResponse, ActionLog, PlatformSummary } from "../lib/types";
import HeaderStatusBar from "../components/HeaderStatusBar";
import RiskOverview from "../components/RiskOverview";
import DecisionReasoningPanel from "../components/DecisionReasoningPanel";
import TreasuryBuckets from "../components/TreasuryBuckets";
import PaymentRequestForm from "../components/PaymentRequestForm";
import CollateralPanel from "../components/CollateralPanel";
import ActionLogTable from "../components/ActionLogTable";
import SidebarNav from "../components/Sidebar";
import PlatformOverview from "../components/PlatformOverview";
import CompanyProfileCard from "../components/CompanyProfileCard";

const POLL_INTERVAL = 3000;
const SIDEBAR_W = 276;
const SIDEBAR_W_COLLAPSED = 78;
const SIDEBAR_MARGIN = 28;

const COMPANY_ID = "northwind";

export default function CompanyNorthwindPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [platform, setPlatform] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const leftPad = (sidebarCollapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W) + SIDEBAR_MARGIN;

  const refresh = useCallback(async () => {
    try {
      const [s, l, p] = await Promise.all([
        getCompanyStatus(COMPANY_ID),
        getCompanyLogs(COMPANY_ID),
        getPlatformSummary(),
      ]);
      setStatus(s);
      setLogs(l);
      setPlatform(p);
      setError("");
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  const policy = status?.company?.policy;
  const minHealthBps = policy?.minHealthBps ?? 14000;
  const emergencyHealthBps = policy?.emergencyHealthBps ?? 12000;

  return (
  <div style={{ ...styles.page, paddingLeft: leftPad, transition: "padding-left 240ms cubic-bezier(0.4, 0, 0.2, 1)" }}>
    <SidebarNav collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
    <HeaderStatusBar status={status} platform={platform} title="Northwind Logistics" />
    <PlatformOverview status={status} platform={platform} />

    {error && <div style={styles.error}>Backend unreachable: {error}</div>}

    <div style={styles.layout}>

      <div style={styles.main}>
        <CompanyProfileCard
          name={status?.company?.name || "Northwind Logistics"}
          riskProfile={status?.company?.riskProfile || "balanced"}
          policy={status?.company?.policy || null}
          address="0x0000000000000000000000000000000000000002"
        />
        <RiskOverview
          snapshot={status?.snapshot || null}
          lastReason={status?.lastReason}
          minHealthBps={minHealthBps}
          emergencyHealthBps={emergencyHealthBps}
        />
        <DecisionReasoningPanel
          snapshot={status?.snapshot || null}
          lastReason={status?.lastReason}
          status={status?.status}
        />
        <TreasuryBuckets snapshot={status?.snapshot || null} />
        <ActionLogTable logs={logs} />
      </div>

       <div style={styles.side}>
        <CollateralPanel
          defaultUser="0x0000000000000000000000000000000000000002"
          agentEnabled={status?.agentEnabled || false}
          snapshot={status?.snapshot || null}
        />
        <PaymentRequestForm defaultUser="0x0000000000000000000000000000000000000002" />
      </div>

    </div>
  </div>
);
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh" },
  layout: {
    maxWidth: 950,
    margin: "0 auto",
    padding: 20,
    display: "column",
    gridTemplateColumns: "2fr 1fr",
    gap: 16,
    alignItems: "start",
  },
  main: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  side: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  error: {
    padding: "10px 20px",
    backgroundColor: "rgba(127, 29, 29, 0.6)",
  },
};
