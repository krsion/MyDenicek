import type { Denicek, EventSnapshot } from "@mydenicek/core";
import { useMemo } from "react";

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
  { events, frontierSet, onReplay }: {
    events: EventSnapshot[];
    frontierSet: Set<string>;
    onReplay?: (eventId: string) => void;
  },
) {
  const peers = [...new Set(events.map((e) => e.peer))];
  const peerCol = new Map(peers.map((p, i) => [p, i]));

  const colWidth = 80;
  const rowHeight = 40;
  const padding = 30;
  const nodeRadius = 12;

  const width = peers.length * colWidth + padding * 2;
  const height = events.length * rowHeight + padding * 2;

  const positions = new Map<string, { x: number; y: number }>();
  events.forEach((ev, i) => {
    const col = peerCol.get(ev.peer) ?? 0;
    positions.set(ev.id, {
      x: padding + col * colWidth + colWidth / 2,
      y: padding + i * rowHeight + rowHeight / 2,
    });
  });

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
          const color = computePeerColor(ev.peer);
          const record = ev as Record<string, unknown>;
          const desc = record.editDescription
            ? ` — ${record.editDescription}`
            : "";
          return (
            <g
              key={`node-${ev.id}`}
              style={{ cursor: onReplay ? "pointer" : undefined }}
              onClick={onReplay ? () => onReplay(ev.id) : undefined}
            >
              <title>{`${ev.id}${desc}`}</title>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={color}
                stroke={isFrontier ? "#000" : color}
                strokeWidth={isFrontier ? 3 : 1.5}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontFamily="monospace"
                fontWeight={700}
                fill="#fff"
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
        onReplay={onReplay}
      />

      {/* Event table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
        }}
      >
        <thead>
          <tr
            style={{
              background: "#e8e8e8",
              textAlign: "left",
              position: "sticky",
              top: 0,
            }}
          >
            {["▶", "ID", "Peer", "Parents", "Edit Kind", "Target"].map((h) => (
              <th key={h} style={{ padding: "4px 6px", fontWeight: 600 }}>
                {h}
              </th>
            ))}
            {events.length > 0 &&
              (events[0] as Record<string, unknown>).vectorClock != null && (
              <th style={{ padding: "4px 6px", fontWeight: 600 }}>
                Vector Clock
              </th>
            )}
            {events.length > 0 &&
              (events[0] as Record<string, unknown>).editDescription !=
                null &&
              (
                <th style={{ padding: "4px 6px", fontWeight: 600 }}>
                  Description
                </th>
              )}
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => {
            const isFrontier = frontierSet.has(ev.id);
            const record = ev as Record<string, unknown>;
            const hasVectorClock = record.vectorClock != null;
            const hasDescription = record.editDescription != null;

            return (
              <tr
                key={ev.id}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                  fontWeight: isFrontier ? 700 : 400,
                }}
              >
                <td style={{ padding: "3px 6px" }}>
                  {onReplay && (
                    <button
                      type="button"
                      onClick={() => onReplay(ev.id)}
                      title={`Replay: ${record.editDescription ?? ev.editKind}`}
                      style={{
                        padding: "1px 6px",
                        fontSize: 10,
                        cursor: "pointer",
                        background: "#0078d4",
                        color: "#fff",
                        border: "none",
                        borderRadius: 3,
                      }}
                    >
                      ▶
                    </button>
                  )}
                </td>
                <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>
                  {ev.id}
                  {isFrontier && (
                    <span
                      style={{
                        marginLeft: 4,
                        background: "#0078d4",
                        color: "#fff",
                        borderRadius: 3,
                        padding: "0 4px",
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    >
                      frontier
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: "3px 6px",
                    color: computePeerColor(ev.peer),
                    fontWeight: 600,
                  }}
                >
                  {ev.peer}
                </td>
                <td style={{ padding: "3px 6px", color: "#666" }}>
                  {ev.parents.length > 0 ? ev.parents.join(", ") : "—"}
                </td>
                <td style={{ padding: "3px 6px" }}>
                  {shortenEditKind(ev.editKind)}
                </td>
                <td style={{ padding: "3px 6px", color: "#444" }}>
                  {ev.target}
                </td>
                {hasVectorClock && (
                  <td style={{ padding: "3px 6px", color: "#888" }}>
                    {JSON.stringify(record.vectorClock)}
                  </td>
                )}
                {hasDescription && (
                  <td style={{ padding: "3px 6px", color: "#555" }}>
                    {String(record.editDescription)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
