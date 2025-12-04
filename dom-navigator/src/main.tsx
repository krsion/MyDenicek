import { DocHandle, IndexedDBStorageAdapter, isValidAutomergeUrl, Repo, RepoContext, WebSocketClientAdapter } from '@automerge/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { initialDocument, type JsonDoc } from './Document.ts';

// Get personal access token from environment variable or localStorage
const getAccessToken = (): string | null => {
  // First, try to get from localStorage (user can set at runtime)
  const storedToken = localStorage.getItem('automerge_access_token');
  if (storedToken) {
    return storedToken;
  }
  
  // Fall back to environment variable
  const envToken = import.meta.env['VITE_AUTOMERGE_TOKEN'];
  if (envToken) {
    return envToken as string;
  }
  
  return null;
};

// Build WebSocket URL with optional token
const buildSyncUrl = (baseUrl: string, token: string | null): string => {
  if (!token) {
    return baseUrl;
  }
  
  // Add token as query parameter
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
};

const accessToken = getAccessToken();
const syncUrl = buildSyncUrl("wss://sync.automerge.org/", accessToken);

const repo = new Repo({
  network: [new WebSocketClientAdapter(syncUrl)],
  storage: new IndexedDBStorageAdapter()
});

const locationHash = document.location.hash.substring(1);

let handle: DocHandle<JsonDoc>;

if (isValidAutomergeUrl(locationHash)) {
  handle = await repo.find(locationHash)
} else {
  handle = repo.create<JsonDoc>(initialDocument());
  document.location.hash = handle.url;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <RepoContext.Provider value={repo}>
        <App handle={handle} onConnect={() => repo.networkSubsystem.adapters[0]!.connect(repo.peerId)} onDisconnect={() => repo.networkSubsystem.adapters[0]!.disconnect()} />
      </RepoContext.Provider>
    </FluentProvider>
  </StrictMode>
);
