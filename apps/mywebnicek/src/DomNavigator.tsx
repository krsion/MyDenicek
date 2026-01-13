

import { makeStyles } from "@fluentui/react-components";
import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

/** Wrap your content with <DomNavigator> to enable navigation/highlighting within it. */

export interface DomNavigatorHandle {
  navigateToParent: () => void;
  navigateToFirstChild: () => void;
  navigateToPrevSibling: () => void;
  navigateToNextSibling: () => void;
  clearSelection: () => void;
}

const useStyles = makeStyles({
  overlay: {
    position: "absolute",
    pointerEvents: "none",
    borderRadius: "6px",
    boxShadow: "0 0 0 2px rgba(59,130,246,0.9), 0 0 0 6px rgba(59,130,246,0.2)",
    background: "rgba(59,130,246,0.10)",
    transition: "all 120ms ease",
  },
  overlayLabel: {
    position: "absolute",
    top: "-24px",
    left: "0px",
    padding: "2px 6px",
    fontSize: "11px",
    background: "#1f2937",
    color: "#fff",
    borderRadius: "4px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
    whiteSpace: "nowrap",
  },
});

export const DomNavigator = React.forwardRef<DomNavigatorHandle, { children: React.ReactNode; onSelectedChange?: (nodeIds: string[], isGeneralized: boolean) => void; selectedNodeIds?: string[], remoteSelections?: { [userId: string]: string[] | null }, generalizer?: (nodeIds: string[]) => string[] }>(({ children, onSelectedChange, selectedNodeIds, remoteSelections, generalizer }, forwardedRef) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
  const [overlays, setOverlays] = useState<{
    id: string;
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
    label: string;
  }[]>([]);

  const [peerOverlays, setPeerOverlays] = useState<Record<string, {
    id: string;
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
    label?: string;
  }[]>>({});



  const styles = useStyles();

  const computeOverlay = useCallback((el: HTMLElement) => {
    const wrapper = wrapperRef.current;
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
  }, []);

  const updateOverlays = useCallback((elements: HTMLElement[]) => {
    const newOverlays = elements.map(el => computeOverlay(el)).filter((o): o is NonNullable<typeof o> => o !== null);
    setOverlays(newOverlays);
  }, [computeOverlay]);

  const updatePeerOverlays = useCallback((peerId: string, elements: HTMLElement[]) => {
    const newOverlays = elements.map(el => computeOverlay(el)).filter((o): o is NonNullable<typeof o> => o !== null);
    setPeerOverlays(p => ({
      ...p,
      [peerId]: newOverlays
    }));
  }, [computeOverlay]);

  const colorFromString = useCallback((s: string) => {
    // simple deterministic color based on string -> hue
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    // return a semi-transparent HSL color strings
    return {
      stroke: `hsl(${h} 70% 45% / 0.9)`,
      fill: `hsl(${h} 70% 45% / 0.10)`,
      subtle: `hsl(${h} 70% 45% / 0.05)`,
    };
  }, []);

  // Focus the container so it can capture keyboard events
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Ensure the wrapper is a positioned element so absolute overlay is placed correctly.
  // If the wrapper's computed position is `static`, set an inline `position: relative`.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const prevInline = el.style.position;
    if (cs.position === "static") {
      el.style.position = "relative";
    }
    return () => {
      // restore previous inline position
      el.style.position = prevInline || "";
    };
  }, []);

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

  // Update peer overlays when remoteSelections change or when the container updates
  useEffect(() => {
    if (!remoteSelections) return;
    const root = containerRef.current;
    if (!root) return;

    Object.entries(remoteSelections).forEach(([userId, nodeIds]) => {
      if (!nodeIds || nodeIds.length === 0) {
        // clear overlay for this peer
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
  }, [remoteSelections, updatePeerOverlays]);

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
  }, [remoteSelections, updatePeerOverlays]);

  useLayoutEffect(() => {
    if (selectedElements.length > 0) updateOverlays(selectedElements);
  }, [updateOverlays, selectedElements]);

  // Recompute overlay when the selected element resizes (e.g. text edit changed dimensions)
  useEffect(() => {
    if (selectedElements.length === 0) return;
    // Use ResizeObserver when available to update overlay on size changes
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => updateOverlays(selectedElements));
      selectedElements.forEach(el => ro?.observe(el));
    } catch {
      // ResizeObserver may not be supported in some environments; fall back to window resize
      const onWin = () => updateOverlays(selectedElements);
      window.addEventListener("resize", onWin, { passive: true });
      return () => window.removeEventListener("resize", onWin);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [updateOverlays, selectedElements]);


  function withinContainer(el: Element | null): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false;
    const root = containerRef.current;
    return !!root && root.contains(el);
  }

  function firstElementChildOf(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    let c: Element | null = el.firstElementChild;
    while (c && !(c instanceof HTMLElement)) c = c.nextElementSibling;
    return c instanceof HTMLElement ? c : null;
  }

  function prevSibling(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.previousElementSibling as HTMLElement | null;
  }

  function nextSibling(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.nextElementSibling as HTMLElement | null;
  }

  function parentOf(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return el.parentElement as HTMLElement | null;
  }

  function describe(el: HTMLElement): string {
    return el.tagName.toLowerCase();
  }

  // Sync selection from an external source (e.g. the app after adding a node)
  useEffect(() => {
    // If prop is not provided, do nothing
    if (typeof selectedNodeIds === "undefined") return;
    if (!selectedNodeIds || selectedNodeIds.length === 0) {
      setSelectedElements([]);
      setOverlays([]);
      return;
    }
    // Find the elements by data-node-guid within the container
    const root = containerRef.current;
    if (!root) return;

    const elements: HTMLElement[] = [];
    for (const id of selectedNodeIds) {
      const el = root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null;
      if (el && withinContainer(el)) {
        elements.push(el);
      }
    }

    if (elements.length > 0) {
      setSelectedElements(elements);
      updateOverlays(elements);
      // ensure keyboard focus for further navigation
      containerRef.current?.focus();
    }
  }, [updateOverlays, selectedNodeIds]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!containerRef.current) return;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.key === "Escape") {
      setSelectedElements([]);
      setOverlays([]);
      onSelectedChange?.([], false);
      return;
    }

    if (selectedElements.length === 0) {
      // No selection yet → start at the container itself or its first child
      const start = firstElementChildOf(containerRef.current);
      if (start) {
        setSelectedElements([start]);
        onSelectedChange?.([start.getAttribute("data-node-guid") || ""], false);
      }
      return;
    }

    // For navigation, we use the last selected element as the anchor
    const anchor = selectedElements[selectedElements.length - 1];
    if (!anchor) return;
    let next: HTMLElement | null = null;

    switch (e.key) {
      case "ArrowUp": {
        next = parentOf(anchor);
        break;
      }
      case "ArrowDown": {
        next = firstElementChildOf(anchor);
        break;
      }
      case "ArrowLeft": {
        next = prevSibling(anchor);
        break;
      }
      case "ArrowRight": {
        next = nextSibling(anchor);
        break;
      }
    }

    if (next && next !== anchor) {
      // If shift is held, we might want to extend selection, but for now let's just move selection
      // Or maybe we should support shift+arrow for range selection?
      // The user asked for "either usimg some switch or while holding ctrl or shift" for selection.
      // Standard behavior: Arrow keys move selection (clearing others). Shift+Arrow extends.

      // For now, let's implement simple navigation that clears other selections
      setSelectedElements([next]);
      onSelectedChange?.([next.getAttribute("data-node-guid") || ""], false);
      // Ensure the element is visible without jumping too much
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (!(e.target instanceof HTMLElement)) return;
    if (!withinContainer(e.target)) return;

    const target = e.target;

    // Allow native interaction with form elements unless Ctrl/Meta is held for selection
    const interactiveTags = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"];
    if (interactiveTags.includes(target.tagName) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      return; // Let native behavior handle the click
    }

    const targetId = target.getAttribute("data-node-guid");
    if (!targetId) return;

    let newSelection: HTMLElement[] = [];

    if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      if (selectedElements.some(el => el.getAttribute("data-node-guid") === targetId)) {
        newSelection = selectedElements.filter(el => el.getAttribute("data-node-guid") !== targetId);
      } else {
        newSelection = [...selectedElements, target];
      }
    } else if (e.shiftKey && selectedElements.length > 0) {
      const lastSelected = selectedElements[selectedElements.length - 1];
      if (!lastSelected) {
        newSelection = [target];
      } else {
        const lastId = lastSelected.getAttribute("data-node-guid");

        if (generalizer && lastId && targetId) {
          const generalizedIds = generalizer([lastId, targetId]);
          const root = containerRef.current;
          if (root) {
            newSelection = generalizedIds.map(id => root.querySelector(`[data-node-guid="${id}"]`) as HTMLElement | null).filter((el): el is HTMLElement => !!el && withinContainer(el));
            // This is a generalized selection
            setSelectedElements(newSelection);
            const ids = newSelection.map(el => el.getAttribute("data-node-guid")).filter((id): id is string => !!id);
            onSelectedChange?.(ids, true);
            return;
          } else {
            newSelection = [target];
          }
        } else {
          // Range selection (simplified: just add range between last selected and current if they are siblings)
          // Implementing full range selection in a tree is complex. 
          // Let's try to find all elements between the last selected and the target in document order.

          // Get all navigable elements in the container
          const allNavigable = Array.from(containerRef.current?.querySelectorAll('[data-node-guid]') || []) as HTMLElement[];
          const lastIndex = allNavigable.indexOf(lastSelected);
          const targetIndex = allNavigable.indexOf(target);

          if (lastIndex !== -1 && targetIndex !== -1) {
            const start = Math.min(lastIndex, targetIndex);
            const end = Math.max(lastIndex, targetIndex);
            const range = allNavigable.slice(start, end + 1);

            // Union with existing selection? Or replace? Standard is usually replace with range + anchor.
            // But here we can just set the range.
            newSelection = range;
          } else {
            newSelection = [target];
          }
        }
      }
    } else {
      // Single selection
      newSelection = [target];
    }

    setSelectedElements(newSelection);
    onSelectedChange?.(newSelection.map(el => el.getAttribute("data-node-guid") || "").filter(Boolean), false);
  }

  // Helper function for programmatic navigation
  const navigate = useCallback((getNext: (current: HTMLElement) => HTMLElement | null) => {
    if (selectedElements.length === 0) {
      // No selection yet → start at the first child
      const start = firstElementChildOf(containerRef.current);
      if (start) {
        setSelectedElements([start]);
        onSelectedChange?.([start.getAttribute("data-node-guid") || ""], false);
      }
      return;
    }

    const anchor = selectedElements[selectedElements.length - 1];
    if (!anchor) return;
    const next = getNext(anchor);
    if (next && next !== anchor) {
      setSelectedElements([next]);
      onSelectedChange?.([next.getAttribute("data-node-guid") || ""], false);
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedElements, onSelectedChange]);

  // Expose navigation methods via ref
  useImperativeHandle(forwardedRef, () => ({
    navigateToParent: () => navigate(parentOf),
    navigateToFirstChild: () => navigate(firstElementChildOf),
    navigateToPrevSibling: () => navigate(prevSibling),
    navigateToNextSibling: () => navigate(nextSibling),
    clearSelection: () => {
      setSelectedElements([]);
      setOverlays([]);
      onSelectedChange?.([], false);
    }
  }), [navigate, onSelectedChange]);

  function handleMouseDown(e: React.MouseEvent) {
    // Prevent default text selection when holding Shift (or Ctrl/Meta for multi-select)
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }


  return (
    <div ref={wrapperRef}>


      {/* The navigable container */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>

      {/* Absolute overlay highlighting the currently selected element */}
      {overlays.map(overlay => (
        <div
          key={overlay.id}
          aria-hidden
          className={styles.overlay}
          style={{
            top: overlay.top,
            left: overlay.left,
            width: overlay.width,
            height: overlay.height,
          }}
        >
          {/* Label */}
          <div
            data-testid="overlay-label"
            data-tagname={overlay.label.split("#")[0]?.split(".")[0]}
            className={styles.overlayLabel}
          >
            {overlay.label}
          </div>
        </div>
      ))}

      {/* Peer overlays: subtle, non-interactive highlights for remote selections */}
      {Object.entries(peerOverlays).flatMap(([peerId, overlays]) => {
        const colors = colorFromString(peerId);
        return overlays.map(o => {
          if (!o.visible) return null;
          return (
            <div
              key={`peer-${peerId}-${o.id}`}
              aria-hidden
              className={styles.overlay}
              style={{
                top: o.top,
                left: o.left,
                width: o.width,
                height: o.height,
                background: colors.fill,
                boxShadow: `0 0 0 2px ${colors.subtle}`,
                pointerEvents: "none",
                transition: "all 120ms ease",
              }}
            >
              <div
                data-testid={`peer-overlay-label-${peerId}`}
                className={styles.overlayLabel}
                style={{ background: colors.stroke, color: "#fff", fontSize: 11 }}
              >
                {peerId}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
});

DomNavigator.displayName = 'DomNavigator';
