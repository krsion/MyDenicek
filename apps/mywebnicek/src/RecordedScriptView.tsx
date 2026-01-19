import { Badge, Button, Card, CardHeader, Checkbox, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip } from "@fluentui/react-components";
import { TargetRegular } from "@fluentui/react-icons";
import { type DenicekAction } from "@mydenicek/react-v2";

import { ShortenedId } from "./components/ShortenedId";
import { getCreationInfo, getDependencyInfo, type ScriptAnalysis } from "./utils/scriptAnalysis";

// Check if a path segment looks like a Loro OpId (peer@counter format)
function isNodeId(segment: string): boolean {
    return /^\d+@\d+$/.test(segment);
}

// Extract the node ID from a path (e.g., ["nodes", "321@18100", "tag"] -> "321@18100")
function extractNodeId(path: (string | number)[]): string | null {
    for (const segment of path) {
        const str = String(segment);
        if (isNodeId(str)) {
            return str;
        }
    }
    return null;
}

interface RecordedScriptViewProps {
    script: DenicekAction[];
    onNodeClick?: (id: string) => void;
    selectedIndices?: Set<number>;
    onSelectionChange?: (indices: Set<number>) => void;
    targetOverrides?: Map<number, string>;
    onRetarget?: (index: number, newNodeId: string) => void;
    currentNodeId?: string | null;
    analysis?: ScriptAnalysis | null;
}

export function RecordedScriptView({ script, onNodeClick, selectedIndices, onSelectionChange, targetOverrides, onRetarget, currentNodeId, analysis }: RecordedScriptViewProps) {
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

    if (!script || script.length === 0) {
        return (
            <Card>
                <CardHeader header={<Text>Recorded Actions</Text>} />
                <Text style={{ padding: 12, fontStyle: 'italic', color: '#666' }}>
                    No actions recorded yet. Perform actions on the document to record them.
                </Text>
            </Card>
        );
    }

    return (
        <Card style={{ overflow: 'hidden' }}>
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
            <div style={{ overflowX: 'auto' }}>
                <Table size="small">
                    <TableHeader>
                        <TableRow>
                            {hasSelection && (
                                <TableHeaderCell style={{ width: '32px' }}>
                                    <Checkbox
                                        checked={allSelected ? true : someSelected ? 'mixed' : false}
                                        onChange={handleSelectAll}
                                    />
                                </TableHeaderCell>
                            )}
                            <TableHeaderCell style={{ width: '60px' }}>Action</TableHeaderCell>
                            <TableHeaderCell style={{ width: '120px' }}>Node</TableHeaderCell>
                            <TableHeaderCell>Value</TableHeaderCell>
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
                            const dependencyInfo = analysis ? getDependencyInfo(i, analysis) : null;

                            return (
                                <TableRow
                                    key={i}
                                    style={isSelected ? { background: 'rgba(59, 130, 246, 0.1)' } : undefined}
                                >
                                    {hasSelection && (
                                        <TableCell>
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={() => handleToggle(i)}
                                            />
                                        </TableCell>
                                    )}
                                    <TableCell style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {patch.action}
                                            {creationInfo && (
                                                <Tooltip content={`This action creates a new node (referenced as #${creationInfo.number})`} relationship="description">
                                                    <Badge appearance="filled" color="success" size="small">
                                                        #{creationInfo.number}
                                                    </Badge>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ padding: '4px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                            {/* Fixed-width slot for dependency badge */}
                                            <span style={{ width: '28px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                                {dependencyInfo ? (
                                                    <Tooltip content={`Uses node created by action #${dependencyInfo.creatorIndex + 1}`} relationship="description">
                                                        <Badge appearance="outline" color="informative" size="small">
                                                            #{dependencyInfo.number}
                                                        </Badge>
                                                    </Tooltip>
                                                ) : null}
                                            </span>
                                            {/* Node ID with overflow hidden */}
                                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                                {displayNodeId ? (
                                                    <span style={isOverridden ? { backgroundColor: 'rgba(34, 197, 94, 0.2)', borderRadius: '3px' } : undefined}>
                                                        <ShortenedId id={displayNodeId} onClick={onNodeClick} maxLength={100} />
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#999' }}>-</span>
                                                )}
                                            </span>
                                            {/* Target button - fixed width slot */}
                                            <span style={{ width: '24px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                                {onRetarget && currentNodeId && originalNodeId ? (
                                                    <Tooltip content="Use currently selected node as target" relationship="label">
                                                        <Button
                                                            size="small"
                                                            appearance="subtle"
                                                            icon={<TargetRegular />}
                                                            onClick={() => onRetarget(i, currentNodeId)}
                                                            disabled={displayNodeId === currentNodeId}
                                                            style={{ minWidth: 'auto', padding: '2px' }}
                                                        />
                                                    </Tooltip>
                                                ) : null}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell style={{ wordBreak: 'break-word' }}>
                                        {value !== undefined ? (
                                            <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                                                {JSON.stringify(value)}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#999' }}>-</span>
                                        )}
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
