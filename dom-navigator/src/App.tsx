
import { type AutomergeUrl, type Repo, RepoContext, useDocument } from "@automerge/react";
import { Card, CardHeader, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, Switch, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup } from "@fluentui/react-components";
import { AddRegular, ArrowDownRegular, ArrowLeftRegular, ArrowRightRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, EditRegular, NavigationRegular, RenameFilled, RenameRegular } from "@fluentui/react-icons";
import { useContext, useMemo, useState } from "react";

import { ConflictsTable } from "./ConflictsTable.tsx";
import { addChildNode, addTransformation, detectConflicts, type JsonDoc, renameNode, setNodeValue, wrapNode } from "./Document.ts";
import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";
import ToolbarPopoverButton from "./ToolbarPopoverButton";

export const App = ({ docUrl, onConnect, onDisconnect }: { docUrl: AutomergeUrl, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(docUrl, { suspense: true });
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [connected, setConnected] = useState(true);
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const repo = useContext(RepoContext) as Repo | undefined;
  const peerId = repo?.peerId ?? null;

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
    const value = modelNode ? (modelNode.value as string | undefined) : undefined;

    return { tag, id, guid, classes, width, height, dataTestId, value };
  }, [selectedEl, doc]);

  const selectedNodeGuid = selectedEl?.getAttribute("data-node-guid") || null;

  const conflicts = useMemo(() => detectConflicts(doc), [doc]);

  return (
    <>
      <Card appearance="subtle">
        <Toolbar style={{ display: "flex", justifyContent: "space-between" }}>
          <ToolbarGroup>
            <ToolbarPopoverButton
              icon={<AddRegular />}
              disabled={!selectedNodeGuid}
              initialValue={doc.nodes.find(n => n.id === (doc.edges.find(e => e.parent === selectedNodeGuid)?.child ?? null))?.tag}
              ariaLabel="Add child"
              onSubmit={(tag) => {
                let newId: string | null = null;
                changeDoc((prev: JsonDoc) => {
                  newId = addChildNode(prev, selectedNodeGuid!, tag, peerId);
                });
                if (newId) {
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
              }}
            >
              Add child
            </ToolbarPopoverButton>

            <ToolbarPopoverButton
              icon={<BackpackRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Wrap"
              initialValue={details?.tag}
              onSubmit={(tag) => {
                changeDoc((prev: JsonDoc) => {
                  wrapNode(prev, selectedNodeGuid!, tag, undefined, peerId);
                });
              }}
            >
              Wrap
            </ToolbarPopoverButton>

            <ToolbarPopoverButton
              icon={<EditRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Edit"
              initialValue={details?.value}
              onSubmit={(value) => {
                changeDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  setNodeValue(prev, selectedNodeGuid!, value);
                });
              }}
            >
              Edit
            </ToolbarPopoverButton>

            <ToolbarPopoverButton
              icon={<RenameRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Rename"
              initialValue={details?.tag}
              onSubmit={(tag) => {
                changeDoc((prev: JsonDoc) => {
                  renameNode(prev, selectedNodeGuid!, tag);
                });
              }}
            >
              Rename
            </ToolbarPopoverButton>
            <ToolbarDivider />

            <ToolbarPopoverButton
              icon={<BackpackFilled />}
              disabled={!selectedNodeGuid}
              ariaLabel="Wrap all children"
              initialValue={details?.tag}
              onSubmit={(tag) => {
                changeDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "wrap", tag, peerId);
                });
              }}
            >
              Wrap all children
            </ToolbarPopoverButton>

            <ToolbarPopoverButton
              icon={<RenameFilled />}
              disabled={!selectedNodeGuid}
              initialValue={details?.tag}
              ariaLabel="Rename all children"
              onSubmit={(tag) => {
                changeDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "rename", tag, peerId);
                });
              }}
            >
              Rename all children
            </ToolbarPopoverButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <span style={{ marginRight: 12 }}>{peerId ? `Peer ID: ${peerId}` : "No Peer ID"}</span>
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
            <ToolbarButton icon={<NavigationRegular />} onClick={() => setConflictsOpen(!conflictsOpen)}>Conflicts ({conflicts.length})</ToolbarButton>
          </ToolbarGroup>
        </Toolbar>

        <CardHeader header={<TagGroup>
          <Tag icon={<ArrowLeftRegular />}> Parent</Tag>
          <Tag icon={<ArrowRightRegular />}> First child</Tag>
          <Tag icon={<ArrowUpRegular />}> Prev sibling</Tag>
          <Tag icon={<ArrowDownRegular />}> Next sibling</Tag>
          <Tag icon={<Text>Esc</Text>}>Clear</Tag>
        </TagGroup>}
        />

        <DomNavigator onSelectedChange={setSelectedEl} selectedElement={selectedEl}>
          <RenderedDocument tree={doc} />
        </DomNavigator>

        <ElementDetails details={details} />


      </Card>
      <Drawer open={conflictsOpen} separator position="end" onOpenChange={(_, { open }) => setConflictsOpen(open)}
      >
        <DrawerHeader>
          <DrawerHeaderTitle>Conflicts</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {conflicts.length === 0 ? (
            <div>No conflicts detected</div>
          ) : (
            <ConflictsTable conflicts={conflicts} doc={doc} />
          )}
        </DrawerBody>
      </Drawer>
    </>
  );
}

