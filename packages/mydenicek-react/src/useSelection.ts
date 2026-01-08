import { useContext } from "react";
import { DenicekInternalContext } from "./DenicekProvider";

export function useSelection() {
  const internalContext = useContext(DenicekInternalContext);
  
  if (!internalContext) {
    throw new Error("useSelection: No context provided. Must be used within DenicekProvider.");
  }

  const { selectedNodeIds, setSelectedNodeIds, remoteSelections, userId } = internalContext;

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    remoteSelections,
    userId,
  };
}
