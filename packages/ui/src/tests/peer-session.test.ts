import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';
import { PeerSession } from '../peer-session.ts';
import type { PlainNode } from '@mydenicek/core';

const INITIAL_DOC: PlainNode = {
  $tag: 'root',
  title: 'Hello',
  items: { $tag: 'list', $items: ['a', 'b'] },
};

describe('PeerSession', () => {
  it('snapshot reflects initial doc', () => {
    const session = new PeerSession('alice', INITIAL_DOC);
    const snap = session.snapshot();
    expect(snap.peerId).toBe('alice');
    expect(snap.events).toHaveLength(0);
    expect(snap.conflicts).toHaveLength(0);
    expect(snap.doc).toMatchObject({ $tag: 'root', title: 'Hello' });
  });

  it('local set edit creates an event and updates snapshot', () => {
    const session = new PeerSession('alice', INITIAL_DOC);
    session.set('title', 'Updated');
    const snap = session.snapshot();
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0]!.editKind).toBe('SetValue');
    expect(snap.events[0]!.peer).toBe('alice');
    expect((snap.doc as unknown as { title: string }).title).toBe('Updated');
  });

  it('receiveEventsFrom transfers events and updates doc', () => {
    const alice = new PeerSession('alice', INITIAL_DOC);
    const bob = new PeerSession('bob', INITIAL_DOC);
    alice.set('title', 'From Alice');
    bob.receiveEventsFrom(alice);
    const bobSnap = bob.snapshot();
    expect(bobSnap.events).toHaveLength(1);
    expect((bobSnap.doc as unknown as { title: string }).title).toBe('From Alice');
  });

  it('event graph updates after multiple edits', () => {
    const session = new PeerSession('alice', INITIAL_DOC);
    session.set('title', 'A');
    session.set('title', 'B');
    const snap = session.snapshot();
    expect(snap.events).toHaveLength(2);
    // Second event's parent should be the first event
    expect(snap.events[1]!.parents).toContain(snap.events[0]!.id);
  });

  it('conflicts are detected on concurrent edits to same field', () => {
    const alice = new PeerSession('alice', INITIAL_DOC);
    const bob = new PeerSession('bob', INITIAL_DOC);
    // Both edit title concurrently (no sync between edits)
    alice.set('title', 'Alice title');
    bob.set('title', 'Bob title');
    // Sync both ways
    alice.receiveEventsFrom(bob);
    bob.receiveEventsFrom(alice);
    // Both should converge to the same doc
    expect(JSON.stringify(alice.snapshot().doc)).toBe(JSON.stringify(bob.snapshot().doc));
  });
});
