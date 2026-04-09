import type { Denicek } from "@mydenicek/core";
import { useMemo } from "react";

interface EventGraphViewProps {
  denicek: Denicek;
  version: number;
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

export function EventGraphView({ denicek, version }: EventGraphViewProps) {
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
            {["ID", "Peer", "Parents", "Edit Kind", "Target"].map((h) => (
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
