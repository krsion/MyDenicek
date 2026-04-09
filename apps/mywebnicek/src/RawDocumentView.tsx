import type { PlainNode } from "@mydenicek/react";
import React from "react";

interface RawDocumentViewProps {
  doc: PlainNode;
}

const COLORS = {
  key: "#0078d4",
  string: "#107c10",
  number: "#ca5010",
  keyword: "#8764b8",
  brace: "#888",
  tag: "#008080",
} as const;

// Matches JSON tokens: strings, numbers, booleans, null, braces/brackets, colons, commas
const TOKEN_RE =
  /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)\b|([{}[\]])|([,:]\s*)/g;

function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = TOKEN_RE.exec(json)) !== null) {
    // Preserve whitespace between tokens
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index));
    }
    lastIndex = match.index + match[0].length;

    if (match[1] !== undefined) {
      // Key (string followed by colon)
      const keyText = match[1];
      nodes.push(
        <span key={key++} style={{ color: COLORS.key }}>{keyText}</span>,
      );
      nodes.push(": ");
    } else if (match[2] !== undefined) {
      // Detect $tag values: the previous meaningful token should be a "$tag" key
      const isTagValue = isAfterTagKey(json, match.index);
      nodes.push(
        <span
          key={key++}
          style={{ color: isTagValue ? COLORS.tag : COLORS.string }}
        >
          {match[2]}
        </span>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: COLORS.number }}>{match[3]}</span>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: COLORS.keyword }}>{match[4]}</span>,
      );
    } else if (match[5] !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: COLORS.brace }}>{match[5]}</span>,
      );
    } else if (match[6] !== undefined) {
      nodes.push(match[6]);
    }
  }

  // Trailing text
  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex));
  }

  return nodes;
}

/** Check whether the string value at `pos` immediately follows a `"$tag":` key. */
function isAfterTagKey(json: string, pos: number): boolean {
  // Walk backwards past whitespace and the colon
  let i = pos - 1;
  while (i >= 0 && (json[i] === " " || json[i] === "\n" || json[i] === "\r")) {
    i--;
  }
  if (i < 0 || json[i] !== ":") return false;
  i--;
  while (i >= 0 && (json[i] === " " || json[i] === "\n" || json[i] === "\r")) {
    i--;
  }
  if (i < 0 || json[i] !== '"') return false;
  // Check if the key ending here is "$tag"
  const keyEnd = i;
  const candidate = json.slice(keyEnd - 4, keyEnd + 1);
  return candidate === '"$tag"';
}

const containerStyle: React.CSSProperties = {
  fontFamily: "Consolas, 'Courier New', monospace",
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: "pre",
  overflow: "auto",
  padding: 16,
  margin: 0,
  background: "#fafafa",
  border: "1px solid #e0e0e0",
  borderRadius: 4,
  height: "100%",
  boxSizing: "border-box",
};

export function RawDocumentView({ doc }: RawDocumentViewProps) {
  const json = JSON.stringify(doc, null, 2);
  const highlighted = highlightJson(json);

  return <pre style={containerStyle}>{highlighted}</pre>;
}
