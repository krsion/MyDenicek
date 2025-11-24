
import { type AutomergeUrl, useDocument } from "@automerge/react";
import { Stack, Text } from "@fluentui/react";
import { Card, CardHeader, DrawerBody, DrawerHeader, DrawerHeaderTitle, InlineDrawer, makeStyles, Switch, Tag, TagGroup } from "@fluentui/react-components";
import { useMemo, useState } from "react";

import { addChildNode, addTransformation, detectConflicts, type JsonDoc, renameNode, setNodeValue, wrapNode } from "./Document.ts";
import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { TagForm } from "./TagForm.tsx";
import { ValueForm } from "./ValueForm";

const useStyles = makeStyles({
  root: {
    display: "flex",
  },
  card: {
    flex: "1",
  },
});

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

  const conflicts = useMemo(() => detectConflicts(doc), [doc]);

  const styles = useStyles();
  console.log(doc);


  return (
    <div className={styles.root}>
      <InlineDrawer open separator position="start" >
        <DrawerHeader>
          <DrawerHeaderTitle>Actions</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack tokens={{ childrenGap: 8 }}>
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
              let newId: string | null = null;
              changeDoc((prev: JsonDoc) => {
                if (!selectedNodeGuid) return;
                newId = addChildNode(prev, selectedNodeGuid!, tag);
              });
              if (newId) {
                // The DOM update may be async. Retry a few times until the element appears.
                const trySelect = (attempt = 0) => {
                  const el = document.querySelector(`[data-node-guid="${newId}"]`) as HTMLElement | null;
                  if (el) {
                    setSelectedEl(el);
                    return;
                  }
                  if (attempt < 10) {
                    setTimeout(() => trySelect(attempt + 1), 50);
                  }
                };
                trySelect();
              }
            }} label="Add child element" buttonText="Add" />

            <ValueForm selectedNodeGuid={selectedNodeGuid} currentValue={details?.value} onSubmit={(v) => {
              changeDoc((prev: JsonDoc) => {
                if (!selectedNodeGuid) return;
                setNodeValue(prev, selectedNodeGuid!, v);
              });
            }} label="Edit text content" buttonText="Set" />
          </Stack>
        </DrawerBody>
      </InlineDrawer>
      <Card appearance="subtle" className={styles.card}>

        <CardHeader header={<TagGroup>
          <Tag>←&nbsp;Parent</Tag>
          <Tag>→&nbsp;First child</Tag>
          <Tag>↑&nbsp;Prev sibling</Tag>
          <Tag>↓&nbsp;Next sibling</Tag>
          <Tag>Esc&nbsp;Clear</Tag>
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
        </TagGroup>}
        />

        <DomNavigator onSelectedChange={setSelectedEl} selectedElement={selectedEl}>
          <RenderedDocument tree={doc} />
        </DomNavigator>

        <ElementDetails details={details} />


      </Card>
      <InlineDrawer open separator position="end" >
        <DrawerHeader>
          <DrawerHeaderTitle>Conflicts</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <Stack tokens={{ childrenGap: 8 }}>
            {conflicts.length === 0 ? (
              <div>No conflicts detected</div>
            ) : (
              conflicts.map((c) => (
                <Card key={c.child} appearance="outline">
                  <CardHeader header={<TagGroup><Tag>{c.child}</Tag></TagGroup>} />
                  <Text>Referenced by parents:</Text>
                  {c.parents.map((p) => (
                    <Tag key={String(p)}>{p === null ? "(root)" : p}</Tag>
                  ))}
                </Card>
              ))
            )}
          </Stack>
        </DrawerBody>
      </InlineDrawer>
    </div>
  );
}
