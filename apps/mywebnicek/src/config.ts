export const config = {
  syncServerUrl: import.meta.env.PROD
    ? "wss://mydenicek-sync-prod.azurewebsites.net"
    : "ws://localhost:3001",
};
