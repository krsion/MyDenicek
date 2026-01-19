import { type DenicekDocument } from "@mydenicek/core-v2";

export function serializeDocument(doc: DenicekDocument): string {
  const rootId = doc.getRootId();
  if (!rootId) return "<!-- Empty document -->";

  function serializeNode(id: string, depth: number): string {
    const node = doc.getNode(id);
    if (!node) return `<!-- Missing node ${id} -->`;

    const indent = "  ".repeat(depth);

    if (node.kind === "value") {
      return `${indent}<value id="${id}">${node.value}</value>`;
    } else {
      const attrs = Object.entries(node.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");

      const openTag = attrs ? `<${node.tag} id="${id}" ${attrs}>` : `<${node.tag} id="${id}">`;

      const childIds = doc.getChildIds(id);
      if (childIds.length === 0) {
        return `${indent}${openTag}</${node.tag}>`;
      }

      const children = childIds
        .map(childId => serializeNode(childId, depth + 1))
        .join("\n");

      return `${indent}${openTag}\n${children}\n${indent}</${node.tag}>`;
    }
  }

  return serializeNode(rootId, 0);
}
