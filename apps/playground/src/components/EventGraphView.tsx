import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { EventSnapshot } from '@mydenicek/core';

type Props = {
  events: EventSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  peerColorMap: Map<string, string>;
};

type LayoutNode = EventSnapshot & { x: number; y: number; depth: number };
type LayoutLink = { source: LayoutNode; target: LayoutNode };

const NODE_RADIUS = 22;
const X_SPACING = 130;
const Y_SPACING = 90;
const PADDING = 50;

function computeLayout(events: EventSnapshot[]): { nodes: LayoutNode[]; links: LayoutLink[] } {
  if (events.length === 0) return { nodes: [], links: [] };

  const byId = new Map(events.map(e => [e.id, e]));

  // Causal depth: max parent depth + 1
  const depth = new Map<string, number>();
  const sortedIds = topoSort(events);
  for (const id of sortedIds) {
    const ev = byId.get(id)!;
    const parentDepths = ev.parents.map(p => depth.get(p) ?? -1);
    depth.set(id, parentDepths.length > 0 ? Math.max(...parentDepths) + 1 : 0);
  }

  // Peer columns: stable assignment by first appearance in topo sort order.
  const peerOrder: string[] = [];
  const peerColumn = new Map<string, number>();
  for (const id of sortedIds) {
    const peer = byId.get(id)!.peer;
    if (!peerColumn.has(peer)) {
      peerColumn.set(peer, peerOrder.length);
      peerOrder.push(peer);
    }
  }

  const nodes: LayoutNode[] = events.map(ev => ({
    ...ev,
    depth: depth.get(ev.id) ?? 0,
    x: PADDING + (peerColumn.get(ev.peer) ?? 0) * X_SPACING,
    y: PADDING + (depth.get(ev.id) ?? 0) * Y_SPACING,
  }));

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const links: LayoutLink[] = [];
  for (const node of nodes) {
    for (const parentId of node.parents) {
      const parentNode = nodeById.get(parentId);
      if (parentNode) links.push({ source: parentNode, target: node });
    }
  }

  return { nodes, links };
}

function topoSort(events: EventSnapshot[]): string[] {
  const allIds = new Set(events.map(e => e.id));
  const indegree = new Map(events.map(e => [e.id, 0]));
  const children = new Map<string, string[]>(events.map(e => [e.id, []]));
  for (const ev of events) {
    for (const p of ev.parents) {
      if (allIds.has(p)) {
        indegree.set(ev.id, (indegree.get(ev.id) ?? 0) + 1);
        children.get(p)?.push(ev.id);
      }
    }
  }
  // Sort queue lexicographically so concurrent events are processed in stable order.
  const queue = events
    .filter(e => (indegree.get(e.id) ?? 0) === 0)
    .map(e => e.id)
    .sort();
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    const next: string[] = [];
    for (const child of children.get(id) ?? []) {
      const deg = (indegree.get(child) ?? 1) - 1;
      indegree.set(child, deg);
      if (deg === 0) next.push(child);
    }
    // Insert newly-ready nodes in sorted order for deterministic output.
    next.sort();
    queue.push(...next);
    queue.sort();
  }
  return result;
}

const FALLBACK_COLOR = '#0078d4';
const PEER_COLORS = ['#0078d4', '#107c10', '#d83b01', '#8764b8', '#00b7c3', '#ca5010'];

export { PEER_COLORS };

export function EventGraphView({ events, selectedId, onSelect, peerColorMap }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { nodes, links } = computeLayout(events);

    if (nodes.length === 0) {
      svg.append('text')
        .attr('x', '50%').attr('y', '50%')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', '#888').attr('font-size', '13px')
        .text('No events yet');
      return;
    }

    // Assign colors from the provided peer color map; fall back if a peer is unknown.
    const peerColor = (peer: string) => peerColorMap.get(peer) ?? FALLBACK_COLOR;

    const maxX = Math.max(...nodes.map(n => n.x)) + PADDING + NODE_RADIUS;
    const maxY = Math.max(...nodes.map(n => n.y)) + PADDING + NODE_RADIUS + 30;

    svg.attr('width', Math.max(maxX, 200)).attr('height', Math.max(maxY, 100));

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('markerWidth', 8).attr('markerHeight', 8)
      .attr('refX', 6).attr('refY', 3)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L0,6 L8,3 z')
      .attr('fill', '#999');

    const g = svg.append('g').attr('class', 'graph-root');

    // Zoom/pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform))
    );

    // Draw edges
    g.selectAll<SVGLineElement, LayoutLink>('line.edge')
      .data(links)
      .join('line')
      .attr('class', 'edge')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y + NODE_RADIUS)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y - NODE_RADIUS)
      .attr('stroke', '#bbb')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Draw nodes
    const nodeGroup = g.selectAll<SVGGElement, LayoutNode>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => onSelect(d.id === selectedId ? null : d.id));

    nodeGroup.append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill', d => d.id === selectedId ? peerColor(d.peer) : '#fff')
      .attr('stroke', d => peerColor(d.peer))
      .attr('stroke-width', 2);

    nodeGroup.append('text')
      .attr('y', NODE_RADIUS + 16)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#333')
      .text(d => d.id);

    nodeGroup.append('text')
      .attr('y', -NODE_RADIUS - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .text(d => d.editKind.replace(/Edit$/, ''));

    nodeGroup.append('title')
      .text(d => `${d.id}\n${d.editKind}\ntarget: ${d.target}\nparents: ${d.parents.join(', ')}`);

  }, [events, selectedId, onSelect]);

  return (
    <div style={{ overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 4, minHeight: 120 }}>
      <svg ref={svgRef} style={{ display: 'block', minWidth: 200, minHeight: 100 }} />
    </div>
  );
}
