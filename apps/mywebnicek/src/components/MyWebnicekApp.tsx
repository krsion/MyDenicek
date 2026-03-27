import { useEffect, useMemo, useState } from 'react';
import type { EventSnapshot, PlainNode } from '@mydenicek/core';
import { SyncClient } from '@mydenicek/sync-server';
import { persistSyncServerUrl, readInitialSyncServerUrl } from '../config.ts';
import { DocumentSession } from '../document-session.ts';
import { ConflictsPanel } from './ConflictsPanel.tsx';
import { EditComposer } from './EditComposer.tsx';
import { EventGraphView, PEER_COLORS } from './EventGraphView.tsx';
import { MaterializedTree } from './MaterializedTree.tsx';

const DEFAULT_ROOM_ID = 'demo';
const DEFAULT_PEER_ID = 'alice';
const DEFAULT_AUTO_SYNC_INTERVAL_MS = '1000';
const INITIAL_DOC: PlainNode = {
  $tag: 'root',
  title: 'Shared Document',
  items: {
    $tag: 'ul',
    $items: [
      { $tag: 'item', name: 'First item' },
      { $tag: 'item', name: 'Second item' },
    ],
  },
};

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

function createDocumentSession(peerId: string): DocumentSession {
  return new DocumentSession(peerId, INITIAL_DOC);
}

function createPeerColorMap(events: EventSnapshot[], localPeerId: string): Map<string, string> {
  const orderedPeers = Array.from(new Set([localPeerId, ...events.map((event) => event.peer)]));
  return new Map(orderedPeers.map((peerId, index) => [peerId, PEER_COLORS[index % PEER_COLORS.length] ?? '#0078d4']));
}

function computeAutoSyncInterval(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

function EventDetails({ event }: { event: EventSnapshot }) {
  return (
    <div style={{ fontSize: 12, fontFamily: 'monospace', padding: '8px', background: '#f8f8f8', borderRadius: 4 }}>
      <div><strong>ID:</strong> {event.id}</div>
      <div><strong>Peer:</strong> {event.peer}</div>
      <div><strong>Seq:</strong> {event.seq}</div>
      <div><strong>Edit:</strong> {event.editKind}</div>
      <div><strong>Target:</strong> {event.target}</div>
      <div><strong>Parents:</strong> {event.parents.length > 0 ? event.parents.join(', ') : '(root)'}</div>
    </div>
  );
}

export function MyWebnicekApp() {
  const [peerIdInput, setPeerIdInput] = useState(DEFAULT_PEER_ID);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);
  const [syncServerUrl, setSyncServerUrl] = useState(() => readInitialSyncServerUrl());
  const [autoSyncIntervalMsInput, setAutoSyncIntervalMsInput] = useState(DEFAULT_AUTO_SYNC_INTERVAL_MS);
  const [session, setSession] = useState(() => createDocumentSession(DEFAULT_PEER_ID));
  const [syncClient, setSyncClient] = useState<SyncClient | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [statusMessage, setStatusMessage] = useState('Local document ready. Connect to start syncing.');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return () => {
      syncClient?.close();
    };
  }, [syncClient]);

  useEffect(() => {
    persistSyncServerUrl(syncServerUrl);
  }, [syncServerUrl]);

  const snapshot = session.createSnapshot();
  const selectedEvent = snapshot.events.find((event) => event.id === selectedEventId) ?? null;
  const peerColorMap = useMemo(() => createPeerColorMap(snapshot.events, session.peerId), [session.peerId, snapshot.events]);
  const sectionTitle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 12,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
    marginTop: 0,
  };

  function refreshView() {
    setRevision((value) => value + 1);
  }

  function disconnectFromSyncServer(nextMessage = 'Disconnected from sync server.'): void {
    syncClient?.close();
    setSyncClient(null);
    setConnectionState('disconnected');
    setStatusMessage(nextMessage);
  }

  function resetLocalDocument(): void {
    disconnectFromSyncServer('Created a fresh local document.');
    setSession(createDocumentSession(peerIdInput.trim() || DEFAULT_PEER_ID));
    setSelectedEventId(null);
    refreshView();
  }

  async function connectToSyncServer(): Promise<void> {
    const peerId = peerIdInput.trim() || DEFAULT_PEER_ID;
    const nextRoomId = roomId.trim() || DEFAULT_ROOM_ID;
    const nextSyncServerUrl = syncServerUrl.trim() || readInitialSyncServerUrl();
    const autoSyncIntervalMs = computeAutoSyncInterval(autoSyncIntervalMsInput);

    let nextSession = session;
    if (peerId !== session.peerId) {
      disconnectFromSyncServer(`Reset local state for peer '${peerId}'.`);
      nextSession = createDocumentSession(peerId);
      setSession(nextSession);
      setSelectedEventId(null);
      refreshView();
    } else {
      syncClient?.close();
      setSyncClient(null);
    }

    setConnectionState('connecting');
    setStatusMessage(`Connecting peer '${peerId}' to room '${nextRoomId}'...`);

    try {
      const client = new SyncClient({
        url: nextSyncServerUrl,
        roomId: nextRoomId,
        document: nextSession.getDocument(),
        autoSyncIntervalMs,
        onRemoteChange: () => {
          setStatusMessage(`Received remote changes for room '${nextRoomId}'.`);
          refreshView();
        },
      });
      await client.connect();
      setSyncClient(client);
      setConnectionState('connected');
      setStatusMessage(`Connected peer '${peerId}' to room '${nextRoomId}'.`);
      refreshView();
    } catch (error) {
      setConnectionState('error');
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function requestSyncNow(): void {
    syncClient?.syncNow();
    setStatusMessage(`Sync requested for room '${roomId.trim() || DEFAULT_ROOM_ID}'.`);
  }

  function handleLocalEdit(): void {
    refreshView();
    if (syncClient !== null) {
      syncClient.syncNow();
      setStatusMessage('Applied a local edit and requested sync.');
      return;
    }
    setStatusMessage('Applied a local edit locally.');
  }

  const connectionColor = {
    disconnected: '#555',
    connecting: '#8764b8',
    connected: '#107c10',
    error: '#c50f1f',
  }[connectionState];

  return (
    <div style={{ fontFamily: 'Segoe UI, system-ui, sans-serif', background: '#f3f3f3', minHeight: '100vh' }}>
      <div style={{ background: '#2b579a', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>MyWebnicek</span>
        <span style={{ opacity: 0.75, fontSize: 12 }}>production-oriented sync client</span>
        <span style={{ background: connectionColor, borderRadius: 999, padding: '2px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {connectionState}
        </span>
        <span style={{ opacity: 0.75, fontSize: 12 }}>revision {revision}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, padding: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <p style={sectionTitle}>Connection</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'grid', gap: 4 }}>
                Peer ID
                <input value={peerIdInput} onChange={(event) => setPeerIdInput(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#555', display: 'grid', gap: 4 }}>
                Room ID
                <input value={roomId} onChange={(event) => setRoomId(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#555', display: 'grid', gap: 4 }}>
                Sync server URL
                <input value={syncServerUrl} onChange={(event) => setSyncServerUrl(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: '#555', display: 'grid', gap: 4 }}>
                Auto-sync interval (ms)
                <input value={autoSyncIntervalMsInput} onChange={(event) => setAutoSyncIntervalMsInput(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => void connectToSyncServer()} style={{ background: '#107c10', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>
                Connect
              </button>
              <button type="button" onClick={requestSyncNow} disabled={syncClient === null} style={{ background: syncClient === null ? '#c8c8c8' : '#2b579a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: syncClient === null ? 'not-allowed' : 'pointer' }}>
                Sync now
              </button>
              <button type="button" onClick={() => disconnectFromSyncServer()} disabled={syncClient === null} style={{ background: syncClient === null ? '#c8c8c8' : '#c50f1f', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: syncClient === null ? 'not-allowed' : 'pointer' }}>
                Disconnect
              </button>
              <button type="button" onClick={resetLocalDocument} style={{ background: '#555', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>
                Reset local document
              </button>
            </div>

            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: '#444' }}>{statusMessage}</p>
            {peerIdInput.trim() !== session.peerId && (
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#8764b8' }}>
                Changing the peer ID creates a fresh local document on the next connect or reset.
              </p>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <p style={sectionTitle}>Document</p>
            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: '#444', marginBottom: 12 }}>
              <div><strong>Peer:</strong> {session.peerId}</div>
              <div><strong>Frontiers:</strong> {snapshot.frontiers.join(', ') || '—'}</div>
              <div><strong>Events:</strong> {snapshot.events.length}</div>
              <div><strong>Conflicts:</strong> {snapshot.conflicts.length}</div>
            </div>
            <p style={{ ...sectionTitle, marginTop: 0 }}>Edit</p>
            <EditComposer session={session} onEdit={handleLocalEdit} />
          </section>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <p style={sectionTitle}>Event Graph</p>
            <EventGraphView events={snapshot.events} selectedId={selectedEventId} onSelect={setSelectedEventId} peerColorMap={peerColorMap} />
          </section>

          {selectedEvent && (
            <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <p style={sectionTitle}>Event Details</p>
              <EventDetails event={selectedEvent} />
            </section>
          )}

          <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <p style={sectionTitle}>Materialized Tree</p>
            <MaterializedTree node={snapshot.doc} />
          </section>

          <section style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <p style={sectionTitle}>Conflicts</p>
            <ConflictsPanel conflicts={snapshot.conflicts} />
          </section>
        </div>
      </div>
    </div>
  );
}
