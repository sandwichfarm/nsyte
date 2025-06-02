$ErrorActionPreference = 'Stop'

$packageName = 'nsyte'

# Remove the shim
Uninstall-BinFile -Name 'nsyte'

Write-Host "$packageName has been uninstalled."