'use client';

import { useEffect, useRef } from 'react';
import type cytoscape from 'cytoscape';
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
  low:      '#334155',
};

export default function MiniGraph({ concepts }: { concepts: Concept[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || concepts.length === 0) return;
    let cy: cytoscape.Core | null = null;

    (async () => {
      const cytoscape = (await import('cytoscape')).default;

      cy = cytoscape({
        container: containerRef.current!,
        elements: concepts.map(c => ({
          data: {
            id: c.id,
            label: c.name,
            subject: c.subject,
            priority: c.priority,
            seen: c.seen_count,
          },
        })),
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (ele: cytoscape.NodeSingular) =>
                SUBJECT_COLORS[ele.data('subject')] ?? '#334155',
              'background-opacity': 0.8,
              'border-color': (ele: cytoscape.NodeSingular) =>
                PRIORITY_GLOW[ele.data('priority')] ?? '#1e2433',
              'border-width': (ele: cytoscape.NodeSingular) =>
                ele.data('priority') === 'critical' ? 2.5 : 1,
              width: (ele: cytoscape.NodeSingular) =>
                Math.max(10, Math.min(20, 10 + ele.data('seen') * 2)),
              height: (ele: cytoscape.NodeSingular) =>
                Math.max(10, Math.min(20, 10 + ele.data('seen') * 2)),
              label: 'data(label)',
              'text-valign': 'bottom',
              'text-halign': 'center',
              color: '#4a5568',
              'font-size': 8,
              'font-weight': 500,
              'text-margin-y': 3,
              'text-max-width': '70px',
              'text-wrap': 'ellipsis',
              'text-outline-color': '#080b12',
              'text-outline-width': 2,
            } as unknown as cytoscape.Css.Node,
          },
          {
            selector: 'node:selected',
            style: {
              'background-opacity': 1,
              color: '#e2e8f0',
              'font-weight': 700,
            } as cytoscape.Css.Node,
          },
          {
            selector: 'edge',
            style: {
              width: 0.75,
              'line-color': '#151a26',
              'target-arrow-shape': 'none',
              'curve-style': 'haystack',
              opacity: 0.5,
            } as cytoscape.Css.Edge,
          },
        ],
        layout: {
          name: 'grid',
          animate: false,
          fit: true,
          padding: 48,
          avoidOverlap: true,
          avoidOverlapPadding: 20,
        } as cytoscape.LayoutOptions,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        autoungrabify: false,
        minZoom: 0.5,
        maxZoom: 4,
      });
    })();

    return () => { cy?.destroy(); };
  }, [concepts]);

  if (concepts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1f2e', border: '1px dashed #2d3748' }} />
        <span style={{ fontSize: '0.75rem', color: '#334155' }}>No concepts yet</span>
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
