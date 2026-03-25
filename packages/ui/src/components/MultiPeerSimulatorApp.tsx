import { useState, useMemo } from 'react';
import { PeerSession } from '../peer-session.ts';
import { InMemorySyncService } from '../sync-service.ts';
import { PeerWorkspace, PEER_COLORS } from './PeerWorkspace.tsx';
import type { PlainNode } from '@core';

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

const DEFAULT_PEER_IDS = ['alice', 'bob', 'carol'];

function createSessions(peerIds: string[]): PeerSession[] {
  return peerIds.map(id => new PeerSession(id, INITIAL_DOC));
}

export function MultiPeerSimulatorApp() {
  const [peerIds] = useState(DEFAULT_PEER_IDS);
  const [sessions, setSessions] = useState(() => createSessions(peerIds));
  const [newPeerId, setNewPeerId] = useState('');
  const [revision, setRevision] = useState(0);
  const syncService = useMemo(() => new InMemorySyncService(), []);

  // Force a re-render after any mutation (sessions mutate in place)
  const refresh = () => setRevision(r => r + 1);

  function handleSync(action: string) {
    switch (action) {
      case 'sync-all':
        syncService.syncAll(sessions);
        break;
      case 'ab': syncService.sync(sessions[0]!, sessions[1]!); break;
      case 'bc': syncService.sync(sessions[1]!, sessions[2]!); break;
      case 'ac': syncService.sync(sessions[0]!, sessions[2]!); break;
      case 'a-to-b': syncService.push(sessions[0]!, sessions[1]!); break;
      case 'b-to-a': syncService.push(sessions[1]!, sessions[0]!); break;
    }
    refresh();
  }

  function handleAddPeer() {
    const id = newPeerId.trim();
    if (!id || sessions.some(s => s.peerId === id)) return;
    // New peer starts from the current synced state of the first peer
    const newSession = new PeerSession(id, INITIAL_DOC);
    // Sync everything from peer 0
    syncService.push(sessions[0]!, newSession);
    setSessions(prev => [...prev, newSession]);
    setNewPeerId('');
  }

  function handleReset() {
    setSessions(createSessions(DEFAULT_PEER_IDS));
    setRevision(0);
  }

  const btnStyle = (color: string): React.CSSProperties => ({
    background: color, color: '#fff', border: 'none',
    borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
    fontSize: 12, margin: '0 2px',
  });

  return (
    <div style={{ fontFamily: 'Segoe UI, system-ui, sans-serif', background: '#f3f3f3', minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{
        background: '#0078d4', color: '#fff', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Mydenicek CRDT Inspector</span>
        <span style={{ opacity: 0.7, fontSize: 12 }}>revision {revision}</span>
      </div>

      {/* Sync controls */}
      <div style={{
        background: '#fff', padding: '10px 16px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
      }}>
        <span style={{ fontSize: 12, color: '#555', fontWeight: 600, marginRight: 4 }}>Sync:</span>
        <button style={btnStyle('#107c10')} onClick={() => handleSync('sync-all')}>Sync All</button>
        {sessions.length >= 2 && (
          <>
            <button style={btnStyle('#555')} onClick={() => handleSync('ab')}>
              {sessions[0]!.peerId} ↔ {sessions[1]!.peerId}
            </button>
            <button style={btnStyle('#444')} onClick={() => handleSync('a-to-b')}>
              {sessions[0]!.peerId} → {sessions[1]!.peerId}
            </button>
            <button style={btnStyle('#444')} onClick={() => handleSync('b-to-a')}>
              {sessions[1]!.peerId} → {sessions[0]!.peerId}
            </button>
          </>
        )}
        {sessions.length >= 3 && (
          <>
            <button style={btnStyle('#555')} onClick={() => handleSync('bc')}>
              {sessions[1]!.peerId} ↔ {sessions[2]!.peerId}
            </button>
            <button style={btnStyle('#555')} onClick={() => handleSync('ac')}>
              {sessions[0]!.peerId} ↔ {sessions[2]!.peerId}
            </button>
          </>
        )}

        <span style={{ marginLeft: 8, borderLeft: '1px solid #ddd', paddingLeft: 8, fontSize: 12, color: '#555', fontWeight: 600 }}>
          Add peer:
        </span>
        <input
          value={newPeerId}
          onChange={e => setNewPeerId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddPeer()}
          placeholder="peer id"
          style={{
            fontFamily: 'monospace', fontSize: 12, padding: '4px 6px',
            border: '1px solid #ccc', borderRadius: 3, width: 80,
          }}
        />
        <button style={btnStyle('#0078d4')} onClick={handleAddPeer}>Add</button>
        <button style={{ ...btnStyle('#c50f1f'), marginLeft: 8 }} onClick={handleReset}>Reset</button>
      </div>

      {/* Peer workspaces */}
      <div style={{ display: 'flex', gap: 12, padding: 16, overflowX: 'auto', alignItems: 'flex-start' }}>
        {sessions.map((session, i) => (
          <PeerWorkspace
            key={session.peerId}
            session={session}
            peerColor={PEER_COLORS[i % PEER_COLORS.length]!}
            onEdit={refresh}
          />
        ))}
      </div>
    </div>
  );
}
