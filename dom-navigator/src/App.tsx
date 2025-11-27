import { DocHandle, type PeerId, type Repo, RepoContext, useDocument, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import { Card, CardHeader, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, CodeRegular, EditRegular, HistoryRegular, RenameFilled, RenameRegular } from "@fluentui/react-icons";
import { useContext, useMemo, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, firstChildsTag, type JsonDoc, type Node, wrapNode } from "./Document.ts";
import { DomNavigator } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { JsonView } from "./JsonView.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";

export const App = ({ handle, onConnect, onDisconnect }: { handle: DocHandle<JsonDoc>, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(handle.url, { suspense: true });
  const [undoStack, setUndoStack] = useState<JsonDoc[]>([]);
  const [redoStack, setRedoStack] = useState<JsonDoc[]>([]);

  const modifyDoc = (updater: (d: JsonDoc) => void) => {
    const snapshot = JSON.parse(JSON.stringify(doc));
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
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
    const modelNode = guid ? doc.nodes[guid] : undefined;
    const value = modelNode?.kind === "value" ? (modelNode.value as string | undefined) : undefined;

    return { tag, id, guid, classes, width, height, dataTestId, value };
  }, [localState?.selectedNodeId, doc]);

  const selectedNodeGuid: string | undefined = localState.selectedNodeId || undefined;
  const selectedNode: Node | undefined = selectedNodeGuid ? doc.nodes[selectedNodeGuid] : undefined;
  const selectedNodeFirstChildTag: string | undefined = (selectedNode && selectedNode.kind === "element") ? firstChildsTag(doc.nodes, selectedNode) : undefined;

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
                  if (!prevDoc) return;
                  setUndoStack(stack => stack.slice(0, -1));
                  setRedoStack(stack => [...stack, JSON.parse(JSON.stringify(doc))]);
                  changeDoc((d) => {
                    d.nodes = JSON.parse(JSON.stringify(prevDoc.nodes));
                    d.transformations = prevDoc.transformations ? JSON.parse(JSON.stringify(prevDoc.transformations)) : [];
                  });
                  if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);

                }}
                disabled={undoStack.length === 0}
              />
            </Tooltip>
            <Tooltip content="Redo" relationship="label">
              <ToolbarButton
                icon={<ArrowRedoRegular />}
                onClick={() => {
                  if (redoStack.length === 0) return;
                  const nextDoc = redoStack[redoStack.length - 1];
                  if (!nextDoc) return;
                  setRedoStack(stack => stack.slice(0, -1));
                  setUndoStack(stack => [...stack, JSON.parse(JSON.stringify(doc))]);
                  changeDoc((d) => {
                    d.nodes = JSON.parse(JSON.stringify(nextDoc.nodes));
                    d.transformations = nextDoc.transformations ? JSON.parse(JSON.stringify(nextDoc.transformations)) : [];
                  });

                  if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                }}
                disabled={redoStack.length === 0}
              />
            </Tooltip>
            <ToolbarDivider />
            <AddNodePopoverButton
              disabled={selectedNode?.kind !== "element"}
              initialValue={selectedNodeFirstChildTag || ""}
              onAddChild={(content, isValue) => {
                if (selectedNode?.kind === "element") {
                  let newId: string | undefined = undefined;
                  modifyDoc((prev: JsonDoc) => {
                    if (isValue) {
                      newId = addValueChildNode(prev, selectedNode, content);
                    } else {
                      newId = addElementChildNode(prev, selectedNode, content);
                    }
                  });
                  if (newId) {
                    updateLocalState({ selectedNodeId: newId });
                  }
                }
              }}
              onAddBefore={() => {
                if (!selectedNodeGuid) return;
                let newId: string | undefined = undefined;
                modifyDoc((prev: JsonDoc) => {
                  newId = addSiblingNodeBefore(prev.nodes, selectedNodeGuid);
                });
                if (newId) {
                  updateLocalState({ selectedNodeId: newId });
                }

              }}
              onAddAfter={() => {
                if (!selectedNodeGuid) return;
                let newId: string | undefined = undefined;
                modifyDoc((prev: JsonDoc) => {
                  newId = addSiblingNodeAfter(prev.nodes, selectedNodeGuid);
                });
                if (newId) {
                  updateLocalState({ selectedNodeId: newId });
                }
              }}
            />
            <ToolbarPopoverButton
              text="Edit"
              icon={<EditRegular />}
              disabled={!selectedNode || selectedNode.kind !== "value"}
              ariaLabel="Edit"
              initialValue={details?.value || ""}
              onSubmit={(value) => {
                if (selectedNode?.kind == "value") {
                  modifyDoc(() => {
                    selectedNode.value = value;
                  });
                }
              }}
            />

            <ToolbarPopoverButton
              text="Wrap"
              icon={<BackpackRegular />}
              disabled={!selectedNodeGuid}
              ariaLabel="Wrap"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  wrapNode(prev.nodes, selectedNodeGuid!, tag);
                });
                if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
              }}
            />

            <ToolbarPopoverButton
              text="Rename"
              icon={<RenameRegular />}
              disabled={!selectedNodeGuid || selectedNode?.kind !== "element"}
              ariaLabel="Rename"
              initialValue={details?.tag || ""}
              onSubmit={(tag) => {
                if (selectedNode?.kind == "element") {
                  modifyDoc(() => {
                    selectedNode.tag = tag;
                  });
                  if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                }
              }}
            />
            <ToolbarDivider />

            <ToolbarPopoverButton
              text="Wrap all children"
              icon={<BackpackFilled />}
              disabled={!selectedNodeGuid || !selectedNodeFirstChildTag}
              ariaLabel="Wrap all children"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "wrap", tag);
                });
              }}
            />

            <ToolbarPopoverButton
              text="Rename all children"
              icon={<RenameFilled />}
              disabled={!selectedNodeGuid || !selectedNodeFirstChildTag}
              initialValue={selectedNodeFirstChildTag || ""}
              ariaLabel="Rename all children"
              onSubmit={(tag) => {
                modifyDoc((prev: JsonDoc) => {
                  if (!selectedNodeGuid) return;
                  addTransformation(prev, selectedNodeGuid!, "rename", tag);
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
            <Dialog>
              <DialogTrigger>
                <ToolbarButton icon={<CodeRegular />}>Raw</ToolbarButton>
              </DialogTrigger>
              <DialogSurface style={{ width: 1000 }}>
                <DialogBody>
                  <DialogContent>
                    <JsonView doc={doc} />
                  </DialogContent>
                </DialogBody>
              </DialogSurface>
            </Dialog>
            <ToolbarButton icon={<HistoryRegular />} onClick={() => setHistoryOpen(!historyOpen)}>History</ToolbarButton>
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
        {doc.transformations && doc.transformations.length > 0 && (
          <Card>
            <CardHeader header={<Text>Transformations</Text>} />
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Parent ID</TableHeaderCell>
                  <TableHeaderCell>Value</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.transformations.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.type}</TableCell>
                    <TableCell>{t.parent}</TableCell>
                    <TableCell>{t.tag}</TableCell>
                    <TableCell>{t.version}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

        )}

      </Card>
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

function clickOnSelectedNode(selectedNodeGuid: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, 0);
}