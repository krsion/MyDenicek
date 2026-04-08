import { Text } from "@fluentui/react-components";
import type { PlainRecord } from "@mydenicek/react";
import { useDenicek } from "@mydenicek/react";
import { useEffect, useMemo } from "react";

import { CommandBar } from "./CommandBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initializeDocument } from "./initializeDocument";
import { RenderedDocument } from "./RenderedDocument.tsx";

const SYNC_SERVER_URL =
  "wss://mydenicek-core-krsion-dev-sync.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync";

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

export function App() {
  const roomId = useMemo(getRoomId, []);
  const dk = useDenicek({ sync: { url: SYNC_SERVER_URL, roomId } });

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
          ● {dk.syncStatus} — room: {roomId}
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
