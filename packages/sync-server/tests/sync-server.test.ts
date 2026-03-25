import { assertEquals } from '@std/assert';

import { Denicek } from '../../core/mod.ts';
import { applySyncResponse, createSyncRequest, decodeEvent, encodeEvent, SyncRoom } from '../mod.ts';

Deno.test('encodeEvent/decodeEvent preserves remote event behavior', () => {
  const initial = {
    $tag: 'root',
    title: 'Draft',
    items: { $tag: 'items', $items: [] },
  } as const;
  const alice = new Denicek('alice', initial);
  const bob = new Denicek('bob', initial);

  alice.set('title', 'Published');
  alice.pushBack('items', { $tag: 'item', name: 'Ship sync server', done: false });

  for (const event of alice.eventsSince([])) {
    bob.applyRemote(decodeEvent(encodeEvent(event)));
  }

  assertEquals(bob.toPlain(), alice.toPlain());
});

Deno.test('SyncRoom exchanges only missing events between peers', () => {
  const initial = {
    $tag: 'root',
    title: 'Tasks',
    items: { $tag: 'items', $items: [] },
  } as const;
  const room = new SyncRoom('demo');
  const alice = new Denicek('alice', initial);
  const bob = new Denicek('bob', initial);

  alice.set('title', 'Alice title');
  let aliceServerFrontiers: string[] = [];
  let aliceResponse = room.computeSyncResponse(createSyncRequest(alice, 'demo', aliceServerFrontiers));
  applySyncResponse(alice, aliceResponse);
  aliceServerFrontiers = aliceResponse.frontiers;

  bob.pushBack('items', { $tag: 'item', name: 'Bob task', done: false });
  let bobServerFrontiers: string[] = [];
  const bobResponse = room.computeSyncResponse(createSyncRequest(bob, 'demo', bobServerFrontiers));
  applySyncResponse(bob, bobResponse);
  bobServerFrontiers = bobResponse.frontiers;

  aliceResponse = room.computeSyncResponse(createSyncRequest(alice, 'demo', aliceServerFrontiers));
  applySyncResponse(alice, aliceResponse);
  aliceServerFrontiers = aliceResponse.frontiers;

  const finalBobResponse = room.computeSyncResponse(createSyncRequest(bob, 'demo', bobServerFrontiers));
  applySyncResponse(bob, finalBobResponse);

  assertEquals(alice.toPlain(), bob.toPlain());
  assertEquals(aliceServerFrontiers, finalBobResponse.frontiers);
});
