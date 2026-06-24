'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  Network,
  BookOpen,
  Dumbbell,
} from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const NAV_ITEMS = [
  { href: "/",                label: "Dashboard",      icon: LayoutDashboard },
  { href: "/add-question",    label: "Add Question",   icon: PlusCircle },
  { href: "/practice",        label: "Practice",       icon: Dumbbell },
  { href: "/knowledge-graph", label: "Knowledge Graph",icon: Network },
  { href: "/word-clarity",    label: "Word Clarity",   icon: BookOpen },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: "#12161f",
        borderRight: "1px solid #2d3748",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 0",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ padding: "0 1.25rem 1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1, #14b8a6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            M
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#e2e8f0", lineHeight: 1.2 }}>
              MCAT
            </div>
            <div style={{ fontSize: "0.68rem", color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Study Tool
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #2d3748", marginBottom: "1rem" }} />

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "0 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.55rem 0.75rem",
                borderRadius: "0.5rem",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                color: active ? "#e2e8f0" : "#64748b",
                background: active ? "#1e2433" : "transparent",
                transition: "all 0.15s",
                position: "relative",
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "20%",
                    bottom: "20%",
                    width: 3,
                    borderRadius: 2,
                    background: "#6366f1",
                  }}
                />
              )}
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "0 1.25rem", borderTop: "1px solid #2d3748", paddingTop: "1rem" }}>
        <div style={{ fontSize: "0.72rem", color: "#334155" }}>
          MCAT Study Tool v0.1
        </div>
      </div>
    </aside>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body style={{ display: "flex", minHeight: "100vh", background: "#0f1117" }}>
        <Sidebar />
        <main
          style={{
            flex: 1,
            marginLeft: 220,
            height: "100vh",
            overflowY: "auto",
            background: "#0f1117",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
