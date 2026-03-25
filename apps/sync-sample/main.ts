import { Denicek } from '../../packages/core/mod.ts';
import { SyncClient } from '../../packages/sync-server/mod.ts';

function readArgument(flag: string, fallback: string): string {
  const index = Deno.args.indexOf(flag);
  return index >= 0 ? Deno.args[index + 1] ?? fallback : fallback;
}

function printHelp(): void {
  console.log('Commands:');
  console.log('  show');
  console.log('  set-title <text>');
  console.log('  add-item <text>');
  console.log('  toggle <index>');
  console.log('  sync');
  console.log('  frontiers');
  console.log('  help');
  console.log('  exit');
}

const peerId = readArgument('--peer', crypto.randomUUID().slice(0, 8));
const roomId = readArgument('--room', 'demo');
const serverUrl = readArgument('--server', 'ws://127.0.0.1:8787/sync');

const document = new Denicek(peerId, {
  $tag: 'root',
  title: 'Shared shopping list',
  items: { $tag: 'items', $items: [] },
});

const client = new SyncClient({
  url: serverUrl,
  roomId,
  document,
  onRemoteChange: () => {
    console.log(`\n[${peerId}] received remote changes`);
    console.log(JSON.stringify(document.toPlain(), null, 2));
  },
});

await client.connect();
console.log(`Connected peer '${peerId}' to ${serverUrl}`);
printHelp();
console.log(JSON.stringify(document.toPlain(), null, 2));

while (true) {
  const command = prompt(`[${peerId}]> `)?.trim();
  if (command === undefined || command === '') {
    continue;
  }
  if (command === 'exit') {
    client.close();
    break;
  }
  if (command === 'help') {
    printHelp();
    continue;
  }
  if (command === 'show') {
    console.log(JSON.stringify(document.toPlain(), null, 2));
    continue;
  }
  if (command === 'sync') {
    client.syncNow();
    continue;
  }
  if (command === 'frontiers') {
    console.log(document.frontiers);
    continue;
  }
  if (command.startsWith('set-title ')) {
    document.set('title', command.slice('set-title '.length));
    client.syncNow();
    continue;
  }
  if (command.startsWith('add-item ')) {
    document.pushBack('items', {
      $tag: 'item',
      name: command.slice('add-item '.length),
      done: false,
    });
    client.syncNow();
    continue;
  }
  if (command.startsWith('toggle ')) {
    const index = Number(command.slice('toggle '.length));
    if (!Number.isInteger(index) || index < 0) {
      console.log('Invalid item index. Please provide a non-negative number.');
      continue;
    }
    const plain = document.toPlain();
    const items = typeof plain === 'object' && plain !== null && 'items' in plain
      ? (plain.items as { $items: Array<{ done?: boolean }> }).$items
      : [];
    const currentItem = items[index];
    if (currentItem === undefined) {
      console.log(`No item at index ${index}.`);
      continue;
    }
    document.set(`items/${index}/done`, !currentItem.done);
    client.syncNow();
    continue;
  }
  console.log(`Unknown command '${command}'. Type 'help' for available commands.`);
}
