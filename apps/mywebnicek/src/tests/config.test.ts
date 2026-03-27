import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';
import { computeInitialSyncServerUrl, DEFAULT_DEPLOYED_SYNC_SERVER_URL } from '../config.ts';

describe('computeInitialSyncServerUrl', () => {
  it('prefers the query parameter over stored state', () => {
    expect(
      computeInitialSyncServerUrl({
        search: '?syncServerUrl=wss%3A%2F%2Fexample.test%2Fsync',
        storedSyncServerUrl: 'wss://stored.example/sync',
      }),
    ).toBe('wss://example.test/sync');
  });

  it('uses the stored value when the query parameter is absent', () => {
    expect(
      computeInitialSyncServerUrl({
        search: '',
        storedSyncServerUrl: 'wss://stored.example/sync',
      }),
    ).toBe('wss://stored.example/sync');
  });

  it('falls back to the deployed default URL', () => {
    expect(computeInitialSyncServerUrl()).toBe(DEFAULT_DEPLOYED_SYNC_SERVER_URL);
  });
});
