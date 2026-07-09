'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import { getConcepts, getConceptRelationships } from "@/lib/db";
import type { Concept, Subject, Priority } from "@/lib/db";

const SUBJECT_COLORS: Record<Subject, string> = {
  "B/B": "#06b6d4",
  "C/B": "#6366f1",
  "P/S": "#8b5cf6",
  "C/P": "#14b8a6",
};

const PRIORITY_GLOW: Record<Priority, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
};

const ALL_SUBJECTS: Subject[] = ["B/B", "C/B", "P/S", "C/P"];

function chapterKey(chapter: string | null): string {
  if (!chapter) return "";
  // Include book prefix so "Biology Ch.2" and "Chemistry Ch.2" don't collide
  const parts = chapter.split("·");
  const book = parts.length > 1 ? parts[0].trim() : "";
  const m = chapter.match(/Ch\.?\s*\d+/i);
  const ch = m ? m[0].replace(/\s/, "") : parts[parts.length - 1].trim().slice(0, 20);
  return book ? `${book}|${ch}` : ch;
}

function edgeLabel(chapter: string | null): string {
  if (!chapter) return "";
  const parts = chapter.split("·");
  return parts[parts.length - 1].trim().slice(0, 30);
}

type GraphNode = {
  id: string;
  name: string;
  subject: Subject;
  priority: Priority;
  seen: number;
  chapter: string;
  concept: Concept;
  // force-graph adds these at runtime:
  x?: number; y?: number; vx?: number; vy?: number;
};

type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
};

export default function KnowledgeGraphPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);

  const [selected, setSelected] = useState<Concept | null>(null);
  const [hovered, setHovered] = useState<Concept | null>(null);
  const selectedRef = useRef<Concept | null>(null);
  const hoveredRef = useRef<Concept | null>(null);
  const [enabledSubjects, setEnabledSubjects] = useState<Set<Subject>>(new Set(ALL_SUBJECTS));
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [dbEdges, setDbEdges] = useState<{ source: string; target: string; label: string }[]>([]);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });

  useEffect(() => {
    Promise.all([getConcepts(), getConceptRelationships()])
      .then(([c, r]) => {
        setConcepts(c);
        setDbEdges(r.map(rel => ({
          source: rel.source_concept_id,
          target: rel.target_concept_id,
          label: edgeLabel(rel.relationship_label),
        })));
      })
      .catch(err => console.error("Failed to load graph data:", err));
  }, []);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build graph data
  const graphData = useCallback(() => {
    const visible = concepts.filter(c => enabledSubjects.has(c.subject));
    const visibleIds = new Set(visible.map(c => c.id));

    const nodes: GraphNode[] = visible.map(c => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      priority: c.priority,
      seen: c.seen_count,
      chapter: edgeLabel(c.kaplan_chapter),
      concept: c,
    }));

    // Merge DB edges + chapter-derived edges
    const edgeMap = new Map<string, GraphLink>();
    for (const e of dbEdges) {
      if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue;
      const key = [e.source, e.target].sort().join("__");
      if (!edgeMap.has(key)) edgeMap.set(key, { source: e.source, target: e.target, label: e.label });
    }
    const byChapter = new Map<string, Concept[]>();
    for (const c of visible) {
      const k = chapterKey(c.kaplan_chapter);
      if (!k) continue;
      if (!byChapter.has(k)) byChapter.set(k, []);
      byChapter.get(k)!.push(c);
    }
    for (const [, group] of byChapter) {
      if (group.length < 2) continue;
      const lbl = edgeLabel(group[0].kaplan_chapter);
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const key = [group[i].id, group[j].id].sort().join("__");
          if (!edgeMap.has(key)) edgeMap.set(key, { source: group[i].id, target: group[j].id, label: lbl });
        }
      }
    }

    return { nodes, links: [...edgeMap.values()] };
  }, [concepts, dbEdges, enabledSubjects]);

  // Init / update force-graph
  useEffect(() => {
    if (!containerRef.current || concepts.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fg: any = null;
    let cancelled = false;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ForceGraph = (await import("force-graph") as any).default;
      if (cancelled || !containerRef.current) return;

      const data = graphData();

      fg = ForceGraph()(containerRef.current)
        .width(dimensions.w)
        .height(dimensions.h)
        .backgroundColor("#080b12")
        .graphData(data)

        // Nodes
        .nodeRelSize(5)
        .nodeVal((node: object) => {
          const n = node as GraphNode;
          return Math.max(1, n.seen * 1.2);
        })
        .nodeColor((node: object) => {
          const n = node as GraphNode;
          return SUBJECT_COLORS[n.subject] ?? "#6366f1";
        })
        .nodeCanvasObject((node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as GraphNode;
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          const r = Math.max(3, Math.sqrt(n.seen) * 4);
          const isSelected = selectedRef.current?.id === n.id;
          const isHovered = hoveredRef.current?.id === n.id;
          const color = SUBJECT_COLORS[n.subject] ?? "#6366f1";
          const glowColor = PRIORITY_GLOW[n.priority];

          // Outer glow ring for priority (critical/high only)
          if (n.priority === "critical" || n.priority === "high") {
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
            ctx.fillStyle = glowColor + "33";
            ctx.fill();
          }

          // Glow halo on hover/select
          if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
            ctx.fillStyle = color + "44";
            ctx.fill();
          }

          // Core node
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = isSelected || isHovered ? color : color + "bb";
          ctx.fill();

          // Inner highlight
          ctx.beginPath();
          ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fill();

          // Label — always show, fade with zoom
          const label = n.name.length > 22 ? n.name.slice(0, 22) + "…" : n.name;
          const fontSize = Math.max(10, 12 / globalScale);
          ctx.font = `${isSelected || isHovered ? "700" : "400"} ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = isSelected || isHovered ? "#e2e8f0" : `rgba(148,163,184,${Math.min(1, globalScale * 0.7 + 0.2)})`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x, y + r + fontSize * 0.9);
        })
        .nodeCanvasObjectMode(() => "replace")

        // Links
        .linkColor(() => "rgba(99,118,155,0.35)")
        .linkWidth(0.8)
        .linkDirectionalParticles(0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .linkCanvasObject((link: any, ctx: CanvasRenderingContext2D) => {
          const s = link.source as GraphNode;
          const t = link.target as GraphNode;
          if (!s.x || !t.x) return;

          // Draw line
          ctx.beginPath();
          ctx.moveTo(s.x, s.y!);
          ctx.lineTo(t.x, t.y!);
          ctx.strokeStyle = "rgba(61,80,112,0.5)";
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Chapter label at midpoint
          const l = link as GraphLink;
          if (l.label) {
            const mx = (s.x + t.x) / 2;
            const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
            ctx.font = "9px Inter, sans-serif";
            ctx.fillStyle = "rgba(100,116,139,0.75)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(l.label, mx, my);
          }
        })
        .linkCanvasObjectMode(() => "replace")

        .onNodeClick((node: object) => {
          const n = node as GraphNode;
          const next = selectedRef.current?.id === n.id ? null : n.concept;
          selectedRef.current = next;
          setSelected(next);
        })
        .onNodeHover((node: object | null) => {
          const c = node ? (node as GraphNode).concept : null;
          hoveredRef.current = c;
          setHovered(c);
          if (containerRef.current) {
            containerRef.current.style.cursor = node ? "pointer" : "default";
          }
        })
        // No onBackgroundClick — panel stays open until Dismiss is clicked

        // Physics tuning
        .d3AlphaDecay(0.02)
        .d3VelocityDecay(0.3);

      fg.d3Force("charge")?.strength(-150).distanceMax(250);
      fg.d3Force("link")?.distance(90).strength(0.5);
      fg.d3ReheatSimulation();

      graphRef.current = fg;
    })();

    return () => {
      cancelled = true;
      try { fg?._destructor?.(); } catch {}
      if (graphRef.current === fg) graphRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts, dbEdges, enabledSubjects]);

  // Resize
  useEffect(() => {
    graphRef.current?.width(dimensions.w).height(dimensions.h);
  }, [dimensions]);


  function toggleSubject(s: Subject) {
    setEnabledSubjects(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  const data = graphData();

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden", background: "#080b12" }}>

      {/* Left sidebar */}
      <aside style={{ width: 190, background: "#0d1117", borderRight: "1px solid #1e2433", padding: "1.25rem 0.9rem", display: "flex", flexDirection: "column", gap: "1.25rem", flexShrink: 0, overflowY: "auto" }}>

        {/* Title */}
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#e2e8f0" }}>Knowledge Graph</div>
          <div style={{ fontSize: "0.68rem", color: "#4a5568", marginTop: "0.2rem" }}>{concepts.length} concepts · {data.links.length} connections</div>
        </div>

        {/* Subject filters */}
        <div>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>Filter</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {ALL_SUBJECTS.map(s => {
              const on = enabledSubjects.has(s);
              const color = SUBJECT_COLORS[s];
              return (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: "0.55rem", cursor: "pointer" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? color : "#2d3748", flexShrink: 0, boxShadow: on ? `0 0 6px ${color}88` : "none", transition: "all 0.2s" }} />
                  <input type="checkbox" checked={on} onChange={() => toggleSubject(s)} style={{ display: "none" }} />
                  <span style={{ fontSize: "0.78rem", fontWeight: on ? 700 : 400, color: on ? color : "#4a5568", transition: "all 0.15s" }}>{s}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Priority legend */}
        <div>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem" }}>Priority Glow</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {(Object.entries(PRIORITY_GLOW) as [Priority, string][]).map(([p, color]) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}`, flexShrink: 0 }} />
                <span style={{ fontSize: "0.72rem", color: "#4a5568", textTransform: "capitalize" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: "0.68rem", color: "#2d3748", lineHeight: 1.6 }}>
          Scroll to zoom · drag to pan · click node to inspect
        </div>
      </aside>

      {/* Graph canvas */}
      <div ref={containerRef} style={{ flex: 1, position: "relative" }} />

      {/* Right detail panel */}
      {selected && (
        <aside style={{ width: 240, background: "#0d1117", borderLeft: "1px solid #1e2433", padding: "1.25rem 1rem", overflowY: "auto", flexShrink: 0 }}>
          {/* Subject accent bar */}
          <div style={{ width: "100%", height: 3, background: SUBJECT_COLORS[selected.subject], borderRadius: 2, marginBottom: "1rem", boxShadow: `0 0 8px ${SUBJECT_COLORS[selected.subject]}88` }} />

          <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#e2e8f0", lineHeight: 1.35, marginBottom: "0.5rem" }}>
            {selected.name}
          </div>

          {/* Badges */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${SUBJECT_COLORS[selected.subject]}22`, color: SUBJECT_COLORS[selected.subject], border: `1px solid ${SUBJECT_COLORS[selected.subject]}44` }}>
              {selected.subject}
            </span>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${PRIORITY_GLOW[selected.priority]}15`, color: PRIORITY_GLOW[selected.priority], border: `1px solid ${PRIORITY_GLOW[selected.priority]}44`, textTransform: "capitalize" }}>
              {selected.priority}
            </span>
          </div>

          {/* Kaplan chapter */}
          {selected.kaplan_chapter && (
            <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "0.45rem", padding: "0.6rem 0.75rem", marginBottom: "0.85rem" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Kaplan Chapter</div>
              <div style={{ fontSize: "0.8rem", color: "#e2e8f0", fontWeight: 600, lineHeight: 1.4 }}>{selected.kaplan_chapter}</div>
              {selected.kaplan_section && (
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.2rem" }}>§ {selected.kaplan_section}</div>
              )}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.85rem" }}>
            <div>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>Exposures</div>
              <div style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 700 }}>{selected.seen_count}×</div>
            </div>
            {selected.aamc_category && (
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>AAMC Category</div>
                <div style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 700 }}>{selected.aamc_category}</div>
              </div>
            )}
          </div>

          {selected.gap_analysis && (
            <div style={{ marginBottom: "0.85rem" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>Gap Analysis</div>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280", lineHeight: 1.65 }}>{selected.gap_analysis}</p>
            </div>
          )}

          {/* Same-chapter concepts */}
          {(() => {
            const key = chapterKey(selected.kaplan_chapter);
            const connected = concepts.filter(c => c.id !== selected.id && chapterKey(c.kaplan_chapter) === key);
            if (!connected.length || !key) return null;
            return (
              <div>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.45rem" }}>
                  Same Chapter ({connected.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {connected.map(c => (
                    <button key={c.id} onClick={() => setSelected(c)}
                      style={{ display: "flex", alignItems: "center", gap: "0.45rem", background: "rgba(255,255,255,0.03)", border: "1px solid #1e2433", borderRadius: "0.3rem", padding: "0.35rem 0.55rem", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: SUBJECT_COLORS[c.subject], boxShadow: `0 0 4px ${SUBJECT_COLORS[c.subject]}88`, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <button onClick={() => setSelected(null)}
            style={{ marginTop: "1.25rem", width: "100%", background: "transparent", border: "1px solid #1e2433", borderRadius: "0.4rem", padding: "0.4rem", fontSize: "0.72rem", color: "#4a5568", cursor: "pointer" }}>
            Dismiss
          </button>
        </aside>
      )}
    </div>
  );
}
