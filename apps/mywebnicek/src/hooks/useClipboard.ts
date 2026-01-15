/**
 * Hook for clipboard operations between input elements and value nodes
 */

import type { DenicekModel, Node } from "@mydenicek/react-v2";
import { useCallback, useEffect, useState } from "react";

interface UseClipboardProps {
    selectedNodeId: string | null;
    node: Node | null | undefined;
    model: DenicekModel | null;
    updateValue: (nodeIds: string[], newValue: string, originalValue: string) => void;
}

export function useClipboard({ selectedNodeId, node, model, updateValue }: UseClipboardProps) {
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
        const valueNode = model?.getNode(selectedNodeId);
        const originalValue = valueNode?.kind === "value" ? valueNode.value : "";
        updateValue([selectedNodeId], clipboardValue, originalValue);
    }, [selectedNodeId, isValueSelected, clipboardValue, model, updateValue]);

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
