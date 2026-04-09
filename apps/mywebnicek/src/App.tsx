import { Text } from "@fluentui/react-components";
import { useDenicek } from "@mydenicek/react";
import { useMemo, useState } from "react";

import { CommandBar } from "./CommandBar.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { EventGraphView } from "./EventGraphView.tsx";
import { INITIAL_DOCUMENT } from "./initializeDocument.ts";
import { RawDocumentView } from "./RawDocumentView.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";

// @ts-ignore: Vite injects import.meta.env at build time
const VITE_SYNC_URL: string | undefined = import.meta.env?.VITE_SYNC_URL;
const SYNC_SERVER_URL: string = VITE_SYNC_URL ??
  (globalThis.location?.hostname === "localhost"
    ? "ws://localhost:8787/sync"
    : "wss://mydenicek-core-krsion-dev-sync.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync");

function getRoomId(): string {
  if (globalThis.location?.hash && globalThis.location.hash.length > 1) {
    return globalThis.location.hash.slice(1);
  }
  const id = crypto.randomUUID().slice(0, 8);
  globalThis.location.hash = id;
  return id;
}

const PEER_SESSION_KEY = "mydenicek-peer-id";

/** Unique peer ID per tab, survives refreshes via sessionStorage. */
function getOrCreatePeerId(): string {
  const stored = globalThis.sessionStorage?.getItem(PEER_SESSION_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID().slice(0, 7);
  globalThis.sessionStorage?.setItem(PEER_SESSION_KEY, id);
  return id;
}

const statusColors: Record<string, string> = {
  connected: "#107c10",
  connecting: "#ca5010",
  disconnected: "#d13438",
  idle: "#8a8a8a",
};

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

  const [syncEnabled, setSyncEnabled] = useState(true);
  const [panels, setPanels] = useState({
    rendered: true,
    raw: false,
    events: false,
  });

  const togglePanel = (key: keyof typeof panels) =>
    setPanels((p) => ({ ...p, [key]: !p[key] }));

  const toggleSync = () => {
    if (syncEnabled) {
      dk.pauseSync();
    } else {
      dk.resumeSync();
    }
    setSyncEnabled(!syncEnabled);
  };

  const activePanels = Object.entries(panels).filter(([, on]) => on);

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
          {(["rendered", "raw", "events"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => togglePanel(key)}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                cursor: "pointer",
                background: panels[key] ? "#0078d4" : "transparent",
                color: panels[key] ? "#fff" : "#616161",
                border: panels[key] ? "1px solid #0078d4" : "1px solid #d0d0d0",
                borderRadius: 4,
              }}
            >
              {key === "rendered"
                ? "Document"
                : key === "raw"
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
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ● {dk.syncStatus} — peer: {peerId} — room: {roomId}
          <button
            type="button"
            onClick={toggleSync}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer",
              background: syncEnabled ? "#d13438" : "#107c10",
              color: "#fff",
              border: "none",
              borderRadius: 3,
            }}
          >
            {syncEnabled ? "Disconnect" : "Connect"}
          </button>
        </span>
      </div>

      {/* Main area — side-by-side panels */}
      <div
        style={{
          flex: 1,
          display: "flex",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {activePanels.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
            }}
          >
            Toggle a panel above
          </div>
        )}
        {panels.rendered && (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: 24,
              borderRight: activePanels.length > 1
                ? "1px solid #e0e0e0"
                : undefined,
            }}
          >
            <ErrorBoundary>
              <RenderedDocument doc={dk.doc} />
            </ErrorBoundary>
          </div>
        )}
        {panels.raw && (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              borderRight: panels.events ? "1px solid #e0e0e0" : undefined,
            }}
          >
            <RawDocumentView doc={dk.doc} />
          </div>
        )}
        {panels.events && (
          <div style={{ flex: 1, overflow: "auto" }}>
            <EventGraphView
              denicek={dk.denicek}
              version={dk.version}
              onReplay={(eventId) => {
                try {
                  dk.denicek.repeatEditFromEventId(eventId);
                  dk.forceUpdate();
                } catch (e) {
                  console.error("Replay failed:", e);
                }
              }}
            />
          </div>
        )}
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
