[CmdletBinding()]
param(
    [string]$Artifact,
    [switch]$DryRun,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ReleaseRoot = Join-Path -Path $Root -ChildPath 'releases/windows'

function Show-Usage {
    @'
Usage: scripts\install-windows.ps1 [-Artifact PATH] [-DryRun] [-Help]

Install one staged Windows artifact without rebuilding or deleting anything:
  .msi      launches Windows Installer (msiexec.exe)
  .exe      launches the staged NSIS installer and waits for it to finish

When -Artifact is omitted, exactly one .msi or .exe is required under
releases\windows\. Pass -DryRun to validate selection without launching it.

Building these artifacts is separate from installation and requires a native
Windows build environment. See docs/NETOZE_DISTRIBUTION.md for the Rust MSVC,
Visual Studio C++/Windows SDK, Node/npm, and Npcap SDK prerequisites.
'@ | Write-Host
}

function Fail([string]$Message) {
    throw "[NET0ZE install] ERROR: $Message"
}

if ($Help) {
    Show-Usage
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Artifact)) {
    if (-not (Test-Path -LiteralPath $ReleaseRoot -PathType Container)) {
        Fail "no Windows release directory found at $ReleaseRoot; build and stage a release first."
    }
    $candidates = @(Get-ChildItem -LiteralPath $ReleaseRoot -Recurse -File | Where-Object {
        $_.Extension.ToLowerInvariant() -in @('.msi', '.exe')
    })
    if ($candidates.Count -eq 0) {
        Fail "no staged .msi or .exe found under $ReleaseRoot; run a Windows release build first."
    }
    if ($candidates.Count -gt 1) {
        $paths = ($candidates | ForEach-Object { "  $($_.FullName)" }) -join [Environment]::NewLine
        Fail "more than one Windows artifact is staged; choose one with -Artifact:`n$paths"
    }
    $Artifact = $candidates[0].FullName
}

$artifactPath = if ([IO.Path]::IsPathRooted($Artifact)) {
    $Artifact
} else {
    Join-Path -Path (Get-Location) -ChildPath $Artifact
}

if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
    Fail "artifact is not a regular file: $artifactPath"
}
$artifactPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $artifactPath).Path)
$extension = [IO.Path]::GetExtension($artifactPath).ToLowerInvariant()
if ($extension -notin @('.msi', '.exe')) {
    Fail "unsupported artifact '$artifactPath'; expected a .msi or .exe file."
}

Write-Host "[NET0ZE install] validated Windows artifact: $artifactPath"
if ($DryRun) {
    Write-Host "[NET0ZE install] dry run: would launch $extension installer"
    exit 0
}

if ($extension -eq '.msi') {
    # Quote the path explicitly because Start-Process joins ArgumentList values.
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', ('"{0}"' -f $artifactPath)) -Wait -PassThru
} else {
    $process = Start-Process -FilePath $artifactPath -Wait -PassThru
}

if ($process.ExitCode -ne 0) {
    Fail "installer exited with code $($process.ExitCode). No cleanup was attempted."
}
Write-Host "[NET0ZE install] installer completed successfully."
