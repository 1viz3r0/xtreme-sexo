<#
.SYNOPSIS
    Install the newest published NET0ZE release on Windows.

.DESCRIPTION
    Resolves the latest GitHub release, downloads the NSIS installer, verifies
    its SHA-256 against the published checksums, and then runs it. Nothing is
    rebuilt and nothing unrelated is removed.

    One-command form (PowerShell):

        irm https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/scripts/install-release.ps1 | iex

    Downloaded-script form:

        powershell -ExecutionPolicy Bypass -File .\install-release.ps1

.PARAMETER Version
    Release tag to install, for example v2.0.0. Defaults to the latest release.

.PARAMETER Silent
    Run the installer with /S (no wizard pages). Default is the normal wizard.

.PARAMETER DryRun
    Download and verify only; do not launch the installer.

.PARAMETER KeepFile
    Leave the downloaded installer on disk instead of deleting it afterwards.

.EXAMPLE
    .\install-release.ps1 -DryRun

    Downloads the newest installer and checks its SHA-256 without installing.

.EXAMPLE
    .\install-release.ps1 -Silent

    Installs silently for the current user.
#>
[CmdletBinding()]
param(
    [string]$Version = 'latest',
    [switch]$Silent,
    [switch]$DryRun,
    [switch]$KeepFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo = if ($env:NET0ZE_REPO) { $env:NET0ZE_REPO } else { '1viz3r0/xtreme-sexo' }

function Say([string]$Message) { Write-Host "[NET0ZE] $Message" }

if ($Version -eq 'latest') {
    # Stable asset name: no API call, no tag parsing, no rate limit.
    $assetName = 'NET0ZE_x64-setup.exe'
    $baseUrl = "https://github.com/$Repo/releases/latest/download"
}
else {
    $numeric = $Version.TrimStart('v')
    $assetName = "NET0ZE_${numeric}_x64-setup.exe"
    $baseUrl = "https://github.com/$Repo/releases/download/$Version"
}
$workDir = Join-Path $env:TEMP ("netoze-install-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))

New-Item -ItemType Directory -Path $workDir -Force | Out-Null

try {
    $installerPath = Join-Path $workDir $assetName
    $sumsPath = Join-Path $workDir 'SHA256SUMS.txt'

    $label = if ($Version -eq 'latest') { 'latest release' } else { "release $Version" }
    Say "$label, windows x64 build"

    Say "downloading $assetName"
    Invoke-WebRequest -Uri "$baseUrl/$assetName" -OutFile $installerPath -UseBasicParsing `
        -Headers @{ 'User-Agent' = 'netoze-installer' }

    Say 'downloading SHA256SUMS.txt'
    Invoke-WebRequest -Uri "$baseUrl/SHA256SUMS.txt" -OutFile $sumsPath -UseBasicParsing `
        -Headers @{ 'User-Agent' = 'netoze-installer' }

    Say 'verifying SHA-256'
    $expected = $null
    foreach ($line in Get-Content -LiteralPath $sumsPath) {
        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$' -and $Matches[2].Trim() -eq $assetName) {
            $expected = $Matches[1].ToLowerInvariant()
        }
    }
    if (-not $expected) { throw "[NET0ZE] ERROR: no checksum published for $assetName." }

    $actual = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        throw "[NET0ZE] ERROR: checksum mismatch for $assetName; refusing to install."
    }
    Say 'checksum OK'

    if ($DryRun) {
        Say "dry run: verified $assetName; no changes made"
        return
    }

    $installerArgs = if ($Silent) { '/S' } else { '' }
    Say 'launching the installer'
    $process = Start-Process -FilePath $installerPath -ArgumentList $installerArgs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "[NET0ZE] ERROR: installer exited with code $($process.ExitCode). No cleanup was attempted."
    }

    Say 'installed. Launch NET0ZE from the Start menu.'
    Say 'note: live packet capture additionally needs the Npcap runtime.'
}
finally {
    if (-not $KeepFile -and (Test-Path -LiteralPath $workDir)) {
        Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
