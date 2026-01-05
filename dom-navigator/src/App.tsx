import { next as Automerge, type Patch } from "@automerge/automerge";
import { DocHandle, type PeerId, type Repo, RepoContext, useDocument, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import { Card, CardHeader, Checkbox, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, DrawerBody, DrawerHeader, DrawerHeaderTitle, InlineDrawer, Input, Switch, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, CameraRegular, CodeRegular, EditRegular, PlayRegular, RecordRegular, RenameFilled, RenameRegular, StopRegular } from "@fluentui/react-icons";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { addElementChildNode, addSiblingNodeAfter, addSiblingNodeBefore, addTransformation, addValueChildNode, type ElementNode, firstChildsTag, generalizeSelection, type JsonDoc, type Node, wrapNode } from "./Document.ts";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { JsonView } from "./JsonView.tsx";
import { RecordedScriptView } from "./RecordedScriptView";
import { type RecordedAction, Recorder } from "./Recorder";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";

export const App = ({ handle, onConnect, onDisconnect }: { handle: DocHandle<JsonDoc>, onConnect: () => void, onDisconnect: () => void }) => {
  const [doc, changeDoc] = useDocument<JsonDoc>(handle.url, { suspense: true });
  const [undoStack, setUndoStack] = useState<JsonDoc[]>([]);
  const [redoStack, setRedoStack] = useState<JsonDoc[]>([]);
  const [snapshot, setSnapshot] = useState<JsonDoc | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);
  const [patchesViewMode, setPatchesViewMode] = useState<'table' | 'json'>('table');
  const [selectedPatchIndices, setSelectedPatchIndices] = useState<Set<number>>(new Set());

  const modifyDoc = (updater: (d: JsonDoc) => void) => {
    setUndoStack(prev => [...prev, doc]);
    setRedoStack([]);
    changeDoc(updater);
  };

  const repo = useContext(RepoContext) as Repo | undefined;
  const peerId: PeerId | null = repo?.peerId ?? null;

  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle, userId: repo?.peerId as string, initialState: {
      selectedNodeIds: [] as string[]
    }
  });

  const [peerStates] = useRemoteAwareness({ handle: handle, localUserId: peerId as string, offlineTimeout: 1000 });
  const peerSelections: { [peerId: string]: string[] | null } = useMemo(() => {
    const selections: { [peerId: string]: string[] | null } = {};
    Object.entries(peerStates).forEach(([peerId, state]) => {
      if (state.selectedNodeIds && Array.isArray(state.selectedNodeIds)) {
        selections[peerId] = state.selectedNodeIds;
      } else if (state.selectedNodeId) {
        // Backward compatibility
        selections[peerId] = [state.selectedNodeId];
      } else {
        selections[peerId] = null;
      }
    });
    return selections;
  }, [peerStates]);
  const [connected, setConnected] = useState(true);
  const navigatorRef = useRef<DomNavigatorHandle>(null);

  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [recordedScript, setRecordedScript] = useState<RecordedAction[] | null>(null);

  const startRecording = () => {
    if (!selectedNodeGuid) return;
    setRecorder(new Recorder(selectedNodeGuid));
    setRecordedScript([]);
  };

  const stopRecording = () => {
    if (recorder) {
      setRecordedScript(recorder.getActions());
      setRecorder(null);
    }
  };

  const replay = () => {
    if (!recordedScript || !selectedNodeGuid) return;

    modifyDoc((doc) => {
      const replayMap: Record<string, string> = { "$0": selectedNodeGuid };

      const resolve = (ref: string): string => {
        if (replayMap[ref]) return replayMap[ref]!;
        if (ref.startsWith("$")) return replayMap[ref] || ref;
        // If it's a wrapper ref like w-$0, check if we have it mapped
        if (ref.startsWith("w-")) {
          // If we mapped "w-$0" explicitly (due to collision handling), return it
          // Otherwise, try to resolve inner and prepend w-
          const inner = resolve(ref.substring(2));
          // If inner resolved to something different, try w-inner
          // But wait, if we didn't map w-$0, it means we assume standard naming w-{ID}
          return "w-" + inner;
        }
        if (ref.endsWith("_w")) {
          const inner = resolve(ref.substring(0, ref.length - 2));
          return inner + "_w";
        }
        return ref;
      };
      for (const action of recordedScript) {
        if (action.type === "addChild") {
          const parentId = resolve(action.parent);
          const parentNode = doc.nodes[parentId];
          if (parentNode?.kind === "element") {
            let newId: string;
            if (action.nodeType === "value") {
              newId = addValueChildNode(doc, parentNode, action.content).id;
            } else {
              newId = addElementChildNode(doc, parentNode, action.content).id;
            }
            replayMap[action.newIdVar] = newId;
          }
        } else if (action.type === "setValue") {
          const targetId = resolve(action.target);
          const node = doc.nodes[targetId];
          if (node?.kind === "value") {
            node.value = action.value;
          }
        } else if (action.type === "wrap") {
          const targetId = resolve(action.target);

          // Predict the wrapper ID to map it
          let wrapperId = "w-" + targetId;
          while (doc.nodes[wrapperId]) wrapperId = wrapperId + "_w";

          wrapNode(doc.nodes, targetId, action.wrapperTag);

          // Map w-{targetRef} to wrapperId
          // action.target is the ref, e.g. $0
          // We need to handle collisions in the map key too, to match Recorder logic
          let refKey = "w-" + action.target;
          while (replayMap[refKey]) refKey = refKey + "_w";
          replayMap[refKey] = wrapperId;

        } else if (action.type === "rename") {
          const targetId = resolve(action.target);
          const node = doc.nodes[targetId];
          if (node?.kind === "element") {
            node.tag = action.newTag;
          }
        }
      }
    });
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


  const selectedNodeGuids: string[] = localState.selectedNodeIds || (localState.selectedNodeId ? [localState.selectedNodeId] : []);
  const selectedNodeGuid: string | undefined = selectedNodeGuids.length > 0 ? selectedNodeGuids[selectedNodeGuids.length - 1] : undefined;

  const details = useMemo(() => {
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

  const [patches, setPatches] = useState<Patch[]>([]);

  useEffect(() => {
    if (!snapshot) {
      setPatches([]);
      return;
    }
    setPatches(Automerge.diff(doc, Automerge.getHeads(snapshot), Automerge.getHeads(doc)));
  }, [snapshot, doc]);

  const relevantPatches = useMemo(() => {
    const allPatches = patches.map((p, i) => ({ patch: p, index: i }));
    if (!filterPatches || !selectedNodeGuid) return allPatches;

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

    return allPatches.filter(({ patch: p }) => {
      // Check if the patch modifies a relevant node
      if (p.path.length > 1 && p.path[0] === 'nodes' && relevantIds.has(String(p.path[1]))) {
        return true;
      }
      // Check if the patch value involves a relevant node (e.g. adding it to a parent's children list)
      const val = (p as { value?: unknown }).value;
      if (typeof val === 'string' && relevantIds.has(val)) {
        return true;
      }
      return false;
    });
  }, [patches, filterPatches, selectedNodeGuid, doc]);

  useEffect(() => {
    setSelectedPatchIndices(new Set());
  }, [relevantPatches]);

  const updatePatch = (index: number, updates: Partial<Patch>) => {
    setPatches(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates } as Patch;
      return next;
    });
  };

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
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <Card appearance="subtle" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
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
                        newId = addValueChildNode(prev, prev.nodes[selectedNodeGuid] as ElementNode, content).id;
                      } else {
                        newId = addElementChildNode(prev, prev.nodes[selectedNodeGuid] as ElementNode, content).id;
                      }
                    });
                    if (newId) {
                      updateLocalState({ selectedNodeId: newId });
                      if (recorder && selectedNodeGuid) {
                        recorder.recordAddChild(selectedNodeGuid, newId, isValue ? "value" : "element", content);
                        setRecordedScript([...recorder.getActions()]);
                      }
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
                    if (recorder && selectedNodeGuid) {
                      recorder.recordSetValue(selectedNodeGuid, value);
                      setRecordedScript([...recorder.getActions()]);
                    }
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
                      if (recorder && selectedNodeGuid) {
                        recorder.recordRename(selectedNodeGuid, tag);
                        setRecordedScript([...recorder.getActions()]);
                      }
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
                  if (recorder && selectedNodeGuid) {
                    recorder.recordWrap(selectedNodeGuid, tag);
                    setRecordedScript([...recorder.getActions()]);
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
                      <JsonView data={doc} />
                    </DialogContent>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
              <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(doc)}>Snapshot</ToolbarButton>
              <ToolbarDivider />
              {!recorder ? (
                <ToolbarButton icon={<RecordRegular />} onClick={startRecording} disabled={!selectedNodeGuid}>Record</ToolbarButton>
              ) : (
                <ToolbarButton icon={<StopRegular />} onClick={stopRecording}>Stop Recording</ToolbarButton>
              )}
              <ToolbarButton icon={<PlayRegular />} onClick={() => {
                replay();
              }} disabled={!recordedScript || !selectedNodeGuid}>Replay</ToolbarButton>
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

          <DomNavigator ref={navigatorRef} onSelectedChange={(ids) => { updateLocalState({ selectedNodeIds: ids }) }} selectedNodeIds={selectedNodeGuids} peerSelections={peerSelections} generalizer={(ids) => generalizeSelection(doc, ids)}>
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
                <ToolbarButton
                  icon={<ArrowRedoRegular />}
                  disabled={selectedPatchIndices.size === 0}
                  onClick={() => {
                    const patchesToReplay = relevantPatches.filter((_, i) => selectedPatchIndices.has(i)).map(p => p.patch);
                    modifyDoc(d => applyPatchesManual(d, patchesToReplay));
                    setSelectedPatchIndices(new Set());
                  }}
                >
                  Replay ({selectedPatchIndices.size})
                </ToolbarButton>
                <Switch label="Filter by selection" checked={filterPatches} onChange={(_, data) => setFilterPatches(data.checked)} />
                <ToolbarButton icon={<CodeRegular />} onClick={() => setPatchesViewMode(patchesViewMode === 'table' ? 'json' : 'table')}>
                  {patchesViewMode === 'table' ? 'JSON' : 'Table'}
                </ToolbarButton>
                <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(null)}>Clear</ToolbarButton>
              </div>} />
              {patchesViewMode === 'json' ? (
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
              )}
            </Card>
          )}

        </Card>
      </div>
      <InlineDrawer open={(recordedScript !== null && recordedScript.length > 0) || recorder !== null} separator position="end">
        <DrawerHeader>
          <DrawerHeaderTitle>Recording</DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <RecordedScriptView script={recordedScript || []} />
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