export const DENICEK_TOOLS = [
  {
    type: "function",
    function: {
      name: "updateAttribute",
      description: "Update or remove an attribute of specific elements.",
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", items: { type: "string" }, description: "List of element IDs to update." },
          key: { type: "string", description: "The attribute name (e.g., 'style', 'class')." },
          value: { type: "string", description: "The new value. If omitted, the attribute is removed." }
        },
        required: ["nodeIds", "key"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateTag",
      description: "Change the tag name of specific elements.",
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", items: { type: "string" }, description: "List of element IDs to update." },
          newTag: { type: "string", description: "The new tag name (e.g., 'div', 'span')." }
        },
        required: ["nodeIds", "newTag"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "wrapNodes",
      description: "Wrap specific elements with a new parent element.",
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", items: { type: "string" }, description: "List of element IDs to wrap." },
          wrapperTag: { type: "string", description: "The tag name of the wrapper element." }
        },
        required: ["nodeIds", "wrapperTag"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "updateValue",
      description: "Update the text content of a value node.",
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", items: { type: "string" }, description: "List of value node IDs to update." },
          newValue: { type: "string", description: "The new text content." },
          originalValue: { type: "string", description: "The original text content (for conflict resolution)." }
        },
        required: ["nodeIds", "newValue", "originalValue"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "addChildren",
      description: "Add a new child node to specific parent elements.",
      parameters: {
        type: "object",
        properties: {
          parentIds: { type: "array", items: { type: "string" }, description: "List of parent element IDs." },
          type: { type: "string", enum: ["element", "value"], description: "The type of node to add." },
          content: { type: "string", description: "The tag name (for elements) or text content (for values)." },
          temporaryId: { type: "string", description: "Optional. A temporary ID (e.g. 'temp-1') to assign to the new node. Use this if you need to reference the new node in the same request." }
        },
        required: ["parentIds", "type", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deleteNodes",
      description: "Delete specific nodes from the document.",
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", items: { type: "string" }, description: "List of node IDs to delete." }
        },
        required: ["nodeIds"]
      }
    }
  }
];

export interface DenicekActions {
  updateAttribute: (nodeIds: string[], key: string, value: unknown | undefined) => void;
  updateTag: (nodeIds: string[], newTag: string) => void;
  wrapNodes: (nodeIds: string[], wrapperTag: string) => void;
  updateValue: (nodeIds: string[], newValue: string, originalValue: string) => void;
  addChildren: (parentIds: string[], type: "element" | "value", content: string) => string[];
  deleteNodes: (nodeIds: string[]) => void;
}
