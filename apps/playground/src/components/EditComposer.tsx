import { type CSSProperties, type FormEvent, useState } from "react";
import type { PeerSession } from "../peer-session.ts";
import type { PlainNode } from "@mydenicek/core";

type Props = { session: PeerSession; onEdit: () => void };

type OpType =
  | "add"
  | "delete"
  | "rename"
  | "set"
  | "pushBack"
  | "pushFront"
  | "popBack"
  | "popFront"
  | "updateTag"
  | "wrapRecord"
  | "wrapList"
  | "copy";

const ALL_OPS: OpType[] = [
  "add",
  "delete",
  "rename",
  "set",
  "pushBack",
  "pushFront",
  "popBack",
  "popFront",
  "updateTag",
  "wrapRecord",
  "wrapList",
  "copy",
];

function parseValue(raw: string): PlainNode {
  try {
    return JSON.parse(raw) as PlainNode;
  } catch {
    return raw;
  }
}

export function EditComposer({ session, onEdit }: Props) {
  const [op, setOp] = useState<OpType>("set");
  const [target, setTarget] = useState("");
  const [field, setField] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      switch (op) {
        case "add":
          session.add(target, field, parseValue(value));
          break;
        case "delete":
          session.delete(target, field);
          break;
        case "rename":
          session.rename(target, from, to);
          break;
        case "set": {
          const parsed = parseValue(value);
          if (typeof parsed === "object" && parsed !== null) {
            throw new Error(
              "set requires a primitive value (string, number, or boolean)",
            );
          }
          session.set(target, parsed);
          break;
        }
        case "pushBack":
          session.pushBack(target, parseValue(value));
          break;
        case "pushFront":
          session.pushFront(target, parseValue(value));
          break;
        case "popBack":
          session.popBack(target);
          break;
        case "popFront":
          session.popFront(target);
          break;
        case "updateTag":
          session.updateTag(target, tag);
          break;
        case "wrapRecord":
          session.wrapRecord(target, field, tag);
          break;
        case "wrapList":
          session.wrapList(target, tag);
          break;
        case "copy":
          session.copy(target, source);
          break;
      }
      onEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const inputStyle: CSSProperties = {
    fontFamily: "monospace",
    fontSize: 12,
    padding: "3px 6px",
    border: "1px solid #ccc",
    borderRadius: 3,
    width: "100%",
    boxSizing: "border-box",
  };
  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: "#555",
    display: "block",
    marginBottom: 2,
  };
  const fieldWrapper: CSSProperties = { marginBottom: 6 };

  return (
    <form onSubmit={handleSubmit} style={{ fontSize: 13 }}>
      <div style={fieldWrapper}>
        <label style={labelStyle}>Operation</label>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as OpType)}
          style={inputStyle}
        >
          {ALL_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div style={fieldWrapper}>
        <label style={labelStyle}>target (selector)</label>
        <input
          style={inputStyle}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="e.g. items/0/name"
        />
      </div>

      {(op === "add" || op === "delete" || op === "wrapRecord") && (
        <div style={fieldWrapper}>
          <label style={labelStyle}>field</label>
          <input
            style={inputStyle}
            value={field}
            onChange={(e) =>
              setField(e.target.value)}
            placeholder="field name"
          />
        </div>
      )}

      {op === "rename" && (
        <>
          <div style={fieldWrapper}>
            <label style={labelStyle}>from</label>
            <input
              style={inputStyle}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div style={fieldWrapper}>
            <label style={labelStyle}>to</label>
            <input
              style={inputStyle}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </>
      )}

      {(op === "set" || op === "add" || op === "pushBack" ||
        op === "pushFront") && (
        <div style={fieldWrapper}>
          <label style={labelStyle}>value (JSON or plain string)</label>
          <input
            style={inputStyle}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='e.g. "hello" or {"$tag":"item"}'
          />
        </div>
      )}

      {(op === "updateTag" || op === "wrapRecord" || op === "wrapList") && (
        <div style={fieldWrapper}>
          <label style={labelStyle}>tag</label>
          <input
            style={inputStyle}
            value={tag}
            onChange={(e) =>
              setTag(e.target.value)}
            placeholder="tag name"
          />
        </div>
      )}

      {op === "copy" && (
        <div style={fieldWrapper}>
          <label style={labelStyle}>source (selector)</label>
          <input
            style={inputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="source selector"
          />
        </div>
      )}

      <button
        type="submit"
        style={{
          background: "#0078d4",
          color: "#fff",
          border: "none",
          borderRadius: 3,
          padding: "5px 12px",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Apply
      </button>

      {error && (
        <div
          style={{
            marginTop: 6,
            color: "#c50f1f",
            fontSize: 12,
            fontFamily: "monospace",
          }}
        >
          Error: {error}
        </div>
      )}
    </form>
  );
}
