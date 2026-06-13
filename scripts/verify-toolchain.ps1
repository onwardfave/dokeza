$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$wingetPackageRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
$candidatePaths = @(
  (Join-Path $env:USERPROFILE ".cargo\bin"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links")
)

if (Test-Path $wingetPackageRoot) {
  $candidatePaths += Get-ChildItem -Path $wingetPackageRoot -Directory |
    ForEach-Object { $_.FullName }
}

$env:Path = (($candidatePaths | Where-Object { Test-Path $_ }) -join ";") + ";" + $env:Path

function Test-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    throw "$Name was not found on PATH"
  }

  Write-Host "==> $Name $($Arguments -join ' ')"
  & $Name @Arguments
}

Push-Location $repoRoot
try {
  Test-Command -Name "node" -Arguments @("--version")
  Test-Command -Name "pnpm" -Arguments @("--version")
  Test-Command -Name "git" -Arguments @("--version")
  Test-Command -Name "docker" -Arguments @("--version")
  Test-Command -Name "gh" -Arguments @("--version")
  Test-Command -Name "cargo" -Arguments @("--version")
  Test-Command -Name "rustc" -Arguments @("--version")
  Test-Command -Name "rustfmt" -Arguments @("--version")
  Test-Command -Name "terraform" -Arguments @("version")
  Test-Command -Name "gitleaks" -Arguments @("version")
  Test-Command -Name "trivy" -Arguments @("--version")

  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (!(Test-Path $vswhere)) {
    throw "vswhere.exe was not found; install Visual Studio Build Tools with the C++ workload"
  }

  $vcInstall = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ([string]::IsNullOrWhiteSpace($vcInstall)) {
    throw "Visual Studio C++ build tools were not found"
  }

  Write-Host "==> Visual Studio C++ tools"
  Write-Host $vcInstall
}
finally {
  Pop-Location
}
