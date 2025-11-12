import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Arrow-key DOM navigator for a given container.
 *
 * Keys:
 *  - Left  ← : go to parent element ("go out")
 *  - Right → : go to first child element ("go in")
 *  - Up    ↑ : previous sibling element
 *  - Down  ↓ : next sibling element
 *  - Esc      : clear selection
 *
 * Notes:
 *  - Navigation is clamped to the provided container.
 *  - A translucent overlay highlights the currently selected element without changing layout.
 */
export default function App() {
  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ margin: "16px 16px 8px" }}>DOM Navigator (React + TS, Vite)</h1>
      <p style={{ margin: "0 16px 16px", color: "#555" }}>
        Click anywhere inside the gray box below, then use your arrow keys. Left = parent, Right = first child, Up = previous sibling, Down = next sibling. Esc clears.
      </p>

      <DomNavigator enableDevSmokeTests>
        {/* --- Demo content you can replace with your own tree --- */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} data-testid="section">
          <article style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd" }} data-testid="article-a">
            <h2>Article A</h2>
            <p>
              Lorem <strong>ipsum</strong> dolor sit amet, <em>consectetur</em> adipiscing elit.
            </p>
            <ul>
              <li>Item A1</li>
              <li>Item A2</li>
              <li>Item A3</li>
            </ul>
          </article>
          <article style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd" }} data-testid="article-b">
            <h2>Article B</h2>
            <p>
              Sed do eiusmod tempor <code>incididunt</code> ut labore et dolore magna aliqua.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button>Button 1</button>
              <button>Button 2</button>
              <button>Button 3</button>
            </div>
          </article>
          <article style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #ddd", gridColumn: "span 2" }} data-testid="article-c">
            <h2>Article C</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} style={{ padding: 12, background: "#f7f7f7", border: "1px dashed #ccc", borderRadius: 6 }}>
                  Box {i + 1}
                </div>
              ))}
            </div>
          </article>
        </section>
      </DomNavigator>
    </div>
  );
}

/** Wrap your content with <DomNavigator> to enable navigation/highlighting within it. */
function DomNavigator({ children, enableDevSmokeTests = false }: { children: React.ReactNode; enableDevSmokeTests?: boolean }) {
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
    let c = el.firstElementChild as HTMLElement | null;
    while (c && !(c instanceof HTMLElement)) c = c.nextElementSibling as HTMLElement | null;
    return c;
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!containerRef.current) return;

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.key === "Escape") {
      setSelected(null);
      setOverlay((o) => ({ ...o, visible: false }));
      return;
    }

    if (!selected) {
      // No selection yet → start at the container itself or its first child
      const start = firstElementChildOf(containerRef.current);
      if (start) setSelected(start);
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
      // Ensure the element is visible without jumping too much
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (!(e.target instanceof HTMLElement)) return;
    if (!withinContainer(e.target)) return;
    setSelected(e.target);
  }

  // ————————————————————————————————————————————————————————————
  // Dev Smoke Tests (run in dev builds only)
  // Simulate a few key presses and assert the visited nodes.
  useEffect(() => {
    const isDev = (import.meta as any)?.env?.MODE !== "production";
    if (!enableDevSmokeTests || !isDev) return;
    const host = containerRef.current;
    if (!host) return;

    // Helper to dispatch a key event to the container
    const send = (key: string) => {
      const evt = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      host.dispatchEvent(evt);
    };

    // Give the app a tick to mount and focus
    const t = setTimeout(() => {
      // Sequence: Right (selects first child = <section>),
      // Right (go to first child = first <article>),
      // Down (next sibling = second <article>),
      // Left (parent = <section>)
      const expected: string[] = ["section", "article", "article", "section"];
      const seen: string[] = [];

      const stop = new MutationObserver(() => {
        if (!wrapperRef.current) return;
        const labelEl = wrapperRef.current.querySelector('[data-testid="overlay-label"]');
        if (labelEl) {
          const tag = (labelEl as HTMLElement).dataset.tagname;
          if (tag && (seen.length === 0 || seen[seen.length - 1] !== tag)) {
            seen.push(tag);
          }
        }
      });

      stop.observe(document.body, { subtree: true, childList: true, attributes: true });

      send("ArrowRight");
      send("ArrowRight");
      send("ArrowDown");
      send("ArrowLeft");

      setTimeout(() => {
        stop.disconnect();
        const pass = expected.every((v, i) => v === (seen[i] || ""));
        console.assert(pass, `DOM Navigator smoke test failed. Expected ${expected.join(" → ")}, got ${seen.join(" → ")}`);
        if (pass) console.info("DOM Navigator smoke test passed.");
      }, 50);
    }, 50);

    return () => clearTimeout(t);
  }, [enableDevSmokeTests]);
  // ————————————————————————————————————————————————————————————

  return (
    <div ref={wrapperRef} style={{ position: "relative", margin: 16 }}>
      {/* Navigation help */}
      <div
        style={{
          fontSize: 12,
          color: "#333",
          background: "#eef2ff",
          border: "1px solid #c7d2fe",
          borderRadius: 8,
          padding: "8px 10px",
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Kbd>←</Kbd> Parent <Kbd>→</Kbd> First child <Kbd>↑</Kbd> Prev sibling <Kbd>↓</Kbd> Next sibling <Kbd>Esc</Kbd> Clear
      </div>

      {/* The navigable container */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        style={{
          position: "relative",
          outline: "none",
          background: "#f3f4f6",
          border: "1px solid #e5e7eb",
          padding: 16,
          borderRadius: 12,
          minHeight: 240,
        }}
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        padding: "0 6px",
        height: 22,
        borderRadius: 6,
        border: "1px solid #d1d5db",
        background: "#fff",
        boxShadow: "inset 0 -1px 0 #e5e7eb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      }}
    >
      {children}
    </span>
  );
}
