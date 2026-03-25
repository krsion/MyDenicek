targetScope = 'resourceGroup'

@description('Azure region for the App Service deployment.')
param location string = resourceGroup().location

@description('Name of the Linux App Service plan.')
param appServicePlanName string

@description('Globally unique name of the sync server web app.')
param webAppName string

@description('SKU name for the App Service plan.')
param appServiceSkuName string = 'F1'

@description('SKU tier for the App Service plan.')
param appServiceSkuTier string = 'Free'

@description('Optional Azure Container Registry name. When provided, the template grants the web app AcrPull with its system-assigned managed identity.')
param containerRegistryName string = ''

@description('Optional container registry login server. Leave empty when using Azure Container Registry and provide containerRegistryName instead.')
param containerRegistryLoginServer string = ''

@description('Container image repository name, for example sync-server.')
param containerImageRepository string = 'sync-server'

@description('Container image tag to deploy.')
param containerImageTag string = 'latest'

@description('Path inside the container for persisted room event logs. Use /home/... on App Service so the mounted storage is used.')
param persistencePath string = '/home/site/data'

@description('Whether to keep App Service storage mounted at /home.')
param enableAppServiceStorage bool = true

@description('Whether Always On should be enabled for the web app.')
param alwaysOn bool = false

@description('Optional tags applied to Azure resources.')
param tags object = {}

var resolvedContainerRegistryLoginServer = !empty(containerRegistryName)
  ? '${containerRegistryName}.azurecr.io'
  : containerRegistryLoginServer
var containerImageName = empty(resolvedContainerRegistryLoginServer)
  ? '${containerImageRepository}:${containerImageTag}'
  : '${resolvedContainerRegistryLoginServer}/${containerImageRepository}:${containerImageTag}'
var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource appServicePlan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServiceSkuName
    tier: appServiceSkuTier
    size: appServiceSkuName
    capacity: 1
  }
  properties: {
    reserved: true
  }
  tags: tags
}

resource webApp 'Microsoft.Web/sites@2025-03-01' = {
  name: webAppName
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      alwaysOn: alwaysOn
      acrUseManagedIdentityCreds: !empty(containerRegistryName)
      ftpsState: 'Disabled'
      healthCheckPath: '/healthz'
      http20Enabled: true
      linuxFxVersion: 'DOCKER|${containerImageName}'
      minTlsVersion: '1.2'
      webSocketsEnabled: true
    }
  }
  tags: tags
}

resource webAppAppSettings 'Microsoft.Web/sites/config@2025-03-01' = {
  name: 'appsettings'
  parent: webApp
  properties: {
    HOSTNAME: '0.0.0.0'
    PERSISTENCE_PATH: persistencePath
    PORT: '8080'
    WEBSITES_ENABLE_APP_SERVICE_STORAGE: enableAppServiceStorage ? 'true' : 'false'
    WEBSITES_PORT: '8080'
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = if (!empty(containerRegistryName)) {
  name: containerRegistryName
}

resource containerRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(containerRegistryName)) {
  name: guid(containerRegistry.id, webApp.id, 'acr-pull')
  scope: containerRegistry
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

output appServicePlanId string = appServicePlan.id
output containerImage string = containerImageName
output healthCheckUrl string = 'https://${webApp.properties.defaultHostName}/healthz'
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output webSocketSyncUrl string = 'wss://${webApp.properties.defaultHostName}/sync'
