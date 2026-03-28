import type { PlainNode } from "@mydenicek/core";

type Props = { conflicts: PlainNode[] };

export function ConflictsPanel({ conflicts }: Props) {
  if (conflicts.length === 0) {
    return (
      <p style={{ color: "#888", margin: 0, fontSize: 13 }}>No conflicts.</p>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {conflicts.map((c, i) => (
        <li
          key={i}
          style={{
            background: "#fff4e5",
            border: "1px solid #f7bd4a",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 4,
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          {JSON.stringify(c)}
        </li>
      ))}
    </ul>
  );
}
