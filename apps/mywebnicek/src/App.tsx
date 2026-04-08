import { Text } from "@fluentui/react-components";
import type { PlainRecord } from "@mydenicek/react";
import { useDenicek } from "@mydenicek/react";
import { useEffect, useMemo, useState } from "react";

import { CommandBar } from "./CommandBar.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { initializeDocument } from "./initializeDocument.ts";
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

function isRec(v: unknown): v is PlainRecord {
  return typeof v === "object" && v !== null &&
    "$tag" in (v as Record<string, unknown>) &&
    !("$items" in (v as Record<string, unknown>)) &&
    !("$ref" in (v as Record<string, unknown>));
}

const statusColors: Record<string, string> = {
  connected: "#107c10",
  connecting: "#ca5010",
  disconnected: "#d13438",
  idle: "#8a8a8a",
};

function PeerNamePrompt(
  { onSubmit }: { onSubmit: (name: string) => void },
) {
  const [name, setName] = useState("");
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}
      >
        <Text size={500} weight="semibold" block style={{ marginBottom: 16 }}>
          mydenicek
        </Text>
        <Text block style={{ marginBottom: 12, color: "#605e5c" }}>
          Enter your name to start collaborating
        </Text>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit(name.trim());
          }}
          placeholder="e.g. Alice"
          style={{
            padding: "8px 12px",
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 4,
            width: 200,
            marginRight: 8,
          }}
        />
        <button
          type="button"
          onClick={() => name.trim() && onSubmit(name.trim())}
          style={{
            padding: "8px 16px",
            fontSize: 16,
            background: "#0078d4",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Join
        </button>
      </div>
    </div>
  );
}

function Editor({ peer, roomId }: { peer: string; roomId: string }) {
  const dk = useDenicek({ peer, sync: { url: SYNC_SERVER_URL, roomId } });

  // Initialize with sample document on first load
  useEffect(() => {
    const tree = dk.denicek.materialize();
    if (!isRec(tree) || !("root" in tree)) {
      initializeDocument(dk.denicek);
      dk.forceUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: statusColors[dk.syncStatus] ?? "#8a8a8a",
          }}
        >
          ● {dk.syncStatus} — {peer} — room: {roomId}
        </span>
      </div>

      {/* Main area — rendered document */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          padding: 24,
          minHeight: 0,
        }}
      >
        <ErrorBoundary>
          <RenderedDocument doc={dk.doc} />
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
  const [peer, setPeer] = useState<string | null>(null);

  if (!peer) {
    return <PeerNamePrompt onSubmit={setPeer} />;
  }

  return <Editor peer={peer} roomId={roomId} />;
}
