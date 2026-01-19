/**
 * Hook for clipboard operations between input elements and value nodes
 */

import type { DenicekDocument, NodeData } from "@mydenicek/react-v2";
import { useCallback, useEffect, useState } from "react";

interface UseClipboardProps {
    selectedNodeId: string | null;
    node: NodeData | null | undefined;
    document: DenicekDocument;
    updateValue: (nodeIds: string[], newValue: string, originalValue: string) => void;
}

export function useClipboard({ selectedNodeId, node, document: denicekDoc, updateValue }: UseClipboardProps) {
    const [clipboardValue, setClipboardValue] = useState<string | null>(null);

    const isInputSelected = node?.kind === "element" && node.tag === "input";
    const isValueSelected = node?.kind === "value";

    const handleCopyFromInput = useCallback(() => {
        if (!selectedNodeId || !isInputSelected) return;
        const inputEl = document.querySelector(`[data-node-guid="${selectedNodeId}"]`) as HTMLInputElement | null;
        if (!inputEl) return;
        setClipboardValue(inputEl.value);
    }, [selectedNodeId, isInputSelected]);

    const handlePasteToValue = useCallback(() => {
        if (!selectedNodeId || !isValueSelected || clipboardValue === null) return;
        const valueNode = denicekDoc.getNode(selectedNodeId);
        const originalValue = valueNode?.kind === "value" ? valueNode.value : "";
        updateValue([selectedNodeId], clipboardValue, originalValue);
    }, [selectedNodeId, isValueSelected, clipboardValue, denicekDoc, updateValue]);

    // Keyboard shortcuts for Ctrl+C and Ctrl+V
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "c" && isInputSelected) {
                e.preventDefault();
                handleCopyFromInput();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "v" && isValueSelected && clipboardValue !== null) {
                e.preventDefault();
                handlePasteToValue();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isInputSelected, isValueSelected, clipboardValue, handleCopyFromInput, handlePasteToValue]);

    return {
        clipboardValue,
        isInputSelected,
        isValueSelected,
        handleCopyFromInput,
        handlePasteToValue,
    };
}
