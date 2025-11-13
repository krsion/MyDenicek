import { DomNavigator } from "./DomNavigator";
import { useMemo, useState } from "react";
// Explicit extension because verbatimModuleSyntax + bundler resolution can require it.
import { JsonMLRenderer, wrapJsonML } from "./JsonML.tsx";
import type { JsonMLNode } from "./JsonML.tsx";

function buildInitialTree(): JsonMLNode {
  return [
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
  ];
}

export default function App() {
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [wrapTag, setWrapTag] = useState("div");
  const [wrapMessage, setWrapMessage] = useState<string | null>(null);
  const [tree, setTree] = useState<JsonMLNode>(() => buildInitialTree());
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const details = useMemo(() => {
    if (!selectedEl) return null;
    const tag = selectedEl.tagName.toLowerCase();
    const id = selectedEl.id || null;
    const classes = Array.from(selectedEl.classList);
    const rect = selectedEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dataTestId = selectedEl.getAttribute("data-testid");
    const text = (selectedEl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120);

    const pathParts: string[] = [];
    let node: HTMLElement | null = selectedEl;
    let depth = 0;
    while (node) {
      const part = `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}`;
      pathParts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    const path = pathParts.join("/");

    return { tag, id, classes, width, height, dataTestId, text, path };
  }, [selectedEl]);

  const selectedJsonMLPath = selectedEl?.getAttribute("data-jsonml-path") || null;

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <DomNavigator onSelectedChange={setSelectedEl}>
        <JsonMLRenderer tree={tree} />
      </DomNavigator>
      <div style={{ margin: 16, fontSize: 13, color: "#444", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
        {details ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 8 }}>
            <div style={{ color: "#666" }}>Tag</div><div>{details.tag}</div>
            <div style={{ color: "#666" }}>Id</div><div>{details.id ?? <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Classes</div><div>{details.classes.length ? details.classes.join(" ") : <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Size</div><div>{details.width} × {details.height}px</div>
            <div style={{ color: "#666" }}>data-testid</div><div>{details.dataTestId ?? <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Path</div><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{details.path}</div>
            <div style={{ color: "#666" }}>Text</div><div style={{ color: "#222" }}>{details.text || <span style={{ color: "#999" }}>(empty)</span>}</div>
          </div>
        ) : (
          <span style={{ color: "#777" }}>Selected: (none)</span>
        )}
      </div>

      {/* Wrap selected element UI */}
      <div style={{ margin: 16, fontSize: 13, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setWrapMessage(null);
            const tag = wrapTag.trim().toLowerCase();
            if (!selectedEl) {
              setWrapMessage("Nothing selected to wrap.");
              return;
            }
            if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) {
              setWrapMessage("Invalid tag name.");
              return;
            }
            if (!selectedJsonMLPath) {
              setWrapMessage("Selected element lacks JsonML path.");
              return;
            }
            setTree((prev) => wrapJsonML(prev, selectedJsonMLPath, tag));
            setWrapMessage(`Wrapped JsonML node ${selectedJsonMLPath} (<${selectedEl.tagName.toLowerCase()}>) in <${tag}>.`);
            // After render select wrapper (same path)
            setTimeout(() => {
              const el = document.querySelector(`[data-jsonml-path='${selectedJsonMLPath}']`) as HTMLElement | null;
              el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }, 0);
          }}
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#555" }}>Wrap in</span>
            <input
              value={wrapTag}
              onChange={(e) => setWrapTag(e.target.value)}
              placeholder="e.g. div"
              style={{
                padding: "4px 6px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 13,
                minWidth: 90,
                background: "#fff",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={!selectedEl}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              background: selectedEl ? "#2563eb" : "#94a3b8",
              color: "#fff",
              border: "none",
              cursor: selectedEl ? "pointer" : "not-allowed",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}
          >
            Wrap
          </button>
          <small style={{ color: "#64748b" }}>Common tags: div, section, article, span, p</small>
        </form>
        {wrapMessage && (
          <div style={{ marginTop: 6, color: wrapMessage.startsWith("Wrapped") ? "#166534" : "#991b1b" }}>
            {wrapMessage}
          </div>
        )}
        {!selectedEl && (
          <div style={{ marginTop: 6, color: "#777" }}>Select an element first using arrows or clicking.</div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
          Wrapping now updates the underlying JsonML tree and re-renders; no direct DOM mutation.
        </div>
      </div>

      {/* Export / Import JSON UI */}
      <div style={{ margin: 16, fontSize: 13, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>JsonML Export / Import</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => {
              const json = JSON.stringify(tree, null, 2);
              setImportText(json);
              navigator.clipboard?.writeText(json).catch(() => {});
            }}
            style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, background: "#334155", color: "#fff", border: "none" }}
          >
            Export (copy + show)
          </button>
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              try {
                const parsed = JSON.parse(importText);
                if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
                  throw new Error("Root must be an array starting with a tag string.");
                }
                setTree(parsed as JsonMLNode);
                setWrapMessage("Imported JsonML tree.");
                // Reset selection
                setSelectedEl(null);
              } catch (err: any) {
                setImportError(err.message || String(err));
              }
            }}
            style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, background: "#16a34a", color: "#fff", border: "none" }}
          >
            Import JSON
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="JsonML JSON here"
          style={{ width: "100%", minHeight: 160, fontSize: 12, fontFamily: "monospace", padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }}
        />
        {importError && <div style={{ marginTop: 6, color: "#b91c1c" }}>Import error: {importError}</div>}
        {!importError && importText && <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Ready to import (root tag: {(() => { try { const p = JSON.parse(importText); return Array.isArray(p) && typeof p[0] === 'string' ? p[0] : 'invalid'; } catch { return 'invalid'; } })()})</div>}
      </div>
    </div>
  );
}
