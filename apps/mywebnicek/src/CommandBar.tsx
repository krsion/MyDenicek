import type {
  PlainList,
  PlainNode,
  PlainRecord,
  PlainRef,
  PrimitiveValue,
} from "@mydenicek/core";
import type { UseDenicekReturn } from "@mydenicek/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CommandBarProps {
  dk: UseDenicekReturn;
}

interface OutputMessage {
  text: string;
  kind: "success" | "error" | "info";
}

// ── Type guards ──────────────────────────────────────────────────────────

function isPlainRecord(node: PlainNode): node is PlainRecord {
  return typeof node === "object" && node !== null && "$tag" in node &&
    !("$items" in node) && !("$ref" in node);
}

function isPlainList(node: PlainNode): node is PlainList {
  return typeof node === "object" && node !== null && "$tag" in node &&
    "$items" in node;
}

function isPlainRef(node: PlainNode): node is PlainRef {
  return typeof node === "object" && node !== null && "$ref" in node;
}

function isPrimitive(node: PlainNode): node is PrimitiveValue {
  return typeof node === "string" || typeof node === "number" ||
    typeof node === "boolean";
}

// ── Tree rendering ───────────────────────────────────────────────────────

function renderTree(
  node: PlainNode,
  path: string,
  indent: number,
  lines: string[],
  maxDepth = 20,
): void {
  if (indent > maxDepth) {
    lines.push(`${"  ".repeat(indent)}...`);
    return;
  }
  const prefix = "  ".repeat(indent);

  if (isPrimitive(node)) {
    lines.push(
      `${prefix}${typeof node === "string" ? `"${node}"` : String(node)}`,
    );
    return;
  }
  if (isPlainRef(node)) {
    lines.push(`${prefix}-> ${node.$ref}`);
    return;
  }
  if (isPlainList(node)) {
    lines.push(`${prefix}${path} [${node.$tag}] (${node.$items.length} items)`);
    node.$items.forEach((item, i) => {
      renderTree(item, `${i}`, indent + 1, lines, maxDepth);
    });
    return;
  }
  if (isPlainRecord(node)) {
    const tag = node.$tag as string;
    const kind = node["$kind"] as string | undefined;
    const SKIP = new Set(["$tag", "$id", "$kind", "$order"]);

    if (kind === "value") {
      const val = node["value"];
      lines.push(
        `${prefix}${path} = ${
          typeof val === "string" ? `"${val}"` : String(val)
        }`,
      );
      return;
    }
    if (kind === "ref") {
      lines.push(`${prefix}${path} → ${node["target"]}`);
      return;
    }
    if (kind === "formula") {
      lines.push(`${prefix}${path} ƒ(${node["operation"]})`);
    } else if (kind === "action") {
      lines.push(`${prefix}${path} ▶ "${node["label"]}"`);
      return;
    } else {
      lines.push(`${prefix}{} ${path} <${tag}>`);
    }

    for (const [key, child] of Object.entries(node)) {
      if (SKIP.has(key)) continue;
      if (
        child !== undefined && typeof child === "object" && child !== null &&
        "$tag" in child
      ) {
        renderTree(child as PlainNode, key, indent + 1, lines, maxDepth);
      } else if (child !== undefined && !SKIP.has(key)) {
        const isKnownField = key === "value" || key === "label" ||
          key === "operation" || key === "target" || key === "actions" ||
          key === "params";
        if (!isKnownField) {
          lines.push(
            `${prefix}  @${key}=${
              typeof child === "string" ? `"${child}"` : String(child)
            }`,
          );
        }
      }
    }
  }
}

// ── Navigate to nodes in the plain tree ───────────────────────────────

/** Navigate through path expanding `*` wildcards. Returns all matching nodes. */
function navigateToAll(
  root: PlainNode,
  segments: string[],
): PlainNode[] {
  let current: PlainNode[] = [root];
  for (const seg of segments) {
    const next: PlainNode[] = [];
    for (const node of current) {
      if (seg === "*") {
        if (isPlainList(node)) {
          next.push(...node.$items);
        } else if (isPlainRecord(node)) {
          for (const [key, child] of Object.entries(node)) {
            if (!META_KEYS.has(key) && child !== undefined) {
              next.push(child as PlainNode);
            }
          }
        }
      } else if (isPlainRecord(node)) {
        if (seg in node && !META_KEYS.has(seg)) {
          next.push(node[seg] as PlainNode);
        }
      } else if (isPlainList(node)) {
        const idx = Number(seg);
        if (!Number.isNaN(idx) && idx >= 0 && idx < node.$items.length) {
          next.push(node.$items[idx]!);
        }
      }
    }
    if (next.length === 0) return [];
    current = next;
  }
  return current;
}

const META_KEYS = new Set(["$tag", "$id", "$kind", "$order"]);

interface CompletionItem {
  name: string;
  label: string;
}

function describeChild(key: string, child: PlainNode): CompletionItem {
  if (isPlainRecord(child)) {
    const kind = child["$kind"] as string | undefined;
    const tag = child["$tag"] as string;
    if (kind === "value") {
      const val = child["value"];
      const display = typeof val === "string"
        ? `"${val.length > 20 ? val.slice(0, 20) + "…" : val}"`
        : String(val);
      return { name: key, label: `${key} = ${display}` };
    }
    if (kind === "ref") {
      return { name: key, label: `${key} → ${child["target"]}` };
    }
    if (kind === "formula") {
      return { name: key, label: `${key} ƒ(${child["operation"]})` };
    }
    if (kind === "action") {
      return { name: key, label: `${key} ▶ "${child["label"]}"` };
    }
    return { name: key, label: `{} ${key} <${tag}>` };
  }
  if (isPlainList(child)) {
    return {
      name: key,
      label: `${key} [${child.$tag}] (${child.$items.length} items)`,
    };
  }
  if (isPlainRef(child)) {
    return { name: key, label: `${key} → ${child.$ref}` };
  }
  if (typeof child === "string") {
    const display = child.length > 25 ? child.slice(0, 25) + "…" : child;
    return { name: key, label: `${key}: "${display}"` };
  }
  return { name: key, label: `${key}: ${String(child)}` };
}

function getChildCompletions(node: PlainNode): CompletionItem[] {
  if (isPlainList(node)) {
    const items: CompletionItem[] = [];
    if (node.$items.length > 0) {
      items.push({
        name: "*",
        label: `* (all ${node.$items.length} items)`,
      });
    }
    node.$items.forEach((item, i) => {
      items.push(describeChild(String(i), item));
    });
    return items;
  }
  if (!isPlainRecord(node)) return [];
  const items: CompletionItem[] = [];
  for (const key of Object.keys(node)) {
    if (META_KEYS.has(key)) continue;
    const child = node[key];
    if (child === undefined) continue;
    items.push(describeChild(key, child as PlainNode));
  }
  return items;
}

/** Completions common to ALL nodes (for wildcard expansion). */
function intersectCompletions(nodes: PlainNode[]): CompletionItem[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return getChildCompletions(nodes[0]!);

  const allCompletions = nodes.map((n) => getChildCompletions(n));
  const nameCount = new Map<string, number>();
  for (const items of allCompletions) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        nameCount.set(item.name, (nameCount.get(item.name) ?? 0) + 1);
      }
    }
  }
  const commonNames = new Set<string>();
  for (const [name, count] of nameCount) {
    if (count === nodes.length) commonNames.add(name);
  }

  return allCompletions[0]!
    .filter((item) => commonNames.has(item.name))
    .map((item) => ({
      name: item.name,
      label: `${item.name} (×${nodes.length})`,
    }));
}

// ── Parse value argument — try JSON first, fall back to string ──────────

function parseValue(raw: string): PlainNode {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as PlainNode;
    } catch { /* fall through */ }
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== "") return num;
  return trimmed;
}

// ── Commands by node context ─────────────────────────────────────────────

/** Commands that require a selector (typed first). */
const RECORD_CMDS = [
  "add",
  "delete",
  "rename",
  "updateTag",
  "wrapRecord",
  "wrapList",
  "copy",
  "formula",
  "get",
  "tree",
];
const LIST_CMDS = [
  "pushBack",
  "pushFront",
  "popBack",
  "popFront",
  "updateTag",
  "wrapRecord",
  "wrapList",
  "copy",
  "get",
  "tree",
];
const PRIMITIVE_CMDS = ["set", "get"];
const ANY_NODE_CMDS = ["get", "tree", "copy", "wrapRecord", "wrapList"];

/** Commands that work without a selector. */
const BARE_CMDS = ["undo", "redo", "help", "tree"];

// Ghost hints: command → [remaining args after command]
const ARG_HINTS: Record<string, string[]> = {
  add: ["<field>", "<value>"],
  delete: ["<field>"],
  rename: ["<old>", "<new>"],
  set: ["<value>"],
  pushBack: ["<value>"],
  pushFront: ["<value>"],
  updateTag: ["<tag>"],
  wrapRecord: ["<field>", "<tag>"],
  wrapList: ["<tag>"],
  copy: ["<source-selector>"],
  formula: ["<field>", "<operation>", "<ref|value> ..."],
};

const FORMULA_OPS = [
  "sum",
  "product",
  "mod",
  "round",
  "floor",
  "ceil",
  "abs",
  "concat",
  "uppercase",
  "lowercase",
  "capitalize",
  "trim",
  "length",
  "replace",
  "countChildren",
];

const HELP_TEXT = `Syntax: /selector command [args...]   or   command

Examples:
  /header/title set Hello         Set a value
  /items pushBack {"$tag":"li"}   Append to a list
  /items/* get                    Get all list items
  /counter add total formula ...  Add a formula

Commands (shown after selecting a path):
  add <field> <value|json>        Add a field
  delete <field>                  Delete a field
  rename <old> <new>              Rename a field
  set <value>                     Set a primitive value
  pushBack / pushFront <value>    Add to list
  popBack / popFront              Remove from list
  updateTag <tag>                 Update structural tag
  wrapRecord <field> <tag>        Wrap in a record
  wrapList <tag>                  Wrap in a list
  copy <source-selector>          Copy nodes
  formula <field> <op> [args]     Add a formula node
  get                             Show node value
  tree                            Show subtree

Standalone:
  undo / redo                     Undo or redo
  tree                            Show full document tree
  help                            Show this help

Formula ops: ${FORMULA_OPS.join(", ")}
Selectors: /path, /list/*, /list/*/field. Tab to auto-complete.`;

/** Return commands valid for the given node type. */
function commandsForNode(node: PlainNode): string[] {
  if (isPlainList(node)) return LIST_CMDS;
  if (isPlainRecord(node)) return RECORD_CMDS;
  if (isPrimitive(node)) return PRIMITIVE_CMDS;
  return ANY_NODE_CMDS;
}

// ── Component ────────────────────────────────────────────────────────────

export function CommandBar({ dk }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [output, setOutput] = useState<OutputMessage[]>([]);
  const [ghostText, setGhostText] = useState("");
  const [completions, setCompletions] = useState<CompletionItem[]>([]);
  const [completionIdx, setCompletionIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The materialized tree comes from the hook (re-renders on every mutation)
  const tree = dk.doc;

  // Tree text for `tree` command
  const treeText = useMemo(() => {
    if (!tree || !isPlainRecord(tree)) return "(empty document)";
    const lines: string[] = [];
    renderTree(tree, "/", 0, lines);
    return lines.join("\n");
  }, [tree]);

  // ── Completion logic (selector-first) ────────────────────────────────────

  /**
   * Parse input into: selector (optional), command, remaining args.
   * Format: `/selector command args...` or `bareCommand`.
   */
  const parseInput = useCallback((text: string) => {
    const parts = text.split(/\s+/);
    const first = parts[0] ?? "";
    if (first.startsWith("/")) {
      return {
        selector: first,
        command: parts[1] ?? "",
        argsStr: parts.slice(2).join(" "),
        argCount: Math.max(0, parts.length - 2),
        hasSelector: true,
      };
    }
    return {
      selector: "",
      command: first,
      argsStr: parts.slice(1).join(" "),
      argCount: Math.max(0, parts.length - 1),
      hasSelector: false,
    };
  }, []);

  /** Resolve the selector to its target node(s) for command suggestions. */
  const resolveSelector = useCallback(
    (selector: string): PlainNode[] => {
      if (!tree || !isPlainRecord(tree)) return [];
      const pathStr = selector.startsWith("/") ? selector.slice(1) : selector;
      if (!pathStr) return [tree];
      return navigateToAll(tree, pathStr.split("/"));
    },
    [tree],
  );

  /** Get completions for the current input state. */
  const getCompletions = useCallback(
    (text: string): { items: CompletionItem[]; phase: string } => {
      const parsed = parseInput(text);

      // Phase 1: bare command completion (undo, redo, help, tree)
      if (!parsed.hasSelector && !parsed.command.startsWith("/")) {
        const partial = parsed.command;
        const allCmds = [...BARE_CMDS];
        return {
          items: allCmds
            .filter((c) => c.startsWith(partial) && c !== partial)
            .map((c) => ({ name: c, label: c })),
          phase: "bare-command",
        };
      }

      // Phase 2: typing a selector path
      if (parsed.hasSelector && !parsed.command) {
        const pathStr = parsed.selector.startsWith("/")
          ? parsed.selector.slice(1)
          : parsed.selector;
        const segments = pathStr.split("/");
        const parentSegments = segments.slice(0, -1);
        const partial = segments[segments.length - 1] ?? "";

        if (!tree || !isPlainRecord(tree)) {
          return { items: [], phase: "path" };
        }
        const parentNodes = parentSegments.length === 0
          ? [tree]
          : navigateToAll(tree, parentSegments);
        if (parentNodes.length === 0) return { items: [], phase: "path" };

        const all = (parentNodes.length === 1
          ? getChildCompletions(parentNodes[0]!)
          : intersectCompletions(parentNodes)).filter((c) =>
            c.name.startsWith(partial)
          );
        return { items: all, phase: "path" };
      }

      // Phase 3: selector done, completing command
      if (parsed.hasSelector && parsed.command && !parsed.argsStr) {
        const nodes = resolveSelector(parsed.selector);
        if (nodes.length === 0) return { items: [], phase: "command" };
        // Union of valid commands across all matched nodes
        const cmdSet = new Set<string>();
        for (const node of nodes) {
          for (const cmd of commandsForNode(node)) cmdSet.add(cmd);
        }
        const partial = parsed.command;
        return {
          items: [...cmdSet]
            .filter((c) => c.startsWith(partial) && c !== partial)
            .map((c) => ({ name: c, label: c })),
          phase: "command",
        };
      }

      // Phase 4: command done, no further completions (just hints)
      return { items: [], phase: "args" };
    },
    [tree, parseInput, resolveSelector],
  );

  /** Update completions and ghost text when input changes. */
  const updateCompletions = useCallback((text: string) => {
    const { items, phase } = getCompletions(text);
    const parsed = parseInput(text);

    if (items.length >= 1) {
      setCompletions(items);
      setCompletionIdx(-1);
      const partial = phase === "path"
        ? (parsed.selector.split("/").pop() ?? "")
        : phase === "command"
        ? parsed.command
        : parsed.command;
      if (items.length === 1 && items[0]!.name !== partial) {
        setGhostText(items[0]!.name.slice(partial.length));
      } else {
        setGhostText("");
      }
    } else {
      setCompletions([]);
      // Show argument hints after command
      if (phase === "args" && parsed.command) {
        const hints = ARG_HINTS[parsed.command];
        if (hints) {
          const extraArgs = parsed.argCount;
          if (extraArgs < hints.length) {
            setGhostText(" " + hints.slice(extraArgs).join(" "));
          } else {
            setGhostText("");
          }
        } else {
          setGhostText("");
        }
      } else if (phase === "command" && items.length === 0 && !parsed.command) {
        // Just finished selector, show hint
        setGhostText(" <command>");
      } else {
        setGhostText("");
      }
    }
  }, [getCompletions, parseInput]);

  /** Apply a selected completion item to the input. */
  const applyCompletion = useCallback((name: string) => {
    const parsed = parseInput(input);
    let newVal: string;

    if (parsed.hasSelector && !parsed.command) {
      // Completing a path segment
      const pathStr = parsed.selector.startsWith("/")
        ? parsed.selector.slice(1)
        : parsed.selector;
      const segments = pathStr.split("/");
      segments[segments.length - 1] = name;
      newVal = "/" + segments.join("/");
    } else if (parsed.hasSelector && parsed.command) {
      // Completing a command after selector
      newVal = parsed.selector + " " + name +
        (parsed.argsStr ? " " + parsed.argsStr : "");
    } else {
      // Completing a bare command
      newVal = name + " ";
    }

    setInput(newVal);
    setCompletionIdx(-1);
    setCompletions([]);
    setGhostText("");
  }, [input, parseInput]);

  const handleTab = useCallback(() => {
    if (completions.length > 0) {
      const idx = completionIdx >= 0 ? completionIdx : 0;
      applyCompletion(completions[idx]!.name);
      return;
    }
    const { items } = getCompletions(input);
    if (items.length === 1) {
      applyCompletion(items[0]!.name);
    } else if (items.length > 1) {
      setCompletions(items);
      setCompletionIdx(0);
    }
  }, [input, completions, completionIdx, getCompletions, applyCompletion]);

  // ── Command execution ──────────────────────────────────────────────────

  const pushOutput = useCallback((msg: OutputMessage) => {
    setOutput((prev) => [...prev.slice(-100), msg]);
  }, []);

  const executeCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);

    // Parse: /selector command args...  OR  bareCommand
    const parsed = parseInput(trimmed);
    const command = parsed.command;
    // Strip leading "/" from selector for CRDT paths
    const target = parsed.selector.startsWith("/")
      ? parsed.selector.slice(1)
      : parsed.selector;
    const argsStr = parsed.argsStr;

    try {
      switch (command) {
        case "help":
          pushOutput({ text: HELP_TEXT, kind: "info" });
          break;

        case "undo": {
          const id = dk.undo();
          pushOutput({ text: `Undone → ${id}`, kind: "success" });
          break;
        }

        case "redo": {
          const id = dk.redo();
          pushOutput({ text: `Redone → ${id}`, kind: "success" });
          break;
        }

        case "tree": {
          if (target) {
            const nodes = dk.get(target);
            if (nodes.length === 0) {
              pushOutput({
                text: `No nodes at '${parsed.selector}'`,
                kind: "error",
              });
            } else {
              for (const n of nodes) {
                const lines: string[] = [];
                renderTree(
                  n,
                  parsed.selector.split("/").pop() ?? "node",
                  0,
                  lines,
                );
                pushOutput({ text: lines.join("\n"), kind: "info" });
              }
            }
          } else {
            pushOutput({ text: treeText, kind: "info" });
          }
          break;
        }

        case "get": {
          if (!target) {
            pushOutput({
              text: "Usage: /selector get",
              kind: "error",
            });
            break;
          }
          const nodes = dk.get(target);
          if (nodes.length === 0) {
            pushOutput({
              text: `No nodes at '${parsed.selector}'`,
              kind: "error",
            });
          } else {
            pushOutput({ text: JSON.stringify(nodes, null, 2), kind: "info" });
          }
          break;
        }

        case "add": {
          const { args } = splitArgs(argsStr, 2);
          if (!target || args.length < 1) {
            pushOutput({
              text: "Usage: /selector add <field> [value|json]",
              kind: "error",
            });
            break;
          }
          const [field] = args as [string];
          const value = args[1] ? parseValue(args[1]) : "";
          const id = dk.add(target, field!, value);
          pushOutput({
            text: `Added '${field}' to ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "delete": {
          const { args } = splitArgs(argsStr, 1);
          if (!target || args.length < 1) {
            pushOutput({
              text: "Usage: /selector delete <field>",
              kind: "error",
            });
            break;
          }
          const [field] = args as [string];
          const id = dk.delete(target, field!);
          pushOutput({
            text: `Deleted '${field}' from ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "rename": {
          const { args } = splitArgs(argsStr, 2);
          if (!target || args.length < 2) {
            pushOutput({
              text: "Usage: /selector rename <old-field> <new-field>",
              kind: "error",
            });
            break;
          }
          const [from, to] = args as [string, string];
          const id = dk.rename(target, from!, to!);
          pushOutput({
            text: `Renamed '${from}' → '${to}' on ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "set": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /selector set <value>",
              kind: "error",
            });
            break;
          }
          const value = parseValue(argsStr);
          if (typeof value === "object") {
            pushOutput({
              text: "set expects a primitive value (string, number, boolean)",
              kind: "error",
            });
            break;
          }
          dk.set(target, value as PrimitiveValue);
          pushOutput({
            text: `Set ${parsed.selector} = ${JSON.stringify(value)}`,
            kind: "success",
          });
          break;
        }

        case "pushBack": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /selector pushBack <value|json>",
              kind: "error",
            });
            break;
          }
          const value = parseValue(argsStr);
          const id = dk.pushBack(target, value);
          pushOutput({
            text: `Pushed to back of ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "pushFront": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /selector pushFront <value|json>",
              kind: "error",
            });
            break;
          }
          const value = parseValue(argsStr);
          const id = dk.pushFront(target, value);
          pushOutput({
            text: `Pushed to front of ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "popBack": {
          if (!target) {
            pushOutput({
              text: "Usage: /selector popBack",
              kind: "error",
            });
            break;
          }
          const id = dk.popBack(target);
          pushOutput({
            text: `Popped back from ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "popFront": {
          if (!target) {
            pushOutput({
              text: "Usage: /selector popFront",
              kind: "error",
            });
            break;
          }
          const id = dk.popFront(target);
          pushOutput({
            text: `Popped front from ${parsed.selector} → ${id}`,
            kind: "success",
          });
          break;
        }

        case "updateTag": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /selector updateTag <new-tag>",
              kind: "error",
            });
            break;
          }
          const id = dk.updateTag(target, argsStr.trim());
          pushOutput({
            text:
              `Updated tag on ${parsed.selector} → '${argsStr.trim()}' (${id})`,
            kind: "success",
          });
          break;
        }

        case "wrapRecord": {
          const { args } = splitArgs(argsStr, 2);
          if (!target || args.length < 2) {
            pushOutput({
              text: "Usage: /selector wrapRecord <field> <tag>",
              kind: "error",
            });
            break;
          }
          const [field, tag] = args as [string, string];
          const id = dk.wrapRecord(target, field!, tag!);
          pushOutput({
            text:
              `Wrapped ${parsed.selector} in record '${field}' [${tag}] → ${id}`,
            kind: "success",
          });
          break;
        }

        case "wrapList": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /selector wrapList <tag>",
              kind: "error",
            });
            break;
          }
          const id = dk.wrapList(target, argsStr.trim());
          pushOutput({
            text:
              `Wrapped ${parsed.selector} in list [${argsStr.trim()}] → ${id}`,
            kind: "success",
          });
          break;
        }

        case "copy": {
          if (!target || !argsStr) {
            pushOutput({
              text: "Usage: /target copy <source-selector>",
              kind: "error",
            });
            break;
          }
          const source = argsStr.trim().startsWith("/")
            ? argsStr.trim().slice(1)
            : argsStr.trim();
          const id = dk.copy(target, source);
          pushOutput({
            text: `Copied ${argsStr.trim()} → ${parsed.selector} (${id})`,
            kind: "success",
          });
          break;
        }

        case "formula": {
          // /selector formula <field> <operation> [arg1] [arg2] ...
          const { args } = splitArgs(argsStr, 3);
          if (!target || args.length < 2) {
            pushOutput({
              text:
                "Usage: /selector formula <field> <operation> [ref|value ...]",
              kind: "error",
            });
            break;
          }
          const [fField, fOp] = args as [string, string];
          const rawArgs = args[2] ? args[2].split(/\s+/).filter(Boolean) : [];
          const formulaArgs: PlainNode[] = rawArgs.map((a) => {
            if (a.startsWith("/")) {
              const cleaned = a.slice(1);
              return { $ref: "/" + cleaned };
            }
            return parseValue(a);
          });
          const formulaNode: PlainNode = {
            $tag: "x-formula",
            $kind: "formula",
            operation: fOp!,
            args: { $tag: "args", $items: formulaArgs },
            result: 0,
          };
          dk.add(target, fField!, formulaNode);
          const opsList = FORMULA_OPS.includes(fOp!)
            ? ""
            : `\n  Known ops: ${FORMULA_OPS.join(", ")}`;
          pushOutput({
            text: `Formula '${fField}' = ${fOp}(${
              rawArgs.join(", ")
            }) added to ${parsed.selector}${opsList}`,
            kind: "success",
          });
          break;
        }

        default:
          pushOutput({
            text:
              `Unknown command: '${command}'. Type 'help' for available commands.`,
            kind: "error",
          });
      }
    } catch (err) {
      pushOutput({
        text: String(err instanceof Error ? err.message : err),
        kind: "error",
      });
    }
  }, [dk, parseInput, pushOutput, treeText]);

  // ── Key handlers ───────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        handleTab();
        return;
      }
      if (e.key === "Escape") {
        setCompletions([]);
        setCompletionIdx(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (completions.length > 0 && completionIdx >= 0) {
          applyCompletion(completions[completionIdx]!.name);
          return;
        }
        executeCommand(input);
        setInput("");
        setGhostText("");
        setCompletions([]);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (completions.length > 0) {
          setCompletionIdx((prev) =>
            prev <= 0 ? completions.length - 1 : prev - 1
          );
          return;
        }
        if (history.length === 0) return;
        const newIdx = historyIndex === -1
          ? history.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIdx);
        setInput(history[newIdx] ?? "");
        setGhostText("");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (completions.length > 0) {
          setCompletionIdx((prev) =>
            prev >= completions.length - 1 ? 0 : prev + 1
          );
          return;
        }
        if (historyIndex === -1) return;
        const newIdx = historyIndex + 1;
        if (newIdx >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIdx);
          setInput(history[newIdx] ?? "");
        }
        setGhostText("");
        return;
      }
    },
    [
      handleTab,
      executeCommand,
      input,
      history,
      historyIndex,
      completions,
      completionIdx,
      applyCompletion,
    ],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      setHistoryIndex(-1);
      updateCompletions(val);
    },
    [updateCompletions],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  const lastMessage = output.length > 0 ? output[output.length - 1] : null;

  return (
    <div
      style={styles.container}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Help overlay */}
      {showHelp && (
        <div style={styles.helpOverlay}>
          <pre style={styles.helpText}>{HELP_TEXT}</pre>
        </div>
      )}

      {/* Last output message */}
      {lastMessage && (
        <div
          style={{
            padding: "4px 12px",
            fontSize: 12,
            color: msgColor(lastMessage.kind),
            fontFamily: FONT,
            whiteSpace: "pre-wrap",
            overflowY: "auto",
            maxHeight: 300,
            borderTop: "1px solid #e0e0e0",
          }}
        >
          {lastMessage.text}
        </div>
      )}

      {/* Completions dropdown (above the input) */}
      {completions.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #e0e0e0",
            background: "#fff",
            maxHeight: 180,
            overflowY: "auto",
            boxShadow: "0 -2px 8px rgba(0,0,0,0.1)",
          }}
        >
          {completions.map((item, i) => (
            <div
              key={item.name}
              onClick={() => applyCompletion(item.name)}
              style={{
                padding: "3px 12px 3px 28px",
                fontFamily: FONT,
                fontSize: 13,
                cursor: "pointer",
                background: i === completionIdx ? "#e8f0fe" : "transparent",
                color: i === completionIdx ? "#0078d4" : "#424242",
                borderLeft: i === completionIdx
                  ? "3px solid #0078d4"
                  : "3px solid transparent",
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={styles.inputRow}>
        <span style={styles.prompt}>{">"}</span>
        <div style={styles.inputWrapper}>
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            style={styles.input}
            spellCheck={false}
            autoComplete="off"
            placeholder="/path command args... (tab to complete)"
          />
          {ghostText && (
            <span style={styles.ghost}>
              <span style={{ visibility: "hidden" }}>{input}</span>
              {ghostText}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowHelp((v) => !v);
          }}
          style={styles.helpButton}
          title="Show command help"
        >
          ?
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Split argsStr into at most `max` tokens; the last token gets the remainder. */
function splitArgs(argsStr: string, max: number): { args: string[] } {
  const args: string[] = [];
  let remaining = argsStr.trim();
  for (let i = 0; i < max - 1 && remaining; i++) {
    const spaceIdx = remaining.indexOf(" ");
    if (spaceIdx === -1) {
      args.push(remaining);
      remaining = "";
      break;
    }
    args.push(remaining.slice(0, spaceIdx));
    remaining = remaining.slice(spaceIdx + 1).trim();
  }
  if (remaining) args.push(remaining);
  return { args };
}

function msgColor(kind: OutputMessage["kind"]): string {
  switch (kind) {
    case "success":
      return "#107c10";
    case "error":
      return "#d13438";
    case "info":
      return "#424242";
  }
}

// ── Styles ───────────────────────────────────────────────────────────────

const FONT = "Consolas, Monaco, 'Courier New', monospace";

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: "#fafafa",
    borderTop: "1px solid #e0e0e0",
    color: "#242424",
    fontFamily: FONT,
    fontSize: 13,
    flexShrink: 0,
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    padding: "6px 12px",
    gap: 8,
  },
  prompt: {
    color: "#0078d4",
    fontWeight: "bold",
    fontSize: 14,
    userSelect: "none",
  },
  inputWrapper: {
    flex: 1,
    position: "relative",
  },
  input: {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#242424",
    fontFamily: FONT,
    fontSize: 13,
    caretColor: "#242424",
    position: "relative",
    zIndex: 1,
  },
  ghost: {
    position: "absolute",
    top: 0,
    left: 0,
    color: "#a0a0a0",
    fontFamily: FONT,
    fontSize: 13,
    pointerEvents: "none",
    whiteSpace: "pre",
    zIndex: 0,
  },
  helpButton: {
    background: "transparent",
    border: "1px solid #d0d0d0",
    borderRadius: 4,
    color: "#616161",
    fontFamily: FONT,
    fontSize: 12,
    width: 24,
    height: 24,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  helpOverlay: {
    padding: "8px 12px",
    borderBottom: "1px solid #e0e0e0",
    background: "#f0f0f0",
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  helpText: {
    margin: 0,
    fontFamily: FONT,
    fontSize: 12,
    color: "#424242",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
  },
};
