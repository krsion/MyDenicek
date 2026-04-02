export function validatePeerId(peer: string): void {
  if (peer.length === 0) {
    throw new Error("Peer ids must not be empty.");
  }
  if (peer.includes(":")) {
    throw new Error(`Peer id '${peer}' cannot contain ':'.`);
  }
}
