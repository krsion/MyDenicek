

import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import { Tag, TagGroup, Card } from "@fluentui/react-components";

/** Wrap your content with <DomNavigator> to enable navigation/highlighting within it. */

export function DomNavigator({ children, onSelectedChange, selectedElement }: { children: React.ReactNode; onSelectedChange?: (el: HTMLElement | null) => void; selectedElement?: HTMLElement | null }) {
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
  }, [selected]);

  useLayoutEffect(() => {
    if (selected) positionOverlay(selected);
  }, [selected]);

  // Recompute overlay when the selected element resizes (e.g. text edit changed dimensions)
  useEffect(() => {
    if (!selected) return;
    // Use ResizeObserver when available to update overlay on size changes
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => positionOverlay(selected));
      ro.observe(selected);
    } catch (err) {
      // ResizeObserver may not be supported in some environments; fall back to window resize
      const onWin = () => positionOverlay(selected);
      window.addEventListener("resize", onWin, { passive: true });
      return () => window.removeEventListener("resize", onWin);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [selected]);

  function positionOverlay(el: HTMLElement) {
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
  }

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
    if (typeof selectedElement === "undefined") return;
    if (selectedElement === null) {
      setSelected(null);
      setOverlay((o) => ({ ...o, visible: false }));
      return;
    }
    if (withinContainer(selectedElement)) {
      setSelected(selectedElement);
      positionOverlay(selectedElement);
      // ensure keyboard focus for further navigation
      containerRef.current?.focus();
    }
  }, [selectedElement]);

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
        onSelectedChange?.(start);
      }
      return;
    }

    let next: HTMLElement | null = null;

    switch (e.key) {
      case "ArrowLeft": {
        const p = parentOf(selected);
        next = withinContainer(p) ? p : selected; // clamp at container edge
        break;
      }
      case "ArrowRight": {
        const c = firstElementChildOf(selected);
        next = withinContainer(c) ? c : selected; // no-op if no children
        break;
      }
      case "ArrowUp": {
        const p = prevSibling(selected);
        next = withinContainer(p) ? p : selected; // no-op if none
        break;
      }
      case "ArrowDown": {
        const n = nextSibling(selected);
        next = withinContainer(n) ? n : selected; // no-op if none
        break;
      }
    }

    if (next && next !== selected) {
      setSelected(next);
      onSelectedChange?.(next);
      // Ensure the element is visible without jumping too much
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (!(e.target instanceof HTMLElement)) return;
    if (!withinContainer(e.target)) return;
    setSelected(e.target);
    onSelectedChange?.(e.target);
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
          style={{
            position: "absolute",
            top: overlay.top,
            left: overlay.left,
            width: overlay.width,
            height: overlay.height,
            pointerEvents: "none",
            borderRadius: 6,
            boxShadow: "0 0 0 2px rgba(59,130,246,0.9), 0 0 0 6px rgba(59,130,246,0.2)",
            background: "rgba(59,130,246,0.10)",
            transition: "all 120ms ease",
          }}
        >
          {/* Label */}
          <div
            data-testid="overlay-label"
            data-tagname={overlay.label.split("#")[0].split(".")[0]}
            style={{
              position: "absolute",
              top: -24,
              left: 0,
              padding: "2px 6px",
              fontSize: 11,
              background: "#1f2937",
              color: "#fff",
              borderRadius: 4,
              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            {overlay.label}
          </div>
        </div>
      )}
    </div>
  );
}
