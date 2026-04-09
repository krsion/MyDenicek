import { Text } from "@fluentui/react-components";
import { useDenicek } from "@mydenicek/react";
import { useMemo, useState } from "react";

import { CommandBar } from "./CommandBar.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { EventGraphView } from "./EventGraphView.tsx";
import { INITIAL_DOCUMENT } from "./initializeDocument.ts";
import { RawDocumentView } from "./RawDocumentView.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";

const SYNC_SERVER_URL = globalThis.location?.hostname === "localhost"
  ? "ws://localhost:8787/sync"
  : "wss://mydenicek-core-krsion-dev-sync.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync";

function getRoomId(): string {
  if (globalThis.location?.hash && globalThis.location.hash.length > 1) {
    return globalThis.location.hash.slice(1);
  }
  const id = crypto.randomUUID().slice(0, 8);
  globalThis.location.hash = id;
  return id;
}

const PEER_ID_KEY = "mydenicek-peer-id";
/** Stable peer ID persisted in localStorage. Generated once, reused forever. */
function getOrCreatePeerId(): string {
  const stored = globalThis.localStorage?.getItem(PEER_ID_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID().slice(0, 12);
  globalThis.localStorage?.setItem(PEER_ID_KEY, id);
  return id;
}

const statusColors: Record<string, string> = {
  connected: "#107c10",
  connecting: "#ca5010",
  disconnected: "#d13438",
  idle: "#8a8a8a",
};

const views = ["rendered", "raw", "events"] as const;
type ViewMode = (typeof views)[number];

function Editor(
  { peerId, roomId }: {
    peerId: string;
    roomId: string;
  },
) {
  const dk = useDenicek({
    peer: peerId,
    initialDocument: INITIAL_DOCUMENT,
    sync: { url: SYNC_SERVER_URL, roomId },
  });

  const [view, setView] = useState<ViewMode>("rendered");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          background: "#f5f5f5",
          borderBottom: "1px solid #e0e0e0",
          flexShrink: 0,
        }}
      >
        <Text size={400} weight="semibold" style={{ color: "#242424" }}>
          mydenicek
        </Text>
        <div style={{ display: "flex", gap: 4 }}>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                cursor: "pointer",
                background: view === v ? "#0078d4" : "transparent",
                color: view === v ? "#fff" : "#616161",
                border: view === v ? "1px solid #0078d4" : "1px solid #d0d0d0",
                borderRadius: 4,
              }}
            >
              {v === "rendered"
                ? "Document"
                : v === "raw"
                ? "Raw JSON"
                : "Event Graph"}
            </button>
          ))}
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: statusColors[dk.syncStatus] ?? "#8a8a8a",
          }}
        >
          ● {dk.syncStatus} — peer: {peerId.slice(0, 6)} — room: {roomId}
        </span>
      </div>

      {/* Main area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          padding: view === "rendered" ? 24 : 0,
          minHeight: 0,
        }}
      >
        <ErrorBoundary>
          {view === "rendered" && <RenderedDocument doc={dk.doc} />}
          {view === "raw" && <RawDocumentView doc={dk.doc} />}
          {view === "events" && (
            <EventGraphView denicek={dk.denicek} version={dk.version} />
          )}
        </ErrorBoundary>
      </div>

      {/* Bottom command bar */}
      <ErrorBoundary>
        <CommandBar dk={dk} />
      </ErrorBoundary>
    </div>
  );
}

export function App() {
  const roomId = useMemo(getRoomId, []);
  const peerId = useMemo(getOrCreatePeerId, []);

  return <Editor peerId={peerId} roomId={roomId} />;
}
