
import { useCallback, useMemo, useState } from "react";
import { Card, Switch } from "@fluentui/react-components";
import { type AutomergeUrl, useDocument } from "@automerge/react";

import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { wrapNode, renameNode, addTransformation, addChildNode, setNodeValue, type JsonDoc } from "./Document.ts";
import { ValueForm } from "./ValueForm";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { TagForm } from "./TagForm.tsx";
import { Stack } from "@fluentui/react";

export const App = ({ docUrl, onConnect, onDisconnect }: { docUrl: AutomergeUrl, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(docUrl, { suspense: true });
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [connected, setConnected] = useState(true);

  const details = useMemo(() => {
    if (!selectedEl) return null;
    const tag = selectedEl.tagName.toLowerCase();
    const id = selectedEl.id || null;
    const classes = Array.from(selectedEl.classList);
    const rect = selectedEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dataTestId = selectedEl.getAttribute("data-testid");
    const guid = selectedEl.getAttribute("data-node-guid") || null;
    // pull the node.value from the document model if available
    const modelNode = guid ? doc.nodes.find((n) => n.id === guid) : undefined;
    const value = modelNode ? (modelNode.value as string | number | undefined) : undefined;

    return { tag, id, guid, classes, width, height, dataTestId, value };
  }, [selectedEl, doc]);

  const selectedNodeGuid = selectedEl?.getAttribute("data-node-guid") || null;


  return (
    <Card appearance="subtle">
      <Switch
        checked={connected}
        onChange={() => {
          if (connected) {
            setConnected(false);
            onDisconnect();
          } else {
            setConnected(true);
            onConnect();
          }
        }}
        label={connected ? "Sync on" : "Sync off"}
      />

      <DomNavigator onSelectedChange={setSelectedEl}>
        <RenderedDocument tree={doc} />
      </DomNavigator>

      <ElementDetails details={details} />

      <Stack horizontal tokens={{ childrenGap: 16 }}>

        <TagForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
          changeDoc((prev: JsonDoc) => {
            wrapNode(prev, selectedNodeGuid!, tag);
          });
        }} label="Wrap into" buttonText="Wrap" />

        <TagForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
          changeDoc((prev: JsonDoc) => {
            renameNode(prev, selectedNodeGuid!, tag);
          });
        }} label="Rename tag to" buttonText="Rename" />

        <TagForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
          changeDoc((prev: JsonDoc) => {
            if (!selectedNodeGuid) return;
            addTransformation(prev, selectedNodeGuid!, "wrap", tag);
          });
        }} label="Wrap all children into" buttonText="Wrap" />

        <TagForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
          changeDoc((prev: JsonDoc) => {
            if (!selectedNodeGuid) return;
            addTransformation(prev, selectedNodeGuid!, "rename", tag);
          });
        }} label="Rename all children tags to" buttonText="Rename" />

        <TagForm selectedNodeGuid={selectedNodeGuid} onSubmit={(tag) => {
          changeDoc((prev: JsonDoc) => {
            if (!selectedNodeGuid) return;
            addChildNode(prev, selectedNodeGuid!, tag);
          });
        }} label="Add child element" buttonText="Add" />

        <ValueForm selectedNodeGuid={selectedNodeGuid} currentValue={details?.value} onSubmit={(v) => {
          changeDoc((prev: JsonDoc) => {
            if (!selectedNodeGuid) return;
            setNodeValue(prev, selectedNodeGuid!, v);
          });
        }} label="Edit text content" buttonText="Set" />
      </Stack>
    </Card>
  );
}
