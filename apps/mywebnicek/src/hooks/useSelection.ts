import type { PeerId } from "@automerge/react";
import { DocHandle, Repo, RepoContext, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import type { JsonDoc } from "@mydenicek/core";
import { DenicekContext } from "@mydenicek/react";
import { useContext, useMemo } from "react";

const EMPTY_ARRAY: string[] = [];
const INITIAL_STATE = { selectedNodeIds: [] as string[] };

export function useSelection(handleOrUndefined?: DocHandle<JsonDoc>) {
  const context = useContext(DenicekContext);
  const handle = handleOrUndefined || context?.handle;
  if (!handle) throw new Error("useSelection: No handle provided");
  
  const repo = useContext(RepoContext) as Repo | undefined;

  const peerId: PeerId | null = repo?.peerId ?? null;

  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle,
    userId: repo?.peerId as string,
    initialState: INITIAL_STATE
  });

  const [peerStates] = useRemoteAwareness({
    handle: handle,
    localUserId: peerId as string,
    offlineTimeout: 1000
  });

  const peerSelections: { [peerId: string]: string[] | null } = useMemo(() => {
    const selections: { [peerId: string]: string[] | null } = {};
    Object.entries(peerStates).forEach(([peerId, state]) => {
      if (state.selectedNodeIds && Array.isArray(state.selectedNodeIds)) {
        selections[peerId] = state.selectedNodeIds;
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
    peerId
  };
}
