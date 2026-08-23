# Keep this file ASCII-compatible because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
param(
  [string]$CodexExe = $env:CODEX_DESKTOP_EXE,
  [int]$Port = 9222,
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CODEX_TRANSLATOR_CDP_PORT = [string]$Port
$backendMutex = New-Object System.Threading.Mutex($false, 'Local\CodexTranslationPluginBackend')
$ownsBackendMutex = $false

function Test-CdpPort {
  param([int]$CandidatePort)
  try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:$CandidatePort/json/version" -TimeoutSec 1
    return $true
  } catch {
    return $false
  }
}

function Find-CodexExecutable {
  param([string]$PreferredPath)

  $candidates = @()
  if ($PreferredPath) { $candidates += $PreferredPath }

  $running = Get-Process ChatGPT -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -like '*OpenAI.Codex*' }
  $candidates += @($running | ForEach-Object { $_.Path })

  if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    $packages = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue)
    if ($packages.Count -eq 0) {
      $packages = @(Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
        $_.PackageFamilyName -like 'OpenAI.Codex_*'
      })
    }
    $packages = $packages | Sort-Object Version -Descending
    foreach ($package in $packages) {
      $candidates += Join-Path $package.InstallLocation 'app\ChatGPT.exe'

      $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
      if (Test-Path -LiteralPath $manifestPath) {
        try {
          [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
          foreach ($application in @($manifest.Package.Applications.Application)) {
            $relativePath = [string]$application.Executable
            if ($relativePath) {
              $candidates += Join-Path $package.InstallLocation $relativePath
            }
          }
        } catch {
          # Fall through to the known package path and recursive fallback.
        }
      }

    }
  }

  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\OpenAI Codex\ChatGPT.exe'
    $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Codex\ChatGPT.exe'
  }

  $seen = @{}
  foreach ($candidate in $candidates) {
    if (-not $candidate -or $seen.ContainsKey($candidate)) { continue }
    $seen[$candidate] = $true
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Get-Item -LiteralPath $candidate).FullName
    }
  }
  return $null
}

try {
  try {
    $ownsBackendMutex = $backendMutex.WaitOne(0, $false)
  } catch [System.Threading.AbandonedMutexException] {
    $ownsBackendMutex = $true
  }
  if (-not $ownsBackendMutex) {
    Write-Host 'The Codex translation backend is already running.'
    return
  }

  if (-not (Test-CdpPort -CandidatePort $Port)) {
    $CodexExe = Find-CodexExecutable -PreferredPath $CodexExe

    if (-not $CodexExe) {
      throw 'Codex desktop executable was not found. Set CODEX_DESKTOP_EXE or pass -CodexExe with the ChatGPT.exe path.'
    }

    $existing = Get-Process ChatGPT -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and ($_.Path -eq $CodexExe -or $_.Path -like '*OpenAI.Codex*\app\ChatGPT.exe') }
    if ($existing) {
      throw 'Codex is running without CDP. Fully exit Codex, then run this script again.'
    }

    Write-Host "Starting Codex with CDP bound to 127.0.0.1:$Port ..."
    Start-Process -FilePath $CodexExe -ArgumentList @(
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=$Port"
    )
  }

  Set-Location -LiteralPath $root
  node "$root\hook.mjs"
} catch {
  if ($LogPath) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $LogPath -Value "[$timestamp] $($_.Exception.Message)" -Encoding UTF8
  }
  throw
} finally {
  if ($ownsBackendMutex) { $backendMutex.ReleaseMutex() }
  $backendMutex.Dispose()
}
