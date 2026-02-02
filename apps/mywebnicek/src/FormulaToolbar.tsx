/**
 * Formula-specific toolbar controls
 *
 * A deep module that encapsulates all formula-related toolbar UI:
 * - Wrap in formula (when value/ref/formula selected)
 * - Edit operation (when formula selected)
 * - Argument hints (when formula selected)
 */

import { Button, Combobox, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, Option, Text, ToolbarButton, Tooltip } from "@fluentui/react-components";
import { CalculatorRegular } from "@fluentui/react-icons";
import type { DenicekDocument, NodeData } from "@mydenicek/core";

import { builtinOperationNames, defaultOperationsMap } from "./formula";

interface FormulaToolbarProps {
    document: DenicekDocument;
    selectedNodeId: string | null | undefined;
    node: NodeData | null | undefined;
}

/**
 * Check if a node can be wrapped in a formula
 */
function canWrapInFormula(node: NodeData | null | undefined): boolean {
    return node?.kind === "value" || node?.kind === "ref" || node?.kind === "formula";
}

/**
 * Get operation info for display
 */
function getOperationInfo(operationName: string) {
    const op = defaultOperationsMap.get(operationName);
    const arity = op?.arity ?? 0;
    return {
        arityText: arity === -1 ? "variadic" : `${arity} args`,
        expectedArity: arity,
    };
}

export function FormulaToolbar({ document, selectedNodeId, node }: FormulaToolbarProps) {
    if (!selectedNodeId) return null;

    return (
        <>
            {/* Wrap in Formula */}
            {canWrapInFormula(node) && (
                <WrapInFormulaButton
                    document={document}
                    selectedNodeId={selectedNodeId}
                />
            )}

            {/* Formula Operation Editor + Arity Hints */}
            {node?.kind === "formula" && (
                <FormulaOperationEditor
                    document={document}
                    selectedNodeId={selectedNodeId}
                    operation={node.operation}
                />
            )}
        </>
    );
}

/**
 * Button that opens a dialog to wrap the selected node in a formula
 */
function WrapInFormulaButton({ document, selectedNodeId }: { document: DenicekDocument; selectedNodeId: string }) {
    return (
        <Dialog>
            <DialogTrigger>
                <Tooltip content="Wrap in formula" relationship="label">
                    <ToolbarButton icon={<CalculatorRegular />}>Wrap in ƒ</ToolbarButton>
                </Tooltip>
            </DialogTrigger>
            <DialogSurface>
                <DialogBody>
                    <DialogTitle>Wrap in Formula</DialogTitle>
                    <DialogContent>
                        <Text block style={{ marginBottom: 8 }}>Select an operation:</Text>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {builtinOperationNames.map((opName) => {
                                const { arityText } = getOperationInfo(opName);
                                return (
                                    <DialogTrigger key={opName} disableButtonEnhancement>
                                        <Button
                                            size="small"
                                            onClick={() => {
                                                document.change((model) => {
                                                    model.wrapInFormula(selectedNodeId, opName);
                                                });
                                            }}
                                        >
                                            {opName} <Text size={100} style={{ opacity: 0.6 }}>({arityText})</Text>
                                        </Button>
                                    </DialogTrigger>
                                );
                            })}
                        </div>
                    </DialogContent>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

/**
 * Combobox to edit formula operation + arity hint
 */
function FormulaOperationEditor({ document, selectedNodeId, operation }: {
    document: DenicekDocument;
    selectedNodeId: string;
    operation: string;
}) {
    const { expectedArity } = getOperationInfo(operation);
    const actualArity = document.getChildIds(selectedNodeId).length;
    const isValidArity = expectedArity === -1 || actualArity === expectedArity;
    const arityDisplay = expectedArity === -1 ? `${actualArity}/∞` : `${actualArity}/${expectedArity}`;

    return (
        <>
            <Combobox
                placeholder="Operation"
                value={operation}
                style={{ minWidth: 120 }}
                onOptionSelect={(_, data) => {
                    if (data.optionValue) {
                        document.change((model) => {
                            model.updateFormulaOperation(selectedNodeId, data.optionValue!);
                        });
                    }
                }}
            >
                {builtinOperationNames.map((name) => (
                    <Option key={name} value={name}>{name}</Option>
                ))}
            </Combobox>
            <Text
                size={200}
                style={{
                    color: isValidArity ? "#666" : "#d13438",
                    alignSelf: "center",
                    marginLeft: 4
                }}
            >
                {arityDisplay} args
            </Text>
        </>
    );
}
