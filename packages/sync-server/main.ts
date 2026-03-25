import { createSyncServer } from './mod.ts';

const port = Number(Deno.env.get('PORT') ?? '8787');
const hostname = Deno.env.get('HOSTNAME') ?? '0.0.0.0';
const persistencePath = Deno.env.get('PERSISTENCE_PATH') ?? './data';

createSyncServer({ port, hostname, persistencePath });
console.log(`Sync server listening on ws://${hostname}:${port}/sync`);
