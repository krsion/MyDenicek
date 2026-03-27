// Update this fallback when the default Azure sync-server deployment hostname changes.
export const DEFAULT_DEPLOYED_SYNC_SERVER_URL = 'wss://mydenicek-core-krsion-dev-sync--9mvjnr2.happyisland-d6dda219.westeurope.azurecontainerapps.io/sync';

const SYNC_SERVER_URL_QUERY_PARAM = 'syncServerUrl';
const SYNC_SERVER_URL_STORAGE_KEY = 'mywebnicek.syncServerUrl';

export type InitialSyncServerUrlOptions = {
  readonly search?: string;
  readonly storedSyncServerUrl?: string | null;
};

export function computeInitialSyncServerUrl(options: InitialSyncServerUrlOptions = {}): string {
  const syncServerUrlFromQuery = new URLSearchParams(options.search ?? '').get(SYNC_SERVER_URL_QUERY_PARAM)?.trim();
  if (syncServerUrlFromQuery) {
    return syncServerUrlFromQuery;
  }

  const storedSyncServerUrl = options.storedSyncServerUrl?.trim();
  if (storedSyncServerUrl) {
    return storedSyncServerUrl;
  }

  return DEFAULT_DEPLOYED_SYNC_SERVER_URL;
}

export function readInitialSyncServerUrl(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_DEPLOYED_SYNC_SERVER_URL;
  }

  let storedSyncServerUrl: string | null = null;
  try {
    storedSyncServerUrl = window.localStorage.getItem(SYNC_SERVER_URL_STORAGE_KEY);
  } catch {
    storedSyncServerUrl = null;
  }

  return computeInitialSyncServerUrl({
    search: window.location.search,
    storedSyncServerUrl,
  });
}

export function persistSyncServerUrl(syncServerUrl: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SYNC_SERVER_URL_STORAGE_KEY, syncServerUrl);
  } catch {
    // Ignore storage failures so the app still works in locked-down browsers.
  }
}
