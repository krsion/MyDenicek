/**
 * Hook for clipboard operations between nodes.
 *
 * Copies create a "copy" action in history that references the source node.
 * On replay, the copy reads the CURRENT value from the source.
 */

import type { DenicekDocument, NodeData } from "@mydenicek/core";
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
                setClipboard({ sourceNodeId: selectedNodeId, textValue: String(valueNode.value) });
            }
        } else if (isInputSelected) {
            const inputEl = document.querySelector(`[data-node-guid="${selectedNodeId}"]`) as HTMLInputElement | null;
            if (inputEl) {
                setClipboard({ sourceNodeId: selectedNodeId, sourceAttr: "data-copy-value", textValue: inputEl.value });
            }
        }
    }, [selectedNodeId, isValueSelected, isInputSelected, doc]);

    const isElementSelected = node?.kind === "element";

    const handlePaste = useCallback(() => {
        if (!selectedNodeId || !clipboard) return;

        if (isValueSelected) {
            // Paste as sibling of value node
            const parentId = doc.getParentId(selectedNodeId);
            if (!parentId) return;
            doc.change((model) => {
                model.copyNode(clipboard.sourceNodeId, parentId, { sourceAttr: clipboard.sourceAttr });
            });
        } else if (isElementSelected) {
            // Paste as child of element node (create value node and copy to it)
            doc.change((model) => {
                model.copyNode(clipboard.sourceNodeId, selectedNodeId, { sourceAttr: clipboard.sourceAttr });
            });
        }
    }, [selectedNodeId, isValueSelected, isElementSelected, clipboard, doc]);

    const canPaste = clipboard !== null && (isValueSelected || isElementSelected);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "c" && (isValueSelected || isInputSelected)) {
                e.preventDefault();
                handleCopy();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "v" && canPaste) {
                e.preventDefault();
                handlePaste();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isInputSelected, isValueSelected, canPaste, handleCopy, handlePaste]);

    return {
        isInputSelected,
        isValueSelected,
        isElementSelected,
        handleCopy,
        handlePaste,
        canPaste,
    };
}
