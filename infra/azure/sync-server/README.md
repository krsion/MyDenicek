# Azure deployment for `apps/sync-server`

The sync server is deployed to **Azure Container Apps (Consumption tier)**. The
web application (`apps/mywebnicek`) is deployed separately to **GitHub Pages**
via `.github/workflows/deno.yml`.

The deployment workflow (`.github/workflows/deno.yml`) builds a Docker image,
pushes it to Azure Container Registry, and deploys it to Azure Container Apps
using the Bicep template in this directory.

## What the Bicep template creates

From the workflow parameters, the template provisions:

- Azure Container Registry
- Container Apps managed environment
- Sync server container app
- Azure Storage account with an Azure Files share (mounted for persistence)

The app is configured with:

- **Consumption**-style serverless hosting
- **min replicas = 0**
- **max replicas = 1**

The `max replicas = 1` limit is intentional because the current sync server
persists room events to files and should stay single-writer.

## One-time Azure OIDC setup

Run these commands once after authenticating with Azure CLI:

```powershell
$RepoOwner = "<github-owner>"
$RepoName = "<github-repo>"
$Branch = "main"
$Scope = "/subscriptions/$(az account show --query id -o tsv)"
$AppName = "mydenicek-github-actions"

$SubscriptionId = az account show --query id -o tsv
$TenantId = az account show --query tenantId -o tsv

$AppId = az ad app create --display-name $AppName --query appId -o tsv
$SpObjectId = az ad sp create --id $AppId --query id -o tsv

az role assignment create `
  --assignee-object-id $SpObjectId `
  --assignee-principal-type ServicePrincipal `
  --role Contributor `
  --scope $Scope

az role assignment create `
  --assignee-object-id $SpObjectId `
  --assignee-principal-type ServicePrincipal `
  --role "User Access Administrator" `
  --scope $Scope

$FederatedCredential = @{
  name = "github-main"
  issuer = "https://token.actions.githubusercontent.com"
  subject = "repo:$RepoOwner/$RepoName:ref:refs/heads/$Branch"
  description = "GitHub Actions access for Azure infra and app deploy"
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

az ad app federated-credential create `
  --id $AppId `
  --parameters $FederatedCredential
```

Why these roles:

- `Contributor` lets the workflow create the resource group and Azure resources
- `User Access Administrator` is needed because the Bicep template creates the
  `AcrPull` role assignment for the Container App identity

## GitHub repository variables

Create these repository variables in GitHub:

- `AZURE_CLIENT_ID` = the `$AppId` value
- `AZURE_TENANT_ID` = the `$TenantId` value
- `AZURE_SUBSCRIPTION_ID` = the `$SubscriptionId` value
