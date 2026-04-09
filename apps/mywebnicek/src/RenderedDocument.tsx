import type {
  PlainList,
  PlainNode,
  PlainRecord,
  PlainRef,
} from "@mydenicek/core";
import { evaluateAllFormulas, FormulaError } from "@mydenicek/core";
import React from "react";

function isRec(v: PlainNode): v is PlainRecord {
  return typeof v === "object" && v !== null && "$tag" in v &&
    !("$items" in v) && !("$ref" in v);
}

function isList(v: PlainNode): v is PlainList {
  return typeof v === "object" && v !== null && "$tag" in v && "$items" in v;
}

function isRef(v: PlainNode): v is PlainRef {
  return typeof v === "object" && v !== null && "$ref" in v;
}

const META = new Set(["$tag", "$id", "$kind"]);

const tableStyles: Record<string, React.CSSProperties> = {
  table: {
    borderCollapse: "collapse" as const,
    margin: "8px 0",
    width: "100%",
  },
  th: {
    border: "1px solid #ccc",
    padding: "4px 8px",
    background: "#f0f0f0",
    textAlign: "left" as const,
  },
  td: { border: "1px solid #ccc", padding: "4px 8px" },
};
const HTML_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "header",
  "main",
  "section",
  "article",
  "nav",
  "footer",
  "strong",
  "em",
  "a",
  "img",
  "br",
  "hr",
  "pre",
  "code",
  "button",
  "input",
  "label",
  "form",
  "blockquote",
]);

interface Props {
  doc: PlainNode;
  onAction?: (scriptPath: string) => void;
  onSetValue?: (path: string, value: string) => void;
}

export function RenderedDocument({ doc, onAction, onSetValue }: Props) {
  if (!isRec(doc)) {
    return <div style={{ color: "#888", padding: 20 }}>Empty document</div>;
  }
  const formulaResults = evaluateAllFormulas(doc);
  return (
    <RenderErrorBoundary>
      <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
        {renderNode(doc, "", formulaResults, onAction, onSetValue)}
      </div>
    </RenderErrorBoundary>
  );
}

function renderNode(
  node: PlainNode,
  path: string,
  formulas: Map<string, unknown>,
  onAction?: (scriptPath: string) => void,
  onSetValue?: (path: string, value: string) => void,
): React.ReactNode {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (isList(node)) {
    const listTag = String(node.$tag);
    const htmlListTag = HTML_TAGS.has(listTag) ? listTag : null;
    const items = node.$items.map((item, i) => (
      <React.Fragment key={i}>
        {renderNode(
          item,
          path ? `${path}/${i}` : String(i),
          formulas,
          onAction,
          onSetValue,
        )}
      </React.Fragment>
    ));
    if (htmlListTag) {
      const style = tableStyles[htmlListTag];
      return React.createElement(htmlListTag, style ? { style } : {}, ...items);
    }
    return <>{items}</>;
  }
  if (isRef(node)) {
    return <span style={{ color: "#0078d4" }}>→ {node.$ref}</span>;
  }
  if (!isRec(node)) return null;

  const tag = String(node.$tag);

  // Formula nodes: show computed result inline
  if (tag.startsWith("x-formula")) {
    const op = node["operation"];
    const computed = formulas.get(path);
    const hasResult = computed !== undefined &&
      !(computed instanceof FormulaError);
    return (
      <span
        style={{
          fontFamily: "Consolas, monospace",
          background: hasResult ? "#e8f0fe" : "#fff4e5",
          padding: "1px 6px",
          borderRadius: 3,
          fontSize: "0.9em",
        }}
        title={`ƒ ${op ?? tag}${hasResult ? " = " + String(computed) : ""}`}
      >
        {hasResult ? String(computed) : `ƒ(${op ?? tag})`}
      </span>
    );
  }

  // Skip internal structural tags — don't render as HTML
  if (
    tag === "replay-script" || tag === "event-steps" ||
    tag === "step" || tag === "args" || tag === "refs"
  ) {
    return null;
  }

  // Button: show label, execute script on click
  if (tag === "button") {
    const label = node["label"];
    const scriptPath = `${path}/steps`;
    return (
      <button
        type="button"
        onClick={onAction ? () => onAction(scriptPath) : undefined}
        style={{
          padding: "4px 12px",
          fontSize: 13,
          cursor: onAction ? "pointer" : "default",
          background: "#0078d4",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          margin: "4px 0",
        }}
      >
        {typeof label === "string" ? label : "Button"}
      </button>
    );
  }

  // Input: editable when onSetValue provided
  if (tag === "input") {
    const value = node["value"];
    const valuePath = path ? `${path}/value` : "value";
    return (
      <input
        readOnly={!onSetValue}
        value={typeof value === "string" || typeof value === "number"
          ? String(value)
          : ""}
        onChange={onSetValue
          ? (e) => onSetValue(valuePath, e.target.value)
          : undefined}
        style={{
          padding: "4px 8px",
          fontSize: 13,
          border: "1px solid #ccc",
          borderRadius: 4,
        }}
      />
    );
  }

  // Render children: records recurse, primitives render as text
  const children: React.ReactNode[] = [];
  for (const [key, val] of Object.entries(node)) {
    if (META.has(key) || val === undefined) continue;
    if (isRec(val) || isList(val) || isRef(val)) {
      children.push(
        <React.Fragment key={key}>
          {renderNode(
            val as PlainNode,
            path ? `${path}/${key}` : key,
            formulas,
            onAction,
            onSetValue,
          )}
        </React.Fragment>,
      );
    } else if (
      typeof val === "string" || typeof val === "number" ||
      typeof val === "boolean"
    ) {
      children.push(<React.Fragment key={key}>{String(val)}</React.Fragment>);
    }
  }

  // Only render known HTML tags; unknown tags become <div>
  const htmlTag = HTML_TAGS.has(tag) ? tag : "div";

  // Void elements (no children allowed)
  if (
    htmlTag === "input" || htmlTag === "img" || htmlTag === "br" ||
    htmlTag === "hr"
  ) {
    return React.createElement(htmlTag, {});
  }

  const style = tableStyles[htmlTag];
  return React.createElement(htmlTag, style ? { style } : {}, ...children);
}

/** Catches rendering errors from invalid HTML nesting and shows a message. */
class RenderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 12,
            background: "#fff4e5",
            border: "1px solid #ffb74d",
            borderRadius: 4,
            color: "#e65100",
            fontSize: 13,
          }}
        >
          Render error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}
