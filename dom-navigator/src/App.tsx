import { DomNavigator } from "./DomNavigator";
import { useMemo, useState } from "react";

export default function App() {
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [wrapTag, setWrapTag] = useState("div");
  const [wrapMessage, setWrapMessage] = useState<string | null>(null);

  const details = useMemo(() => {
    if (!selectedEl) return null;
    const tag = selectedEl.tagName.toLowerCase();
    const id = selectedEl.id || null;
    const classes = Array.from(selectedEl.classList);
    const rect = selectedEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dataTestId = selectedEl.getAttribute("data-testid");
    const text = (selectedEl.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120);

    const pathParts: string[] = [];
    let node: HTMLElement | null = selectedEl;
    let depth = 0;
    while (node) {
      const part = `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}`;
      pathParts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    const path = pathParts.join("/");

    return { tag, id, classes, width, height, dataTestId, text, path };
  }, [selectedEl]);

  return (
    <div style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>

  <DomNavigator onSelectedChange={setSelectedEl}>
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
      <div style={{ margin: 16, fontSize: 13, color: "#444", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
        {details ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 4, columnGap: 8 }}>
            <div style={{ color: "#666" }}>Tag</div><div>{details.tag}</div>
            <div style={{ color: "#666" }}>Id</div><div>{details.id ?? <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Classes</div><div>{details.classes.length ? details.classes.join(" ") : <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Size</div><div>{details.width} × {details.height}px</div>
            <div style={{ color: "#666" }}>data-testid</div><div>{details.dataTestId ?? <span style={{ color: "#999" }}>(none)</span>}</div>
            <div style={{ color: "#666" }}>Path</div><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{details.path}</div>
            <div style={{ color: "#666" }}>Text</div><div style={{ color: "#222" }}>{details.text || <span style={{ color: "#999" }}>(empty)</span>}</div>
          </div>
        ) : (
          <span style={{ color: "#777" }}>Selected: (none)</span>
        )}
      </div>

      {/* Wrap selected element UI */}
      <div style={{ margin: 16, fontSize: 13, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setWrapMessage(null);
            const tag = wrapTag.trim().toLowerCase();
            if (!selectedEl) {
              setWrapMessage("Nothing selected to wrap.");
              return;
            }
            if (!tag || !/^[a-z][a-z0-9-]*$/.test(tag)) {
              setWrapMessage("Invalid tag name.");
              return;
            }
            const parent = selectedEl.parentElement;
            if (!parent) {
              setWrapMessage("Selected element has no parent; cannot wrap.");
              return;
            }
            // Create wrapper and insert it.
            const wrapper = document.createElement(tag);
            wrapper.style.outline = "1px dashed #94a3b8"; // visual hint
            parent.replaceChild(wrapper, selectedEl);
            wrapper.appendChild(selectedEl);
            // Let DomNavigator update selection (click bubbles to container)
            wrapper.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            setWrapMessage(`Wrapped <${selectedEl.tagName.toLowerCase()}> in <${tag}>.`);
          }}
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#555" }}>Wrap in</span>
            <input
              value={wrapTag}
              onChange={(e) => setWrapTag(e.target.value)}
              placeholder="e.g. div"
              style={{
                padding: "4px 6px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                fontSize: 13,
                minWidth: 90,
                background: "#fff",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={!selectedEl}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              background: selectedEl ? "#2563eb" : "#94a3b8",
              color: "#fff",
              border: "none",
              cursor: selectedEl ? "pointer" : "not-allowed",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }}
          >
            Wrap
          </button>
          <small style={{ color: "#64748b" }}>Common tags: div, section, article, span, p</small>
        </form>
        {wrapMessage && (
          <div style={{ marginTop: 6, color: wrapMessage.startsWith("Wrapped") ? "#166534" : "#991b1b" }}>
            {wrapMessage}
          </div>
        )}
        {!selectedEl && (
          <div style={{ marginTop: 6, color: "#777" }}>Select an element first using arrows or clicking.</div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
          Note: Wrapping directly manipulates the DOM outside React's virtual DOM. For production, consider representing the tree in state and rendering the wrapper via React instead.
        </div>
      </div>
    </div>
  );
}
