# Setup Windows Scheduled Task to run 9Router with Administrator privileges without UAC prompts
$ErrorActionPreference = "Stop"

$taskName = "9Router-Admin"
$nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    $nodePath = "$env:ProgramFiles\nodejs\node.exe"
}

$cliPath = "$env:APPDATA\npm\node_modules\9router\cli.js"

# Check if elevated
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Re-launching with Administrator privileges to register Scheduled Task..." -ForegroundColor Cyan
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$cliPath`" --tray --skip-update"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Register or update task
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Host "✅ Scheduled Task '$taskName' registered successfully with Highest (Admin) privileges!" -ForegroundColor Green

# Create 9router-admin.cmd in npm global directory so user can type '9router-admin' in terminal
$npmDir = "$env:APPDATA\npm"
if (Test-Path $npmDir) {
    $cmdPath = "$npmDir\9router-admin.cmd"
    $cmdContent = "@echo off`r`nschtasks /run /tn `"$taskName`" >nul 2>&1`r`necho [9Router] Started with Administrator privileges (System Tray).`r`n"
    [System.IO.File]::WriteAllText($cmdPath, $cmdContent, [System.Text.Encoding]::ASCII)
    Write-Host "✅ Command '9router-admin' created at $cmdPath" -ForegroundColor Green
}

# Create Desktop Shortcut
$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath("Desktop")
$shortcut = $wsh.CreateShortcut("$desktop\9Router (Admin).lnk")
$shortcut.TargetPath = "schtasks.exe"
$shortcut.Arguments = "/run /tn `"$taskName`""
$shortcut.IconLocation = "$nodePath,0"
$shortcut.Description = "Start 9Router with Administrator privileges"
$shortcut.Save()
Write-Host "✅ Desktop shortcut '9Router (Admin)' created!" -ForegroundColor Green
