import { next as Automerge, type Patch } from "@automerge/automerge";
import { DocHandle, type PeerId, type Repo, RepoContext, useDocument, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import { Card, CardHeader, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, CameraRegular, CodeRegular, EditRegular, HistoryRegular, RenameFilled, RenameRegular } from "@fluentui/react-icons";
import { useContext, useMemo, useRef, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, firstChildsTag, type JsonDoc, type Node, wrapNode } from "./Document.ts";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { JsonView } from "./JsonView.tsx";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";

export const App = ({ handle, onConnect, onDisconnect }: { handle: DocHandle<JsonDoc>, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(handle.url, { suspense: true });
  const [undoStack, setUndoStack] = useState<JsonDoc[]>([]);
  const [redoStack, setRedoStack] = useState<JsonDoc[]>([]);
  const [snapshot, setSnapshot] = useState<JsonDoc | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);

  const modifyDoc = (updater: (d: JsonDoc) => void) => {
    setUndoStack(prev => [...prev, doc]);
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
  const navigatorRef = useRef<DomNavigatorHandle>(null);

  const triggerNavigation = (action: 'parent' | 'child' | 'prev' | 'next' | 'clear') => {
    if (!navigatorRef.current) return;
    switch (action) {
      case 'parent':
        navigatorRef.current.navigateToParent();
        break;
      case 'child':
        navigatorRef.current.navigateToFirstChild();
        break;
      case 'prev':
        navigatorRef.current.navigateToPrevSibling();
        break;
      case 'next':
        navigatorRef.current.navigateToNextSibling();
        break;
      case 'clear':
        navigatorRef.current.clearSelection();
        break;
    }
  };


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
  // Edits to selectedNode will not be synced by Automerge. instead, use changeDoc(prev => ...) to update the document model
  const selectedNode: Node | undefined = selectedNodeGuid ? doc.nodes[selectedNodeGuid] : undefined;
  const selectedNodeFirstChildTag: string | undefined = (selectedNode && selectedNode.kind === "element") ? firstChildsTag(doc.nodes, selectedNode) : undefined;
  const selectedNodeAttributes = (selectedNode && selectedNode.kind === "element") ? selectedNode.attrs : undefined;

  const handleAttributeChange = (key: string, value: unknown | undefined) => {
    if (!selectedNodeGuid) return;
    modifyDoc((prev: JsonDoc) => {
      const node = prev.nodes[selectedNodeGuid];
      if (node && node.kind === "element") {
        if (value === undefined) {
          delete node.attrs[key];
        } else {
          node.attrs[key] = value;
        }
      }
    });
  };

  const patches = useMemo(() => {
    if (!snapshot) return [];
    return Automerge.diff(doc, Automerge.getHeads(snapshot), Automerge.getHeads(doc));
  }, [snapshot, doc]);

  const relevantPatches = useMemo(() => {
    if (!filterPatches || !selectedNodeGuid) return patches;

    const relevantIds = new Set<string>();
    const stack = [selectedNodeGuid];
    while (stack.length > 0) {
      const id = stack.pop()!;
      relevantIds.add(id);
      const node = doc.nodes[id];
      if (node && node.kind === 'element') {
        stack.push(...node.children);
      }
    }

    return patches.filter(p => {
      // Check if the patch modifies a relevant node
      if (p.path.length > 1 && p.path[0] === 'nodes' && relevantIds.has(String(p.path[1]))) {
        return true;
      }
      // Check if the patch value involves a relevant node (e.g. adding it to a parent's children list)
      // const val = (p as { value?: unknown }).value;
      // if (typeof val === 'string' && relevantIds.has(val)) {
      //   return true;
      // }
      return false;
    });
  }, [patches, filterPatches, selectedNodeGuid, doc]);

  const applyPatchesManual = (d: JsonDoc, patches: Patch[]) => {
    patches.forEach((patch, _i) => {
      let target: unknown = d;
      const path = patch.path;
      let i_path = 0;

      // Traverse path until we hit a primitive or end of path
      for (; i_path < path.length - 1; i_path++) {
        const part = path[i_path]!;
        const next = (target as Record<string | number, unknown>)[part];
        if (typeof next === 'string') {
          // Stop if next is string (primitive), so we can modify it on the parent
          break;
        }
        target = next;
      }

      const key = path[i_path]!;
      const remainingPath = path.slice(i_path + 1);
      const targetRecord = target as Record<string | number, unknown>;
      const targetArray = target as unknown[];

      if (patch.action === 'del') {
        if (Array.isArray(target)) {
          targetArray.splice(key as number, 1);
        } else {
          delete targetRecord[key];
        }
      } else if (patch.action === 'put') {
        targetRecord[key] = patch.value;
      } else if (patch.action === 'insert') {
        // Insert into array
        targetArray.splice(key as number, 0, ...patch.values);
      } else if (patch.action === 'splice') {
        // Splice string or array
        // If remainingPath has elements, the first one is likely the index
        const index = remainingPath.length > 0 ? remainingPath[0] as number : key as number;
        const value = patch.value;

        if (typeof targetRecord[key] === 'string') {
          const str = targetRecord[key] as string;
          // Simple string splice simulation
          targetRecord[key] = str.slice(0, index) + value + str.slice(index);
        } else if (Array.isArray(targetRecord[key])) {
          (targetRecord[key] as unknown[]).splice(index, 0, value);
        } else if (Array.isArray(target) && patch.action === 'splice') {
          (targetRecord[key] as unknown[]).splice(index, 0, value);
        }
      }
    });
  };

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
                  setRedoStack(stack => [...stack, doc]);
                  const currentHeads = Automerge.getHeads(doc);
                  const prevHeads = Automerge.getHeads(prevDoc);
                  const patches = Automerge.diff(doc, currentHeads, prevHeads);

                  changeDoc((d) => {
                    try {
                      applyPatchesManual(d, patches);
                    } catch (e) {
                      console.error("Error applying patches:", e);
                    }
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
                  setUndoStack(stack => [...stack, doc]);
                  const currentHeads = Automerge.getHeads(doc);
                  const nextHeads = Automerge.getHeads(nextDoc);
                  const patches = Automerge.diff(doc, currentHeads, nextHeads);

                  changeDoc((d) => {
                    try {
                      applyPatchesManual(d, patches);
                    } catch (e) {
                      console.error("Error applying redo patches:", e);
                    }
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
                    if (!selectedNodeGuid || prev.nodes[selectedNodeGuid]?.kind !== "element") return;
                    if (isValue) {
                      newId = addValueChildNode(prev, prev.nodes[selectedNodeGuid], content);
                    } else {
                      newId = addElementChildNode(prev, prev.nodes[selectedNodeGuid], content);
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

            {selectedNode?.kind === "value" && (
              <ToolbarPopoverButton
                text="Edit"
                icon={<EditRegular />}
                disabled={false}
                ariaLabel="Edit"
                initialValue={details?.value || ""}
                onSubmit={(value) => {
                  modifyDoc((prev: JsonDoc) => {
                    if (!selectedNodeGuid || prev.nodes[selectedNodeGuid]?.kind !== "value") return;
                    prev.nodes[selectedNodeGuid].value = value;
                  });
                }}
              />
            ) ||
              <ToolbarPopoverButton
                text="Rename"
                icon={<RenameRegular />}
                disabled={!selectedNodeGuid || selectedNode?.kind !== "element"}
                ariaLabel="Rename"
                initialValue={details?.tag || ""}
                onSubmit={(tag) => {
                  if (selectedNode?.kind == "element") {
                    modifyDoc((prev: JsonDoc) => {
                      if (!selectedNodeGuid || prev.nodes[selectedNodeGuid]?.kind !== "element") return;
                      prev.nodes[selectedNodeGuid].tag = tag;
                    });
                    if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                  }
                }}
              />
            }
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
            <ToolbarDivider />

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
            <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(doc)}>Snapshot</ToolbarButton>
          </ToolbarGroup>
        </Toolbar>

        <CardHeader header={<TagGroup>
          <Tag icon={<ArrowUpRegular />} onClick={() => triggerNavigation('parent')} style={{ cursor: 'pointer' }}> Parent</Tag>
          <Tag icon={<ArrowDownRegular />} onClick={() => triggerNavigation('child')} style={{ cursor: 'pointer' }}> First child</Tag>
          <Tag icon={<ArrowLeftRegular />} onClick={() => triggerNavigation('prev')} style={{ cursor: 'pointer' }}> Prev sibling</Tag>
          <Tag icon={<ArrowRightRegular />} onClick={() => triggerNavigation('next')} style={{ cursor: 'pointer' }}> Next sibling</Tag>
          <Tag icon={<Text>Esc</Text>} onClick={() => triggerNavigation('clear')} style={{ cursor: 'pointer' }}>Clear</Tag>
        </TagGroup>}
        />

        <DomNavigator ref={navigatorRef} onSelectedChange={(id) => { updateLocalState({ selectedNodeId: id }) }} selectedNodeId={doc.nodes[localState.selectedNodeId!] ? localState.selectedNodeId : null} peerSelections={peerSelections}>
          <RenderedDocument tree={doc} />
        </DomNavigator>

        <ElementDetails
          details={details}
          attributes={selectedNodeAttributes}
          onAttributeChange={handleAttributeChange}
        />
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

        {snapshot && (
          <Card>
            <CardHeader header={<Text>Patches from Snapshot</Text>} action={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Switch label="Filter by selection" checked={filterPatches} onChange={(_, data) => setFilterPatches(data.checked)} /><ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(null)}>Clear</ToolbarButton></div>} />
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Path</TableHeaderCell>
                  <TableHeaderCell>Value</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relevantPatches.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.action}</TableCell>
                    <TableCell>{p.path.join("/")}</TableCell>
                    <TableCell>{JSON.stringify((p as { value?: unknown }).value)}</TableCell>
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