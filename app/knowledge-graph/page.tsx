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

export default function KnowledgeGraphPage() {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<cytoscape.Core | null>(null);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [enabledSubjects, setEnabledSubjects] = useState<Set<Subject>>(new Set(ALL_SUBJECTS));
  const [showMastered, setShowMastered] = useState(true);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [edges, setEdges] = useState<{ source: string; target: string; label: string }[]>([]);

  useEffect(() => {
    Promise.all([getConcepts(), getConceptRelationships()])
      .then(([c, r]) => {
        setConcepts(c);
        setEdges(r.map(rel => ({
          source: rel.source_concept_id,
          target: rel.target_concept_id,
          label: rel.relationship_label ?? "",
        })));
      })
      .catch(err => console.error("Failed to load graph data:", err));
  }, []);

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
              subject: c.subject,
              seen: c.seen_count,
              priority: c.priority,
            },
          })),
          ...edges
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
                PRIORITY_COLORS[ele.data("priority") as Priority] ?? "#64748b",
              "border-width": 3,
              width: (ele: cytoscape.NodeSingular) => Math.max(40, ele.data("seen") * 12),
              height: (ele: cytoscape.NodeSingular) => Math.max(40, ele.data("seen") * 12),
              label: "data(label)",
              "text-valign": "bottom",
              "text-halign": "center",
              color: "#e2e8f0",
              "font-size": 11,
              "font-weight": 600,
              "text-margin-y": 6,
              "text-outline-color": "#0f1117",
              "text-outline-width": 2,
            } as unknown as cytoscape.Css.Node,
          },
          {
            selector: "node:selected",
            style: {
              "border-color": "#fff",
              "border-width": 4,
              "overlay-opacity": 0,
            } as cytoscape.Css.Node,
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "#2d3748",
              "target-arrow-color": "#4a5568",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              label: "data(label)",
              "font-size": 9,
              color: "#64748b",
              "text-outline-color": "#0f1117",
              "text-outline-width": 2,
            } as cytoscape.Css.Edge,
          },
          {
            selector: "edge:selected",
            style: {
              "line-color": "#6366f1",
              "target-arrow-color": "#6366f1",
            } as cytoscape.Css.Edge,
          },
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 500,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 150,
          fit: true,
          padding: 40,
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
  }, [enabledSubjects, showMastered, concepts, edges]);

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
      <aside
        style={{
          width: 200,
          background: "#12161f",
          borderRight: "1px solid #2d3748",
          padding: "1.5rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Filter by Subject
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {ALL_SUBJECTS.map(s => {
              const checked = enabledSubjects.has(s);
              return (
                <label
                  key={s}
                  style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSubject(s)}
                    style={{ accentColor: SUBJECT_COLORS[s], width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: checked ? SUBJECT_COLORS[s] : "#4a5568",
                      transition: "color 0.15s",
                    }}
                  >
                    {s}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Display
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showMastered}
              onChange={() => setShowMastered(p => !p)}
              style={{ accentColor: "#22c55e", width: 14, height: 14 }}
            />
            <span style={{ fontSize: "0.8rem", color: showMastered ? "#22c55e" : "#4a5568", fontWeight: 600, transition: "color 0.15s" }}>
              Show Mastered
            </span>
          </label>
        </div>

        {/* Legend */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.75rem" }}>
            Priority Border
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(Object.entries(PRIORITY_COLORS) as [Priority, string][]).map(([p, color]) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "capitalize" }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
            Node Size
          </div>
          <p style={{ fontSize: "0.75rem", color: "#4a5568", margin: 0, lineHeight: 1.5 }}>
            Larger = more exposures. Scroll to zoom, drag to pan.
          </p>
        </div>
      </aside>

      {/* Graph */}
      <div style={{ flex: 1, position: "relative", background: "#0f1117" }}>
        <div ref={cyRef} style={{ width: "100%", height: "100%" }} />

        {/* Page title overlay */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: "rgba(15,17,23,0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid #2d3748",
            borderRadius: "0.6rem",
            padding: "0.5rem 0.9rem",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#e2e8f0" }}>Knowledge Graph</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{concepts.length} concepts · {edges.length} connections</div>
        </div>
      </div>

      {/* Right detail panel */}
      {selected && (
        <aside
          style={{
            width: 260,
            background: "#12161f",
            borderLeft: "1px solid #2d3748",
            padding: "1.5rem 1.1rem",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              height: 4,
              background: SUBJECT_COLORS[selected.subject],
              borderRadius: 2,
              marginBottom: "1.1rem",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#e2e8f0", marginBottom: "0.4rem" }}>
            {selected.name}
          </div>

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: `${SUBJECT_COLORS[selected.subject]}22`,
                color: SUBJECT_COLORS[selected.subject],
                border: `1px solid ${SUBJECT_COLORS[selected.subject]}44`,
              }}
            >
              {selected.subject}
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: `${PRIORITY_COLORS[selected.priority]}15`,
                color: PRIORITY_COLORS[selected.priority],
                border: `1px solid ${PRIORITY_COLORS[selected.priority]}44`,
                textTransform: "capitalize",
              }}
            >
              {selected.priority}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {(selected.kaplan_chapter || selected.kaplan_section) && (
              <Detail label="Kaplan Reference" value={`${selected.kaplan_chapter ?? ""} ${selected.kaplan_section ?? ""}`.trim()} />
            )}
            <Detail label="Exposures" value={`${selected.seen_count}×`} />
            {selected.gap_analysis && (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                  Gap Analysis
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.6 }}>
                  {selected.gap_analysis}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={() => setSelected(null)}
            style={{
              marginTop: "1.5rem",
              width: "100%",
              background: "transparent",
              border: "1px solid #2d3748",
              borderRadius: "0.45rem",
              padding: "0.45rem",
              fontSize: "0.78rem",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
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
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
