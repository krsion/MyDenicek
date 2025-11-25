import { DocHandle, type PeerId, type Repo, RepoContext, useDocument, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import { Card, CardHeader, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, Switch, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { AddRegular, ArrowDownRegular, ArrowLeftRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, EditRegular, NavigationRegular, RenameFilled, RenameRegular } from "@fluentui/react-icons";
import { useContext, useMemo, useState } from "react";

import { ConflictsTable } from "./ConflictsTable.tsx";
import { addChildNode, addTransformation, detectConflicts, type JsonDoc, renameNode, setNodeValue, wrapNode } from "./Document.ts";
import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";
import ToolbarPopoverButton from "./ToolbarPopoverButton";

export const App = ({ handle, onConnect, onDisconnect }: { handle: DocHandle<JsonDoc>, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(handle.url, { suspense: true });
  const [undoStack, setUndoStack] = useState<JsonDoc[]>([]);

  const modifyDoc = (updater: (d: JsonDoc) => void) => {
    const snapshot = JSON.parse(JSON.stringify(doc));
    setUndoStack(prev => [...prev, snapshot]);
    changeDoc(updater);
  };

  const repo = useContext(RepoContext) as Repo | undefined;
  const peerId: PeerId | null = repo?.peerId ?? null;

  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle, userId: repo?.peerId as string, initialState: {
      selectedNodeId: null
    }
  });

  const [peerStates] = useRemoteAwareness({ handle: handle, localUserId: peerId as string, offlineTimeout: 1000 });
  const peerSelections: { [peerId: string]: string | null } = useMemo(() => {
    const selections: { [peerId: string]: string | null } = {};
    Object.entries(peerStates).forEach(([peerId, state]) => {
      selections[peerId] = state.selectedNodeId || null;
    });
    return selections;
  }, [peerStates]);
  const [connected, setConnected] = useState(true);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);


  const details = useMemo(() => {
    const selectedEl = localState?.selectedNodeId ? document.querySelector(`[data-node-guid="${localState.selectedNodeId}"]`) as HTMLElement | null : null;
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
  }, [localState?.selectedNodeId, doc]);

  const selectedNodeGuid = localState.selectedNodeId || null;

  const conflicts = useMemo(() => detectConflicts(doc), [doc]);

  return (
    <>
      <Card appearance="subtle">
        <Toolbar style={{ display: "flex", justifyContent: "space-between" }}>
          <ToolbarGroup>
            <Tooltip content="Undo" relationship="label">
              <ToolbarButton
                icon={<ArrowUndoRegular />}
                onClick={() => {
                  if (undoStack.length === 0) return;
                  const prevDoc = undoStack[undoStack.length - 1];
                  setUndoStack(stack => stack.slice(0, -1));
                  changeDoc((d) => {
                    d.nodes = JSON.parse(JSON.stringify(prevDoc.nodes));
                    d.edges = JSON.parse(JSON.stringify(prevDoc.edges));
                    d.transformations = prevDoc.transformations ? JSON.parse(JSON.stringify(prevDoc.transformations)) : [];
                  });

                  clickOnSelectedNode(selectedNodeGuid);

                }}
                disabled={undoStack.length === 0}
              />
            </Tooltip>
            <ToolbarDivider />
            <ToolbarPopoverButton
              text="Add child"
              icon={<AddRegular />}
              disabled={!selectedNodeGuid}
              initialValue={doc.nodes.find(n => n.id === (doc.edges.find(e => e.parent === selectedNodeGuid)?.child ?? null))?.tag}
              ariaLabel="Add child"
              onSubmit={(tag) => {
                let newId: string | null = null;
                modifyDoc((prev: JsonDoc) => {
                  newId = addChildNode(prev, selectedNodeGuid!, tag, peerId);
                });
                if (newId) {
                  updateLocalState({ selectedNodeId: newId });
                }
              }}
            />
            <ToolbarPopoverButton
              text="Edit"
              icon={<EditRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Edit"
              initialValue={details?.value}
              onSubmit={(value) => {
                modifyDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  setNodeValue(prev, selectedNodeGuid!, value);
                });
              }}
            />

            <ToolbarPopoverButton
              text="Wrap"
              icon={<BackpackRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Wrap"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  wrapNode(prev, selectedNodeGuid!, tag, undefined, peerId);
                });
                clickOnSelectedNode(selectedNodeGuid);
              }}
            />

            <ToolbarPopoverButton
              text="Rename"
              icon={<RenameRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Rename"
              initialValue={details?.tag}
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  renameNode(prev, selectedNodeGuid!, tag);
                });
                clickOnSelectedNode(selectedNodeGuid);
              }}
            />
            <ToolbarDivider />

            <ToolbarPopoverButton
              text="Wrap all children"
              icon={<BackpackFilled />}
              disabled={!selectedNodeGuid}
              ariaLabel="Wrap all children"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "wrap", tag, peerId);
                });
              }}
            />

            <ToolbarPopoverButton
              text="Rename all children"
              icon={<RenameFilled />}
              disabled={!selectedNodeGuid}
              initialValue={doc.nodes.find(n => n.id === (doc.edges.find(e => e.parent === selectedNodeGuid)?.child ?? null))?.tag}
              ariaLabel="Rename all children"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "rename", tag, peerId);
                });
              }}
            />
          </ToolbarGroup>

          <ToolbarGroup>
            <Text>{peerId}</Text>
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
            <ToolbarButton icon={<NavigationRegular />} onClick={() => setHistoryOpen(!historyOpen)}>History</ToolbarButton>
            {conflicts.length > 0 && <ToolbarButton icon={<NavigationRegular />} onClick={() => setConflictsOpen(!conflictsOpen)}>Conflicts ({conflicts.length})</ToolbarButton>}
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

        <DomNavigator onSelectedChange={(id) => { updateLocalState({ selectedNodeId: id }) }} selectedNodeId={localState.selectedNodeId} peerSelections={peerSelections}>
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
      <Drawer open={historyOpen} separator position="end" onOpenChange={(_, { open }) => {
        setHistoryOpen(open);

      }}>
        <DrawerHeader>
          <DrawerHeaderTitle>History</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
        </DrawerBody>
      </Drawer>
    </>
  );
}

function clickOnSelectedNode(selectedNodeGuid: string | null) {
  setTimeout(() => {
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, 0);
}