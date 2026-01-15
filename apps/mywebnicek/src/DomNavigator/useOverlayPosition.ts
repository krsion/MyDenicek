/**
 * Hook for computing and tracking overlay positions
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { describe } from "./domHelpers";

export interface OverlayData {
    id: string;
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
    label: string;
}

/**
 * Compute overlay position relative to wrapper element
 */
export function computeOverlay(el: HTMLElement, wrapper: HTMLElement | null): OverlayData | null {
    if (!wrapper) return null;
    const s = el.getBoundingClientRect();
    const w = wrapper.getBoundingClientRect();
    const label = describe(el);
    return {
        id: el.getAttribute("data-node-guid") || "",
        top: s.top - w.top,
        left: s.left - w.left,
        width: s.width,
        height: s.height,
        visible: true,
        label,
    };
}

/**
 * Hook for managing overlay positions with automatic updates on scroll/resize
 */
export function useOverlayPosition(
    wrapperRef: React.RefObject<HTMLElement | null>,
    selectedElements: HTMLElement[]
) {
    const [overlays, setOverlays] = useState<OverlayData[]>([]);

    const updateOverlays = useCallback((elements: HTMLElement[]) => {
        const wrapper = wrapperRef.current;
        const newOverlays = elements
            .map(el => computeOverlay(el, wrapper))
            .filter((o): o is OverlayData => o !== null);
        setOverlays(newOverlays);
    }, [wrapperRef]);

    // Update overlays when selection changes
    useLayoutEffect(() => {
        if (selectedElements.length > 0) updateOverlays(selectedElements);
    }, [updateOverlays, selectedElements]);

    // Recompute overlay on scroll/resize
    useEffect(() => {
        function onWinChange() {
            if (selectedElements.length > 0) updateOverlays(selectedElements);
        }
        window.addEventListener("scroll", onWinChange, { passive: true });
        window.addEventListener("resize", onWinChange, { passive: true });
        return () => {
            window.removeEventListener("scroll", onWinChange);
            window.removeEventListener("resize", onWinChange);
        };
    }, [updateOverlays, selectedElements]);

    // Recompute overlay when selected elements resize
    useEffect(() => {
        if (selectedElements.length === 0) return;
        let ro: ResizeObserver | null = null;
        try {
            ro = new ResizeObserver(() => updateOverlays(selectedElements));
            selectedElements.forEach(el => ro?.observe(el));
        } catch {
            const onWin = () => updateOverlays(selectedElements);
            window.addEventListener("resize", onWin, { passive: true });
            return () => window.removeEventListener("resize", onWin);
        }
        return () => {
            if (ro) ro.disconnect();
        };
    }, [updateOverlays, selectedElements]);

    return { overlays, setOverlays, updateOverlays };
}

/**
 * Hook for managing peer overlay positions
 */
export function usePeerOverlays(
    wrapperRef: React.RefObject<HTMLElement | null>,
    containerRef: React.RefObject<HTMLElement | null>,
    remoteSelections: { [userId: string]: string[] | null } | undefined,
    withinContainer: (el: Element | null) => el is HTMLElement
) {
    const [peerOverlays, setPeerOverlays] = useState<Record<string, OverlayData[]>>({});

    const updatePeerOverlays = useCallback((peerId: string, elements: HTMLElement[]) => {
        const wrapper = wrapperRef.current;
        const newOverlays = elements
            .map(el => computeOverlay(el, wrapper))
            .filter((o): o is OverlayData => o !== null);
        setPeerOverlays(p => ({ ...p, [peerId]: newOverlays }));
    }, [wrapperRef]);

    // Update peer overlays when remoteSelections change
    useEffect(() => {
        if (!remoteSelections) return;
        const root = containerRef.current;
        if (!root) return;

        Object.entries(remoteSelections).forEach(([userId, nodeIds]) => {
            if (!nodeIds || nodeIds.length === 0) {
                setPeerOverlays((p) => {
                    const next = { ...p };
                    delete next[userId];
                    return next;
                });
                return;
            }

            const elements: HTMLElement[] = [];
            for (const id of nodeIds) {
                const el = root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null;
                if (el && withinContainer(el)) {
                    elements.push(el);
                }
            }
            updatePeerOverlays(userId, elements);
        });
    }, [remoteSelections, updatePeerOverlays, containerRef, withinContainer]);

    // Recompute peer overlays on scroll/resize
    useEffect(() => {
        function onWinChange() {
            if (!remoteSelections) return;
            const root = containerRef.current;
            if (!root) return;
            Object.entries(remoteSelections).forEach(([userId, nodeIds]) => {
                if (!nodeIds) return;
                const elements: HTMLElement[] = [];
                for (const id of nodeIds) {
                    const el = root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null;
                    if (el && withinContainer(el)) {
                        elements.push(el);
                    }
                }
                updatePeerOverlays(userId, elements);
            });
        }
        window.addEventListener("scroll", onWinChange, { passive: true });
        window.addEventListener("resize", onWinChange, { passive: true });
        return () => {
            window.removeEventListener("scroll", onWinChange);
            window.removeEventListener("resize", onWinChange);
        };
    }, [remoteSelections, updatePeerOverlays, containerRef, withinContainer]);

    return { peerOverlays, setPeerOverlays, updatePeerOverlays };
}
