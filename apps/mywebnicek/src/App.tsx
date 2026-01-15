import { Card, CardHeader, Dialog, DialogBody, DialogContent, DialogSurface, DialogTrigger, Switch, Tag, TagGroup, Text, Toolbar, ToolbarButton, ToolbarDivider, ToolbarGroup, Tooltip } from "@fluentui/react-components";
import { ArrowDownRegular, ArrowLeftRegular, ArrowRedoRegular, ArrowRightRegular, ArrowUndoRegular, ArrowUpRegular, BackpackFilled, BackpackRegular, CameraRegular, ClipboardPasteRegular, CodeRegular, CopyRegular, EditFilled, EditRegular, PlayRegular, RecordRegular, RenameFilled, RenameRegular, StopRegular } from "@fluentui/react-icons";
import type { DocumentSnapshot } from "@mydenicek/react-v2";
import {
  useConnectivity,
  useDocumentActions,
  useDocumentState,
  useRecording,
  useSelectedNode,
  useSelection
} from "@mydenicek/react-v2";
import { useRef, useState } from "react";

import { AddNodePopoverButton } from "./AddNodePopoverButton";
import { useClipboard } from "./hooks/useClipboard";
import { DomNavigator, type DomNavigatorHandle } from "./DomNavigator";
import { ElementDetails } from "./ElementDetails.tsx";
import { JsonView } from "./JsonView.tsx";
import { RecordedScriptView } from "./RecordedScriptView";
import { RenderedDocument } from "./RenderedDocument.tsx";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";
import { ResizablePanel } from "./components/ResizablePanel";

export const App = () => {
  const { store, model, snapshot: liveSnapshot } = useDocumentState();
  const {
    undo, redo, canUndo, canRedo,
    updateAttribute, updateTag, wrapNodes,
    updateValue, addChildren, addSiblings,
    deleteNodes
  } = useDocumentActions();
  const recordingObj = useRecording();
  const { history: recordingHistory, clearHistory, replay } = recordingObj;
  const [showHistory, setShowHistory] = useState(true);

  const { connect, disconnect } = useConnectivity();
  const { setSelectedNodeIds, remoteSelections, userId } = useSelection();
  const { selectedNodeId, selectedNodeIds, node, details } = useSelectedNode();

  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [filterPatches, setFilterPatches] = useState(false);
  const [patchesViewMode, setPatchesViewMode] = useState<'table' | 'json'>('table');

  const [connected, setConnected] = useState(true);
  const [isGeneralizedSelection, setIsGeneralizedSelection] = useState(false);
  const navigatorRef = useRef<DomNavigatorHandle>(null);



  const handleReplay = () => {
    if (!recordingHistory || !selectedNodeId) return;
    replay(recordingHistory, selectedNodeId);
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

  const handleAttributeChange = (key: string, value: unknown | undefined) => {
    if (selectedNodeIds.length === 0) return;
    updateAttribute(selectedNodeIds, key, value);
  };

  // Clipboard operations for copy/paste between input and value nodes
  const { clipboardValue, isInputSelected, isValueSelected, handleCopyFromInput, handlePasteToValue } = useClipboard({
    selectedNodeId,
    node,
    model,
    updateValue,
  });

  if (!model) return <div>Loading...</div>;

  const selectedNodeFirstChildTag = (node && node.kind === "element") ? model.getFirstChildTag(node) : undefined;
  const selectedNodeAttributes = (node && node.kind === "element") ? node.attrs : undefined;


  return (
    <div style={{ display: "flex" }}>
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
                isGeneralizedSelection ? (
                  <ToolbarPopoverButton
                    text="Edit all"
                    icon={<EditFilled />}
                    disabled={false}
                    ariaLabel="Edit all matching"
                    placeholder="Value content"
                    initialValue={details?.value || ""}
                    onSubmit={(value) => {
                      const originalValue = details?.value || "";
                      updateValue(selectedNodeIds, value, originalValue);
                    }}
                  />
                ) : (
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
                )
              ) : (
                !isGeneralizedSelection && (
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
                )
              )}
              {!isGeneralizedSelection && (
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
              )}

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

              {isGeneralizedSelection && node?.kind === "element" && (
                <ToolbarPopoverButton
                  text="Rename all"
                  icon={<RenameFilled />}
                  disabled={!selectedNodeId}
                  initialValue={(node?.kind === "element") ? node.tag : ""}
                  ariaLabel="Rename all matching"
                  onSubmit={(tag) => {
                    updateTag(selectedNodeIds, tag);
                  }}
                />
              )}

              {isGeneralizedSelection && (
                <ToolbarPopoverButton
                  text="Wrap all"
                  icon={<BackpackFilled />}
                  disabled={!selectedNodeId}
                  ariaLabel="Wrap all matching"
                  onSubmit={(tag) => {
                    wrapNodes(selectedNodeIds, tag);
                  }}
                />
              )}
            </ToolbarGroup>

            <ToolbarGroup>
              <Text>{userId}</Text>
              <Switch
                checked={connected}
                onChange={() => {
                  if (connected) {
                    setConnected(false);
                    disconnect();
                  } else {
                    setConnected(true);
                    connect("ws://localhost:3001");
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
                      <JsonView data={model.getSnapshot()} />
                    </DialogContent>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
              <ToolbarButton icon={<CameraRegular />} onClick={() => setSnapshot(model.getSnapshot())}>Snapshot</ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton icon={<RecordRegular />} onClick={() => setShowHistory(!showHistory)} appearance={showHistory ? "primary" : undefined}>History</ToolbarButton>
              <ToolbarButton icon={<PlayRegular />} onClick={handleReplay} disabled={!recordingHistory?.length || !selectedNodeId}>Replay</ToolbarButton>
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

          <DomNavigator ref={navigatorRef} onSelectedChange={(ids, isGeneralized) => { setSelectedNodeIds(ids); setIsGeneralizedSelection(isGeneralized); }} selectedNodeIds={selectedNodeIds} remoteSelections={remoteSelections} generalizer={(ids) => model.generalizeSelection(ids)}>
            <RenderedDocument model={model} version={liveSnapshot} />
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
        <div style={{ padding: '12px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="semibold">History</Text>
          <ToolbarButton
            appearance="subtle"
            icon={<StopRegular />}
            onClick={clearHistory}
            aria-label="Clear History"
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          <RecordedScriptView script={recordingHistory || []} onNodeClick={(id) => setSelectedNodeIds([id])} />
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


