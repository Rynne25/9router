param(
    [string]$TgzPath = "",
    [string]$LogFile = "$env:TEMP\9router-install-local.log",
    [string]$TargetAppData = "$env:APPDATA"
)

$ErrorActionPreference = "Continue"

function Resolve-LatestTgz {
    param([string]$InputPath)
    if ($InputPath -and (Test-Path $InputPath)) {
        return (Resolve-Path $InputPath).Path
    }
    $repoRoot = Split-Path $PSScriptRoot -Parent
    $latest = Get-ChildItem -Path $repoRoot -Filter "9router-*.tgz" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "No 9router-*.tgz found in $repoRoot"
    }
    return $latest.FullName
}

$resolvedTgz = Resolve-LatestTgz -InputPath $TgzPath
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $isAdmin) {
    if (Test-Path $LogFile) {
        Remove-Item $LogFile -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Requesting UAC Administrator elevation to install $resolvedTgz ..."
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -TgzPath `"$resolvedTgz`" -LogFile `"$LogFile`" -TargetAppData `"$TargetAppData`""
    try {
        $proc = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList $argList
        if (Test-Path $LogFile) {
            Get-Content $LogFile
        }
        exit $proc.ExitCode
    } catch {
        Write-Error "UAC elevation cancelled or failed: $($_.Exception.Message)"
        exit 1
    }
}

$logLines = New-Object System.Collections.Generic.List[string]
function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
    $logLines.Add($line)
    Write-Host $line
}

try {
    Write-Log "Elevated install started for $resolvedTgz"
    Write-Log "Target AppData: $TargetAppData"

    $pidsToStop = New-Object System.Collections.Generic.HashSet[int]

    $portConns = Get-NetTCPConnection -LocalPort 20128 -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $portConns) {
        if ($conn.OwningProcess -and $conn.OwningProcess -ne $PID) {
            [void]$pidsToStop.Add([int]$conn.OwningProcess)
        }
    }

    $nodeProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($np in $nodeProcs) {
        if ($np.ProcessId -ne $PID -and $np.CommandLine -and ($np.CommandLine -like "*9router*" -or $np.CommandLine -like "*custom-server*")) {
            [void]$pidsToStop.Add([int]$np.ProcessId)
        }
    }

    $mitmPidFile = Join-Path $TargetAppData "9router\mitm\.mitm.pid"
    if (Test-Path $mitmPidFile) {
        $mPid = 0
        if ([int]::TryParse((Get-Content $mitmPidFile -Raw -ErrorAction SilentlyContinue).Trim(), [ref]$mPid) -and $mPid -ne $PID) {
            [void]$pidsToStop.Add($mPid)
        }
    }

    foreach ($extraName in @("cloudflared", "tray_windows_release")) {
        $extras = Get-Process -Name $extraName -ErrorAction SilentlyContinue
        foreach ($ex in $extras) {
            if ($ex.Id -ne $PID) {
                [void]$pidsToStop.Add([int]$ex.Id)
            }
        }
    }

    if ($pidsToStop.Count -gt 0) {
        Write-Log "Stopping processes: $($pidsToStop -join ', ')"
        foreach ($targetPid in $pidsToStop) {
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Log "No running 9router processes found on port 20128"
    }

    $waitStart = Get-Date
    while (((Get-Date) - $waitStart).TotalSeconds -lt 8) {
        $stillListening = Get-NetTCPConnection -LocalPort 20128 -State Listen -ErrorAction SilentlyContinue
        if (-not $stillListening) { break }
        Start-Sleep -Milliseconds 300
    }
    Start-Sleep -Milliseconds 1500

    $npmPrefix = Join-Path $TargetAppData "npm"
    $env:npm_config_prefix = $npmPrefix
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmCmd) {
        $npmCmd = "$env:ProgramFiles\nodejs\npm.cmd"
    }

    $installExit = 1
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        Write-Log "Running npm.cmd install -g (attempt $attempt/2)..."
        $output = & $npmCmd install -g $resolvedTgz --prefix $npmPrefix 2>&1
        $installExit = $LASTEXITCODE
        foreach ($o in $output) {
            $logLines.Add("  $o")
        }
        if ($installExit -eq 0) {
            break
        }
        if ($attempt -lt 2) {
            Write-Log "npm install exited with $installExit, waiting 2s before retry..."
            Start-Sleep -Seconds 2
        }
    }

    if ($installExit -ne 0) {
        throw "npm install -g failed with exit code $installExit"
    }

    $installedPkgPath = Join-Path $npmPrefix "node_modules\9router\package.json"
    if (Test-Path $installedPkgPath) {
        $pkgJson = Get-Content $installedPkgPath -Raw | ConvertFrom-Json
        Write-Log "Installed global 9router version: $($pkgJson.version)"
    } else {
        Write-Log "Warning: package.json not found at $installedPkgPath"
    }

    $taskExists = $false
    try {
        $null = schtasks /query /tn "9Router-Admin" 2>$null
        if ($LASTEXITCODE -eq 0) { $taskExists = $true }
    } catch {}

    if ($taskExists) {
        Write-Log "Starting Scheduled Task '9Router-Admin'..."
        $taskOut = schtasks /run /tn "9Router-Admin" 2>&1
        foreach ($t in $taskOut) { $logLines.Add("  $t") }
    } else {
        $runner = Join-Path $npmPrefix "9router.cmd"
        Write-Log "Task '9Router-Admin' not found; starting $runner --tray --skip-update"
        Start-Process -FilePath $runner -ArgumentList "--tray", "--skip-update" -WindowStyle Hidden
    }

    $apiOk = $false
    $pollStart = Get-Date
    while (((Get-Date) - $pollStart).TotalSeconds -lt 15) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:20128/api/antigravity/plugins" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                $apiOk = $true
                Write-Log "Health check passed: GET /api/antigravity/plugins -> HTTP 200"
                break
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }

    if (-not $apiOk) {
        Write-Log "Warning: /api/antigravity/plugins did not return 200 within 15s"
    }

    [System.IO.File]::WriteAllLines($LogFile, $logLines, [System.Text.Encoding]::UTF8)
    exit 0
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    [System.IO.File]::WriteAllLines($LogFile, $logLines, [System.Text.Encoding]::UTF8)
    exit 1
}
