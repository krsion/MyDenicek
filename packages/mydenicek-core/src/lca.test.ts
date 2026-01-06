import { describe, expect, it } from 'vitest';

import { LowestCommonAncestor } from './Document';
import { type JsonDoc } from './types';

describe('LowestCommonAncestor', () => {
  const doc: JsonDoc = {
    root: 'root',
    nodes: {
      'root': { kind: 'element', tag: 'root', attrs: {}, children: ['a', 'b'] },
      'a': { kind: 'element', tag: 'div', attrs: {}, children: ['a1', 'a2'] },
      'b': { kind: 'element', tag: 'span', attrs: {}, children: ['b1'] },
      'a1': { kind: 'value', value: 'text1' },
      'a2': { kind: 'element', tag: 'p', attrs: {}, children: ['a2_1'] },
      'a2_1': { kind: 'value', value: 'deep' },
      'b1': { kind: 'value', value: 'text2' },
    },
    transformations: []
  };

  it('finds LCA of single node (itself)', () => {
    expect(LowestCommonAncestor(doc, ['a'])).toBe('a');
    expect(LowestCommonAncestor(doc, ['root'])).toBe('root');
  });

  it('finds LCA of two siblings', () => {
    expect(LowestCommonAncestor(doc, ['a', 'b'])).toBe('root');
    expect(LowestCommonAncestor(doc, ['a1', 'a2'])).toBe('a');
  });

  it('finds LCA of parent and child', () => {
    expect(LowestCommonAncestor(doc, ['a', 'a1'])).toBe('a');
    expect(LowestCommonAncestor(doc, ['root', 'b1'])).toBe('root');
  });

  it('finds LCA of nodes in different branches', () => {
    expect(LowestCommonAncestor(doc, ['a1', 'b1'])).toBe('root');
    expect(LowestCommonAncestor(doc, ['a2_1', 'b'])).toBe('root');
    expect(LowestCommonAncestor(doc, ['a2_1', 'a1'])).toBe('a');
  });

  it('finds LCA of multiple nodes', () => {
    expect(LowestCommonAncestor(doc, ['a1', 'a2_1', 'b1'])).toBe('root');
    expect(LowestCommonAncestor(doc, ['a1', 'a2', 'a2_1'])).toBe('a');
  });

  it('returns null for empty list', () => {
    expect(LowestCommonAncestor(doc, [])).toBe(null);
  });

  it('handles nodes that do not exist (fallback to root or behavior)', () => {
    // Current implementation relies on parentMap. If node not in map (e.g. root or non-existent), 
    // it might behave in specific ways.
    // Root is not a child of anyone, so parentMap['root'] is undefined.
    // If we pass 'root' and 'a', ancestors of 'root' is {'root'}. 'a' walks up to 'root'. Match.
    
    // If we pass a non-existent node 'x'. parentMap['x'] is undefined.
    // ancestors of 'x' is {'x'}.
    // 'a' walks up to 'root'. No match with {'x'}.
    // It falls back to doc.root in the loop if not found.
    
    expect(LowestCommonAncestor(doc, ['x', 'a'])).toBe('root'); 
  });
});
