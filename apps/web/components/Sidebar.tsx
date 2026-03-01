import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

const SIDEBAR_W = 276;
const SIDEBAR_W_COLLAPSED = 78;

type NavItem = { label: string; href: string; icon: IconName };
type IconName =
  | "dashboard"
  | "companies"
  | "chevron"
  | "treasury"
  | "agents"
  | "risk"
  | "reporting"
  | "settings"
  | "dot";

type SidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
};

export default function SidebarNav({ collapsed, onCollapsedChange }: SidebarProps) {
  const router = useRouter();
  const [companiesOpen, setCompaniesOpen] = useState(true);
  const [allCompaniesOpen, setAllCompaniesOpen] = useState(true);

  const activePath = router.pathname;

  const primaryItems: NavItem[] = useMemo(
    () => [
      { label: "Dashboard", href: "/", icon: "dashboard" },
      { label: "Treasury", href: "/treasury", icon: "treasury" },
      { label: "Agents", href: "/agents", icon: "agents" },
      { label: "Risk", href: "/risk", icon: "risk" },
      { label: "Reporting", href: "/reporting", icon: "reporting" },
      { label: "Settings", href: "/settings", icon: "settings" },
    ],
    []
  );

  const companyItems: NavItem[] = useMemo(
    () => [
      { label: "Atlas Manufacturing", href: "/company-atlas", icon: "dot" },
      { label: "Northwind Logistics", href: "/company-northwind", icon: "dot" },
      { label: "Harbor Health Systems", href: "/company-harbor", icon: "dot" },
    ],
    []
  );

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Sidebar navigation">
      <div className="brandRow">
        <div className="brand">
          <span className="brandMark" aria-hidden>●</span>
          <span className="brandText">horizn</span>
        </div>
        <button
          className="collapseBtn"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          <Icon name="chevron" className={`collapseChev ${collapsed ? "" : "chevLeft"}`} />
        </button>
      </div>

      <nav className="nav">
        <LinkRow
          item={primaryItems[0]}
          active={activePath === primaryItems[0].href}
          collapsed={collapsed}
        />

        <div className="section">
          <button
            type="button"
            className="dropdownBtn"
            onClick={() => setCompaniesOpen((v) => !v)}
            aria-expanded={companiesOpen}
            aria-label="Companies navigation"
          >
            <Icon name="companies" />
            <span className="label strong fadeLabel">Companies</span>
            <Icon
              name="chevron"
              className={`chev fadeLabel ${companiesOpen ? "open" : ""}`}
            />
          </button>

          <div className={`dropdown ${companiesOpen ? "open" : ""}`}>
            <div className="dropdownInner">
              <button
                type="button"
                className="dropdownBtn subheading"
                onClick={() => setAllCompaniesOpen((v) => !v)}
                aria-expanded={allCompaniesOpen}
                aria-label="All companies"
              >
                <span className="bullet" />
                <span className="label fadeLabel">All Companies</span>
                <Icon
                  name="chevron"
                  className={`chev fadeLabel ${allCompaniesOpen ? "open" : ""}`}
                />
              </button>

              <div className={`dropdown ${allCompaniesOpen ? "open" : ""}`}>
                <div className="dropdownInner innerPad">
                  {companyItems.map((it) => (
                    <LinkRow
                      key={it.href}
                      item={it}
                      active={activePath === it.href}
                      collapsed={collapsed}
                      isSub
                    />
                  ))}
                </div>
              </div>

              <LinkRow
                item={{ label: "Onboard Company", href: "/onboard-company", icon: "dot" }}
                active={activePath === "/onboard-company"}
                collapsed={collapsed}
                isSub
              />
              <LinkRow
                item={{ label: "Company Performance", href: "/company-performance", icon: "dot" }}
                active={activePath === "/company-performance"}
                collapsed={collapsed}
                isSub
              />
            </div>
          </div>
        </div>

        <div className="section stack">
          {primaryItems.slice(1).map((it) => (
            <LinkRow
              key={it.href}
              item={it}
              active={activePath === it.href}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      <style jsx>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          width: ${SIDEBAR_W}px;
          padding: 20px 18px;
          background: #0c0d11;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          color: var(--text);
          transition: width 240ms cubic-bezier(0.4, 0, 0.2, 1);
          overflow-x: hidden;
          overflow-y: auto;
          will-change: width;
        }
        .sidebar.collapsed {
          width: ${SIDEBAR_W_COLLAPSED}px;
        }

        .brandRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
          min-width: ${SIDEBAR_W - 36}px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          letter-spacing: 0.2px;
          overflow: hidden;
        }
        .brandMark {
          display: inline-block;
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          border-radius: 6px;
          background: var(--accent);
          color: transparent;
        }
        .brandText {
          font-size: 22px;
          color: var(--text);
          white-space: nowrap;
          opacity: ${collapsed ? 0 : 1};
          max-width: ${collapsed ? "0px" : "160px"};
          overflow: hidden;
          transition: opacity 160ms ease, max-width 240ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .collapseBtn {
          flex: 0 0 36px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: var(--text);
          width: 36px;
          height: 36px;
          border-radius: 12px;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .collapseChev {
          transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chevLeft {
          transform: rotate(180deg);
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
          min-width: ${SIDEBAR_W - 36}px;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 2px;
        }
        .stack {
          margin-top: 10px;
        }

        .dropdownBtn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: none;
          background: transparent;
          color: var(--text);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: background 120ms ease, color 120ms ease;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.1px;
          white-space: nowrap;
          overflow: hidden;
        }
        .dropdownBtn:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .dropdownBtn.subheading {
          padding-left: 12px;
          color: var(--muted);
        }

        .fadeLabel {
          opacity: ${collapsed ? 0 : 1};
          transition: opacity 160ms ease;
          pointer-events: ${collapsed ? "none" : "auto"};
        }

        .dropdown {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .dropdown.open {
          grid-template-rows: 1fr;
        }
        .dropdownInner {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 2px;
        }
        .innerPad {
          padding-left: 16px;
          padding-top: 6px;
        }

        .bullet {
          width: 10px;
          height: 10px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.12);
          flex: 0 0 auto;
        }

        .label {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: 0.1px;
        }
        .strong {
          font-weight: 700;
        }

        .chev {
          margin-left: auto;
          transition: transform 160ms ease, opacity 160ms ease;
        }
        .chev.open {
          transform: rotate(180deg);
        }
      `}</style>
    </aside>
  );
}

function LinkRow({
  item,
  active,
  collapsed,
  isSub = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  isSub?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`linkRow ${active ? "active" : ""}`}
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} className={isSub ? "subIcon" : ""} />
      <span className={`linkLabel ${isSub ? "subLabel" : ""}`}>{item.label}</span>
      <style jsx>{`
        .linkRow {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 14px;
          border-radius: 12px;
          color: ${active ? "var(--accent)" : "var(--text)"};
          text-decoration: none;
          background: ${active ? "rgba(0, 229, 160, 0.12)" : "transparent"};
          border: 1px solid ${active ? "rgba(0, 229, 160, 0.4)" : "transparent"};
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
        }
        .linkRow:hover {
          background: rgba(255, 255, 255, 0.04);
          color: ${active ? "var(--accent)" : "var(--text)"};
        }
        .linkLabel {
          font-size: 15px;
          font-weight: 600;
          opacity: ${collapsed ? 0 : 1};
          transition: opacity 160ms ease;
          overflow: hidden;
        }
        .subLabel {
          color: var(--muted);
          font-weight: 600;
        }
        .subIcon {
          opacity: 0.6;
        }
      `}</style>
    </Link>
  );
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  const size = 18;
  const stroke = "currentColor";

  switch (name) {
    case "dashboard":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
        </svg>
      );
    case "companies":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21V8l9-5 9 5v13" />
          <path d="M9 22V12h6v10" />
          <path d="M3 13h18" />
        </svg>
      );
    case "treasury":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 12h10" />
          <path d="M12 8v8" />
        </svg>
      );
    case "agents":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="7" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "risk":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 3 7v6c0 5 4 9 9 9s9-4 9-9V7l-9-5Z" />
          <path d="M12 8v4" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      );
    case "reporting":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h16" />
          <path d="M4 9h16" />
          <path d="M9 4v5" />
          <path d="M15 9V4" />
          <path d="M7 14v5" />
          <path d="M17 14v5" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .69.4 1.31 1.01 1.6.23.11.49.17.75.17H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case "chevron":
      return (
        <svg className={className} width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case "dot":
    default:
      return (
        <svg className={className} width={10} height={10} viewBox="0 0 10 10" fill={stroke}>
          <circle cx="5" cy="5" r="5" />
        </svg>
      );
  }
}
