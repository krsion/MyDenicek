import { DomNavigator } from "./DomNavigator";
import { useMemo, useState } from "react";
// Explicit extension because verbatimModuleSyntax + bundler resolution can require it.
import { JsonMLRenderer, wrapJsonML } from "./JsonML.tsx";
import type { JsonMLNode } from "./JsonML.tsx";
import { AutomergeDemo } from "./AutomergeDemo.tsx";
import { PrimaryButton, DefaultButton, TextField } from "@fluentui/react";
import { Card } from "@fluentui/react-components";
import { ElementDetails } from "./ElementDetails.tsx";

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
    <Card appearance="subtle">
      <DomNavigator onSelectedChange={setSelectedEl}>
        <JsonMLRenderer tree={tree} />
      </DomNavigator>

      <ElementDetails details={details} />

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const tag = wrapTag.trim().toLowerCase();
            if (!selectedEl) {
              return;
            }
            if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) {
              return;
            }
            if (!selectedJsonMLPath) {
              return;
            }
            setTree((prev) => wrapJsonML(prev, selectedJsonMLPath, tag));
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
          <PrimaryButton type="submit" disabled={!selectedEl}>
            Wrap
          </PrimaryButton>
          <small style={{ color: "#64748b" }}>Common tags: div, section, article, span, p</small>
        </form>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <DefaultButton
            type="button"
            onClick={() => {
              const json = JSON.stringify(tree, null, 2);
              setImportText(json);
              navigator.clipboard?.writeText(json).catch(() => { });
            }}
          >
            Export JsonML
          </DefaultButton>
          <PrimaryButton
            type="button"
            onClick={() => {
              setImportError(null);
              try {
                const parsed = JSON.parse(importText);
                if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
                  throw new Error("Root must be an array starting with a tag string.");
                }
                setTree(parsed as JsonMLNode);
                // Reset selection
                setSelectedEl(null);
              } catch (err: any) {
                setImportError(err.message || String(err));
              }
            }}
          >
            Import JsonML
          </PrimaryButton>
        </div>
        <TextField
          multiline
          value={importText}
          onChange={(_, v) => setImportText(v ?? "")}
          placeholder="JsonML JSON here"
        />
        {importError && <div style={{ marginTop: 6, color: "#b91c1c" }}>Import error: {importError}</div>}
        {!importError && importText && <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Ready to import (root tag: {(() => { try { const p = JSON.parse(importText); return Array.isArray(p) && typeof p[0] === 'string' ? p[0] : 'invalid'; } catch { return 'invalid'; } })()})</div>}
      </Card>

      <AutomergeDemo />
    </Card>
  );
}



