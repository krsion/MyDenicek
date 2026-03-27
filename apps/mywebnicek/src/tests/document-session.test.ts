import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';
import type { PlainNode } from '@mydenicek/core';
import { DocumentSession } from '../document-session.ts';

const INITIAL_DOC: PlainNode = {
  $tag: 'root',
  title: 'Hello',
  items: { $tag: 'list', $items: ['a', 'b'] },
};

describe('DocumentSession', () => {
  it('creates a snapshot for a fresh document', () => {
    const session = new DocumentSession('alice', INITIAL_DOC);
    const snapshot = session.createSnapshot();
    expect(snapshot.peerId).toBe('alice');
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.conflicts).toHaveLength(0);
    expect(snapshot.doc).toMatchObject({ $tag: 'root', title: 'Hello' });
  });

  it('records local edits in the snapshot', () => {
    const session = new DocumentSession('alice', INITIAL_DOC);
    session.set('title', 'Updated');
    const snapshot = session.createSnapshot();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]!.editKind).toBe('SetValue');
    expect((snapshot.doc as { title: string }).title).toBe('Updated');
  });
});
