import { Badge, Button, Card, CardHeader, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Spinner, Switch, Tag, TagGroup, Text, Toast, Toaster, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip, useId, useToastController } from "@fluentui/react-components";
import { AddRegular, ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackRegular, CalculatorRegular, CameraRegular, ClipboardPasteRegular, CodeRegular, CopyRegular, EditRegular, InfoRegular, LinkRegular, PlayRegular, RecordRegular, RenameRegular, StopRegular } from "@fluentui/react-icons";
import type { GeneralizedPatch } from "@mydenicek/core";
import type { Snapshot } from "@mydenicek/react";
import {
  useConnectivity,
  useDocumentActions,
  useDocumentState,
  useFormulaViewMode,
  useRecording,
  useSelectedNode,
  useSelection
} from "@mydenicek/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddNodePopoverButton, type NodeKind } from "./AddNodePopoverButton";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ResizablePanel } from "./components/ResizablePanel";
import { PeerAliasProvider } from "./context/PeerAliasContext";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { FormulaToolbar } from "./FormulaToolbar";
import { useClipboard } from "./hooks/useClipboard";
import { JsonView } from "./JsonView.tsx";
import { RecordedScriptView } from "./RecordedScriptView";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { sanitizeTagName, ToolbarPopoverButton, validateTagName } from "./ToolbarPopoverButton";
import { analyzeScript, generalizeScript, type ScriptAnalysis } from "./utils/scriptAnalysis";
import { generalizeSelection } from "./utils/selectionUtils";

// Generate a random room ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Get room ID from URL hash or generate a new one
function getRoomIdFromHash(): string {
  const hash = window.location.hash.slice(1); // Remove the # prefix
  return hash || generateRoomId();
}

export const App = () => {
  const { document } = useDocumentState();
  const {
    undo, redo, canUndo, canRedo,
    updateAttribute, updateTag, wrapNodes,
    updateValue,
    deleteNodes: _deleteNodes
  } = useDocumentActions();
  const recordingObj = useRecording();
  const { history: recordingHistory, clearHistory, replay } = recordingObj;
  const [showHistory, setShowHistory] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [refPickMode, setRefPickMode] = useState<{ parentId: string; position: "child" | "before" | "after" } | null>(null);

  const { connect, disconnect, status, latency, error } = useConnectivity();
  const { setSelectedNodeIds, remoteSelections, userId } = useSelection();
  const { selectedNodeId, selectedNodeIds, node, details } = useSelectedNode();
  const { mode: formulaViewMode, toggleMode: toggleFormulaViewMode, isFormulaMode } = useFormulaViewMode();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);
  const [patchesViewMode, setPatchesViewMode] = useState<'table' | 'json'>('table');

  const [roomId] = useState<string>(() => getRoomIdFromHash());

  // Derive connected from status
  const connected = status === "connected";
  const navigatorRef = useRef<DomNavigatorHandle>(null);
  const [selectedActionIndices, setSelectedActionIndices] = useState<Set<number>>(new Set());
  const [targetOverrides, setTargetOverrides] = useState<Map<number, string>>(new Map());
  const [sourceOverrides, setSourceOverrides] = useState<Map<number, string>>(new Map());

  // Add to Button dialog state
  const [showAddToButtonDialog, setShowAddToButtonDialog] = useState(false);
  const [selectedActionNodeId, setSelectedActionNodeId] = useState<string | null>(null);

  /**
   * Convert node kind + content to proper node data structure.
   * This is a "define errors out of existence" pattern - the function always returns valid node data.
   */
  const createNodeData = useCallback((kind: NodeKind, content: string, defaultTarget: string) => {
    switch (kind) {
      case "value": return { kind: "value" as const, value: content };
      case "element": return { kind: "element" as const, tag: content, attrs: {}, children: [] };
      case "formula": return { kind: "formula" as const, operation: content };
      case "ref": return { kind: "ref" as const, target: content };
      case "action": return { kind: "action" as const, label: content, actions: [], target: defaultTarget };
    }
  }, []);

  // Find all action nodes in document
  const actionNodes = useMemo(() => {
    const nodes: { id: string; label: string; target: string }[] = [];
    const traverse = (id: string) => {
      const node = document.getNode(id);
      if (!node) return;
      if (node.kind === "action") {
        nodes.push({ id, label: node.label, target: node.target });
      }
      if (node.kind === "element") {
        const childIds = document.getChildIds(id);
        for (const childId of childIds) {
          traverse(childId);
        }
      }
    };
    const rootId = document.getRootId();
    if (rootId) traverse(rootId);
    return nodes;
  }, [document]);

  // Toast for share notification
  const toasterId = useId("share-toaster");
  const { dispatchToast } = useToastController(toasterId);

  // Update URL hash when room ID changes
  useEffect(() => {
    if (roomId && window.location.hash.slice(1) !== roomId) {
      window.history.replaceState(null, "", `#${roomId}`);
    }
  }, [roomId]);

  // Auto-connect on mount
  useEffect(() => {
    connect("ws://localhost:3001", roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle share button click
  const handleShare = useCallback(() => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      dispatchToast(
        <Toast>Link copied to clipboard!</Toast>,
        { intent: "success" }
      );
    }).catch(() => {
      dispatchToast(
        <Toast>Failed to copy link</Toast>,
        { intent: "error" }
      );
    });
  }, [roomId, dispatchToast]);

  // Handle sync toggle
  const handleSyncToggle = useCallback(() => {
    if (status === "connected" || status === "connecting") {
      disconnect();
    } else {
      connect("ws://localhost:3001", roomId);
    }
  }, [status, connect, disconnect, roomId]);

  // Frontend-only generalization for Shift+click multi-select
  const handleGeneralize = useCallback((ids: string[]) => {
    return generalizeSelection(document, ids);
  }, [document]);

  // Analyze recording history for created node dependencies
  const scriptAnalysis: ScriptAnalysis | null = useMemo(() => {
    if (!recordingHistory || recordingHistory.length === 0) return null;
    return analyzeScript(recordingHistory);
  }, [recordingHistory]);

  const handleReplay = () => {
    if (!recordingHistory || !selectedNodeId) return;

    // Get indices to replay (all or selected)
    const indicesToReplay = selectedActionIndices.size > 0
      ? Array.from(selectedActionIndices).sort((a, b) => a - b)
      : recordingHistory.map((_, i) => i);

    if (indicesToReplay.length === 0) return;

    // Get the actions to replay
    const actionsToReplay = indicesToReplay
      .map(i => recordingHistory[i])
      .filter((action): action is NonNullable<typeof action> => action !== null);

    if (actionsToReplay.length === 0) return;

    // Analyze and generalize the script (replace created node IDs with variables)
    // This allows replay() to map $1, $2, etc. to newly created nodes
    const analysis = analyzeScript(actionsToReplay);
    const generalizedActions = generalizeScript(actionsToReplay, analysis);

    // Apply target overrides (manual retargeting by user)
    const finalActions = generalizedActions.map((action, newIdx) => {
      const origIdx = indicesToReplay[newIdx]!;
      const targetOverride = targetOverrides.get(origIdx);
      const sourceOverride = sourceOverrides.get(origIdx);

      let result = action;

      // Apply target override to path
      if (targetOverride) {
        const newPath = action.path.map(segment => {
          const str = String(segment);
          // Replace node ID (peer@counter format) - but not variables
          if (/^\d+@\d+$/.test(str)) {
            return targetOverride;
          }
          return segment;
        });
        result = { ...result, path: newPath };
      }

      // Apply source override for copy actions
      if (sourceOverride && action.action === "copy" && action.value && typeof action.value === 'object' && 'sourceId' in action.value) {
        result = {
          ...result,
          value: { ...action.value, sourceId: sourceOverride }
        };
      }

      return result;
    });

    replay(finalActions, selectedNodeId);
  };

  const handleActionSelectionChange = useCallback((indices: Set<number>) => {
    setSelectedActionIndices(indices);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setSelectedActionIndices(new Set());
    setTargetOverrides(new Map());
    setSourceOverrides(new Map());
  }, [clearHistory]);

  const handleRetarget = useCallback((index: number, newNodeId: string) => {
    setTargetOverrides(prev => {
      const newMap = new Map(prev);
      newMap.set(index, newNodeId);
      return newMap;
    });
  }, []);

  const handleRetargetSource = useCallback((index: number, newSourceId: string) => {
    setSourceOverrides(prev => {
      const newMap = new Map(prev);
      newMap.set(index, newSourceId);
      return newMap;
    });
  }, []);

  // Add selected actions to an existing action node
  const handleAddToButton = useCallback(() => {
    if (!recordingHistory || selectedActionIndices.size === 0 || !selectedActionNodeId) return;

    // Get indices to use (selected actions)
    const indicesToUse = Array.from(selectedActionIndices).sort((a, b) => a - b);
    const actionsToUse = indicesToUse
      .map(i => recordingHistory[i])
      .filter((action): action is NonNullable<typeof action> => action !== null);

    if (actionsToUse.length === 0) return;

    // Analyze and generalize the script
    const analysis = analyzeScript(actionsToUse);
    const generalizedActions = generalizeScript(actionsToUse, analysis);

    // Apply target/source overrides
    const finalActions = generalizedActions.map((action, newIdx) => {
      const origIdx = indicesToUse[newIdx]!;
      const targetOverride = targetOverrides.get(origIdx);
      const sourceOverride = sourceOverrides.get(origIdx);

      let result = action;

      if (targetOverride) {
        const newPath = action.path.map(segment => {
          const str = String(segment);
          if (/^\d+@\d+$/.test(str)) {
            return targetOverride;
          }
          return segment;
        });
        result = { ...result, path: newPath };
      }

      if (sourceOverride && action.action === "copy" && action.value && typeof action.value === 'object' && 'sourceId' in action.value) {
        result = {
          ...result,
          value: { ...action.value, sourceId: sourceOverride }
        };
      }

      return result;
    });

    // Append actions to the existing action node
    document.change((model) => {
      model.appendActions(selectedActionNodeId, finalActions);
    });

    setShowAddToButtonDialog(false);
    setSelectedActionNodeId(null);
  }, [recordingHistory, selectedActionIndices, targetOverrides, sourceOverrides, document, selectedActionNodeId]);

  // Handler for action button clicks
  const handleActionClick = useCallback((actions: GeneralizedPatch[], target: string) => {
    replay(actions, target);
  }, [replay]);

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

  const handleAttributeChange = (key: string, value: unknown | undefined) => {
    if (selectedNodeIds.length === 0) return;
    updateAttribute(selectedNodeIds, key, value);
  };

  // Clipboard: copy creates a "copy" action referencing the source node
  const { canPaste, isInputSelected, isValueSelected, handleCopy, handlePaste } = useClipboard({
    selectedNodeId: selectedNodeId ?? null,
    node,
    document,
  });

  // Get first child's tag for the selected element node
  const selectedNodeFirstChildTag = (() => {
    if (!node || node.kind !== "element" || !selectedNodeId) return undefined;
    const childIds = document.getChildIds(selectedNodeId);
    if (childIds.length === 0) return undefined;
    const firstChild = document.getNode(childIds[0]!);
    return firstChild?.kind === "element" ? firstChild.tag : undefined;
  })();
  const selectedNodeAttributes = (node && node.kind === "element") ? node.attrs : undefined;

  // Collect known peer IDs from recording history and remote selections
  const knownPeerIds = useMemo(() => {
    const peerIds = new Set<string>();

    // Extract peer IDs from recording history
    if (recordingHistory) {
      for (const action of recordingHistory) {
        for (const segment of action.path) {
          const str = String(segment);
          const match = str.match(/^\d+@(\d+)$/);
          if (match?.[1]) {
            peerIds.add(match[1]);
          }
        }
        // Also check values for node IDs
        const value = (action as { value?: unknown }).value;
        if (typeof value === 'object' && value !== null) {
          const checkValue = (v: unknown): void => {
            if (typeof v === 'string') {
              const match = v.match(/^\d+@(\d+)$/);
              if (match?.[1]) peerIds.add(match[1]);
            } else if (Array.isArray(v)) {
              v.forEach(checkValue);
            } else if (typeof v === 'object' && v !== null) {
              Object.values(v).forEach(checkValue);
            }
          };
          checkValue(value);
        }
      }
    }

    // Add remote selection peer IDs
    if (remoteSelections) {
      for (const peerId of Object.keys(remoteSelections)) {
        peerIds.add(peerId);
      }
    }

    return Array.from(peerIds);
  }, [recordingHistory, remoteSelections]);

  return (
    <PeerAliasProvider selfPeerId={userId ?? null} knownPeerIds={knownPeerIds}>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Toaster toasterId={toasterId} position="bottom-end" />
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <Card appearance="subtle" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Toolbar style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "space-between" }}>
              <ToolbarGroup>
                <Tooltip content="Undo" relationship="label">
                  <ToolbarButton
                    icon={<ArrowUndoRegular />}
                    onClick={() => {
                      undo();
                      if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                    }}
                    disabled={!canUndo}
                  />
                </Tooltip>
                <Tooltip content="Redo" relationship="label">
                  <ToolbarButton
                    icon={<ArrowRedoRegular />}
                    onClick={() => {
                      redo();
                      if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                    }}
                    disabled={!canRedo}
                  />
                </Tooltip>
                <ToolbarDivider />
                <AddNodePopoverButton
                  disabled={node?.kind !== "element" && node?.kind !== "formula"}
                  initialValue={selectedNodeFirstChildTag || ""}
                  onAddChild={(content, kind) => {
                    if (!selectedNodeId) return;
                    document.change((model) => {
                      const newId = model.addChild(selectedNodeId, createNodeData(kind, content, selectedNodeId));
                      if (newId) setSelectedNodeIds([newId]);
                    });
                  }}
                  onAddBefore={(content, kind) => {
                    if (!selectedNodeId) return;
                    document.change((model) => {
                      const newId = model.addSibling(selectedNodeId, "before", createNodeData(kind, content, selectedNodeId));
                      if (newId) setSelectedNodeIds([newId]);
                    });
                  }}
                  onAddAfter={(content, kind) => {
                    if (!selectedNodeId) return;
                    document.change((model) => {
                      const newId = model.addSibling(selectedNodeId, "after", createNodeData(kind, content, selectedNodeId));
                      if (newId) setSelectedNodeIds([newId]);
                    });
                  }}
                  onStartRefPick={(position) => {
                    if (selectedNodeId) {
                      setRefPickMode({ parentId: selectedNodeId, position });
                    }
                  }}
                />

                {node?.kind === "value" ? (
                  <ToolbarPopoverButton
                    text="Edit"
                    icon={<EditRegular />}
                    disabled={false}
                    ariaLabel="Edit"
                    placeholder="Value content"
                    initialValue={String(details?.value ?? "")}
                    onSubmit={(value) => {
                      const originalValue = String(details?.value ?? "");
                      updateValue(selectedNodeIds, value, originalValue);
                    }}
                  />
                ) : (
                  <ToolbarPopoverButton
                    text="Rename"
                    icon={<RenameRegular />}
                    disabled={!selectedNodeId || node?.kind !== "element"}
                    ariaLabel="Rename"
                    placeholder="Tag name (e.g. div)"
                    initialValue={details?.tag || details?.dom?.tagName || ""}
                    validate={validateTagName}
                    onSubmit={(value) => {
                      const { tag } = sanitizeTagName(value);
                      if (tag) {
                        updateTag(selectedNodeIds, tag);
                        if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                      }
                    }}
                  />
                )}
                <ToolbarPopoverButton
                  text="Wrap"
                  icon={<BackpackRegular />}
                  disabled={!selectedNodeId}
                  ariaLabel="Wrap"
                  placeholder="Tag name (e.g. div)"
                  validate={validateTagName}
                  onSubmit={(value) => {
                    const { tag } = sanitizeTagName(value);
                    if (tag) {
                      wrapNodes(selectedNodeIds, tag);
                      if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                    }
                  }}
                />

                <FormulaToolbar document={document} selectedNodeId={selectedNodeId} node={node} />

                <Tooltip content="Copy (Ctrl+C)" relationship="label">
                  <ToolbarButton
                    icon={<CopyRegular />}
                    disabled={!isInputSelected && !isValueSelected}
                    onClick={handleCopy}
                  />
                </Tooltip>

                <Tooltip content="Paste (Ctrl+V)" relationship="label">
                  <ToolbarButton
                    icon={<ClipboardPasteRegular />}
                    onClick={handlePaste}
                    disabled={!canPaste}
                  />
                </Tooltip>

                <ToolbarDivider />

                <Tooltip content={isFormulaMode ? "Showing formula structure" : "Showing formula results"} relationship="label">
                  <ToolbarButton
                    icon={<CalculatorRegular />}
                    onClick={toggleFormulaViewMode}
                    appearance={isFormulaMode ? "primary" : "subtle"}
                  >
                    {isFormulaMode ? "Formulas" : "Results"}
                  </ToolbarButton>
                </Tooltip>
              </ToolbarGroup>

              <ToolbarGroup>
                <Text>{userId}</Text>
                <SyncStatusIndicator status={status} latency={latency} error={error} />
                <Switch
                  checked={status === "connected" || status === "connecting"}
                  onChange={handleSyncToggle}
                  label={connected ? "Sync on" : "Sync off"}
                  disabled={status === "connecting"}
                />
                <Tooltip content="Copy shareable link" relationship="label">
                  <ToolbarButton
                    icon={<LinkRegular />}
                    onClick={handleShare}
                  >
                    Share
                  </ToolbarButton>
                </Tooltip>
                <Dialog>
                  <DialogTrigger>
                    <ToolbarButton icon={<CodeRegular />}>Raw</ToolbarButton>
                  </DialogTrigger>
                  <DialogSurface style={{ width: 1000 }}>
                    <DialogBody>
                      <DialogContent>
                        <JsonView data={document} />
                      </DialogContent>
                    </DialogBody>
                  </DialogSurface>
                </Dialog>
                <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(document.getSnapshot())}>Snapshot</ToolbarButton>
                <ToolbarDivider />
                {showDetails ? (
                  <ToolbarButton icon={<InfoRegular />} onClick={() => setShowDetails(!showDetails)} appearance="primary">Details</ToolbarButton>
                ) : (
                  <ToolbarButton icon={<InfoRegular />} onClick={() => setShowDetails(!showDetails)}>Details</ToolbarButton>
                )}
                {showHistory ? (
                  <ToolbarButton icon={<RecordRegular />} onClick={() => setShowHistory(!showHistory)} appearance="primary">Actions</ToolbarButton>
                ) : (
                  <ToolbarButton icon={<RecordRegular />} onClick={() => setShowHistory(!showHistory)}>Actions</ToolbarButton>
                )}
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

            <div style={{ flex: 1, overflow: "auto", minHeight: 0, position: "relative" }}>
              {refPickMode && (
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  padding: "8px 12px",
                  background: "#fff3cd",
                  borderBottom: "1px solid #ffc107",
                  zIndex: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <Text>Click on a node to create a reference to it</Text>
                  <Button size="small" onClick={() => setRefPickMode(null)}>Cancel</Button>
                </div>
              )}
              <DomNavigator ref={navigatorRef} onSelectedChange={(ids) => {
                const targetId = ids[0];
                if (refPickMode && targetId) {
                  const { parentId, position } = refPickMode;
                  document.change((model) => {
                    if (position === "child") {
                      model.addChild(parentId, { kind: "ref", target: targetId });
                    } else {
                      model.addSibling(parentId, position, { kind: "ref", target: targetId });
                    }
                  });
                  setRefPickMode(null);
                  return;
                }
                setSelectedNodeIds(ids);
              }} selectedNodeIds={selectedNodeIds} remoteSelections={remoteSelections} generalizer={handleGeneralize}>
                <ErrorBoundary>
                  <RenderedDocument document={document} onActionClick={handleActionClick} viewMode={formulaViewMode} onRefClick={(targetId) => setSelectedNodeIds([targetId])} />
                </ErrorBoundary>
              </DomNavigator>
            </div>

            {showDetails && (
              <ElementDetails
                details={details}
                attributes={selectedNodeAttributes}
                onAttributeChange={handleAttributeChange}
                onIdClick={(id) => setSelectedNodeIds([id])}
              />
            )}

            {snapshot && (
              <Card>
                <CardHeader header={<Text>Patches from Snapshot</Text>} action={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Switch label="Filter by selection" checked={filterPatches} onChange={(_, data) => setFilterPatches(data.checked)} />
                  <ToolbarButton icon={<CodeRegular />} onClick={() => setPatchesViewMode(patchesViewMode === 'table' ? 'json' : 'table')}>
                    {patchesViewMode === 'table' ? 'JSON' : 'Table'}
                  </ToolbarButton>
                  <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(null)}>Clear</ToolbarButton>
                </div>} />
              </Card>
            )}
          </Card>
        </div>
        <ResizablePanel open={showHistory} defaultWidth={700} minWidth={200} maxWidth={1200}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Show action node details when one is selected */}
            {node?.kind === "action" && (
              <div style={{ borderBottom: '2px solid #0078d4', background: '#f0f6ff' }}>
                <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Text weight="semibold" style={{ color: '#0078d4' }}>Button: {node.label}</Text>
                    <Text size={200} style={{ display: 'block', marginTop: 4 }}>Target: {node.target}</Text>
                  </div>
                  <Badge appearance="filled" color="brand">{node.actions.length} action{node.actions.length !== 1 ? 's' : ''}</Badge>
                </div>
                {node.actions.length > 0 && (
                  <div style={{ maxHeight: 200, overflow: 'auto', padding: '0 8px 8px' }}>
                    <RecordedScriptView
                      script={node.actions}
                      onNodeClick={(id) => setSelectedNodeIds([id])}
                      selectedIndices={new Set()}
                      onSelectionChange={() => { }}
                      targetOverrides={new Map()}
                      sourceOverrides={new Map()}
                      onRetarget={() => { }}
                      onRetargetSource={() => { }}
                      currentNodeId={selectedNodeId ?? null}
                      analysis={null}
                      mode="view"
                      onDeleteAction={(index) => {
                        if (selectedNodeId) {
                          document.change((model) => {
                            model.deleteAction(selectedNodeId, index);
                          });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <Text weight="semibold">Recorded History</Text>
              <ToolbarButton
                appearance="subtle"
                icon={<StopRegular />}
                onClick={handleClearHistory}
                aria-label="Clear Actions"
              />
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px', minHeight: 0 }}>
              <RecordedScriptView
                script={recordingHistory || []}
                onNodeClick={(id) => setSelectedNodeIds([id])}
                selectedIndices={selectedActionIndices}
                onSelectionChange={handleActionSelectionChange}
                targetOverrides={targetOverrides}
                sourceOverrides={sourceOverrides}
                onRetarget={handleRetarget}
                onRetargetSource={handleRetargetSource}
                currentNodeId={selectedNodeId ?? null}
                analysis={scriptAnalysis}
              />
            </div>
            <div style={{ padding: '12px', borderTop: '1px solid #e0e0e0', display: 'flex', gap: '8px' }}>
              <Tooltip content="Apply selected actions to the currently selected node" relationship="label">
                <Button
                  icon={<PlayRegular />}
                  onClick={handleReplay}
                  disabled={!recordingHistory?.length || !selectedNodeId}
                  appearance="primary"
                  style={{ flex: 1 }}
                >
                  {selectedActionIndices.size > 0 ? `Apply (${selectedActionIndices.size})` : "Apply all"}
                </Button>
              </Tooltip>
              <Tooltip content="Add selected actions to an existing action button" relationship="label">
                <Button
                  icon={<AddRegular />}
                  onClick={() => setShowAddToButtonDialog(true)}
                  disabled={!recordingHistory?.length || selectedActionIndices.size === 0 || actionNodes.length === 0}
                  appearance="secondary"
                >
                  Add to Button
                </Button>
              </Tooltip>
            </div>

            {/* Add to Button Dialog */}
            <Dialog open={showAddToButtonDialog} onOpenChange={(_, data) => {
              setShowAddToButtonDialog(data.open);
              if (!data.open) setSelectedActionNodeId(null);
            }}>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>Add Actions to Button</DialogTitle>
                  <DialogContent>
                    <Text size={200} style={{ marginBottom: 12, display: 'block' }}>
                      Select a button to add {selectedActionIndices.size} action{selectedActionIndices.size !== 1 ? 's' : ''} to:
                    </Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {actionNodes.map(({ id, label, target }) => (
                        <Button
                          key={id}
                          appearance={selectedActionNodeId === id ? 'primary' : 'secondary'}
                          onClick={() => setSelectedActionNodeId(id)}
                          style={{ justifyContent: 'flex-start' }}
                        >
                          <span style={{ fontWeight: 'bold' }}>{label}</span>
                          <span style={{ marginLeft: 8, opacity: 0.7, fontSize: '0.9em' }}>→ {target}</span>
                        </Button>
                      ))}
                      {actionNodes.length === 0 && (
                        <Text size={200} style={{ color: '#666' }}>
                          No action buttons found. Create one first using the toolbar.
                        </Text>
                      )}
                    </div>
                  </DialogContent>
                  <DialogActions>
                    <DialogTrigger disableButtonEnhancement>
                      <Button appearance="secondary">Cancel</Button>
                    </DialogTrigger>
                    <Button
                      appearance="primary"
                      onClick={handleAddToButton}
                      disabled={!selectedActionNodeId}
                    >
                      Add
                    </Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          </div>
        </ResizablePanel>
      </div>
    </PeerAliasProvider>
  );
}

/** Sync status indicator component */
function SyncStatusIndicator({
  status,
  latency,
  error,
}: {
  status: "connecting" | "connected" | "disconnected" | "idle";
  latency?: number;
  error?: string | null;
}) {
  if (status === "connecting") {
    return (
      <Tooltip content="Attempting to connect..." relationship="label">
        <Badge appearance="outline" color="warning" size="medium" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Spinner size="extra-tiny" />
          Connecting
        </Badge>
      </Tooltip>
    );
  }

  if (status === "connected") {
    return (
      <Tooltip
        content={latency ? `Round-trip latency: ${latency}ms` : "Connected to sync server"}
        relationship="label"
      >
        <Badge appearance="filled" color="success" size="medium">
          {latency ? `Synced (${latency}ms)` : "Synced"}
        </Badge>
      </Tooltip>
    );
  }

  if (status === "disconnected") {
    return (
      <Tooltip content={error || "Connection lost, will auto-retry"} relationship="label">
        <Badge appearance="filled" color="danger" size="medium">
          Disconnected
        </Badge>
      </Tooltip>
    );
  }

  // idle
  return (
    <Badge appearance="outline" color="informative" size="medium">
      Offline
    </Badge>
  );
}

function clickOnSelectedNode(selectedNodeGuid: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, 0);
}


