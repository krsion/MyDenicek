// Azure infrastructure for MyDenicek Sync Server
// Deploy with: az deployment sub create --location <region> --template-file main.bicep --parameters main.bicepparam

targetScope = 'subscription'

@description('Base name for all resources')
param baseName string = 'mydenicek'

@description('Azure region for resources')
param location string = 'westeurope'

@description('Environment (dev, prod)')
param environment string = 'prod'

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: '${baseName}-${environment}-rg'
  location: location
}

// Deploy resources into the resource group
module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    baseName: baseName
    location: location
    environment: environment
  }
}

// Outputs for GitHub Actions and documentation
output resourceGroupName string = rg.name
output webAppName string = resources.outputs.webAppName
output webAppHostname string = resources.outputs.webAppHostname
output storageAccountName string = resources.outputs.storageAccountName
