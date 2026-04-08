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

@description('Container image repository name, for example sync-server.')
param containerImageRepository string = 'sync-server'

@description('Container image tag to deploy.')
param containerImageTag string = 'latest'

@description('Optional fully qualified container image name. When empty, the image is resolved from the registry, repository, and tag parameters.')
param containerImageName string = ''

@description('Container port exposed through Azure Container Apps ingress.')
param containerPort int = 8080

@description('HTTP path used for readiness and liveness probes, and for the health-check output.')
param healthCheckPath string = '/healthz'

@description('Whether to configure readiness and liveness probes for the container.')
param enableHealthProbes bool = true

@description('Path inside the container where the Azure Files share is mounted.')
param persistencePath string = '/mnt/sync-data'

@description('Optional tags applied to Azure resources.')
param tags object = {}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
  tags: tags
}

var resolvedContainerImageName = empty(containerImageName)
  ? '${containerRegistry.properties.loginServer}/${containerImageRepository}:${containerImageTag}'
  : containerImageName

resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvironmentName
  location: location
  properties: {}
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
      secrets: [
        {
          name: 'acr-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
      ]
      ingress: {
        allowInsecure: false
        external: true
        targetPort: containerPort
        transport: 'auto'
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'sync-server'
          image: resolvedContainerImageName
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
              value: '${containerPort}'
            }
          ]
          probes: enableHealthProbes
            ? [
                {
                  type: 'Liveness'
                  httpGet: {
                    path: healthCheckPath
                    port: containerPort
                  }
                  initialDelaySeconds: 10
                  periodSeconds: 30
                }
                {
                  type: 'Readiness'
                  httpGet: {
                    path: healthCheckPath
                    port: containerPort
                  }
                  initialDelaySeconds: 5
                  periodSeconds: 15
                }
              ]
            : []
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

output containerAppEnvironmentId string = containerAppEnvironment.id
output containerAppUrl string = 'https://${containerApp.properties.latestRevisionFqdn}'
output containerImage string = resolvedContainerImageName
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output healthCheckUrl string = 'https://${containerApp.properties.latestRevisionFqdn}${healthCheckPath}'
output persistenceShareName string = persistenceShare.name
output persistenceStorageAccountName string = persistenceStorage.name
output webSocketSyncUrl string = 'wss://${containerApp.properties.latestRevisionFqdn}/sync'
