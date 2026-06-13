$ErrorActionPreference = "Stop"

function Install-WinGetPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Id,
    [string] $Override
  )

  $installed = winget list --id $Id --exact --source winget 2>$null
  if ($LASTEXITCODE -eq 0 -and $installed -match [regex]::Escape($Id)) {
    Write-Host "$Id is already installed"
    return
  }

  $arguments = @(
    "install",
    "--id", $Id,
    "--exact",
    "--source", "winget",
    "--accept-package-agreements",
    "--accept-source-agreements"
  )

  if ($Override) {
    $arguments += @("--override", $Override)
  }

  winget @arguments
}

Install-WinGetPackage -Id "Rustlang.Rustup"
Install-WinGetPackage -Id "Hashicorp.Terraform"
Install-WinGetPackage -Id "Gitleaks.Gitleaks"
Install-WinGetPackage -Id "AquaSecurity.Trivy"
Install-WinGetPackage `
  -Id "Microsoft.VisualStudio.2022.BuildTools" `
  -Override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

corepack enable
pnpm install --frozen-lockfile

Write-Host "Setup complete. Open a new terminal, then run scripts/verify-toolchain.ps1."
