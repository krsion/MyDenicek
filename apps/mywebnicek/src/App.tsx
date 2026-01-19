import { Button, Card, CardHeader, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, Switch, Tag, TagGroup, Text, Toast, Toaster, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip, useId, useToastController } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackRegular, CameraRegular, ClipboardPasteRegular, CodeRegular, CopyRegular, EditRegular, LinkRegular, PlayRegular, RecordRegular, RenameRegular, StopRegular } from "@fluentui/react-icons";
import type { Snapshot } from "@mydenicek/react-v2";
import {
  useConnectivity,
  useDocumentActions,
  useDocumentState,
  useRecording,
  useSelectedNode,
  useSelection
} from "@mydenicek/react-v2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { ResizablePanel } from "./components/ResizablePanel";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { useClipboard } from "./hooks/useClipboard";
import { JsonView } from "./JsonView.tsx";
import { RecordedScriptView } from "./RecordedScriptView";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";
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
    updateValue, addChildren, addSiblings,
    deleteNodes: _deleteNodes
  } = useDocumentActions();
  const recordingObj = useRecording();
  const { history: recordingHistory, clearHistory, replay } = recordingObj;
  const [showHistory, setShowHistory] = useState(true);

  const { connect, disconnect, roomId: _connectedRoomId } = useConnectivity();
  const { setSelectedNodeIds, remoteSelections, userId } = useSelection();
  const { selectedNodeId, selectedNodeIds, node, details } = useSelectedNode();

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);
  const [patchesViewMode, setPatchesViewMode] = useState<'table' | 'json'>('table');

  const [connected, setConnected] = useState(true);
  const [roomId] = useState<string>(() => getRoomIdFromHash());
  const navigatorRef = useRef<DomNavigatorHandle>(null);
  const [selectedActionIndices, setSelectedActionIndices] = useState<Set<number>>(new Set());
  const [targetOverrides, setTargetOverrides] = useState<Map<number, string>>(new Map());

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
    if (connected) {
      setConnected(false);
      disconnect();
    } else {
      setConnected(true);
      connect("ws://localhost:3001", roomId);
    }
  }, [connected, connect, disconnect, roomId]);

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
      const override = targetOverrides.get(origIdx);
      if (!override) return action;

      // Clone and modify the path to use the overridden node ID
      const newPath = action.path.map(segment => {
        const str = String(segment);
        // Replace node ID (peer@counter format) - but not variables
        if (/^\d+@\d+$/.test(str)) {
          return override;
        }
        return segment;
      });

      return { ...action, path: newPath };
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
  }, [clearHistory]);

  const handleRetarget = useCallback((index: number, newNodeId: string) => {
    setTargetOverrides(prev => {
      const newMap = new Map(prev);
      newMap.set(index, newNodeId);
      return newMap;
    });
  }, []);

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

  // Clipboard operations for copy/paste between input and value nodes
  const { clipboardValue, isInputSelected, isValueSelected, handleCopyFromInput, handlePasteToValue } = useClipboard({
    selectedNodeId: selectedNodeId ?? null,
    node,
    document,
    updateValue,
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


  return (
    <div style={{ display: "flex" }}>
      <Toaster toasterId={toasterId} position="bottom-end" />
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <Card appearance="subtle" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
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
                disabled={node?.kind !== "element"}
                initialValue={selectedNodeFirstChildTag || ""}
                onAddChild={(content, isValue) => {
                  if (selectedNodeIds.length === 0) return;
                  const newIds = addChildren(selectedNodeIds, isValue ? "value" : "element", content);
                  if (newIds.length > 0) setSelectedNodeIds(newIds);
                }}
                onAddBefore={(content, _isValue) => {
                  if (selectedNodeIds.length === 0) return;
                  const newIds = addSiblings(selectedNodeIds, "before");
                  // If content was provided, update it immediately
                  if (newIds.length > 0) {
                    updateValue(newIds, content, "");
                    setSelectedNodeIds(newIds);
                  }
                }}
                onAddAfter={(content, _isValue) => {
                  if (selectedNodeIds.length === 0) return;
                  const newIds = addSiblings(selectedNodeIds, "after");
                  // If content was provided, update it immediately
                  if (newIds.length > 0) {
                    updateValue(newIds, content, "");
                    setSelectedNodeIds(newIds);
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
                  initialValue={details?.value || ""}
                  onSubmit={(value) => {
                    const originalValue = details?.value || "";
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
                  onSubmit={(tag) => {
                    updateTag(selectedNodeIds, tag);
                    if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                  }}
                />
              )}
              <ToolbarPopoverButton
                text="Wrap"
                icon={<BackpackRegular />}
                disabled={!selectedNodeId}
                ariaLabel="Wrap"
                onSubmit={(tag) => {
                  wrapNodes(selectedNodeIds, tag);
                  if (selectedNodeId) clickOnSelectedNode(selectedNodeId);
                }}
              />

              <Tooltip content="Copy input value (Ctrl+C)" relationship="label">
                <ToolbarButton
                  icon={<CopyRegular />}
                  disabled={!isInputSelected}
                  onClick={handleCopyFromInput}
                />
              </Tooltip>


              <Tooltip content={`Paste value (Ctrl+V)`} relationship="label">
                <ToolbarButton
                  icon={<ClipboardPasteRegular />}
                  onClick={handlePasteToValue}
                  disabled={!isValueSelected || clipboardValue === null}
                />
              </Tooltip>
            </ToolbarGroup>

            <ToolbarGroup>
              <Text>{userId}</Text>
              <Switch
                checked={connected}
                onChange={handleSyncToggle}
                label={connected ? "Sync on" : "Sync off"}
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

          <DomNavigator ref={navigatorRef} onSelectedChange={(ids) => { setSelectedNodeIds(ids); }} selectedNodeIds={selectedNodeIds} remoteSelections={remoteSelections} generalizer={handleGeneralize}>
            <RenderedDocument document={document} />
          </DomNavigator>

          <ElementDetails
            details={details}
            attributes={selectedNodeAttributes}
            onAttributeChange={handleAttributeChange}
            onIdClick={(id) => setSelectedNodeIds([id])}
          />



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
      <ResizablePanel open={showHistory} defaultWidth={350} minWidth={200} maxWidth={700}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text weight="semibold">Actions</Text>
            <ToolbarButton
              appearance="subtle"
              icon={<StopRegular />}
              onClick={handleClearHistory}
              aria-label="Clear Actions"
            />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            <RecordedScriptView
              script={recordingHistory || []}
              onNodeClick={(id) => setSelectedNodeIds([id])}
              selectedIndices={selectedActionIndices}
              onSelectionChange={handleActionSelectionChange}
              targetOverrides={targetOverrides}
              onRetarget={handleRetarget}
              currentNodeId={selectedNodeId ?? null}
              analysis={scriptAnalysis}
            />
          </div>
          <div style={{ padding: '12px', borderTop: '1px solid #e0e0e0' }}>
            <Tooltip content="Apply selected actions to the currently selected node" relationship="label">
              <Button
                icon={<PlayRegular />}
                onClick={handleReplay}
                disabled={!recordingHistory?.length || !selectedNodeId}
                appearance="primary"
                style={{ width: '100%' }}
              >
                {selectedActionIndices.size > 0 ? `Apply (${selectedActionIndices.size})` : "Apply all"}
              </Button>
            </Tooltip>
          </div>
        </div>
      </ResizablePanel>
    </div>
  );
}

function clickOnSelectedNode(selectedNodeGuid: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-node-guid='${selectedNodeGuid}']`) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, 0);
}


