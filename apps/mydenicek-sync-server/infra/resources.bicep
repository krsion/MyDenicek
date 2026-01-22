// Azure resources for MyDenicek Sync Server

@description('Base name for all resources')
param baseName string

@description('Azure region for resources')
param location string

@description('Environment (dev, prod)')
param environment string

// Storage Account for Blob persistence
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: toLower(replace('${baseName}${environment}stor', '-', ''))
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

// Blob container for Loro documents
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource loroContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'loro-documents'
  properties: {
    publicAccess: 'None'
  }
}

// App Service Plan (Free F1 tier)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${baseName}-${environment}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: 'F1'
    tier: 'Free'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

// Web App
resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${baseName}-sync-${environment}'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      webSocketsEnabled: true
      alwaysOn: false // Not available on Free tier
      ftpsState: 'Disabled'
      appCommandLine: 'npm run start'
      appSettings: [
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'
        }
        {
          name: 'BLOB_CONTAINER_NAME'
          value: 'loro-documents'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
      ]
    }
  }
}

// Outputs
output webAppName string = webApp.name
output webAppHostname string = webApp.properties.defaultHostName
output storageAccountName string = storageAccount.name
