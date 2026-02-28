import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

const SIDEBAR_W = 270;
const SIDEBAR_W_COLLAPSED = 74;

type NavItem = { label: string; href: string };

type SidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
};

export default function SidebarNav({ collapsed, onCollapsedChange }: SidebarProps) {
  const router = useRouter();
  const [companiesOpen, setCompaniesOpen] = useState(true);

  const activePath = router.pathname;

  const topItems: NavItem[] = useMemo(() => [{ label: "Home", href: "/" }], []);

  const companyItems: NavItem[] = useMemo(
    () => [
      { label: "Atlas Manufacturing", href: "/company-atlas" },
      { label: "Northwind Logistics", href: "/company-northwind" },
      { label: "Harbor Health Systems", href: "/company-harbor" },
    ],
    []
  );

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Sidebar navigation">
      <div className="top">
        <div className="brand">

          {!collapsed && <img src="/horizn_logo.svg" alt="Horizn" className="logo" />}
        </div>

        <button
          className="collapseBtn"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          type="button"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="nav">
        <div className="section">
          {topItems.map((it) => {
            const active = activePath === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`navItem ${active ? "active" : ""}`}
                style={{ textDecoration: "none" }}
              >
                <span className="dot" />
                {!collapsed && <span className="label">{it.label}</span>}
                {collapsed && <span className="srOnly">{it.label}</span>}
              </Link>
            );
          })}
        </div>

        <div className="section">
          <button
            type="button"
            className="dropdownBtn"
            onClick={() => setCompaniesOpen((v) => !v)}
            aria-expanded={companiesOpen}
          >
            <span className="dot" />
            {!collapsed && <span className="label">Companies</span>}
            {!collapsed && <span className={`chev ${companiesOpen ? "open" : ""}`}>⌄</span>}
            {collapsed && <span className="srOnly">Companies</span>}
          </button>

          <div className={`dropdown ${companiesOpen ? "open" : ""}`}>
            <div className="dropdownInner">
              {companyItems.map((it) => {
                const active = activePath === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`navItem sub ${active ? "active" : ""}`}
                    title={collapsed ? it.label : undefined}
                    style={{ textDecoration: "none" }}
                  >
                    <span className="bullet" />
                    {!collapsed && <span className="label">{it.label}</span>}
                    {collapsed && <span className="srOnly">{it.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      <style jsx>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          height: 100vh;
          width: ${SIDEBAR_W}px;
          padding: 14px;
          border-radius: 24px;
          margin: 14px;
          background: rgba(2, 6, 23, 0.65);
          border: 1px solid rgba(148, 163, 184, 0.14);
          backdrop-filter: blur(10px);
          z-index: 50;
          transition: width 180ms ease;
        }
        .sidebar.collapsed {
          width: ${SIDEBAR_W_COLLAPSED}px;
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .logo {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: block;
        }
        .brandText {
          font-weight: 800;
          font-size: 13px;
          color: rgba(226, 232, 240, 0.92);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .collapseBtn {
          border: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(2, 6, 23, 0.35);
          color: rgba(226, 232, 240, 0.9);
          border-radius: 12px;
          width: 34px;
          height: 34px;
          cursor: pointer;
          transition: transform 140ms ease, background 140ms ease;
        }
        .collapseBtn:hover {
          transform: scale(1.05);
          background: rgba(2, 6, 23, 0.5);
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .navItem,
        .dropdownBtn {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.1);
          background: rgba(2, 6, 23, 0.22);
          color: rgba(226, 232, 240, 0.9);
          cursor: pointer;
          user-select: none;
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
          transform-origin: left center;
        }

        .navItem:hover,
        .dropdownBtn:hover {
          transform: scale(1.03);
          background: rgba(2, 6, 23, 0.34);
          border-color: rgba(148, 163, 184, 0.18);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }

        .navItem.active {
          border: 1px solid rgba(34, 211, 238, 0.28);
          box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.12) inset;
        }

        .sub {
          padding-left: 18px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(34, 211, 238, 0.6);
          flex: 0 0 auto;
        }
        .bullet {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.6);
          flex: 0 0 auto;
        }

        .label {
          font-weight: 700;
          font-size: 14px;
          line-height: 1.2;
          min-width: 0;
        }

        .chev {
          margin-left: auto;
          opacity: 0.8;
          transition: transform 160ms ease;
        }
        .chev.open {
          transform: rotate(180deg);
        }

        /* dropdown open/close */
        .dropdown {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 180ms ease;
        }
        .dropdown.open {
          grid-template-rows: 1fr;
        }
        .dropdownInner {
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 10px;
        }

        .srOnly {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </aside>
  );
}