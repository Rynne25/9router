param(
  [int]$Port = 20128,
  [switch]$SkipBuild,
  [switch]$Background
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  # Stop any existing listener(s) on target port cleanly
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 -and $_ -ne $PID }
    foreach ($procId in $pids) {
      Write-Host "[local-prod] Stopping existing process $procId on port $Port..."
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    $deadline = (Get-Date).AddSeconds(5)
    while ((Get-Date) -lt $deadline) {
      $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      if (-not $remaining) {
        break
      }
      Start-Sleep -Milliseconds 200
    }

    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
      Write-Error "[local-prod] Port $Port is still occupied after 5s."
      exit 1
    }
  }

  $standaloneEntry = Join-Path $repoRoot ".next\standalone\custom-server.js"

  if (-not $SkipBuild) {
    Write-Host "[local-prod] Running npm run build..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      Write-Error "[local-prod] npm run build failed with exit code $LASTEXITCODE."
      exit $LASTEXITCODE
    }
    if (-not (Test-Path $standaloneEntry)) {
      Write-Error "[local-prod] Missing standalone server entry at $standaloneEntry."
      exit 1
    }
  } elseif (-not (Test-Path $standaloneEntry)) {
    Write-Error "[local-prod] -SkipBuild specified, but $standaloneEntry does not exist. Run npm run build first."
    exit 1
  }

  $env:PORT = "$Port"
  $env:HOSTNAME = "127.0.0.1"
  $env:NODE_ENV = "production"

  $targetUrl = "http://127.0.0.1:$Port/dashboard"

  if ($Background) {
    $nextDir = Join-Path $repoRoot ".next"
    if (-not (Test-Path $nextDir)) {
      New-Item -ItemType Directory -Path $nextDir -Force | Out-Null
    }

    $stdoutLog = Join-Path $nextDir "local-prod.log"
    $stderrLog = Join-Path $nextDir "local-prod.err.log"

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process `
      -FilePath "node" `
      -ArgumentList ".next/standalone/custom-server.js" `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -PassThru

    $ready = $false
    $pollDeadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $pollDeadline) {
      if ($proc.HasExited) {
        Write-Error "[local-prod] Server process $($proc.Id) exited early with code $($proc.ExitCode). Check $stderrLog"
        exit 1
      }
      try {
        $resp = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
          $ready = $true
          break
        }
      } catch {
        # Wait and retry until server binds
      }
      Start-Sleep -Milliseconds 300
    }

    $stopwatch.Stop()
    if (-not $ready) {
      Write-Error "[local-prod] Timed out after 20s waiting for $targetUrl (PID $($proc.Id)). Check $stderrLog"
      exit 1
    }

    $bootSeconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 2)
    Write-Host "[local-prod] Ready: $targetUrl | PID: $($proc.Id) | Boot: ${bootSeconds}s"
    exit 0
  }

  Write-Host "[local-prod] Starting foreground server at $targetUrl..."
  & node .next/standalone/custom-server.js
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
