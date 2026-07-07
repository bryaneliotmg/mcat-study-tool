'use client';

import { useEffect, useRef, useState } from "react";
import type cytoscape from "cytoscape";
import { getConcepts, getConceptRelationships } from "@/lib/db";
import type { Concept, Subject, Priority } from "@/lib/db";

const SUBJECT_COLORS: Record<Subject, string> = {
  "B/B": "#06b6d4",
  "C/B": "#6366f1",
  "P/S": "#8b5cf6",
  "C/P": "#14b8a6",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

const ALL_SUBJECTS: Subject[] = ["B/B", "C/B", "P/S", "C/P"];

// Extract short chapter key e.g. "Ch.3" from "Kaplan Biology · Ch.3: Genetics"
function chapterKey(chapter: string | null): string {
  if (!chapter) return "";
  const m = chapter.match(/Ch\.?\s*\d+/i);
  return m ? m[0].replace(/\s/, "") : chapter.split("·").pop()?.trim().slice(0, 20) ?? "";
}

// Short label for edge: strip book prefix, keep "Ch.N: Title"
function edgeLabel(chapter: string | null): string {
  if (!chapter) return "";
  const parts = chapter.split("·");
  return parts[parts.length - 1].trim().slice(0, 30);
}

export default function KnowledgeGraphPage() {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [enabledSubjects, setEnabledSubjects] = useState<Set<Subject>>(new Set(ALL_SUBJECTS));
  const [showMastered, setShowMastered] = useState(true);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [dbEdges, setDbEdges] = useState<{ source: string; target: string; label: string }[]>([]);

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

  // Derive edges from shared kaplan chapters (client-side, covers existing data)
  const allEdges = (() => {
    const edgeMap = new Map<string, { source: string; target: string; label: string }>();

    // DB edges first
    for (const e of dbEdges) {
      const key = [e.source, e.target].sort().join("__");
      if (!edgeMap.has(key)) edgeMap.set(key, e);
    }

    // Compute from shared chapter
    const byChapter = new Map<string, Concept[]>();
    for (const c of concepts) {
      const key = chapterKey(c.kaplan_chapter);
      if (!key) continue;
      if (!byChapter.has(key)) byChapter.set(key, []);
      byChapter.get(key)!.push(c);
    }
    for (const [, group] of byChapter) {
      if (group.length < 2) continue;
      const label = edgeLabel(group[0].kaplan_chapter);
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const key = [group[i].id, group[j].id].sort().join("__");
          if (!edgeMap.has(key)) {
            edgeMap.set(key, { source: group[i].id, target: group[j].id, label });
          }
        }
      }
    }

    return [...edgeMap.values()];
  })();

  useEffect(() => {
    let cy: cytoscape.Core | null = null;

    async function initCy() {
      if (!cyRef.current) return;
      const cytoscape = (await import("cytoscape")).default;

      const visibleConcepts = concepts.filter(c => {
        if (!enabledSubjects.has(c.subject)) return false;
        if (!showMastered && c.priority === "low") return false;
        return true;
      });
      const visibleIds = new Set(visibleConcepts.map(c => c.id));

      cy = cytoscape({
        container: cyRef.current,
        elements: [
          ...visibleConcepts.map(c => ({
            data: {
              id: c.id,
              label: c.name,
              chapter: edgeLabel(c.kaplan_chapter),
              subject: c.subject,
              seen: c.seen_count,
              priority: c.priority,
            },
          })),
          ...allEdges
            .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
            .map(e => ({
              data: { source: e.source, target: e.target, label: e.label },
            })),
        ],
        style: [
          {
            selector: "node",
            style: {
              "background-color": (ele: cytoscape.NodeSingular) =>
                SUBJECT_COLORS[ele.data("subject") as Subject] ?? "#6366f1",
              "border-color": (ele: cytoscape.NodeSingular) =>
                PRIORITY_COLORS[ele.data("priority") as Priority] ?? "#8899aa",
              "border-width": 1,
              width: (ele: cytoscape.NodeSingular) => Math.min(28, Math.max(14, 10 + ele.data("seen") * 3)),
              height: (ele: cytoscape.NodeSingular) => Math.min(28, Math.max(14, 10 + ele.data("seen") * 3)),
              label: "data(label)",
              "text-valign": "bottom",
              "text-halign": "center",
              color: "#94a3b8",
              "font-size": 9,
              "font-weight": 500,
              "text-margin-y": 4,
              "text-outline-color": "#0a0e17",
              "text-outline-width": 2,
              "text-max-width": "80px",
              "text-wrap": "ellipsis",
            } as unknown as cytoscape.Css.Node,
          },
          {
            selector: "node:selected",
            style: {
              "border-color": "#fff",
              "border-width": 2,
              color: "#e2e8f0",
              "font-weight": 700,
              "overlay-opacity": 0,
            } as cytoscape.Css.Node,
          },
          {
            selector: "edge",
            style: {
              width: 1.5,
              "line-color": "#3d5070",
              "target-arrow-color": "#3d5070",
              "target-arrow-shape": "none",
              "curve-style": "straight",
              label: "data(label)",
              "font-size": 8,
              color: "#94a3b8",
              "text-outline-color": "#0a0e17",
              "text-outline-width": 2,
              "text-rotation": "autorotate",
              "text-background-color": "#0a0e17",
              "text-background-opacity": 0.7,
              "text-background-padding": "2px",
            } as unknown as cytoscape.Css.Edge,
          },
          {
            selector: "edge:selected",
            style: {
              "line-color": "#6366f1",
              width: 2.5,
              color: "#e2e8f0",
            } as cytoscape.Css.Edge,
          },
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 400,
          nodeRepulsion: () => 12000,
          idealEdgeLength: () => 100,
          nodeOverlap: 20,
          fit: true,
          padding: 60,
          randomize: true,
          nodeDimensionsIncludeLabels: true,
        } as cytoscape.LayoutOptions,
        userZoomingEnabled: true,
        userPanningEnabled: true,
      });

      cy.on("tap", "node", evt => {
        const node = evt.target;
        const concept = concepts.find(c => c.id === node.id());
        setSelected(concept ?? null);
      });

      cy.on("tap", evt => {
        if (evt.target === cy) setSelected(null);
      });

      cyInstance.current = cy;
    }

    initCy();

    return () => {
      cy?.destroy();
      cyInstance.current = null;
    };
  }, [enabledSubjects, showMastered, concepts, allEdges]);

  function toggleSubject(s: Subject) {
    setEnabledSubjects(prev => {
      const next = new Set(prev);
      if (next.has(s)) { next.delete(s); } else { next.add(s); }
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>

      {/* Left sidebar */}
      <aside style={{ width: 200, background: "#12161f", borderRight: "1px solid #2d3748", padding: "1.5rem 1rem", display: "flex", flexDirection: "column", gap: "1.5rem", flexShrink: 0, overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Filter by Subject
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {ALL_SUBJECTS.map(s => {
              const checked = enabledSubjects.has(s);
              return (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSubject(s)} style={{ accentColor: SUBJECT_COLORS[s], width: 14, height: 14 }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: checked ? SUBJECT_COLORS[s] : "#7a8fa3", transition: "color 0.15s" }}>{s}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>Display</div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
            <input type="checkbox" checked={showMastered} onChange={() => setShowMastered(p => !p)} style={{ accentColor: "#22c55e", width: 14, height: 14 }} />
            <span style={{ fontSize: "0.8rem", color: showMastered ? "#22c55e" : "#7a8fa3", fontWeight: 600, transition: "color 0.15s" }}>Show Mastered</span>
          </label>
        </div>

        {/* Legend */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>Priority Border</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(Object.entries(PRIORITY_COLORS) as [Priority, string][]).map(([p, color]) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", color: "#8899aa", textTransform: "capitalize" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Connections</div>
          <p style={{ fontSize: "0.72rem", color: "#7a8fa3", margin: 0, lineHeight: 1.5 }}>
            Lines connect concepts in the same Kaplan chapter. Click an edge to see the chapter.
          </p>
        </div>

        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Node Size</div>
          <p style={{ fontSize: "0.72rem", color: "#7a8fa3", margin: 0, lineHeight: 1.5 }}>
            Larger = more exposures. Scroll to zoom, drag to pan.
          </p>
        </div>
      </aside>

      {/* Graph */}
      <div style={{ flex: 1, position: "relative", background: "#0a0e17" }}>
        <div ref={cyRef} style={{ width: "100%", height: "100%" }} />

        {/* Title overlay */}
        <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(10,14,23,0.9)", backdropFilter: "blur(8px)", border: "1px solid #2d3748", borderRadius: "0.6rem", padding: "0.5rem 0.9rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Knowledge Graph</div>
          <div style={{ fontSize: "0.72rem", color: "#8899aa" }}>{concepts.length} concepts · {allEdges.length} connections</div>
        </div>
      </div>

      {/* Right detail panel */}
      {selected && (
        <aside style={{ width: 260, background: "#12161f", borderLeft: "1px solid #2d3748", padding: "1.5rem 1.1rem", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ width: "100%", height: 4, background: SUBJECT_COLORS[selected.subject], borderRadius: 2, marginBottom: "1.1rem" }} />

          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#e2e8f0", marginBottom: "0.4rem" }}>
            {selected.name}
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${SUBJECT_COLORS[selected.subject]}22`, color: SUBJECT_COLORS[selected.subject], border: `1px solid ${SUBJECT_COLORS[selected.subject]}44` }}>
              {selected.subject}
            </span>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${PRIORITY_COLORS[selected.priority]}15`, color: PRIORITY_COLORS[selected.priority], border: `1px solid ${PRIORITY_COLORS[selected.priority]}44`, textTransform: "capitalize" }}>
              {selected.priority}
            </span>
          </div>

          {/* Chapter — highlighted */}
          {selected.kaplan_chapter && (
            <div style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "0.5rem", padding: "0.6rem 0.85rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.25rem" }}>
                Kaplan Chapter
              </div>
              <div style={{ fontSize: "0.82rem", color: "#e2e8f0", fontWeight: 700, lineHeight: 1.4 }}>
                {selected.kaplan_chapter}
              </div>
              {selected.kaplan_section && (
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                  § {selected.kaplan_section}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <Detail label="Exposures" value={`${selected.seen_count}×`} />
            {selected.gap_analysis && (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>Gap Analysis</div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.6 }}>{selected.gap_analysis}</p>
              </div>
            )}

            {/* Connected concepts in same chapter */}
            {(() => {
              const key = chapterKey(selected.kaplan_chapter);
              const connected = concepts.filter(c => c.id !== selected.id && chapterKey(c.kaplan_chapter) === key);
              if (!connected.length || !key) return null;
              return (
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
                    Same Chapter ({connected.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {connected.map(c => (
                      <button key={c.id} onClick={() => setSelected(c)}
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(255,255,255,0.04)", border: "1px solid #1e2433", borderRadius: "0.35rem", padding: "0.4rem 0.6rem", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: SUBJECT_COLORS[c.subject], flexShrink: 0 }} />
                        <span style={{ fontSize: "0.78rem", color: "#cbd5e1", fontWeight: 500 }}>{c.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <button onClick={() => setSelected(null)} style={{ marginTop: "1.5rem", width: "100%", background: "transparent", border: "1px solid #2d3748", borderRadius: "0.45rem", padding: "0.45rem", fontSize: "0.78rem", color: "#8899aa", cursor: "pointer" }}>
            Dismiss
          </button>
        </aside>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{label}</div>
      <div style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
