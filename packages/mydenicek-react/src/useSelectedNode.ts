import type { Node } from "@mydenicek/core";
import { useMemo } from "react";
import { DENICEK_NODE_ID_ATTR } from "./constants";
import { useDocumentState } from "./useDenicekDocument";
import { useSelection } from "./useSelection";

export interface SelectedNodeDetails {
  id: string;
  node: Node | undefined;
  tag: string | undefined;
  value: string | undefined;
  attrs: Record<string, unknown> | undefined;
  dom?: {
    tagName: string;
    classes: string[];
    width: number;
    height: number;
    rect: DOMRect;
  };
}

export function useSelectedNode() {
  const { model } = useDocumentState();
  const { selectedNodeIds } = useSelection();

  const selectedNodeId = selectedNodeIds.length > 0 
    ? selectedNodeIds[selectedNodeIds.length - 1] 
    : undefined;

  const node = useMemo(() => {
    if (!model || !selectedNodeId) return undefined;
    return model.getNode(selectedNodeId);
  }, [model, selectedNodeId]);

  const details = useMemo<SelectedNodeDetails | undefined>(() => {
    if (!model || !selectedNodeId) return undefined;
    
    // Attempt to find the element in the DOM for visual info
    const el = document.querySelector(`[${DENICEK_NODE_ID_ATTR}="${selectedNodeId}"]`) as HTMLElement | null;
    
    const baseInfo: SelectedNodeDetails = {
        id: selectedNodeId,
        node: node,
        tag: node?.kind === "element" ? node.tag : undefined,
        value: node?.kind === "value" ? node.value : undefined,
        attrs: node?.kind === "element" ? node.attrs : undefined,
    };

    if (el) {
        const rect = el.getBoundingClientRect();
        return {
            ...baseInfo,
            dom: {
                tagName: el.tagName.toLowerCase(),
                classes: Array.from(el.classList),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                rect,
            }
        };
    }

    return baseInfo;
  }, [model, node, selectedNodeId]);

  return {
    selectedNodeId,
    selectedNodeIds,
    node,
    details,
  };
}
