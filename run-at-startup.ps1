# Makes the website (and Rentals Control) start automatically when Windows starts, even before anyone logs in.
# Run in an administrator PowerShell, in this folder:
#   powershell -ExecutionPolicy Bypass -File .\run-at-startup.ps1
# To undo:  Unregister-ScheduledTask -TaskName "Rental Rates website" -Confirm:$false

$ErrorActionPreference = "Stop"
$folder = $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host "Node.js was not found. Install it first (see README)." -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $folder ".env"))) { Copy-Item (Join-Path $folder ".env.example") (Join-Path $folder ".env") }

# Settings (port, address, updates) come from the .env file in this folder.
$action   = New-ScheduledTaskAction -Execute $node -Argument "src\supervisor.js" -WorkingDirectory $folder
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Stop-ScheduledTask -TaskName "Rental Rates website" -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "Rental Rates website" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName "Rental Rates website"
Write-Host "Done. The website now starts with Windows. Open 'Rentals Control.bat' to see it." -ForegroundColor Green
