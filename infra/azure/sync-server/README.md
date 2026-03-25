# Azure App Service deployment for `packages\sync-server`

The supported deployment path is `.github\workflows\infra-setup.yml`. It logs into Azure with GitHub OIDC, creates or reuses the resource group and ACR, builds the container image with `az acr build`, deploys `infra\azure\sync-server\main.bicep`, and prints the health and WebSocket URLs.

The workflow intentionally keeps inputs small. You provide:

- `name_prefix` — defaults to `mydenicek-core-dev`
  (for this repo it should be `mydenicek-core-krsion-dev`)
- `location` — defaults to `westeurope`
- `image_tag` — defaults to `latest`

It derives the rest:

- resource group = `rg-<name_prefix>`
- App Service plan = `asp-<name_prefix>`
- web app = `<name_prefix>-sync`
- ACR = `<name_prefix-without-hyphens-or-symbols>acr`
- image repository = `sync-server`
- App Service SKU = `F1` / `Free`

### One-time Azure OIDC setup

Run these commands once after authenticating with Azure CLI:

```powershell
$RepoOwner = "<github-owner>"
$RepoName = "<github-repo>"
$Branch = "main"
$Scope = "/subscriptions/$(az account show --query id -o tsv)"
$AppName = "mydenicek-core-github-actions"

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
  description = "GitHub Actions access for sync-server infra"
  audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json -Compress

az ad app federated-credential create `
  --id $AppId `
  --parameters $FederatedCredential
```

Why two role assignments:

- `Contributor` lets the workflow create the resource group, ACR, App Service plan, and web app
- `User Access Administrator` is needed because the Bicep template creates the `AcrPull` role assignment for the web app identity

The example uses **subscription scope** because the workflow creates the resource group. If you later decide to pre-create the resource group and lock the workflow down further, you can narrow the scope.

### GitHub repository variables

Create these repository variables in GitHub:

- `AZURE_CLIENT_ID` = the `$AppId` value
- `AZURE_TENANT_ID` = the `$TenantId` value
- `AZURE_SUBSCRIPTION_ID` = the `$SubscriptionId` value

### Running the workflow

Open the **Actions** tab, run **Azure sync-server infra**, and provide:

- name prefix
- location
- image tag

Runtime note: the sync server still persists room events to files, so keep it on a single App Service instance. If Free tier proves too constrained, rerun the workflow with `B1` / `Basic`.
