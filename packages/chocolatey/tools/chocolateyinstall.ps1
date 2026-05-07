$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$packageName = 'nsyte'
$version = 'PLACEHOLDER_VERSION'
$url64 = "https://github.com/sandwichfarm/nsyte/releases/download/v$version/nsyte-windows-$version.exe"
$finalPath = Join-Path $toolsDir 'nsyte.exe'

$packageArgs = @{
  packageName   = $packageName
  fileFullPath  = $finalPath
  url64bit      = $url64
  softwareName  = 'nsyte*'
  checksum64    = 'PLACEHOLDER_SHA256_WINDOWS'
  checksumType64= 'sha256'
  fileType      = 'exe'
  silentArgs    = ''
  validExitCodes= @(0)
}

Get-ChocolateyWebFile @packageArgs

Install-BinFile -Name 'nsyte' -Path $finalPath
