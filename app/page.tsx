'use client';

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Clock, ChevronRight, Zap, BookOpen, BarChart2, Network } from "lucide-react";
import { getConcepts } from "@/lib/db";
import type { Concept, Priority, Subject } from "@/lib/db";

const MiniGraph = dynamic(() => import("./components/MiniGraph"), { ssr: false });

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  critical: { label: "Critical", color: "#ef4444", bg: "rgba(239,68,68,0.1)",  icon: <AlertTriangle size={12} /> },
  high:     { label: "High",     color: "#f97316", bg: "rgba(249,115,22,0.1)", icon: <Zap size={12} /> },
  medium:   { label: "Medium",   color: "#eab308", bg: "rgba(234,179,8,0.1)",  icon: <Clock size={12} /> },
  low:      { label: "Low",      color: "#22c55e", bg: "rgba(34,197,94,0.1)",  icon: <BookOpen size={12} /> },
};

const SUBJECT_META: Record<Subject, { color: string }> = {
  "B/B": { color: "#06b6d4" },
  "C/B": { color: "#6366f1" },
  "P/S": { color: "#8b5cf6" },
  "C/P": { color: "#14b8a6" },
};

function freqLabel(seen: number) {
  if (seen >= 5) return `${seen}× · Dedicated`;
  if (seen >= 3) return `${seen}× · Deep Review`;
  return `${seen}× · Quick`;
}

function ConceptRow({ concept }: { concept: Concept }) {
  const pm = PRIORITY_META[concept.priority];
  const sm = SUBJECT_META[concept.subject];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "0.75rem",
      padding: "0.85rem 0", borderBottom: "1px solid #151a26",
    }}>
      {/* Priority dot */}
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: pm.color, flexShrink: 0, marginTop: 6 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
          <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {concept.name}
          </span>
          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: sm.color, flexShrink: 0 }}>{concept.subject}</span>
        </div>
        {concept.gap_analysis && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#7a8fa3", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {concept.gap_analysis}
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem", flexShrink: 0 }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: pm.bg, color: pm.color, display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {pm.icon}{pm.label}
        </span>
        <span style={{ fontSize: "0.65rem", color: "#8899aa", fontWeight: 500 }}>{freqLabel(concept.seen_count)}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Concept | null>(null);

  useEffect(() => {
    getConcepts()
      .then(setConcepts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const critical = concepts.filter(c => c.priority === "critical").length;
  const totalSeen = concepts.reduce((a, c) => a + c.seen_count, 0);

  return (
    <div style={{ padding: "1.75rem 2rem", height: "100%", display: "flex", flexDirection: "column", gap: "1.25rem", boxSizing: "border-box" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.01em" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h1>
          <p style={{ margin: "0.2rem 0 0", color: "#8899aa", fontSize: "0.78rem" }}>Study Dashboard</p>
        </div>
        <Link href="/add-question" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#1e2433", color: "#818cf8", textDecoration: "none", borderRadius: "0.45rem", padding: "0.45rem 0.9rem", fontSize: "0.8rem", fontWeight: 700, border: "1px solid rgba(99,102,241,0.35)" }}>
          + Add Question
        </Link>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
        {[
          { label: "Concepts", value: concepts.length, color: "#6366f1", icon: <BookOpen size={14} /> },
          { label: "Critical",  value: critical,        color: "#ef4444", icon: <AlertTriangle size={14} /> },
          { label: "Exposures", value: totalSeen,       color: "#14b8a6", icon: <BarChart2 size={14} /> },
        ].map(s => (
          <div key={s.label} style={{ background: "#0f1117", border: "1px solid #1a1f2e", borderRadius: "0.6rem", padding: "0.85rem 1rem", display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <span style={{ color: s.color, opacity: 0.8 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#e2e8f0", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "0.65rem", color: "#8899aa", marginTop: "0.15rem" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main two-column body ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", flex: 1, minHeight: 0, height: 0 }}>

        {/* Left — Study Queue */}
        <div style={{ background: "#0f1117", border: "1px solid #1a1f2e", borderRadius: "0.75rem", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid #1a1f2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7a8fa3", textTransform: "uppercase", letterSpacing: "0.08em" }}>Study Queue</span>
            <span style={{ fontSize: "0.65rem", color: "#2d3748" }}>{concepts.length} concepts · by priority</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 1rem" }}>
            {loading ? (
              <p style={{ color: "#2d3748", fontSize: "0.8rem", padding: "1rem 0" }}>Loading...</p>
            ) : concepts.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem", padding: "2rem 0" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: "1px dashed #1e2433" }} />
                <span style={{ fontSize: "0.78rem", color: "#2d3748" }}>No concepts yet</span>
                <Link href="/add-question" style={{ fontSize: "0.75rem", color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>Add your first →</Link>
              </div>
            ) : (
              concepts.map(c => <ConceptRow key={c.id} concept={c} />)
            )}
          </div>
          {concepts.length > 0 && (
            <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid #1a1f2e" }}>
              <Link href="/practice" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", background: "rgba(99,102,241,0.12)", color: "#818cf8", textDecoration: "none", borderRadius: "0.4rem", padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700, border: "1px solid rgba(99,102,241,0.2)" }}>
                Start Practice Session <ChevronRight size={13} />
              </Link>
            </div>
          )}
        </div>

        {/* Right — Knowledge Graph */}
        <div style={{ background: "#080b12", border: "1px solid #1a1f2e", borderRadius: "0.75rem", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid #1a1f2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#7a8fa3", textTransform: "uppercase", letterSpacing: "0.08em" }}>Knowledge Map</span>
            <Link href="/knowledge-graph" style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.65rem", color: "#2d3748", textDecoration: "none", fontWeight: 600 }}>
              <Network size={11} /> Expand
            </Link>
          </div>

          {/* Legend */}
          <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #1a1f2e", display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
            {(Object.entries(SUBJECT_META) as [Subject, { color: string }][]).map(([s, m]) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />
                <span style={{ fontSize: "0.62rem", color: "#8899aa", fontWeight: 600 }}>{s}</span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 4px #ef4444" }} />
              <span style={{ fontSize: "0.62rem", color: "#8899aa" }}>critical</span>
            </div>
          </div>

          {/* Graph canvas */}
          <div style={{ position: "relative", height: 340 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <MiniGraph concepts={concepts} />
            </div>
          </div>

          {/* Node tooltip on click — shown at bottom */}
          {selectedNode && (
            <div style={{ padding: "0.65rem 1rem", borderTop: "1px solid #1a1f2e", background: "#0a0e17" }}>
              <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#e2e8f0" }}>{selectedNode.name}</div>
              <div style={{ fontSize: "0.65rem", color: "#7a8fa3", marginTop: "0.15rem" }}>{selectedNode.subject} · {selectedNode.seen_count}× seen</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
