import type { Denicek, EventSnapshot } from "@mydenicek/core";
import { useMemo, useState } from "react";

interface EventGraphViewProps {
  denicek: Denicek;
  version: number;
  onReplay?: (eventId: string) => void;
}

const PEER_COLORS = [
  "#0078d4",
  "#d13438",
  "#107c10",
  "#ca5010",
  "#8764b8",
  "#008272",
  "#c239b3",
  "#57811b",
];

function computePeerColor(peer: string): string {
  let hash = 0;
  for (let i = 0; i < peer.length; i++) {
    hash = (hash * 31 + peer.charCodeAt(i)) | 0;
  }
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

function shortenEditKind(kind: string): string {
  return kind.endsWith("Edit") ? kind.slice(0, -4) : kind;
}

function DagVisualization(
  { events, frontierSet, selectedId, onSelect }: {
    events: EventSnapshot[];
    frontierSet: Set<string>;
    selectedId: string | null;
    onSelect: (eventId: string) => void;
  },
) {
  const peers = [...new Set(events.map((e) => e.peer))];
  const peerCol = new Map(peers.map((p, i) => [p, i]));

  // Compute row per event: row = max(parent rows) + 1
  // Concurrent events land on the same row in different peer columns.
  const rowOf = new Map<string, number>();
  for (const ev of events) {
    let maxParentRow = -1;
    for (const pid of ev.parents) {
      const pr = rowOf.get(pid);
      if (pr !== undefined && pr > maxParentRow) maxParentRow = pr;
    }
    rowOf.set(ev.id, maxParentRow + 1);
  }
  const totalRows = Math.max(0, ...rowOf.values()) + 1;

  const colWidth = 80;
  const rowHeight = 40;
  const padding = 30;
  const nodeRadius = 12;

  const width = peers.length * colWidth + padding * 2;
  const height = totalRows * rowHeight + padding * 2;

  const positions = new Map<string, { x: number; y: number }>();
  for (const ev of events) {
    const col = peerCol.get(ev.peer) ?? 0;
    const row = rowOf.get(ev.id) ?? 0;
    positions.set(ev.id, {
      x: padding + col * colWidth + colWidth / 2,
      y: padding + row * rowHeight + rowHeight / 2,
    });
  }

  return (
    <div
      style={{
        maxHeight: 250,
        overflow: "auto",
        borderBottom: "1px solid #ccc",
      }}
    >
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* Peer labels */}
        {peers.map((peer) => {
          const col = peerCol.get(peer) ?? 0;
          const x = padding + col * colWidth + colWidth / 2;
          return (
            <text
              key={`label-${peer}`}
              x={x}
              y={14}
              textAnchor="middle"
              fontSize={10}
              fontFamily="monospace"
              fontWeight={600}
              fill={computePeerColor(peer)}
            >
              {peer.slice(0, 6)}
            </text>
          );
        })}

        {/* Edges (drawn first so nodes render on top) */}
        {events.flatMap((ev) =>
          ev.parents.map((parentId) => {
            const from = positions.get(ev.id);
            const to = positions.get(parentId);
            if (!from || !to) return null;
            return (
              <line
                key={`edge-${ev.id}-${parentId}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#ccc"
                strokeWidth={1.5}
              />
            );
          })
        )}

        {/* Nodes */}
        {events.map((ev) => {
          const pos = positions.get(ev.id);
          if (!pos) return null;
          const isFrontier = frontierSet.has(ev.id);
          const isSelected = ev.id === selectedId;
          const color = computePeerColor(ev.peer);
          const record = ev as Record<string, unknown>;
          const desc = record.editDescription
            ? ` — ${record.editDescription}`
            : "";
          return (
            <g
              key={`node-${ev.id}`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(ev.id)}
            >
              <title>{`${ev.id}${desc}`}</title>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={isSelected ? "#fff" : color}
                stroke={isSelected ? color : isFrontier ? "#000" : color}
                strokeWidth={isSelected ? 3 : isFrontier ? 3 : 1.5}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontFamily="monospace"
                fontWeight={700}
                fill={isSelected ? color : "#fff"}
              >
                {ev.seq}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function EventGraphView(
  { denicek, version, onReplay }: EventGraphViewProps,
) {
  void version;

  const events = denicek.inspectEvents();
  const frontierSet = useMemo(
    () => new Set(denicek.frontiers),
    [denicek.frontiers],
  );

  const peers = useMemo(() => {
    const seen = new Set<string>();
    for (const ev of events) seen.add(ev.peer);
    return seen;
  }, [events]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? events.find((e) => e.id === selectedId) ?? null
    : null;

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 12,
        overflow: "auto",
        height: "100%",
      }}
    >
      {/* Stats header */}
      <div
        style={{
          padding: "6px 10px",
          background: "#f0f0f0",
          borderBottom: "1px solid #ddd",
          display: "flex",
          gap: 16,
          fontWeight: 600,
        }}
      >
        <span>Events: {events.length}</span>
        <span>Peers: {peers.size}</span>
        <span>Frontier: {frontierSet.size}</span>
      </div>

      {/* DAG visualization */}
      <DagVisualization
        events={events}
        frontierSet={frontierSet}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Selected event detail */}
      {selected && (
        <EventDetail
          event={selected}
          isFrontier={frontierSet.has(selected.id)}
          onReplay={onReplay}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function EventDetail(
  { event, isFrontier, onReplay, onClose }: {
    event: EventSnapshot;
    isFrontier: boolean;
    onReplay?: (eventId: string) => void;
    onClose: () => void;
  },
) {
  const record = event as Record<string, unknown>;
  const color = computePeerColor(event.peer);
  return (
    <div
      style={{
        padding: "10px 14px",
        background: "#fafafa",
        borderTop: "1px solid #ddd",
        fontSize: 11,
        lineHeight: 1.8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {event.id}
          {isFrontier && (
            <span
              style={{
                marginLeft: 6,
                background: "#0078d4",
                color: "#fff",
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              frontier
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {onReplay && (
            <button
              type="button"
              onClick={() => onReplay(event.id)}
              style={{
                padding: "2px 10px",
                fontSize: 11,
                cursor: "pointer",
                background: "#0078d4",
                color: "#fff",
                border: "none",
                borderRadius: 3,
              }}
            >
              ▶ Replay
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "2px 10px",
              fontSize: 11,
              cursor: "pointer",
              background: "transparent",
              color: "#666",
              border: "1px solid #ccc",
              borderRadius: 3,
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div>
        <b>Peer:</b>{" "}
        <span style={{ color, fontWeight: 600 }}>{event.peer}</span>
      </div>
      <div>
        <b>Edit:</b> {shortenEditKind(event.editKind)} → {event.target}
      </div>
      {record.editDescription && (
        <div>
          <b>Description:</b> {String(record.editDescription)}
        </div>
      )}
      <div>
        <b>Parents:</b>{" "}
        {event.parents.length > 0 ? event.parents.join(", ") : "none (root)"}
      </div>
      {record.vectorClock && (
        <div>
          <b>Vector Clock:</b> {JSON.stringify(record.vectorClock)}
        </div>
      )}
    </div>
  );
}
