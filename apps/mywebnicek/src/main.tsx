import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DenicekProvider } from '@mydenicek/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';

// LocalStorage key for persisting peer ID across sessions
const PEER_ID_STORAGE_KEY = "mydenicek-peer-id";

/**
 * Get or generate a persistent peer ID.
 * This ensures the same user keeps the same peer ID across page refreshes,
 * which is essential for consistent peer identification in CRDT operations.
 */
function getOrCreatePeerId(): bigint {
  const stored = localStorage.getItem(PEER_ID_STORAGE_KEY);
  if (stored) {
    try {
      return BigInt(stored);
    } catch {
      // Invalid stored value, generate new one
    }
  }

  // Generate a random peer ID (similar to how Loro does it)
  // Using crypto.getRandomValues for better randomness
  const array = new BigUint64Array(1);
  crypto.getRandomValues(array);
  const newPeerId = array[0]!;

  localStorage.setItem(PEER_ID_STORAGE_KEY, newPeerId.toString());
  return newPeerId;
}

const peerId = getOrCreatePeerId();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <DenicekProvider peerId={peerId}>
        <App />
      </DenicekProvider>
    </FluentProvider>
  </StrictMode>
);
