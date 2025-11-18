import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { initializeIcons } from '@fluentui/react'
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IndexedDBStorageAdapter, Repo, RepoContext, WebSocketClientAdapter, isValidAutomergeUrl, DocHandle } from '@automerge/react';
import type { JsonDoc } from './JsonML.tsx'
const repo = new Repo({
  network: [new WebSocketClientAdapter("wss://sync.automerge.org/")],
  storage: new IndexedDBStorageAdapter()
});

export type JsonMLDoc = { tree: JsonDoc };

const locationHash = document.location.hash.substring(1);

let handle: DocHandle<JsonMLDoc>;

if (isValidAutomergeUrl(locationHash)) {
  handle = await repo.find(locationHash)
} else {
  handle = repo.create<JsonMLDoc>({ tree: {
    nodes: [
      { id: 'n-root', tag: 'section' },
      { id: 'n-inner', tag: 'section', attrs: { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, 'data-testid': 'section' } },

      // Article A
      { id: 'article-a', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }, 'data-testid': 'article-a' } },
      { id: 'h2-a', tag: 'h2' }, { id: 't-h2-a', value: 'Article A' },
      { id: 'p-a', tag: 'p' }, { id: 't-p-a', value: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      { id: 'ul-a', tag: 'ul' },
      { id: 'li-a1', tag: 'li' }, { id: 't-li-a1', value: 'Item A1' },
      { id: 'li-a2', tag: 'li' }, { id: 't-li-a2', value: 'Item A2' },
      { id: 'li-a3', tag: 'li' }, { id: 't-li-a3', value: 'Item A3' },

      // Article B
      { id: 'article-b', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd' }, 'data-testid': 'article-b' } },
      { id: 'h2-b', tag: 'h2' }, { id: 't-h2-b', value: 'Article B' },
      { id: 'p-b', tag: 'p' }, { id: 't-p-b', value: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
      { id: 'div-b-buttons', tag: 'div', attrs: { style: { display: 'flex', gap: 8 } } },
      { id: 'btn1', tag: 'button' }, { id: 't-btn1', value: 'Button 1' },
      { id: 'btn2', tag: 'button' }, { id: 't-btn2', value: 'Button 2' },
      { id: 'btn3', tag: 'button' }, { id: 't-btn3', value: 'Button 3' },

      // Article C (spans two columns)
      { id: 'article-c', tag: 'article', attrs: { style: { padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ddd', gridColumn: 'span 2' }, 'data-testid': 'article-c' } },
      { id: 'h2-c', tag: 'h2' }, { id: 't-h2-c', value: 'Article C' },
      { id: 'grid-c', tag: 'div', attrs: { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } } },
      // boxes (box-1 .. box-9)
      ...Array.from({ length: 9 }).map((_, i) => ({ id: `box-${i+1}`, tag: 'div', attrs: { style: { padding: 12, background: '#f7f7f7', border: '1px dashed #ccc', borderRadius: 6 } }, value: `Box ${i+1}` }))
    ],
    edges: [
      // root -> inner
      { parent: 'n-root', child: 'n-inner' },
      { parent: null, child: 'n-root' },

      // inner -> articles
      { parent: 'n-inner', child: 'article-a' },
      { parent: 'n-inner', child: 'article-b' },
      { parent: 'n-inner', child: 'article-c' },

      // article-a children
      { parent: 'article-a', child: 'h2-a' },
      { parent: 'h2-a', child: 't-h2-a' },
      { parent: 'article-a', child: 'p-a' },
      { parent: 'p-a', child: 't-p-a' },
      { parent: 'article-a', child: 'ul-a' },
      { parent: 'ul-a', child: 'li-a1' }, { parent: 'li-a1', child: 't-li-a1' },
      { parent: 'ul-a', child: 'li-a2' }, { parent: 'li-a2', child: 't-li-a2' },
      { parent: 'ul-a', child: 'li-a3' }, { parent: 'li-a3', child: 't-li-a3' },

      // article-b children
      { parent: 'article-b', child: 'h2-b' }, { parent: 'h2-b', child: 't-h2-b' },
      { parent: 'article-b', child: 'p-b' }, { parent: 'p-b', child: 't-p-b' },
      { parent: 'article-b', child: 'div-b-buttons' },
      { parent: 'div-b-buttons', child: 'btn1' }, { parent: 'btn1', child: 't-btn1' },
      { parent: 'div-b-buttons', child: 'btn2' }, { parent: 'btn2', child: 't-btn2' },
      { parent: 'div-b-buttons', child: 'btn3' }, { parent: 'btn3', child: 't-btn3' },

      // article-c children
      { parent: 'article-c', child: 'h2-c' }, { parent: 'h2-c', child: 't-h2-c' },
      { parent: 'article-c', child: 'grid-c' },
      // grid children: boxes
      ...Array.from({ length: 9 }).map((_, i) => ({ parent: 'grid-c', child: `box-${i+1}` }))
    ]
  } });
  document.location.hash = handle.url;
}

// Initialize Fluent UI icons (required by many Fluent components)
initializeIcons();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <RepoContext.Provider value={repo}>
        <App docUrl={handle.url} />
      </RepoContext.Provider>
    </FluentProvider>
  </StrictMode>,
)
