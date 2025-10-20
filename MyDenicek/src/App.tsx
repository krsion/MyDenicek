import React from "react";
import "./App.css";
// ...existing code...
const EDGE_ID = 0, NODE_ID_FROM = 1, NODE_TYPE_FROM = 2, POSITION_FROM = 3, NODE_ID_TO = 4, NODE_TYPE_TO = 5, STATUS = 6;

const edges = [
  ["edge0", "node0",  "<div>", "content", "node1", "linkedList", "active"],
  ["edge1", "node1", "linkedList", "head", "node2", "<a>", "active"],
  ["edge2", "node2", "<a>", "href", "node3", "attribute", "active"],
  ["edge3", "node3", "attribute", "value", "node6", 'string("http://example.com")', "active"],
  ["edge7", "node2", "<a>", "content", "node7", 'string("Click here")', "active"],
  ["edge4", "node1", "linkedList", "tail", "node4", "linkedList", "active"],
  ["edge5", "node4", "linkedList", "head", "node5", "<p>", "active"],
  ["edge6", "node5", "<p>", "content", "node8", 'string("Hello, world!")', "active"],
];

function extractString(nodeType: string) {
  if (typeof nodeType === "string" && nodeType.startsWith('string("') && nodeType.endsWith('")')) {
    return nodeType.slice(8, -2);
  }
  return String(nodeType);
}

function renderNode(edgesArr: Array<Array<string>>, rootNodeId: string, rootNodeType: string): React.ReactNode | string {
  const edgesFromRoot = edgesArr.filter(e => e[NODE_ID_FROM] === rootNodeId && e[STATUS] === "active");
  if (edgesFromRoot.length === 0) {
    // leaf: either a string node or fallback text
    if (rootNodeType && rootNodeType.startsWith && rootNodeType.startsWith('string("')) {
      return extractString(rootNodeType);
    }
    return extractString(rootNodeType);
  }

  const fromType = edgesFromRoot[0][NODE_TYPE_FROM];

  if (fromType === "attribute") {
    // attribute node -> return its value (string)
    const valueEdge = edgesArr.find(e => e[NODE_ID_FROM] === rootNodeId && e[POSITION_FROM] === "value" && e[STATUS] === "active");
    if (valueEdge && valueEdge[NODE_TYPE_TO].startsWith('string("')) {
      return extractString(valueEdge[NODE_TYPE_TO]);
    }
    // fallback: try to render child node
    if (valueEdge) return renderNode(edgesArr, valueEdge[NODE_ID_TO], valueEdge[NODE_TYPE_TO]);
    return "";
  }

  if (fromType && fromType.startsWith("<") && fromType.endsWith(">")) {
    const tag = fromType.slice(1, -1);
    // attributes
    const attributesEdges = edgesFromRoot.filter(e => e[NODE_TYPE_TO] === "attribute");
    const attrs: { [key: string]: string } = {};
    attributesEdges.forEach(attrEdge => {
      const attrName = attrEdge[POSITION_FROM];
      const attrNodeId = attrEdge[NODE_ID_TO];
      // find value child on attribute node
      const valueEdge = edgesArr.find(e => e[NODE_ID_FROM] === attrNodeId && e[POSITION_FROM] === "value" && e[STATUS] === "active");
      let value: React.ReactNode;
      if (valueEdge) {
        if (valueEdge[NODE_TYPE_TO].startsWith('string("')) value = attrs[attrName] = extractString(valueEdge[NODE_TYPE_TO]);
        else value = renderNode(edgesArr, valueEdge[NODE_ID_TO], valueEdge[NODE_TYPE_TO]);
      }    
    });

    // content children
    const contentEdges = edgesFromRoot.filter(e => e[POSITION_FROM] === "content");
    const children = contentEdges.map(ce => renderNode(edgesArr, ce[NODE_ID_TO], ce[NODE_TYPE_TO]));

    // return element with node id as key (helps React)
    return React.createElement(tag, { key: rootNodeId, ...attrs }, ...(children.length ? children : []));
  }

  if (fromType === "linkedList") {
    const headEdges = edgesFromRoot.filter(e => e[POSITION_FROM] === "head");
    const tailEdges = edgesFromRoot.filter(e => e[POSITION_FROM] === "tail");
    const items: React.ReactNode[] = [];
    headEdges.forEach(h => items.push(renderNode(edgesArr, h[NODE_ID_TO], h[NODE_TYPE_TO])));
    tailEdges.forEach(t => items.push(renderNode(edgesArr, t[NODE_ID_TO], t[NODE_TYPE_TO])));
    return React.createElement(React.Fragment, { key: rootNodeId }, ...items);
  }

  return null;
}

export default function App() {
  // root is node0 with type <div>
  return (
    <>
      {renderNode(edges, "node0", "<div>")}
    </>
  );
}