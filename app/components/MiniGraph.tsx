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
          const r = Math.max(4, Math.min(10, 4 + (node.seen ?? 0) * 1.2));
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const color = SUBJECT_COLORS[node.subject] ?? '#8899aa';
          const glowColor = PRIORITY_GLOW[node.priority] ?? '#1e2433';

          // Glow
          const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
          grd.addColorStop(0, color + '55');
          grd.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(x, y, r * 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = grd;
          ctx.fill();

          // Priority ring
          if (node.priority === 'critical' || node.priority === 'high') {
            ctx.beginPath();
            ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI);
            ctx.strokeStyle = glowColor + 'aa';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }

          // Core
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          // Label at higher zoom
          if (globalScale > 1.5) {
            const label = node.name.length > 18 ? node.name.slice(0, 16) + '…' : node.name;
            ctx.font = `${5 / globalScale}px Inter, sans-serif`;
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText(label, x, y + r + 4 / globalScale);
          }
        })
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
