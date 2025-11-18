
import { useMemo, useState } from "react";
import { PrimaryButton, DefaultButton, TextField } from "@fluentui/react";
import { Card } from "@fluentui/react-components";
import { type AutomergeUrl, useDocument } from "@automerge/react";

import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { JsonMLRenderer, wrapJsonMLMutable } from "./JsonML.tsx";
import type { JsonMLDoc } from "./main.tsx";


export const App = ({ docUrl }: { docUrl: AutomergeUrl }) => {
  const [doc, changeDoc] = useDocument<JsonMLDoc>(docUrl, { suspense: true });
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [wrapTag, setWrapTag] = useState("div");
  // const [tree, setTree] = useState<JsonMLNode>();
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
    const guid = selectedEl.getAttribute("data-jsonml-path") || null;

    return { tag, id, guid, classes, width, height, dataTestId, text, path };
  }, [selectedEl]);

  const selectedJsonMLPath = selectedEl?.getAttribute("data-jsonml-path") || null;

  return (
    <Card appearance="subtle">
      <DomNavigator onSelectedChange={setSelectedEl}>
        <JsonMLRenderer tree={doc.tree} />
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
            changeDoc((prev) => {
              // mutate the proxied `tree` in-place to avoid assigning objects that reference
              // existing document proxies (Automerge will reject those).
              wrapJsonMLMutable(prev.tree, selectedJsonMLPath, tag);
            });
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
              const json = JSON.stringify(doc, null, 2);
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
                changeDoc(_ => parsed);
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
        {!importError && importText && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
            Ready to import (
            {(() => {
              try {
                const p = JSON.parse(importText);
                if (Array.isArray(p) && typeof p[0] === "string") {
                  return `root tag: ${p[0]}`;
                }
                if (
                  typeof p === "object" &&
                  p !== null &&
                  "nodes" in p &&
                  "edges" in p &&
                  Array.isArray(p.nodes) &&
                  Array.isArray(p.edges)
                ) {
                  return `nodes: ${p.nodes.length}, edges: ${p.edges.length}`;
                }
                return "invalid";
              } catch {
                return "invalid";
              }
            })()}
            )
          </div>
        )}
      </Card>
    </Card>
  );
}



