'use client';

import { useEffect, useRef } from 'react';
import type { Concept } from '@/lib/db';

const SUBJECT_COLORS: Record<string, string> = {
  'B/B': '#06b6d4',
  'C/B': '#6366f1',
  'P/S': '#8b5cf6',
  'C/P': '#14b8a6',
};

const PRIORITY_GLOW: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#8899aa',
};

function chapterKey(ch: string | null): string {
  if (!ch) return '';
  const m = ch.match(/Ch\.?\s*\d+/i);
  return m ? m[0].replace(/\s/, '') : ch.split('·').pop()?.trim().slice(0, 20) ?? '';
}

export default function MiniGraph({ concepts }: { concepts: Concept[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || concepts.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fg: any = null;

    (async () => {
      if (!containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ForceGraph = (await import('force-graph') as any).default;

      // Build edges from shared chapter
      const byChapter = new Map<string, typeof concepts>();
      for (const c of concepts) {
        const k = chapterKey(c.kaplan_chapter ?? null);
        if (!k) continue;
        if (!byChapter.has(k)) byChapter.set(k, []);
        byChapter.get(k)!.push(c);
      }
      const edges: { source: string; target: string }[] = [];
      const edgeSet = new Set<string>();
      for (const [, group] of byChapter) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const key = [group[i].id, group[j].id].sort().join('|');
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              edges.push({ source: group[i].id, target: group[j].id });
            }
          }
        }
      }

      const nodes = concepts.map(c => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        priority: c.priority,
        seen: c.seen_count,
      }));

      fg = ForceGraph()(containerRef.current)
        .backgroundColor('#080b12')
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight)
        .graphData({ nodes, links: edges })
        .nodeCanvasObject((node: { id: string; name: string; subject: string; priority: string; seen: number; x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const r = Math.max(3, Math.sqrt(node.seen ?? 1) * 4);
          const color = SUBJECT_COLORS[node.subject] ?? '#6366f1';
          const glowColor = PRIORITY_GLOW[node.priority] ?? '#8899aa';

          // Outer glow ring for priority
          if (node.priority === 'critical' || node.priority === 'high') {
            ctx.beginPath();
            ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
            ctx.fillStyle = glowColor + '33';
            ctx.fill();
          }

          // Core node
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color + 'bb';
          ctx.fill();

          // Inner highlight
          ctx.beginPath();
          ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fill();

          // Label
          const label = node.name.length > 22 ? node.name.slice(0, 22) + '…' : node.name;
          const fontSize = Math.max(10, 12 / globalScale);
          ctx.font = `400 ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = `rgba(148,163,184,${Math.min(1, globalScale * 0.7 + 0.2)})`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, y + r + fontSize * 0.9);
        })
        .nodeCanvasObjectMode(() => 'replace')
        .nodePointerAreaPaint((node: { x?: number; y?: number; seen?: number }, color: string, ctx: CanvasRenderingContext2D) => {
          const r = Math.max(4, Math.min(10, 4 + (node.seen ?? 0) * 1.2));
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r + 3, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        })
        .linkCanvasObject((link: { source: { x?: number; y?: number } | string; target: { x?: number; y?: number } | string }, ctx: CanvasRenderingContext2D) => {
          const s = link.source as { x?: number; y?: number };
          const t = link.target as { x?: number; y?: number };
          if (!s.x || !t.x) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y ?? 0);
          ctx.lineTo(t.x, t.y ?? 0);
          ctx.strokeStyle = 'rgba(99,102,241,0.25)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        })
        .d3AlphaDecay(0.03)
        .d3VelocityDecay(0.4)
        .enableZoomInteraction(true)
        .enablePanInteraction(true);

      fg.d3Force('charge')?.strength(-60).distanceMax(150);
      fg.d3Force('link')?.distance(50).strength(0.4);
    })();

    return () => {
      try { fg?._destructor?.(); } catch { /* ignore */ }
    };
  }, [concepts]);

  if (concepts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1f2e', border: '1px dashed #2d3748' }} />
        <span style={{ fontSize: '0.75rem', color: '#8899aa' }}>No concepts yet</span>
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
