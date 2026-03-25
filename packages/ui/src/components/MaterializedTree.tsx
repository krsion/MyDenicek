import type { PlainNode, PlainRecord, PlainList, PlainRef } from '@core';

type Props = { node: PlainNode; path?: string };

function isRecord(n: PlainNode): n is PlainRecord {
  return typeof n === 'object' && n !== null && !Array.isArray(n) &&
    '$tag' in n && !('$items' in n) && !('$ref' in n);
}
function isList(n: PlainNode): n is PlainList {
  return typeof n === 'object' && n !== null && '$tag' in n && '$items' in n;
}
function isRef(n: PlainNode): n is PlainRef {
  return typeof n === 'object' && n !== null && '$ref' in n;
}
function isPrimitive(n: PlainNode): n is string | number | boolean {
  return typeof n !== 'object';
}

function NodeView({ node, path = '' }: Props) {
  if (isPrimitive(node)) {
    return (
      <span style={{ color: typeof node === 'string' ? '#a31515' : '#0000ff' }}>
        {JSON.stringify(node)}
      </span>
    );
  }
  if (isRef(node)) {
    return <span style={{ color: '#795e26' }}>→{node.$ref}</span>;
  }
  if (isList(node)) {
    return (
      <div style={{ marginLeft: 16 }}>
        <span style={{ color: '#0070c1', fontWeight: 600 }}>[{node.$tag}]</span>
        {node.$items.length === 0 ? <span style={{ color: '#888', marginLeft: 6 }}>empty</span> : null}
        {node.$items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <span style={{ color: '#888', minWidth: 20 }}>{i}:</span>
            <NodeView node={item} path={`${path}/${i}`} />
          </div>
        ))}
      </div>
    );
  }
  if (isRecord(node)) {
    const fields = Object.entries(node).filter(([k]) => k !== '$tag');
    return (
      <div style={{ marginLeft: 16 }}>
        <span style={{ color: '#267f99', fontWeight: 600 }}>{'{' + node.$tag + '}'}</span>
        {fields.length === 0 ? <span style={{ color: '#888', marginLeft: 6 }}>empty</span> : null}
        {fields.map(([key, val]) => (
          <div key={key} style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <span style={{ color: '#001080', minWidth: 60 }}>{key}:</span>
            <NodeView node={val as PlainNode} path={`${path}/${key}`} />
          </div>
        ))}
      </div>
    );
  }
  return <span style={{ color: '#888' }}>?</span>;
}

export function MaterializedTree({ node }: { node: PlainNode }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, overflowX: 'auto' }}>
      <NodeView node={node} />
    </div>
  );
}
