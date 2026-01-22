# Azure Setup Guide for MyDenicek Sync Server

This guide walks you through deploying the sync server infrastructure using Azure Bicep.

## Prerequisites

- Azure CLI installed ([install guide](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli))
- Azure account (free tier eligible)
- GitHub repository with this code

## Step 1: Login to Azure

```bash
az login
```

## Step 2: Customize Parameters (Optional)

Edit `infra/main.bicepparam` to customize:

```bicep
param baseName = 'mydenicek'      // Base name for all resources
param location = 'westeurope'     // Azure region
param environment = 'prod'        // Environment suffix
```

## Step 3: Deploy Infrastructure

```bash
cd apps/mydenicek-sync-server/infra

az deployment sub create \
  --location westeurope \
  --template-file main.bicep \
  --parameters main.bicepparam
```

This creates:
- Resource Group: `mydenicek-prod-rg`
- Storage Account: `mydenicekprodstor`
- Blob Container: `loro-documents`
- App Service Plan: `mydenicek-prod-plan` (Free F1)
- Web App: `mydenicek-sync-prod` (with WebSockets enabled)

The storage connection string is automatically configured in the Web App.

## Step 4: Get Deployment Outputs

```bash
az deployment sub show \
  --name main \
  --query properties.outputs
```

Note the `webAppName` - you'll need it for the GitHub workflow.

## Step 5: Set Up GitHub Actions Deployment

1. Get the publish profile:
   ```bash
   az webapp deployment list-publishing-profiles \
     --name mydenicek-sync-prod \
     --resource-group mydenicek-prod-rg \
     --xml
   ```

2. Copy the entire XML output

3. Go to your GitHub repo > **Settings** > **Secrets and variables** > **Actions**

4. Create secret:
   - **Name**: `AZURE_WEBAPP_PUBLISH_PROFILE`
   - **Secret**: Paste the XML content

## Step 6: Update Workflow Configuration

Edit `.github/workflows/deploy-sync-server.yml` and update the app name:

```yaml
env:
  AZURE_WEBAPP_NAME: mydenicek-sync-prod  # Must match your Web App name
```

## Step 7: Deploy Application

Push to the `main` branch or manually trigger:

```bash
gh workflow run "Deploy Sync Server to Azure"
```

Or go to GitHub > **Actions** > **Deploy Sync Server to Azure** > **Run workflow**

## Verification

After deployment:

1. **Check logs**:
   ```bash
   az webapp log tail \
     --name mydenicek-sync-prod \
     --resource-group mydenicek-prod-rg
   ```

2. **Test WebSocket**: Connect to `wss://mydenicek-sync-prod.azurewebsites.net`

   Using PowerShell:
   ```powershell
   $ws = New-Object System.Net.WebSockets.ClientWebSocket
   $ws.ConnectAsync("wss://mydenicek-sync-prod.azurewebsites.net", [Threading.CancellationToken]::None).Wait()
   $ws.State  # Should show "Open"
   ```

   Using wscat (Node.js):
   ```bash
   npm install -g wscat
   wscat -c wss://mydenicek-sync-prod.azurewebsites.net
   ```

   Using websocat (Rust):
   ```bash
   websocat wss://mydenicek-sync-prod.azurewebsites.net
   ```

3. **Check blobs**:
   ```bash
   az storage blob list --account-name mydenicekprodstor --container-name loro-documents --auth-mode key --output table
   ```

## Infrastructure Updates

To update infrastructure after changes to Bicep files:

```bash
cd apps/mydenicek-sync-server/infra

az deployment sub create \
  --location westeurope \
  --template-file main.bicep \
  --parameters main.bicepparam
```

Bicep deployments are idempotent - they only change what's different.

## Cleanup

To delete all resources:

```bash
az group delete --name mydenicek-prod-rg --yes
```

## Free Tier Limitations

- **60 CPU minutes/day** - sufficient for light usage
- **1 GB RAM** - enough for the sync server
- **Auto-sleep after ~20 min inactivity** - first request after sleep takes ~30s
- **WebSockets supported** on Free tier

## Troubleshooting

### Deployment fails
```bash
# Check deployment status
az deployment sub show --name main --query properties.provisioningState

# View detailed errors
az deployment sub show --name main --query properties.error
```

### App not starting
```bash
# View app logs
az webapp log tail --name mydenicek-sync-prod --resource-group mydenicek-prod-rg

# Check app settings
az webapp config appsettings list --name mydenicek-sync-prod --resource-group mydenicek-prod-rg
```

### WebSocket connection fails
- Verify WebSockets are enabled (should be automatic with Bicep)
- Use `wss://` (not `ws://`) for HTTPS
- Check CORS if connecting from a different domain

## Local Development

For local development, the server uses file-based persistence:

```bash
npm run dev -w @mydenicek/sync-server
```

To test with Azure Blob Storage locally:

```bash
# Get connection string
az storage account show-connection-string \
  --name mydenicekprodstor \
  --resource-group mydenicek-prod-rg \
  --query connectionString -o tsv

# Set and run
export AZURE_STORAGE_CONNECTION_STRING="<connection-string>"
npm run dev -w @mydenicek/sync-server
```
