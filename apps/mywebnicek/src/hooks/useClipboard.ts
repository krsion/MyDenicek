/**
 * Hook for clipboard operations between nodes.
 *
 * Copies create a "copy" action in history that references the source node.
 * On replay, the copy reads the CURRENT value from the source.
 */

import type { DenicekDocument, NodeData } from "@mydenicek/react";
import { useCallback, useEffect, useState } from "react";

interface ClipboardData {
    sourceNodeId: string;
    /** If set, copy from this attribute (for input elements) */
    sourceAttr?: string;
    /** For display only */
    textValue: string;
}

interface UseClipboardProps {
    selectedNodeId: string | null;
    node: NodeData | null | undefined;
    document: DenicekDocument;
}

export function useClipboard({ selectedNodeId, node, document: doc }: UseClipboardProps) {
    const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

    const isInputSelected = node?.kind === "element" && node.tag === "input";
    const isValueSelected = node?.kind === "value";

    const handleCopy = useCallback(() => {
        if (!selectedNodeId) return;

        if (isValueSelected) {
            const valueNode = doc.getNode(selectedNodeId);
            if (valueNode?.kind === "value") {
                setClipboard({ sourceNodeId: selectedNodeId, textValue: valueNode.value });
            }
        } else if (isInputSelected) {
            const inputEl = document.querySelector(`[data-node-guid="${selectedNodeId}"]`) as HTMLInputElement | null;
            if (inputEl) {
                setClipboard({ sourceNodeId: selectedNodeId, sourceAttr: "data-copy-value", textValue: inputEl.value });
            }
        }
    }, [selectedNodeId, isValueSelected, isInputSelected, doc]);

    const handlePaste = useCallback(() => {
        if (!selectedNodeId || !isValueSelected || !clipboard) return;

        const parentId = doc.getParentId(selectedNodeId);
        if (!parentId) return;

        doc.change((model) => {
            model.copyNode(clipboard.sourceNodeId, parentId, { sourceAttr: clipboard.sourceAttr });
        });
    }, [selectedNodeId, isValueSelected, clipboard, doc]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "c" && (isValueSelected || isInputSelected)) {
                e.preventDefault();
                handleCopy();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "v" && isValueSelected && clipboard) {
                e.preventDefault();
                handlePaste();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isInputSelected, isValueSelected, clipboard, handleCopy, handlePaste]);

    return {
        isInputSelected,
        isValueSelected,
        handleCopy,
        handlePaste,
        hasClipboardData: clipboard !== null,
    };
}
