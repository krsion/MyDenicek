import type { PeerId } from "@automerge/react";
import { DocHandle, Repo, RepoContext, useLocalAwareness, useRemoteAwareness } from "@automerge/react";
import { useContext, useMemo } from "react";

import type { JsonDoc } from "../types";

export function useSelection(handle: DocHandle<JsonDoc>) {
  const repo = useContext(RepoContext) as Repo | undefined;
  const peerId: PeerId | null = repo?.peerId ?? null;

  const [localState, updateLocalState] = useLocalAwareness({
    handle: handle,
    userId: repo?.peerId as string,
    initialState: {
      selectedNodeIds: [] as string[]
    }
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

  const selectedNodeIds = localState.selectedNodeIds || [];
  
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
