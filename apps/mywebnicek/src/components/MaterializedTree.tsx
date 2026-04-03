import type {
  FormulaResult,
  PlainList,
  PlainNode,
  PlainRecord,
  PlainRef,
} from "@mydenicek/core";

type Props = {
  node: PlainNode;
  path?: string;
  formulaResults?: Map<string, FormulaResult>;
};

function isRecord(n: PlainNode): n is PlainRecord {
  return typeof n === "object" && n !== null && !Array.isArray(n) &&
    "$tag" in n && !("$items" in n) && !("$ref" in n);
}
function isList(n: PlainNode): n is PlainList {
  return typeof n === "object" && n !== null && "$tag" in n && "$items" in n;
}
function isRef(n: PlainNode): n is PlainRef {
  return typeof n === "object" && n !== null && "$ref" in n;
}
function isPrimitive(n: PlainNode): n is string | number | boolean {
  return typeof n !== "object";
}

function isFormula(n: PlainNode): boolean {
  return isRecord(n) && typeof n.$tag === "string" &&
    (n.$tag as string).startsWith("x-formula");
}

function NodeView({ node, path = "", formulaResults }: Props) {
  if (isPrimitive(node)) {
    return (
      <span style={{ color: typeof node === "string" ? "#a31515" : "#0000ff" }}>
        {JSON.stringify(node)}
      </span>
    );
  }
  if (isRef(node)) {
    return <span style={{ color: "#795e26" }}>→{node.$ref}</span>;
  }
  if (isList(node)) {
    return (
      <div style={{ marginLeft: 16 }}>
        <span style={{ color: "#0070c1", fontWeight: 600 }}>[{node.$tag}]</span>
        {node.$items.length === 0
          ? <span style={{ color: "#888", marginLeft: 6 }}>empty</span>
          : null}
        {node.$items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 4, marginTop: 2 }}>
            <span style={{ color: "#888", minWidth: 20 }}>{i}:</span>
            <NodeView
              node={item}
              path={`${path}/${i}`}
              formulaResults={formulaResults}
            />
          </div>
        ))}
      </div>
    );
  }
  if (isFormula(node)) {
    const rec = node as PlainRecord;
    const op = typeof rec.operation === "string" ? rec.operation : "?";
    const resultPath = path.startsWith("/") ? path.slice(1) : path;
    const formulaResult = formulaResults?.get(resultPath);
    return (
      <div style={{ marginLeft: 16 }}>
        <span style={{ color: "#8764b8", fontWeight: 600 }}>
          ƒ {op}
        </span>
        {formulaResult !== undefined && (
          <span
            style={{
              marginLeft: 8,
              color: typeof formulaResult === "object" ? "#c50f1f" : "#107c10",
              fontWeight: 600,
              fontSize: "0.9em",
            }}
          >
            = {typeof formulaResult === "object"
              ? formulaResult.toString()
              : JSON.stringify(formulaResult)}
          </span>
        )}
        {Object.entries(rec)
          .filter(([k]) => k !== "$tag")
          .map(([key, val]) => (
            <div
              key={key}
              style={{ display: "flex", gap: 4, marginTop: 2 }}
            >
              <span style={{ color: "#001080", minWidth: 60 }}>{key}:</span>
              <NodeView
                node={val as PlainNode}
                path={`${path}/${key}`}
                formulaResults={formulaResults}
              />
            </div>
          ))}
      </div>
    );
  }
  if (isRecord(node)) {
    const fields = Object.entries(node).filter(([k]) => k !== "$tag");
    return (
      <div style={{ marginLeft: 16 }}>
        <span style={{ color: "#267f99", fontWeight: 600 }}>
          {"{" + node.$tag + "}"}
        </span>
        {fields.length === 0
          ? <span style={{ color: "#888", marginLeft: 6 }}>empty</span>
          : null}
        {fields.map(([key, val]) => (
          <div key={key} style={{ display: "flex", gap: 4, marginTop: 2 }}>
            <span style={{ color: "#001080", minWidth: 60 }}>{key}:</span>
            <NodeView
              node={val as PlainNode}
              path={`${path}/${key}`}
              formulaResults={formulaResults}
            />
          </div>
        ))}
      </div>
    );
  }
  return <span style={{ color: "#888" }}>?</span>;
}

export function MaterializedTree(
  { node, formulaResults }: {
    node: PlainNode;
    formulaResults?: Map<string, FormulaResult>;
  },
) {
  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 13,
        lineHeight: 1.6,
        overflowX: "auto",
      }}
    >
      <NodeView node={node} formulaResults={formulaResults} />
    </div>
  );
}
