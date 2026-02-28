import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";


type NavItem = { label: string; href: string};

function isActive(asPath: string, href: string) {
  // Home active when on "/" with no hash, or exact match
  if (href === "/") return asPath === "/" || asPath.startsWith("/#") === false;
  return asPath === href;
}

export default function SidebarNav() {
  const router = useRouter();

  const items: NavItem[] = [
    { label: "Home", href: "/"},
    { label: "Atlas Manufacturing", href: "/company-atlas"},
    { label: "Northwind Logistics", href: "/company-northwind"},
    { label: "Harbor Health Systems", href: "/company-harbor"},
  ];

  return (
    <aside style={styles.aside}>
      <div style={styles.brand}>Navigation</div>
        <img
            src="/horizn_logo.svg"
            alt="Horizn"
            style={{ width: 120, height: "auto", display: "block" }}
        />

      <nav style={styles.nav}>
        {items.map((it) => {
          const active = isActive(router.asPath, it.href);

          return (
            <Link key={it.href} href={it.href} scroll={false} style={{ textDecoration: "none" }}>
                <div className={`navItem ${active ? "active" : ""}`}>
                    <span style={styles.label}>{it.label}</span>
                </div>
            </Link>
          );
        })}
      </nav>

      <div style={styles.footerHint}></div>
      <style jsx>{`
            .navItem {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 10px;
                border-radius: 14px;
                border: 1px solid rgba(148, 163, 184, 0.10);
                background: rgba(2, 6, 23, 0.22);
                cursor: pointer;
                user-select: none;

                /* smooth hover/expand */
                transition:
                transform 140ms ease,
                background 140ms ease,
                border-color 140ms ease,
                box-shadow 140ms ease;
                transform-origin: left center;
            }

            .navItem:hover {
                transform: scale(1.05);
                background: rgba(2, 6, 23, 0.34);
                border-color: rgba(148, 163, 184, 0.18);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
            }

            .navItem.active {
                border: 1px solid rgba(34, 211, 238, 0.28);
                box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.10) inset;
            }
            }
        `}</style>
        </aside>);
}

const styles: Record<string, React.CSSProperties> = {
  aside: {
    position: "fixed",
    top: 12,
    left: 12,
    bottom: 12,
    width: 220,
    borderRadius: 18,
    padding: 14,
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 50,
  },
  brand: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.6,
    opacity: 0.95,
    textTransform: "uppercase",
  },
  nav: { display: "flex", flexDirection: "column", gap: 8, marginTop: 6 },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.10)",
    background: "rgba(2, 6, 23, 0.22)",
    cursor: "pointer",
    userSelect: "none",
  },
  itemActive: {
    border: "1px solid rgba(34, 211, 238, 0.28)",
    boxShadow: "0 0 0 1px rgba(34, 211, 238, 0.10) inset",
  },
};