param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath,

    [string]$ToVersion = "",
    [string]$FromVersion = "",
    [string]$DbPath = "",
    [string]$BackupDir = "",
    [string]$GoogleDriveFolder = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $AppPath)) {
    throw "AppPath was not found: $AppPath"
}

$arguments = @("--pre-update-backup")

if ($ToVersion.Trim()) {
    $arguments += @("--to-version", $ToVersion.Trim())
}
if ($FromVersion.Trim()) {
    $arguments += @("--from-version", $FromVersion.Trim())
}
if ($DbPath.Trim()) {
    $arguments += @("--db-path", $DbPath.Trim())
}
if ($BackupDir.Trim()) {
    $arguments += @("--backup-dir", $BackupDir.Trim())
}
if ($GoogleDriveFolder.Trim()) {
    $arguments += @("--google-drive-folder", $GoogleDriveFolder.Trim())
}

$output = & $AppPath @arguments
if ($LASTEXITCODE -ne 0) {
    throw "Pre-update backup failed with exit code $LASTEXITCODE"
}

$output
