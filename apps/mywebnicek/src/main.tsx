import { DocHandle, IndexedDBStorageAdapter, isValidAutomergeUrl, Repo, RepoContext, WebSocketClientAdapter } from '@automerge/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DenicekModel, type JsonDoc } from '@mydenicek/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
const repo = new Repo({
  network: [new WebSocketClientAdapter("wss://sync.automerge.org/")],
  storage: new IndexedDBStorageAdapter()
});

const locationHash = document.location.hash.substring(1);

let handle: DocHandle<JsonDoc>;

if (isValidAutomergeUrl(locationHash)) {
  handle = await repo.find(locationHash)
} else {
  handle = repo.create<JsonDoc>(DenicekModel.createInitialDocument());
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
