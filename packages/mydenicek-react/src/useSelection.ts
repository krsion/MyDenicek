import {
    type PeerId,
    useLocalAwareness,
    useRemoteAwareness
} from "@automerge/react";
import { useContext, useMemo } from "react";
import { DenicekContext } from "./DenicekProvider";

const EMPTY_ARRAY: string[] = [];
const INITIAL_STATE = { selectedNodeIds: [] as string[] };

export function useSelection() {
  const context = useContext(DenicekContext);
  
  if (!context) {
    throw new Error("useSelection: No context provided. Must be used within DenicekProvider.");
  }

  const { _internal: { handle, repo } } = context;

  if (!handle) {
      throw new Error("useSelection: No handle provided. Must be used within DenicekProvider.");
  }

  const peerId: PeerId | null = repo?.peerId ?? null;

  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle,
    userId: repo?.peerId as string,
    initialState: INITIAL_STATE,
  });

  const [peerStates] = useRemoteAwareness({
    handle: handle,
    localUserId: peerId as string,
    offlineTimeout: 1000,
  });

  const peerSelections: { [peerId: string]: string[] | null } = useMemo(() => {
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

  const selectedNodeIds = localState.selectedNodeIds || EMPTY_ARRAY;

  const setSelectedNodeIds = (ids: string[]) => {
    updateLocalState({ selectedNodeIds: ids });
  };

  return {
    selectedNodeIds,
    setSelectedNodeIds,
    peerSelections,
    peerId,
  };
}
