# Keep this file ASCII-compatible because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
param(
  [string]$CodexExe = $env:CODEX_DESKTOP_EXE,
  [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:CODEX_TRANSLATOR_CDP_PORT = [string]$Port

function Test-CdpPort {
  param([int]$CandidatePort)
  try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:$CandidatePort/json/version" -TimeoutSec 1
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-CdpPort -CandidatePort $Port)) {
  if (-not $CodexExe) {
    $running = Get-Process ChatGPT -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and $_.Path -like '*OpenAI.Codex*\app\ChatGPT.exe' } |
      Select-Object -First 1
    if ($running) { $CodexExe = $running.Path }
  }

  if (-not $CodexExe) {
    $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
      Sort-Object Version -Descending |
      Select-Object -First 1
    if ($package) {
      $candidate = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
      if (Test-Path -LiteralPath $candidate) { $CodexExe = $candidate }
    }
  }

  if (-not $CodexExe -or -not (Test-Path -LiteralPath $CodexExe)) {
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
