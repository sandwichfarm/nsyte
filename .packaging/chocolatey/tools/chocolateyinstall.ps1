$ErrorActionPreference = 'Stop'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$packageName = 'nsyte'
$url64 = 'https://github.com/sandwichfarm/nsyte/releases/download/v0.27.1/nsyte-windows-0.27.1.exe'
$filePath = Join-Path $toolsDir 'nsyte.exe'

$packageArgs = @{
  packageName   = $packageName
  fileFullPath  = $filePath
  url64bit      = $url64
  checksum64    = '9b7776a28f9091a56742c42152f38de759702915b26060005630975314239a38'
  checksumType64= 'sha256'
  validExitCodes= @(0)
}

Get-ChocolateyWebFile @packageArgs
Install-BinFile -Name 'nsyte' -Path $filePath
