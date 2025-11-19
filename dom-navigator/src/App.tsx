
import { useMemo, useState } from "react";
import { Card } from "@fluentui/react-components";
import { type AutomergeUrl, useDocument } from "@automerge/react";

import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { wrapNode, type JsonDoc } from "./Document.ts";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { WrapForm } from "./WrapForm.tsx";

export const App = ({ docUrl }: { docUrl: AutomergeUrl }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(docUrl, { suspense: true });
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);

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
    const guid = selectedEl.getAttribute("data-node-guid") || null;

    return { tag, id, guid, classes, width, height, dataTestId, text, path };
  }, [selectedEl]);

  const selectedNodeGuid = selectedEl?.getAttribute("data-node-guid") || null;

  return (
    <Card appearance="subtle">
      <DomNavigator onSelectedChange={setSelectedEl}>
        <RenderedDocument tree={doc} />
      </DomNavigator>

      <ElementDetails details={details} />

      <WrapForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
        changeDoc((prev: JsonDoc) => {
          wrapNode(prev, selectedNodeGuid!, tag);
        });
      }} />
    </Card>
  );
}
