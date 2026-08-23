# Keep this file ASCII-compatible because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
[CmdletBinding()]
param(
  [string]$InstallDir = $(Join-Path $env:LOCALAPPDATA 'CodexSelectionTranslator'),
  [string]$ShortcutPath = $(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Selection Translator.lnk'),
  [string]$SettingsDir = $(Join-Path $env:APPDATA 'CodexSelectionTranslator')
)

$ErrorActionPreference = 'Stop'
$installPath = [IO.Path]::GetFullPath($InstallDir)
$shortcutFullPath = [IO.Path]::GetFullPath($ShortcutPath)
$markerPath = Join-Path $installPath '.codex-selection-translator'
$hookPath = Join-Path $installPath 'src\hook.mjs'
$launcherPath = Join-Path $installPath 'scripts\start-codex-with-hook.ps1'

if ($installPath -eq [IO.Path]::GetPathRoot($installPath)) {
  throw "Refusing to remove a filesystem root: $installPath"
}

if (Test-Path -LiteralPath $shortcutFullPath -PathType Leaf) {
  Remove-Item -LiteralPath $shortcutFullPath -Force
}

if (Test-Path -LiteralPath $installPath -PathType Container) {
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    $remainingItems = @(Get-ChildItem -LiteralPath $installPath -Force -ErrorAction SilentlyContinue)
    if ($remainingItems.Count -gt 0) {
      throw "Refusing to remove a non-empty unmarked directory: $installPath"
    }
  }

  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.CommandLine.IndexOf($hookPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.CommandLine.IndexOf($launcherPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Set-Location -LiteralPath ([IO.Path]::GetTempPath())
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
      Remove-Item -LiteralPath $installPath -Recurse -Force
      break
    } catch {
      if ($attempt -eq 10) { throw }
      Start-Sleep -Milliseconds 200
    }
  }
}

$settingsPath = [IO.Path]::GetFullPath($SettingsDir)
if ($settingsPath -eq [IO.Path]::GetPathRoot($settingsPath)) {
  throw "Refusing to remove a filesystem root: $settingsPath"
}
if (Test-Path -LiteralPath $settingsPath -PathType Container) {
  Remove-Item -LiteralPath $settingsPath -Recurse -Force
}

Write-Host 'Codex Selection Translator was removed.'
