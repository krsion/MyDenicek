import {
  useLocalAwareness,
  useRemoteAwareness
} from "@automerge/react";
import { useContext, useMemo } from "react";
import { DenicekContext, DenicekInternalContext } from "./DenicekProvider";

const EMPTY_ARRAY: string[] = [];
const INITIAL_STATE = { selectedNodeIds: [] as string[] };

export function useSelection() {
  const context = useContext(DenicekContext);
  const internalContext = useContext(DenicekInternalContext);
  
  if (!context || !internalContext) {
    throw new Error("useSelection: No context provided. Must be used within DenicekProvider.");
  }

  const { handle, repo } = internalContext;

  if (!handle) {
      throw new Error("useSelection: No handle provided. Must be used within DenicekProvider.");
  }


  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle,
    userId: repo?.peerId as string,
    initialState: INITIAL_STATE,
  });

  const userId = repo?.peerId ?? null;
  const selectedNodeIds = localState.selectedNodeIds || EMPTY_ARRAY;

  const [peerStates] = useRemoteAwareness({
    handle: handle,
    localUserId: userId as string,
    offlineTimeout: 1000,
  });

  const setSelectedNodeIds = (ids: string[]) => {
    updateLocalState({ selectedNodeIds: ids });
  };
  
  const remoteSelections = useMemo(() => {
    const selections: { [peerId: string]: string[] | null } = {};
    Object.entries(peerStates).forEach(([peerId, state]) => {
      // @ts-ignore
      const selected = state?.selectedNodeIds;
      if (selected && Array.isArray(selected)) {
        selections[peerId] = selected;
      } else {
        selections[peerId] = null;
      }
    });
    return selections;
  }, [peerStates]);

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    remoteSelections,
    userId,
  };
}
