'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, ChevronRight, Zap, BookOpen, BarChart2 } from "lucide-react";
import { getConcepts } from "@/lib/db";
import type { Concept, Priority, Subject } from "@/lib/db";

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  critical: { label: "Critical",  color: "#ef4444", bg: "rgba(239,68,68,0.12)",   icon: <AlertTriangle size={13} /> },
  high:     { label: "High",      color: "#f97316", bg: "rgba(249,115,22,0.12)",  icon: <Zap size={13} /> },
  medium:   { label: "Medium",    color: "#eab308", bg: "rgba(234,179,8,0.12)",   icon: <Clock size={13} /> },
  low:      { label: "Mastered",  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   icon: <BookOpen size={13} /> },
};

const SUBJECT_META: Record<Subject, { badgeClass: string; color: string }> = {
  "B/B": { badgeClass: "badge-bb", color: "#22d3ee" },
  "C/B": { badgeClass: "badge-cb", color: "#818cf8" },
  "P/S": { badgeClass: "badge-ps", color: "#a78bfa" },
  "C/P": { badgeClass: "badge-cp", color: "#2dd4bf" },
};

function freqLabel(seen: number): string {
  if (seen >= 5) return `Seen ${seen}x · Dedicated Review`;
  if (seen >= 3) return `Seen ${seen}x · Deep Review`;
  return `Seen ${seen}x · Quick Review`;
}

function ConceptCard({ concept }: { concept: Concept }) {
  const pm = PRIORITY_META[concept.priority];
  const sm = SUBJECT_META[concept.subject];

  return (
    <div
      className={`priority-${concept.priority}`}
      style={{
        background: "#1e2433",
        border: "1px solid #2d3748",
        borderRadius: "0.75rem",
        padding: "1.1rem 1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem", color: "#e2e8f0" }}>{concept.name}</span>
            <span
              className={sm.badgeClass}
              style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: "0.03em" }}
            >
              {concept.subject}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span className="freq-badge">{freqLabel(concept.seen_count)}</span>
            {(concept.kaplan_chapter || concept.kaplan_section) && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Kaplan {concept.kaplan_chapter} {concept.kaplan_section}
              </span>
            )}
          </div>
        </div>

        {/* Priority pill */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            background: pm.bg,
            color: pm.color,
            border: `1px solid ${pm.color}44`,
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: "0.72rem",
            fontWeight: 700,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {pm.icon}
          {pm.label}
        </span>
      </div>

      {/* Gap analysis */}
      {concept.gap_analysis && (
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: "0.4rem",
            padding: "0.55rem 0.75rem",
            fontSize: "0.82rem",
            color: "#94a3b8",
            lineHeight: 1.5,
            borderLeft: `3px solid ${pm.color}66`,
          }}
        >
          <span style={{ color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Gap ·{" "}
          </span>
          {concept.gap_analysis}
        </div>
      )}

      {/* Study Now button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            background: pm.color,
            color: "#fff",
            border: "none",
            borderRadius: "0.45rem",
            padding: "0.4rem 1rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Study Now <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConcepts()
      .then(data => setConcepts(data))
      .catch(err => console.error("Failed to load concepts:", err))
      .finally(() => setLoading(false));
  }, []);

  const critical = concepts.filter(c => c.priority === "critical").length;
  const totalSeen = concepts.reduce((a, c) => a + c.seen_count, 0);

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1000, margin: "0 auto" }}>

      {/* Page header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em" }}>
              Study Dashboard
            </h1>
            <p style={{ margin: "0.3rem 0 0", color: "#64748b", fontSize: "0.875rem" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <Link
            href="/add-question"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#3b82f6",
              color: "#fff",
              textDecoration: "none",
              borderRadius: "0.5rem",
              padding: "0.5rem 1.1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            + Add Question
          </Link>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", marginTop: "1.5rem" }}>
          {[
            { label: "Concepts Tracked", value: concepts.length, icon: <BookOpen size={18} />, color: "#6366f1" },
            { label: "Critical Items",   value: critical,         icon: <AlertTriangle size={18} />, color: "#ef4444" },
            { label: "Total Exposures",  value: totalSeen,        icon: <BarChart2 size={18} />, color: "#14b8a6" },
            { label: "Session Length",   value: "45 min",         icon: <Clock size={18} />, color: "#f97316" },
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                background: "#1e2433",
                border: "1px solid #2d3748",
                borderRadius: "0.65rem",
                padding: "1rem 1.1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <span style={{ color: stat.color }}>{stat.icon}</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#e2e8f0", lineHeight: 1 }}>{stat.value}</span>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Study Queue */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#e2e8f0" }}>
            Today&apos;s Study Queue
          </h2>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Sorted by priority · {concepts.length} concepts
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {loading ? (
            <div style={{ color: "#64748b", fontSize: "0.875rem", padding: "1rem 0" }}>Loading...</div>
          ) : concepts.length === 0 ? (
            <div
              style={{
                background: "#1e2433",
                border: "1px solid #2d3748",
                borderRadius: "0.75rem",
                padding: "2rem",
                textAlign: "center",
                color: "#64748b",
                fontSize: "0.875rem",
              }}
            >
              No concepts tracked yet. Add your first missed question to get started.
            </div>
          ) : (
            concepts.map(concept => (
              <ConceptCard key={concept.id} concept={concept} />
            ))
          )}
        </div>
      </section>

      {/* Session Planner */}
      {concepts.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#e2e8f0" }}>
              Session Planner
            </h2>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Next session · 45 min</span>
          </div>
          <div
            style={{
              background: "#1e2433",
              border: "1px solid #2d3748",
              borderRadius: "0.75rem",
              overflow: "hidden",
            }}
          >
            {concepts.slice(0, 4).map((concept, i, arr) => {
              const mode =
                concept.seen_count >= 5 ? "Active Recall + Diagram" :
                concept.seen_count >= 3 ? "Practice Problems" :
                concept.seen_count >= 2 ? "Mnemonics + Examples" : "Quick Review";
              const timeSlots = ["0–15 min", "15–30 min", "30–40 min", "40–45 min"];
              return (
                <div
                  key={concept.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.85rem 1.25rem",
                    borderBottom: i < arr.length - 1 ? "1px solid #2d3748" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#64748b",
                      fontWeight: 600,
                      minWidth: 80,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {timeSlots[i] ?? `+${i * 10} min`}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#e2e8f0" }}>{concept.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>{mode}</div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: "rgba(99,102,241,0.15)",
                      color: "#818cf8",
                      border: "1px solid rgba(99,102,241,0.3)",
                      borderRadius: 999,
                      padding: "2px 9px",
                      fontWeight: 600,
                    }}
                  >
                    Queued
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
