import { type CSSProperties, useState } from "react";
import type { PeerSession } from "../peer-session.ts";
import type { EventSnapshot } from "@mydenicek/core";
import { EventGraphView } from "./EventGraphView.tsx";
import { MaterializedTree } from "./MaterializedTree.tsx";
import { ConflictsPanel } from "./ConflictsPanel.tsx";
import { EditComposer } from "./EditComposer.tsx";

type Props = {
  session: PeerSession;
  peerColor: string;
  peerColorMap: Map<string, string>;
  onEdit: () => void;
};

function EventDetails({ event }: { event: EventSnapshot }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontFamily: "monospace",
        padding: "8px",
        background: "#f8f8f8",
        borderRadius: 4,
      }}
    >
      <div>
        <strong>ID:</strong> {event.id}
      </div>
      <div>
        <strong>Peer:</strong> {event.peer}
      </div>
      <div>
        <strong>Seq:</strong> {event.seq}
      </div>
      <div>
        <strong>Edit:</strong> {event.editKind}
      </div>
      <div>
        <strong>Target:</strong> {event.target}
      </div>
      <div>
        <strong>Parents:</strong>{" "}
        {event.parents.length > 0 ? event.parents.join(", ") : "(root)"}
      </div>
    </div>
  );
}

export function PeerWorkspace(
  { session, peerColor, peerColorMap, onEdit }: Props,
) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const snapshot = session.snapshot();
  const selectedEvent = snapshot.events.find((e) => e.id === selectedEventId) ??
    null;

  const sectionTitle: CSSProperties = {
    fontWeight: 600,
    fontSize: 12,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
    marginTop: 0,
  };

  return (
    <div
      style={{
        width: 400,
        border: `2px solid ${peerColor}`,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{ background: peerColor, padding: "8px 12px", color: "#fff" }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>{session.peerId}</span>
        <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.8 }}>
          frontiers: {snapshot.frontiers.join(", ") || "—"}
        </span>
      </div>

      <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
        {/* Event Graph */}
        <p style={sectionTitle}>Event Graph</p>
        <EventGraphView
          events={snapshot.events}
          selectedId={selectedEventId}
          onSelect={setSelectedEventId}
          peerColorMap={peerColorMap}
        />

        {/* Event Details */}
        {selectedEvent && (
          <div style={{ marginTop: 8 }}>
            <p style={sectionTitle}>Event Details</p>
            <EventDetails event={selectedEvent} />
          </div>
        )}

        {/* Materialized Tree */}
        <p style={{ ...sectionTitle, marginTop: 12 }}>Materialized Tree</p>
        <MaterializedTree node={snapshot.doc} />

        {/* Conflicts */}
        <p style={{ ...sectionTitle, marginTop: 12 }}>
          Conflicts {snapshot.conflicts.length > 0 && (
            <span
              style={{
                background: "#f7bd4a",
                color: "#333",
                borderRadius: 10,
                padding: "1px 6px",
                fontSize: 10,
                marginLeft: 4,
              }}
            >
              {snapshot.conflicts.length}
            </span>
          )}
        </p>
        <ConflictsPanel conflicts={snapshot.conflicts} />

        {/* Edit Composer */}
        <p style={{ ...sectionTitle, marginTop: 12 }}>Edit</p>
        <EditComposer session={session} onEdit={onEdit} />
      </div>
    </div>
  );
}
