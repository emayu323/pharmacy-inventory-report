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

$processStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processStartInfo.FileName = $AppPath
$processStartInfo.UseShellExecute = $false
$processStartInfo.RedirectStandardOutput = $true
$processStartInfo.RedirectStandardError = $true

foreach ($argument in $arguments) {
    [void]$processStartInfo.ArgumentList.Add($argument)
}

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $processStartInfo

[void]$process.Start()
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()

$output = $stdoutTask.GetAwaiter().GetResult()
$errorOutput = $stderrTask.GetAwaiter().GetResult()
$exitCode = $process.ExitCode
$process.Dispose()

if ($exitCode -ne 0) {
    $errorDetails = $errorOutput.Trim()
    if ($errorDetails) {
        throw "Pre-update backup failed with exit code ${exitCode}: $errorDetails"
    }
    throw "Pre-update backup failed with exit code ${exitCode}"
}

if ($errorOutput.Trim()) {
    Write-Warning $errorOutput.Trim()
}

$output
