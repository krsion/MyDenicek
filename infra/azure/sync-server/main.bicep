targetScope = 'resourceGroup'

@description('Azure region for the deployment.')
param location string = resourceGroup().location

@description('Globally unique name of the Azure Container Registry.')
param containerRegistryName string

@description('Name of the Container Apps managed environment.')
param containerAppEnvironmentName string

@description('Globally unique name of the sync server container app.')
param containerAppName string

@description('Globally unique name of the persistence storage account.')
param persistenceStorageAccountName string

@description('Azure Files share name used for sync-server persistence.')
param persistenceShareName string = 'sync-data'

@description('Globally unique name of the Azure Static Web App.')
param staticWebAppName string

@description('Container image repository name, for example sync-server.')
param containerImageRepository string = 'sync-server'

@description('Container image tag to deploy.')
param containerImageTag string = 'latest'

@description('Path inside the container where the Azure Files share is mounted.')
param persistencePath string = '/mnt/sync-data'

@description('Optional tags applied to Azure resources.')
param tags object = {}

var acrPullRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
  tags: tags
}

var containerImageName = '${containerRegistry.properties.loginServer}/${containerImageRepository}:${containerImageTag}'

resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'none'
    }
  }
  tags: tags
}

resource persistenceStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: persistenceStorageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
  tags: tags
}

resource persistenceFileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  name: 'default'
  parent: persistenceStorage
}

resource persistenceShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: persistenceShareName
  parent: persistenceFileService
  properties: {
    enabledProtocols: 'SMB'
    shareQuota: 10
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  name: 'syncdata'
  parent: containerAppEnvironment
  properties: {
    azureFile: {
      accessMode: 'ReadWrite'
      accountKey: persistenceStorage.listKeys().keys[0].value
      accountName: persistenceStorage.name
      shareName: persistenceShare.name
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'sync-server'
          image: containerImageName
          env: [
            {
              name: 'HOSTNAME'
              value: '0.0.0.0'
            }
            {
              name: 'PERSISTENCE_PATH'
              value: persistencePath
            }
            {
              name: 'PORT'
              value: '8080'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              mountPath: persistencePath
              volumeName: 'syncdata'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'syncdata'
          storageName: environmentStorage.name
          storageType: 'AzureFile'
        }
      ]
    }
  }
  tags: tags
}

resource containerRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, containerApp.id, 'acr-pull')
  scope: containerRegistry
  properties: {
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2025-03-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    publicNetworkAccess: 'Enabled'
    stagingEnvironmentPolicy: 'Disabled'
  }
  tags: tags
}

output containerAppEnvironmentId string = containerAppEnvironment.id
output containerAppUrl string = 'https://${containerApp.properties.latestRevisionFqdn}'
output containerImage string = containerImageName
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output healthCheckUrl string = 'https://${containerApp.properties.latestRevisionFqdn}/healthz'
output persistenceShareName string = persistenceShare.name
output persistenceStorageAccountName string = persistenceStorage.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output webSocketSyncUrl string = 'wss://${containerApp.properties.latestRevisionFqdn}/sync'
