import { Badge, Button, Card, CardHeader, Checkbox, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip } from "@fluentui/react-components";
import { DeleteRegular, TargetRegular } from "@fluentui/react-icons";
import { type GeneralizedPatch } from "@mydenicek/core";

import { NodeId } from "./components/NodeId";
import { usePeerAlias } from "./context/PeerAliasContext";
import { getCreationInfo, type ScriptAnalysis } from "./utils/scriptAnalysis";

// Check if a path segment looks like a Loro OpId (peer@counter format)
function isNodeId(segment: string): boolean {
    return /^\d+@\d+$/.test(segment);
}

// Check if a path segment is a variable placeholder ($0, $1, etc.)
function isVariablePlaceholder(segment: string): boolean {
    return /^\$\d+$/.test(segment);
}

// Extract the node ID from a path (e.g., ["nodes", "321@18100", "tag"] -> "321@18100")
// Also recognizes variable placeholders like $0, $1
function extractNodeId(path: (string | number)[]): string | null {
    for (const segment of path) {
        const str = String(segment);
        if (isNodeId(str) || isVariablePlaceholder(str)) {
            return str;
        }
    }
    return null;
}

interface RecordedScriptViewProps {
    script: GeneralizedPatch[];
    onNodeClick?: (id: string) => void;
    selectedIndices?: Set<number>;
    onSelectionChange?: (indices: Set<number>) => void;
    targetOverrides?: Map<number, string>;
    sourceOverrides?: Map<number, string>;
    onRetarget?: (index: number, newNodeId: string) => void;
    onRetargetSource?: (index: number, newSourceId: string) => void;
    currentNodeId?: string | null;
    analysis?: ScriptAnalysis | null;
    /** Mode: "history" shows selection checkboxes, "view" shows delete buttons */
    mode?: "history" | "view";
    /** Callback when delete button is clicked in view mode */
    onDeleteAction?: (index: number) => void;
    /** The target node ID for $0 placeholder (used when viewing button actions) */
    actionTarget?: string;
}

export function RecordedScriptView({ script, onNodeClick, selectedIndices, onSelectionChange, targetOverrides, sourceOverrides, onRetarget, onRetargetSource, currentNodeId, analysis, mode = "history", onDeleteAction, actionTarget }: RecordedScriptViewProps) {
    const { formatValue } = usePeerAlias();
    const hasSelection = selectedIndices !== undefined && onSelectionChange !== undefined;
    const allSelected = hasSelection && script.length > 0 && selectedIndices.size === script.length;
    const someSelected = hasSelection && selectedIndices.size > 0 && selectedIndices.size < script.length;

    const handleToggle = (index: number) => {
        if (!onSelectionChange || !selectedIndices) return;
        const newSet = new Set(selectedIndices);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        onSelectionChange(newSet);
    };

    const handleSelectAll = () => {
        if (!onSelectionChange) return;
        if (allSelected) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(script.map((_, i) => i)));
        }
    };

    const handleClearSelection = () => {
        if (!onSelectionChange) return;
        onSelectionChange(new Set());
    };

    const isViewMode = mode === "view";

    if (!script || script.length === 0) {
        return (
            <Card>
                {!isViewMode && <CardHeader header={<Text>Recorded Actions</Text>} />}
                <Text style={{ padding: 12, fontStyle: 'italic', color: '#666' }}>
                    {isViewMode ? 'No actions assigned to this button.' : 'No actions recorded yet. Perform actions on the document to record them.'}
                </Text>
            </Card>
        );
    }

    return (
        <Card style={{ overflow: 'hidden' }}>
            {!isViewMode && (
                <CardHeader
                    header={<Text>Recorded Actions</Text>}
                    action={hasSelection ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <Button size="small" appearance="subtle" onClick={handleSelectAll}>
                                {allSelected ? 'Deselect all' : 'Select all'}
                            </Button>
                            {someSelected && (
                                <Button size="small" appearance="subtle" onClick={handleClearSelection}>
                                    Clear
                                </Button>
                            )}
                        </div>
                    ) : null}
                />
            )}
            <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
                <Table size="small">
                    <TableHeader>
                        <TableRow>
                            {hasSelection && !isViewMode && (
                                <TableHeaderCell style={{ width: '32px' }}>
                                    <Checkbox
                                        checked={allSelected ? true : someSelected ? 'mixed' : false}
                                        onChange={handleSelectAll}
                                    />
                                </TableHeaderCell>
                            )}
                            {isViewMode && onDeleteAction && (
                                <TableHeaderCell style={{ width: '32px' }}></TableHeaderCell>
                            )}
                            <TableHeaderCell>Details</TableHeaderCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {script.map((patch, i) => {
                            const originalNodeId = extractNodeId(patch.path);
                            const overriddenNodeId = targetOverrides?.get(i);
                            const displayNodeId = overriddenNodeId ?? originalNodeId;
                            const isOverridden = overriddenNodeId !== undefined;
                            const value = (patch as unknown as { value?: unknown; values?: unknown }).value ??
                                (patch as unknown as { value?: unknown; values?: unknown }).values;
                            const isSelected = hasSelection && selectedIndices.has(i);

                            // Get creation/dependency info from analysis
                            const creationInfo = analysis ? getCreationInfo(i, analysis) : null;

                            // Path rest (after node ID)
                            const pathRest = patch.path.slice(2);
                            const pathStr = pathRest.map((seg, idx) => {
                                if (typeof seg === 'number') return seg === -1 ? '[end]' : `[${seg}]`;
                                if (idx === 0) return String(seg);
                                return `.${seg}`;
                            }).join('');

                            // Render node reference with override styling and target button
                            const renderTargetNode = () => {
                                if (!displayNodeId) return null;
                                // Check if it's a variable placeholder ($0, $1, etc.)
                                const varMatch = displayNodeId.match(/^\$(\d+)$/);
                                if (varMatch) {
                                    const num = parseInt(varMatch[1]!, 10);
                                    // $0 with actionTarget = show actual target node
                                    if (num === 0 && actionTarget) {
                                        return <NodeId id={actionTarget} onClick={onNodeClick} />;
                                    }
                                    // $0 without actionTarget = show #0 (target placeholder)
                                    // $1, $2, etc. = show #1, #2, etc. (created nodes)
                                    return <Badge appearance="outline" color="success" size="small">#{num}</Badge>;
                                }
                                return (
                                    <>
                                        <span style={isOverridden ? { backgroundColor: 'rgba(34, 197, 94, 0.2)', borderRadius: '3px' } : undefined}>
                                            <NodeId id={displayNodeId} onClick={onNodeClick} />
                                        </span>
                                        {!isViewMode && onRetarget && currentNodeId && originalNodeId && (
                                            <Tooltip content="Use selected node as target" relationship="label">
                                                <Button
                                                    size="small"
                                                    appearance="subtle"
                                                    icon={<TargetRegular />}
                                                    onClick={() => onRetarget(i, currentNodeId)}
                                                    disabled={displayNodeId === currentNodeId}
                                                    style={{ minWidth: 'auto', padding: '2px' }}
                                                />
                                            </Tooltip>
                                        )}
                                    </>
                                );
                            };

                            // Format the action as a sentence
                            const renderActionSentence = () => {
                                // Insert on children - "insert <node> #N to TARGET's path"
                                if (patch.action === "insert" && pathRest[0] === "children" && value && typeof value === 'object') {
                                    const node = value as { kind?: string; tag?: string; value?: string; label?: string; attrs?: Record<string, unknown>; target?: string; id?: string };
                                    const kind = node.kind || 'element';
                                    let nodeDisplay = '';
                                    if (kind === 'element') {
                                        const tag = node.tag || 'div';
                                        const attrs = node.attrs || {};
                                        const attrStr = Object.entries(attrs)
                                            .slice(0, 2)
                                            .map(([k, v]) => `${k}="${String(v).slice(0, 10)}"`)
                                            .join(' ');
                                        nodeDisplay = `<${tag}${attrStr ? ' ' + attrStr : ''}></${tag}>`;
                                    } else if (kind === 'value') {
                                        const text = node.value || '';
                                        nodeDisplay = `"${text.slice(0, 20)}${text.length > 20 ? '...' : ''}"`;
                                    } else if (kind === 'action') {
                                        nodeDisplay = `<button>${node.label || 'Action'}</button>`;
                                    }

                                    // Check if value.id is a variable placeholder (for generalized actions)
                                    const varIdMatch = node.id?.match(/^\$(\d+)$/);
                                    const varCreatedNum = varIdMatch ? parseInt(varIdMatch[1]!, 10) : null;

                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>insert</span>
                                            <span style={{ color: '#666' }}>{nodeDisplay}</span>
                                            {creationInfo && (
                                                <Tooltip content={`Creates node #${creationInfo.number}`} relationship="description">
                                                    <Badge appearance="filled" color="success" size="small">#{creationInfo.number}</Badge>
                                                </Tooltip>
                                            )}
                                            {!creationInfo && varCreatedNum !== null && (
                                                <Badge appearance="filled" color="success" size="small">#{varCreatedNum}</Badge>
                                            )}
                                            <span>to</span>
                                            {renderTargetNode()}
                                            {pathStr && <span>'s {pathStr}</span>}
                                        </>
                                    );
                                }

                                // Copy - "copy SOURCE's .attr to TARGET's path"
                                if (patch.action === "copy" && value && typeof value === 'object' && 'sourceId' in value) {
                                    const copyVal = value as { sourceId: string; sourceAttr?: string };
                                    const origSourceId = copyVal.sourceId;
                                    const overriddenSourceId = sourceOverrides?.get(i);
                                    const dispSourceId = overriddenSourceId ?? origSourceId;
                                    const isSourceOverridden = overriddenSourceId !== undefined;

                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>copy</span>
                                            <span style={isSourceOverridden ? { backgroundColor: 'rgba(34, 197, 94, 0.2)', borderRadius: '3px' } : undefined}>
                                                <NodeId id={dispSourceId} onClick={onNodeClick} />
                                            </span>
                                            {!isViewMode && onRetargetSource && currentNodeId && (
                                                <Tooltip content="Use selected node as source" relationship="label">
                                                    <Button
                                                        size="small"
                                                        appearance="subtle"
                                                        icon={<TargetRegular />}
                                                        onClick={() => onRetargetSource(i, currentNodeId)}
                                                        disabled={dispSourceId === currentNodeId}
                                                        style={{ minWidth: 'auto', padding: '2px' }}
                                                    />
                                                </Tooltip>
                                            )}
                                            {copyVal.sourceAttr && <span>'s .{copyVal.sourceAttr}</span>}
                                            <span>to</span>
                                            {renderTargetNode()}
                                            {pathStr && <span>'s {pathStr}</span>}
                                        </>
                                    );
                                }

                                // Splice - "splice pos:N del:N "text" to TARGET's value"
                                if (patch.action === "splice") {
                                    // Extract position from path (last element is the index)
                                    const position = pathRest.length > 0 && typeof pathRest[pathRest.length - 1] === 'number'
                                        ? pathRest[pathRest.length - 1] as number
                                        : 0;
                                    // Path without the index for display
                                    const fieldPath = pathRest.slice(0, -1).map((seg, idx) => {
                                        if (typeof seg === 'number') return seg === -1 ? '[end]' : `[${seg}]`;
                                        if (idx === 0) return String(seg);
                                        return `.${seg}`;
                                    }).join('') || 'value';

                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>splice</span>
                                            <span style={{ color: '#888' }}>pos:{position}</span>
                                            <span style={{ color: '#888' }}>del:{patch.length ?? 0}</span>
                                            <span style={{ color: '#666' }}>
                                                {value !== undefined ? JSON.stringify(formatValue(value)).slice(0, 20) : '""'}
                                            </span>
                                            <span>to</span>
                                            {renderTargetNode()}
                                            <span>'s {fieldPath}</span>
                                        </>
                                    );
                                }

                                // Put - "put VALUE to TARGET's .property"
                                if (patch.action === "put") {
                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>put</span>
                                            <span style={{ color: '#666' }}>
                                                {value !== undefined ? JSON.stringify(formatValue(value)).slice(0, 30) : ''}
                                            </span>
                                            <span>to</span>
                                            {renderTargetNode()}
                                            {pathStr && <span>'s {pathStr}</span>}
                                        </>
                                    );
                                }

                                // Del - "del TARGET's path"
                                if (patch.action === "del") {
                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>del</span>
                                            {renderTargetNode()}
                                            {pathStr && <span>'s {pathStr}</span>}
                                        </>
                                    );
                                }

                                // Move - "move TARGET to PARENT at index N"
                                if (patch.action === "move" && value && typeof value === 'object' && 'parentId' in value) {
                                    const moveVal = value as { parentId: string; index?: number };
                                    const parentVarMatch = moveVal.parentId.match(/^\$(\d+)$/);
                                    const parentVarNum = parentVarMatch ? parseInt(parentVarMatch[1]!, 10) : null;
                                    return (
                                        <>
                                            <span style={{ color: '#0078d4' }}>move</span>
                                            {renderTargetNode()}
                                            <span>to</span>
                                            {parentVarNum !== null ? (
                                                <Badge appearance="outline" color="success" size="small">#{parentVarNum}</Badge>
                                            ) : (
                                                <NodeId id={moveVal.parentId} onClick={onNodeClick} />
                                            )}
                                            {moveVal.index != null && (
                                                <span style={{ color: '#888' }}>at index {moveVal.index}</span>
                                            )}
                                        </>
                                    );
                                }

                                // Insert actions to button - show nested actions
                                if (patch.action === "insert" && pathRest[0] === "actions" && value) {
                                    const actions = Array.isArray(value) ? value : [value];

                                    // Helper to render node ref with variable support
                                    const renderNestedNodeRef = (id: string | null) => {
                                        if (!id) return null;
                                        const varMatch = id.match(/^\$(\d+)$/);
                                        if (varMatch) {
                                            const num = parseInt(varMatch[1]!, 10);
                                            return <Badge appearance="outline" color="success" size="small">#{num}</Badge>;
                                        }
                                        return <NodeId id={id} onClick={onNodeClick} />;
                                    };

                                    const isVar = (id: string | null) => id && /^\$\d+$/.test(id);
                                    const getVarNum = (id: string) => {
                                        const match = id.match(/^\$(\d+)$/);
                                        return match ? parseInt(match[1]!, 10) : null;
                                    };

                                    const formatNestedNode = (act: { action?: string; path?: (string | number)[]; value?: unknown }) => {
                                        const actPath = Array.isArray(act.path) ? act.path.slice(2) : [];
                                        const actValue = act.value;
                                        if (act.action === "insert" && actPath[0] === "children" && actValue && typeof actValue === 'object') {
                                            const node = actValue as { kind?: string; tag?: string; value?: string; label?: string };
                                            const kind = node.kind || 'element';
                                            if (kind === 'element') return `<${node.tag || 'div'}></${node.tag || 'div'}>`;
                                            if (kind === 'value') return `"${(node.value || '').slice(0, 15)}"`;
                                            if (kind === 'action') return `<button>${node.label || 'Action'}</button>`;
                                        }
                                        return '';
                                    };

                                    return (
                                        <div>
                                            <span>{pathStr} +{actions.length} action{actions.length !== 1 ? 's' : ''}:</span>
                                            {actions.map((act, idx) => {
                                                const actPath = Array.isArray(act.path) ? act.path.slice(2) : [];
                                                const actPathStr = actPath.map((seg: string | number, ai: number) => {
                                                    if (typeof seg === 'number') return seg === -1 ? '[end]' : `[${seg}]`;
                                                    if (ai === 0) return String(seg);
                                                    return `.${seg}`;
                                                }).join('');
                                                const actNodeId = (() => {
                                                    for (const seg of (act.path || [])) {
                                                        const str = String(seg);
                                                        if (/^\d+@\d+$/.test(str) || /^\$\d+$/.test(str)) return str;
                                                    }
                                                    return null;
                                                })();
                                                const actValue = act.value;

                                                if (act.action === "insert" && actPath[0] === "children" && actValue && typeof actValue === 'object') {
                                                    const node = actValue as { id?: string };
                                                    const createdVarNum = node.id && isVar(node.id) ? getVarNum(node.id) : null;
                                                    return (
                                                        <div key={idx} style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span style={{ color: '#0078d4' }}>insert</span>
                                                            <span style={{ color: '#666' }}>{formatNestedNode(act)}</span>
                                                            {createdVarNum && <Badge appearance="filled" color="success" size="small">#{createdVarNum}</Badge>}
                                                            <span>to</span>
                                                            {renderNestedNodeRef(actNodeId)}
                                                            {actPathStr && <span>'s {actPathStr}</span>}
                                                        </div>
                                                    );
                                                }

                                                if (act.action === "copy" && actValue && typeof actValue === 'object' && 'sourceId' in actValue) {
                                                    const copyVal = actValue as { sourceId: string; sourceAttr?: string };
                                                    return (
                                                        <div key={idx} style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span style={{ color: '#0078d4' }}>copy</span>
                                                            {renderNestedNodeRef(copyVal.sourceId)}
                                                            {copyVal.sourceAttr && <span>'s .{copyVal.sourceAttr}</span>}
                                                            <span>to</span>
                                                            {renderNestedNodeRef(actNodeId)}
                                                            {actPathStr && <span>'s {actPathStr}</span>}
                                                        </div>
                                                    );
                                                }

                                                if (act.action === "splice") {
                                                    // Extract position from path (last element is the index)
                                                    const splicePos = actPath.length > 0 && typeof actPath[actPath.length - 1] === 'number'
                                                        ? actPath[actPath.length - 1] as number
                                                        : 0;
                                                    // Field path without the index
                                                    const spliceFieldPath = actPath.slice(0, -1).map((seg: string | number, ai: number) => {
                                                        if (typeof seg === 'number') return seg === -1 ? '[end]' : `[${seg}]`;
                                                        if (ai === 0) return String(seg);
                                                        return `.${seg}`;
                                                    }).join('') || 'value';

                                                    return (
                                                        <div key={idx} style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span style={{ color: '#0078d4' }}>splice</span>
                                                            <span style={{ color: '#888' }}>pos:{splicePos}</span>
                                                            <span style={{ color: '#888' }}>del:{act.length ?? 0}</span>
                                                            <span style={{ color: '#666' }}>{actValue !== undefined ? JSON.stringify(actValue).slice(0, 15) : '""'}</span>
                                                            <span>to</span>
                                                            {renderNestedNodeRef(actNodeId)}
                                                            <span>'s {spliceFieldPath}</span>
                                                        </div>
                                                    );
                                                }

                                                if (act.action === "put") {
                                                    return (
                                                        <div key={idx} style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                            <span style={{ color: '#0078d4' }}>put</span>
                                                            <span style={{ color: '#666' }}>{actValue !== undefined ? JSON.stringify(formatValue(actValue)).slice(0, 20) : ''}</span>
                                                            <span>to</span>
                                                            {renderNestedNodeRef(actNodeId)}
                                                            {actPathStr && <span>'s {actPathStr}</span>}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={idx} style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                        <span style={{ color: '#0078d4' }}>{act.action}</span>
                                                        {renderNestedNodeRef(actNodeId)}
                                                        {actPathStr && <span>{actPathStr}</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                }

                                // Default fallback
                                return (
                                    <>
                                        <span style={{ color: '#0078d4' }}>{patch.action}</span>
                                        {creationInfo && (
                                            <Badge appearance="filled" color="success" size="small">#{creationInfo.number}</Badge>
                                        )}
                                        {renderTargetNode()}
                                        {pathStr && <span>{pathStr}</span>}
                                        {value !== undefined && (
                                            <span style={{ color: '#666' }}>{JSON.stringify(formatValue(value)).slice(0, 40)}</span>
                                        )}
                                    </>
                                );
                            };

                            return (
                                <TableRow
                                    key={i}
                                    style={isSelected ? { background: 'rgba(59, 130, 246, 0.1)' } : undefined}
                                >
                                    {hasSelection && !isViewMode && (
                                        <TableCell>
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={() => handleToggle(i)}
                                            />
                                        </TableCell>
                                    )}
                                    {isViewMode && onDeleteAction && (
                                        <TableCell>
                                            <Tooltip content="Remove this action" relationship="label">
                                                <Button
                                                    size="small"
                                                    appearance="subtle"
                                                    icon={<DeleteRegular />}
                                                    onClick={() => onDeleteAction(i)}
                                                    style={{ minWidth: 'auto', padding: '2px', color: '#d13438' }}
                                                />
                                            </Tooltip>
                                        </TableCell>
                                    )}
                                    <TableCell style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                            {renderActionSentence()}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
