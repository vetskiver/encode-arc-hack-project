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

      <nav style={styles.nav}>
        {items.map((it) => {
          const active = isActive(router.asPath, it.href);

          return (
            <Link key={it.href} href={it.href} scroll={false} style={{ textDecoration: "none" }}>
              <div style={{ ...styles.item, ...(active ? styles.itemActive : {}) }}>
                <span style={styles.label}>{it.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div style={styles.footerHint}>Tip: Click a company to jump</div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  aside: {
    position: "fixed",
    top: 12,
    left: 12,
    bottom: 12,
    width: 240,
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
    opacity: 0.8,
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
  emoji: { width: 18, textAlign: "center" },
  label: { fontSize: 13, fontWeight: 800, opacity: 0.92 },
  footerHint: { marginTop: "auto", fontSize: 12, opacity: 0.7, fontWeight: 600 },
};