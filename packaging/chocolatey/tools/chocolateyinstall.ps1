$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$packageName = 'nsyte'
$url64 = 'https://github.com/sandwichfarm/nsyte/releases/download/v0.7.0/nsyte-windows.exe'

$packageArgs = @{
  packageName   = $packageName
  unzipLocation = $toolsDir
  url64bit      = $url64
  softwareName  = 'nsyte*'
  checksum64    = 'PLACEHOLDER_CHECKSUM'
  checksumType64= 'sha256'
  fileType      = 'exe'
  silentArgs    = ''
  validExitCodes= @(0)
}

# Download and place the executable
Get-ChocolateyWebFile @packageArgs

# Rename the downloaded file to nsyte.exe
$exePath = Join-Path $toolsDir "nsyte-windows.exe"
$finalPath = Join-Path $toolsDir "nsyte.exe"

if (Test-Path $exePath) {
  Move-Item -Path $exePath -Destination $finalPath -Force
}

# Create a shim (executable will be available in PATH as 'nsyte')
Install-BinFile -Name 'nsyte' -Path $finalPath