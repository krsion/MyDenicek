import { DocHandle } from "@automerge/react";
import { Card, CardHeader, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, DrawerBody, DrawerHeader, DrawerHeaderTitle, InlineDrawer, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, CameraRegular, ChatRegular, CodeRegular, EditRegular, PlayRegular, RecordRegular, RenameFilled, RenameRegular, StopRegular } from "@fluentui/react-icons";
import type { JsonDoc, Node } from "@mydenicek/core";
import { firstChildsTag, generalizeSelection } from "@mydenicek/core";
import { useMemo, useRef, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { useDenicekDocument } from "./hooks/useDenicekDocument";
import { useRecorder } from "./hooks/useRecorder";
import { useSelection } from "./hooks/useSelection";
import { JsonView } from "./JsonView.tsx";
import { LlmChat } from "./LlmChat";
import { RecordedScriptView } from "./RecordedScriptView";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";



export const App = ({ handle, onConnect, onDisconnect }: { handle: DocHandle<JsonDoc>, onConnect: () => void, onDisconnect: () => void }) => {
  const { doc, undo, redo, canUndo, canRedo, updateAttribute, updateTag, wrapNodes, updateValue, addChildren, addSiblings, deleteNodes, replayScript, addTransformation } = useDenicekDocument(handle);
  const { selectedNodeIds, setSelectedNodeIds, peerSelections, peerId } = useSelection(handle);
  const { isRecording, recordedScript, startRecording, stopRecording, recordAction } = useRecorder();

  const [snapshot, setSnapshot] = useState<JsonDoc | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);
  const [patchesViewMode, setPatchesViewMode] = useState<'table' | 'json'>('table');
  // const [selectedPatchIndices, setSelectedPatchIndices] = useState<Set<number>>(new Set());

  const [connected, setConnected] = useState(true);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const navigatorRef = useRef<DomNavigatorHandle>(null);

  const selectedNodeGuids = selectedNodeIds;
  const selectedNodeGuid = selectedNodeGuids.length > 0 ? selectedNodeGuids[selectedNodeGuids.length - 1] : undefined;

  const handleStartRecording = () => {
    if (selectedNodeGuid) {
      startRecording(selectedNodeGuid);
    }
  };

  const replay = () => {
    if (!recordedScript || !selectedNodeGuid) return;
    replayScript(recordedScript, selectedNodeGuid);
  };

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

  // console.log(helloWorld());

  const details = useMemo(() => {
    if (!doc) return null;
    const selectedEl = selectedNodeGuid ? document.querySelector(`[data-node-guid="${selectedNodeGuid}"]`) as HTMLElement | null : null;
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
  }, [selectedNodeGuid, doc]);

  // Edits to selectedNode will not be synced by Automerge. instead, use changeDoc(prev => ...) to update the document model
  const selectedNode: Node | undefined = (selectedNodeGuid && doc) ? doc.nodes[selectedNodeGuid] : undefined;
  const selectedNodeFirstChildTag: string | undefined = (selectedNode && selectedNode.kind === "element" && doc) ? firstChildsTag(doc.nodes, selectedNode) : undefined;
  const selectedNodeAttributes = (selectedNode && selectedNode.kind === "element") ? selectedNode.attrs : undefined;

  const handleAttributeChange = (key: string, value: unknown | undefined) => {
    if (selectedNodeGuids.length === 0) return;
    updateAttribute(selectedNodeGuids, key, value);
  };

  // const [patches, setPatches] = useState<Patch[]>([]);

  // useEffect(() => {
  //   if (!snapshot || !doc) {
  //     setPatches([]);
  //     return;
  //   }
  //   // Automerge.diff returns a new array every time, but if the content is the same, we should avoid setting state?
  //   // Actually, if doc changes, diff changes.
  //   // The issue might be that setPatches triggers a re-render, which somehow triggers doc change? No.
  //   // But if doc is changing rapidly...

  //   // Let's try to wrap this in a transition or debounce if needed, but for now just uncomment.
  //   setPatches(Automerge.diff(doc, Automerge.getHeads(snapshot), Automerge.getHeads(doc)));
  // }, [snapshot, doc]);

  // const relevantPatches = useMemo(() => {
  //   const allPatches = patches.map((p, i) => ({ patch: p, index: i }));
  //   if (!filterPatches || selectedNodeGuids.length === 0 || !doc) return allPatches;

  //   const relevantIds = new Set<string>();
  //   const stack = [...selectedNodeGuids];
  //   while (stack.length > 0) {
  //     const id = stack.pop()!;
  //     relevantIds.add(id);
  //     const node = doc.nodes[id];
  //     if (node && node.kind === 'element') {
  //       stack.push(...node.children);
  //     }
  //   }

  //   return allPatches.filter(({ patch: p }) => {
  //     // Check if the patch modifies a relevant node
  //     if (p.path.length > 1 && p.path[0] === 'nodes' && relevantIds.has(String(p.path[1]))) {
  //       return true;
  //     }
  //     // Check if the patch value involves a relevant node (e.g. adding it to a parent's children list)
  //     const val = (p as { value?: unknown }).value;
  //     if (typeof val === 'string' && relevantIds.has(val)) {
  //       return true;
  //     }
  //     return false;
  //   });
  // }, [patches, filterPatches, selectedNodeGuids, doc]);

  // // Reset selected patches when relevantPatches change (e.g., filter changes)
  // // This useEffect is intentionally placed after the useMemo for relevantPatches
  // // to ensure it runs when relevantPatches is updated.
  // // useEffect(() => setSelectedPatchIndices(new Set()), [relevantPatches]);
  // const updatePatch = (index: number, updates: Partial<Patch>) => {
  //   setPatches(prev => {
  //     const next = [...prev];
  //     next[index] = { ...next[index], ...updates } as Patch;
  //     return next;
  //   });
  // };

  const actions = useMemo(() => ({
    updateAttribute, updateTag, wrapNodes, updateValue, addChildren, addSiblings, deleteNodes
  }), [updateAttribute, updateTag, wrapNodes, updateValue, addChildren, addSiblings, deleteNodes]);

  if (!doc) return <div>Loading...</div>;

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <Card appearance="subtle" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <Toolbar style={{ display: "flex", justifyContent: "space-between" }}>
            <ToolbarGroup>
              <Tooltip content="Undo" relationship="label">
                <ToolbarButton
                  icon={<ArrowUndoRegular />}
                  onClick={() => {
                    undo();
                    if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                  }}
                  disabled={!canUndo}
                />
              </Tooltip>
              <Tooltip content="Redo" relationship="label">
                <ToolbarButton
                  icon={<ArrowRedoRegular />}
                  onClick={() => {
                    redo();
                    if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                  }}
                  disabled={!canRedo}
                />
              </Tooltip>
              <ToolbarDivider />
              <AddNodePopoverButton
                disabled={selectedNode?.kind !== "element"}
                initialValue={selectedNodeFirstChildTag || ""}
                onAddChild={(content, isValue) => {
                  if (selectedNodeGuids.length === 0) return;
                  const newIds = addChildren(selectedNodeGuids, isValue ? "value" : "element", content);

                  if (newIds.length > 0) {
                    setSelectedNodeIds(newIds);

                    if (isRecording && selectedNodeGuid) {
                      // Recording only supports single action for now
                      recordAction(r => r.recordAddChild(selectedNodeGuid!, newIds[newIds.length - 1]!, isValue ? "value" : "element", content));
                    }
                  }
                }}
                onAddBefore={() => {
                  if (selectedNodeGuids.length === 0) return;
                  const newIds = addSiblings(selectedNodeGuids, "before");

                  if (newIds.length > 0) {
                    setSelectedNodeIds(newIds);
                  }

                }}
                onAddAfter={() => {
                  if (selectedNodeGuids.length === 0) return;
                  const newIds = addSiblings(selectedNodeGuids, "after");

                  if (newIds.length > 0) {
                    setSelectedNodeIds(newIds);
                  }
                }}
              />

              {selectedNode?.kind === "value" && (
                <ToolbarPopoverButton
                  text="Edit"
                  icon={<EditRegular />}
                  disabled={false}
                  ariaLabel="Edit"
                  placeholder="Value content"
                  initialValue={details?.value || ""}
                  onSubmit={(value) => {
                    const originalValue = details?.value || "";
                    updateValue(selectedNodeGuids, value, originalValue);

                    if (isRecording && selectedNodeGuid) {
                      recordAction(r => r.recordSetValue(selectedNodeGuid, value));
                    }
                  }}
                />
              ) ||
                <ToolbarPopoverButton
                  text="Rename"
                  icon={<RenameRegular />}
                  disabled={!selectedNodeGuid || selectedNode?.kind !== "element"}
                  ariaLabel="Rename"
                  placeholder="Tag name (e.g. div)"
                  initialValue={details?.tag || ""}
                  onSubmit={(tag) => {
                    updateTag(selectedNodeGuids, tag);
                    if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                    if (isRecording && selectedNodeGuid) {
                      recordAction(r => r.recordRename(selectedNodeGuid, tag));
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
                  wrapNodes(selectedNodeGuids, tag);
                  if (selectedNodeGuid) clickOnSelectedNode(selectedNodeGuid);
                  if (isRecording && selectedNodeGuid) {
                    recordAction(r => r.recordWrap(selectedNodeGuid, tag));
                  }
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
                  addTransformation(selectedNodeGuids, "rename", tag);
                }}
              />

              <ToolbarPopoverButton
                text="Wrap all children"
                icon={<BackpackFilled />}
                disabled={!selectedNodeGuid || !selectedNodeFirstChildTag}
                ariaLabel="Wrap all children"
                onSubmit={(tag) => {
                  addTransformation(selectedNodeGuids, "wrap", tag);
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
                      <JsonView data={doc} />
                    </DialogContent>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
              <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(doc)}>Snapshot</ToolbarButton>
              <ToolbarDivider />
              {!isRecording ? (
                <ToolbarButton icon={<RecordRegular />} onClick={handleStartRecording} disabled={!selectedNodeGuid}>Record</ToolbarButton>
              ) : (
                <ToolbarButton icon={<StopRegular />} onClick={stopRecording}>Stop Recording</ToolbarButton>
              )}
              <ToolbarButton icon={<PlayRegular />} onClick={() => {
                replay();
              }} disabled={!recordedScript || !selectedNodeGuid}>Replay</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton icon={<ChatRegular />} onClick={() => setShowAiPanel(!showAiPanel)}>AI Assistant</ToolbarButton>
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

          <DomNavigator ref={navigatorRef} onSelectedChange={(ids) => { setSelectedNodeIds(ids) }} selectedNodeIds={selectedNodeGuids} peerSelections={peerSelections} generalizer={(ids) => generalizeSelection(doc, ids)}>
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
              <CardHeader header={<Text>Patches from Snapshot</Text>} action={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* <ToolbarButton
                  icon={<ArrowRedoRegular />}
                  disabled={selectedPatchIndices.size === 0}
                  onClick={() => {
                    const patchesToReplay = relevantPatches.filter((_, i) => selectedPatchIndices.has(i)).map(p => p.patch);
                    applyPatches(patchesToReplay);
                    setSelectedPatchIndices(new Set());
                  }}
                >
                  Replay ({selectedPatchIndices.size})
                </ToolbarButton> */}
                <Switch label="Filter by selection" checked={filterPatches} onChange={(_, data) => setFilterPatches(data.checked)} />
                <ToolbarButton icon={<CodeRegular />} onClick={() => setPatchesViewMode(patchesViewMode === 'table' ? 'json' : 'table')}>
                  {patchesViewMode === 'table' ? 'JSON' : 'Table'}
                </ToolbarButton>
                <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(null)}>Clear</ToolbarButton>
              </div>} />
              {/* {patchesViewMode === 'json' ? (
                <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                  <JsonView data={relevantPatches.map(p => p.patch)} />
                </div>
              ) : (
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>
                        <Checkbox
                          checked={relevantPatches.length > 0 && selectedPatchIndices.size === relevantPatches.length ? true : selectedPatchIndices.size > 0 ? "mixed" : false}
                          onChange={(_, data) => {
                            if (data.checked === true) {
                              setSelectedPatchIndices(new Set(relevantPatches.map((_, i) => i)));
                            } else {
                              setSelectedPatchIndices(new Set());
                            }
                          }}
                        />
                      </TableHeaderCell>
                      <TableHeaderCell>Action</TableHeaderCell>
                      <TableHeaderCell>Path</TableHeaderCell>
                      <TableHeaderCell>Value</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {relevantPatches.map(({ patch: p, index: originalIndex }, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Checkbox
                            checked={selectedPatchIndices.has(i)}
                            onChange={(_, data) => {
                              const newSet = new Set(selectedPatchIndices);
                              if (data.checked) {
                                newSet.add(i);
                              } else {
                                newSet.delete(i);
                              }
                              setSelectedPatchIndices(newSet);
                            }}
                          />
                        </TableCell>
                        <TableCell>{p.action}</TableCell>
                        <TableCell>
                          <Input
                            style={{ width: '100%', minWidth: '300px' }}
                            value={p.path.join("/")}
                            onChange={(_, data) => {
                              const newPath = data.value.split("/");
                              updatePatch(originalIndex, { path: newPath });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            style={{ width: '100%' }}
                            value={JSON.stringify((p as { value?: unknown }).value)}
                            onChange={(_, data) => {
                              try {
                                const newValue = JSON.parse(data.value);
                                updatePatch(originalIndex, { value: newValue });
                              } catch {
                                // ignore invalid json while typing
                              }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )} */}
            </Card>
          )}

        </Card>
      </div>
      <InlineDrawer open={(recordedScript !== null && recordedScript.length > 0) || isRecording} separator position="end">
        <DrawerHeader>
          <DrawerHeaderTitle>Recording</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <RecordedScriptView script={recordedScript || []} />
        </DrawerBody>
      </InlineDrawer>
      <InlineDrawer open={showAiPanel} separator position="end" style={{ width: '400px' }}>
        <DrawerHeader>
          <DrawerHeaderTitle>AI Assistant</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <LlmChat doc={doc} actions={actions} />
        </DrawerBody>
      </InlineDrawer>
    </div>
  );
}

function clickOnSelectedNode(selectedNodeGuid: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, 0);
}