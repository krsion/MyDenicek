

import { makeStyles } from "@fluentui/react-components";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Wrap your content with <DomNavigator> to enable navigation/highlighting within it. */

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

export function DomNavigator({ children, onSelectedChange, selectedNodeId, peerSelections }: { children: React.ReactNode; onSelectedChange?: (nodeId: string | null) => void; selectedNodeId?: string | null, peerSelections?: { [peerId: string]: string | null } }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
    label: string;
  }>({ top: 0, left: 0, width: 0, height: 0, visible: false, label: "" });

  const [peerOverlays, setPeerOverlays] = useState<Record<string, {
    top: number;
    left: number;
    width: number;
    height: number;
    visible: boolean;
    label?: string;
  }>>({});



  const styles = useStyles();

  const positionOverlay = useCallback((el: HTMLElement) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const s = el.getBoundingClientRect();
    const w = wrapper.getBoundingClientRect();
    const label = describe(el);
    setOverlay({
      top: s.top - w.top,
      left: s.left - w.left,
      width: s.width,
      height: s.height,
      visible: true,
      label,
    });
  }, []);

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

  const positionPeerOverlay = useCallback((peerId: string, el: HTMLElement | null) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !el) {
      setPeerOverlays((p) => {
        const next = { ...p };
        delete next[peerId];
        return next;
      });
      return;
    }
    const s = el.getBoundingClientRect();
    const w = wrapper.getBoundingClientRect();
    setPeerOverlays((p) => ({
      ...p,
      [peerId]: {
        top: s.top - w.top,
        left: s.left - w.left,
        width: s.width,
        height: s.height,
        visible: true,
        label: peerId,
      },
    }));
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
      if (selected) positionOverlay(selected);
    }
    window.addEventListener("scroll", onWinChange, { passive: true });
    window.addEventListener("resize", onWinChange, { passive: true });
    return () => {
      window.removeEventListener("scroll", onWinChange);
      window.removeEventListener("resize", onWinChange);
    };
  }, [positionOverlay, selected]);

  // Update peer overlays when peerSelections change or when the container updates
  useEffect(() => {
    if (!peerSelections) return;
    const root = containerRef.current;
    if (!root) return;

    Object.entries(peerSelections).forEach(([peerId, nodeId]) => {
      if (!nodeId) {
        // clear overlay for this peer
        setPeerOverlays((p) => {
          const next = { ...p };
          delete next[peerId];
          return next;
        });
        return;
      }
      const el = root.querySelector(`[data-node-guid="${nodeId}"]`) as HTMLElement | null;
      if (el && withinContainer(el)) {
        positionPeerOverlay(peerId, el);
      } else {
        positionPeerOverlay(peerId, null);
      }
    });
  }, [peerSelections, positionPeerOverlay]);

  // Recompute peer overlays on scroll/resize
  useEffect(() => {
    function onWinChange() {
      if (!peerSelections) return;
      const root = containerRef.current;
      if (!root) return;
      Object.entries(peerSelections).forEach(([peerId, nodeId]) => {
        if (!nodeId) return;
        const el = root.querySelector(`[data-node-guid="${nodeId}"]`) as HTMLElement | null;
        positionPeerOverlay(peerId, el);
      });
    }
    window.addEventListener("scroll", onWinChange, { passive: true });
    window.addEventListener("resize", onWinChange, { passive: true });
    return () => {
      window.removeEventListener("scroll", onWinChange);
      window.removeEventListener("resize", onWinChange);
    };
  }, [peerSelections, positionPeerOverlay]);

  useLayoutEffect(() => {
    if (selected) positionOverlay(selected);
  }, [positionOverlay, selected]);

  // Recompute overlay when the selected element resizes (e.g. text edit changed dimensions)
  useEffect(() => {
    if (!selected) return;
    // Use ResizeObserver when available to update overlay on size changes
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => positionOverlay(selected));
      ro.observe(selected);
    } catch {
      // ResizeObserver may not be supported in some environments; fall back to window resize
      const onWin = () => positionOverlay(selected);
      window.addEventListener("resize", onWin, { passive: true });
      return () => window.removeEventListener("resize", onWin);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [positionOverlay, selected]);


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
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.className && typeof el.className === "string" ?
      "." + (el.className as string).trim().split(/\s+/).join(".") : "";
    return `${tag}${id}${cls}`;
  }

  // Sync selection from an external source (e.g. the app after adding a node)
  useEffect(() => {
    // If prop is not provided, do nothing
    if (typeof selectedNodeId === "undefined") return;
    if (selectedNodeId === null) {
      setSelected(null);
      setOverlay((o) => ({ ...o, visible: false }));
      return;
    }
    // Find the element by data-node-guid within the container
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-node-guid="${selectedNodeId}"]`) as HTMLElement | null;
    if (el && withinContainer(el)) {
      setSelected(el);
      positionOverlay(el);
      // ensure keyboard focus for further navigation
      containerRef.current?.focus();
    }
  }, [positionOverlay, selectedNodeId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!containerRef.current) return;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.key === "Escape") {
      setSelected(null);
      setOverlay((o) => ({ ...o, visible: false }));
      onSelectedChange?.(null);
      return;
    }

    if (!selected) {
      // No selection yet → start at the container itself or its first child
      const start = firstElementChildOf(containerRef.current);
      if (start) {
        setSelected(start);
        onSelectedChange?.(start.getAttribute("data-node-guid") || null);
      }
      return;
    }

    let next: HTMLElement | null = null;

    switch (e.key) {
      case "ArrowLeft": {
        next = parentOf(selected);
        break;
      }
      case "ArrowRight": {
        next = firstElementChildOf(selected);
        break;
      }
      case "ArrowUp": {
        next = prevSibling(selected);
        break;
      }
      case "ArrowDown": {
        next = nextSibling(selected);
        break;
      }
    }

    if (next && next !== selected) {
      setSelected(next);
      onSelectedChange?.(next.getAttribute("data-node-guid") || null);
      // Ensure the element is visible without jumping too much
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (!(e.target instanceof HTMLElement)) return;
    if (!withinContainer(e.target)) return;
    setSelected(e.target);
    onSelectedChange?.(e.target.getAttribute("data-node-guid") || null);
  }


  return (
    <div ref={wrapperRef}>


      {/* The navigable container */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
      >
        {children}
      </div>

      {/* Absolute overlay highlighting the currently selected element */}
      {overlay.visible && (
        <div
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
            data-tagname={overlay.label.split("#")[0].split(".")[0]}
            className={styles.overlayLabel}
          >
            {overlay.label}
          </div>
        </div>
      )}

      {/* Peer overlays: subtle, non-interactive highlights for remote selections */}
      {Object.entries(peerOverlays).map(([peerId, o]) => {
        if (!o.visible) return null;
        const colors = colorFromString(peerId);
        return (
          <div
            key={`peer-${peerId}`}
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
      })}
    </div>
  );
}
