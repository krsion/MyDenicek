# Azure deployment for `apps\sync-server`, `apps\playground`, and `apps\mywebnicek`

This repo now targets:

- **Azure Container Apps Consumption** for the sync server
- **Azure Static Web Apps Free** for both browser apps

The supported workflows are:

- `.github\workflows\infra-setup.yml` — provisions Azure resources with GitHub
  OIDC
- `.github\workflows\deploy-app.yml` — builds and deploys the sync server image,
  playground, and mywebnicek

## What the infra workflow creates

From a single `name_prefix`, the workflow derives:

- resource group = `rg-<name_prefix>`
- Azure Container Registry = `<name_prefix-without-symbols>acr`
- Container Apps environment = `cae-<name_prefix>`
- sync server container app = `<name_prefix>-sync`
- persistence storage account = `<name_prefix-without-symbols>sync`
- playground Static Web App = `<name_prefix>-playground`
- mywebnicek Static Web App = `<name_prefix>-mywebnicek`

The Bicep template also creates an Azure Files share mounted into the
sync-server container. The app is configured with:

- **Consumption**-style serverless hosting
- **min replicas = 0**
- **max replicas = 1**

That `max replicas = 1` limit is intentional because the current sync server
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

## Run the infra workflow

Run **Azure infra setup** from the Actions tab with:

- `name_prefix` — defaults to `mydenicek-krsion-dev`
- `location` — defaults to `westeurope`

After the workflow finishes, store both Static Web Apps deployment tokens as
GitHub repository secrets.

From your machine, use:

```powershell
$NamePrefix = "mydenicek-krsion-dev"
$NormalizedPrefix = $NamePrefix.ToLower() -replace "[^a-z0-9]+", "-"
$PlaygroundStaticWebAppName = "$NormalizedPrefix-playground"
$MyWebnicekStaticWebAppName = "$NormalizedPrefix-mywebnicek"
$ResourceGroup = "rg-$NormalizedPrefix"

az staticwebapp secrets list `
  --name $PlaygroundStaticWebAppName `
  --resource-group $ResourceGroup `
  --query properties.apiKey `
  -o tsv

az staticwebapp secrets list `
  --name $MyWebnicekStaticWebAppName `
  --resource-group $ResourceGroup `
  --query properties.apiKey `
  -o tsv
```

Paste the values into these repository secrets:

- `AZURE_STATIC_WEB_APPS_API_TOKEN_PLAYGROUND`
- `AZURE_STATIC_WEB_APPS_API_TOKEN_MYWEBNICEK`

## Run the app deploy workflow

Run **Deploy sync server, playground, and mywebnicek** with:

- `name_prefix` — defaults to `mydenicek-krsion-dev`
- `image_tag` — defaults to `latest`

It will:

- build the sync-server image in ACR
- redeploy the Container App to the requested image tag
- build `apps\playground`
- build `apps\mywebnicek`
- upload both browser apps to Azure Static Web Apps
