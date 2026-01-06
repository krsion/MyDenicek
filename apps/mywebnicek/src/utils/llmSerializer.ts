import { type JsonDoc } from "../types";

export function serializeDocument(doc: JsonDoc): string {
  const nodes = doc.nodes;
  const rootId = doc.root;

  function serializeNode(id: string, depth: number): string {
    const node = nodes[id];
    if (!node) return `<!-- Missing node ${id} -->`;

    const indent = "  ".repeat(depth);

    if (node.kind === "value") {
      return `${indent}<value id="${id}">${node.value}</value>`;
    } else {
      const attrs = Object.entries(node.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      
      const openTag = attrs ? `<${node.tag} id="${id}" ${attrs}>` : `<${node.tag} id="${id}">`;
      
      if (node.children.length === 0) {
        return `${indent}${openTag}</${node.tag}>`;
      }

      const children = node.children
        .map(childId => serializeNode(childId, depth + 1))
        .join("\n");

      return `${indent}${openTag}\n${children}\n${indent}</${node.tag}>`;
    }
  }

  return serializeNode(rootId, 0);
}
