import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { initializeIcons } from '@fluentui/react'
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IndexedDBStorageAdapter, Repo, RepoContext, WebSocketClientAdapter, isValidAutomergeUrl, DocHandle } from '@automerge/react';
import type { JsonMLNode } from './JsonML.tsx'
const repo = new Repo({
  network: [new WebSocketClientAdapter("wss://sync.automerge.org/")],
  storage: new IndexedDBStorageAdapter()
});

export type JsonMLDoc = { tree: JsonMLNode };

const locationHash = document.location.hash.substring(1);

let handle: DocHandle<JsonMLDoc>;

if (isValidAutomergeUrl(locationHash)) {
  handle = await repo.find(locationHash)
} else {
  handle = repo.create<JsonMLDoc>({ tree: ["section", [
    "section",
    { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, "data-testid": "section" },
    [
      "article",
      { style: { padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd" }, "data-testid": "article-a" },
      ["h2", "Article A"],
      [
        "p",
        "Lorem ",
        ["strong", "ipsum"],
        " dolor sit amet, ",
        ["em", "consectetur"],
        " adipiscing elit."
      ],
      [
        "ul",
        ["li", "Item A1"],
        ["li", "Item A2"],
        ["li", "Item A3"],
      ]
    ],
    [
      "article",
      { style: { padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd" }, "data-testid": "article-b" },
      ["h2", "Article B"],
      [
        "p",
        "Sed do eiusmod tempor ",
        ["code", "incididunt"],
        " ut labore et dolore magna aliqua."
      ],
      [
        "div",
        { style: { display: "flex", gap: 8 } },
        ["button", "Button 1"],
        ["button", "Button 2"],
        ["button", "Button 3"],
      ]
    ],
    [
      "article",
      { style: { padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd", gridColumn: "span 2" }, "data-testid": "article-c" },
      ["h2", "Article C"],
      [
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 } },
        ...Array.from({ length: 9 }).map((_, i) => [
          "div",
          { style: { padding: 12, background: "#f7f7f7", border: "1px dashed #ccc", borderRadius: 6 } },
          `Box ${i + 1}`,
        ])
      ]
    ]
  ]]});
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
