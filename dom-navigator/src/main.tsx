import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { initializeIcons } from '@fluentui/react'
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IndexedDBStorageAdapter, Repo, RepoContext, WebSocketClientAdapter, isValidAutomergeUrl, DocHandle } from '@automerge/react';
import { initialDocument, type JsonDoc } from './Document.ts'
const repo = new Repo({
  network: [new WebSocketClientAdapter("wss://sync.automerge.org/")],
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

initializeIcons();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <RepoContext.Provider value={repo}>
        <App docUrl={handle.url} />
      </RepoContext.Provider>
    </FluentProvider>
  </StrictMode>
);
