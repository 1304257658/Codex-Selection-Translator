# Keep this file ASCII-compatible because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
[CmdletBinding()]
param(
  [string]$InstallDir = $(Join-Path $env:LOCALAPPDATA 'CodexTranslationPlugin'),
  [string]$ShortcutPath = $(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Translation.lnk')
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$installPath = [IO.Path]::GetFullPath($InstallDir)
$shortcutFullPath = [IO.Path]::GetFullPath($ShortcutPath)
$requiredFiles = @(
  'hook.mjs',
  'renderer.js',
  'start-codex-with-hook.ps1',
  'launch-hidden.vbs',
  'uninstall.ps1'
)

function Find-CodexIconSource {
  function Resolve-IconSource([string]$ExecutablePath) {
    $trayIcon = Join-Path (Split-Path -Parent $ExecutablePath) 'resources\chatgpt-tray-light.ico'
    if (Test-Path -LiteralPath $trayIcon -PathType Leaf) { return $trayIcon }
    return $ExecutablePath
  }

  $running = Get-Process ChatGPT -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -like '*OpenAI.Codex*' } |
    Select-Object -First 1
  if ($running -and (Test-Path -LiteralPath $running.Path -PathType Leaf)) {
    return (Resolve-IconSource -ExecutablePath $running.Path)
  }

  if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
      Sort-Object Version -Descending |
      Select-Object -First 1
    if ($package) {
      $candidate = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
      if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return (Resolve-IconSource -ExecutablePath $candidate)
      }
    }
  }

  foreach ($candidate in @(
    (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI Codex\ChatGPT.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Codex\ChatGPT.exe')
  )) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-IconSource -ExecutablePath $candidate)
    }
  }
  return $null
}

if ($installPath -eq [IO.Path]::GetPathRoot($installPath)) {
  throw "Refusing to install into a filesystem root: $installPath"
}

if (-not $env:LOCALAPPDATA) {
  throw 'LOCALAPPDATA is not available for the current user.'
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw 'Node.js was not found in PATH. Install Node.js 22 or later first.'
}

foreach ($fileName in $requiredFiles) {
  $sourcePath = Join-Path $sourceRoot $fileName
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required file is missing: $sourcePath"
  }
}

New-Item -ItemType Directory -Path $installPath -Force | Out-Null
foreach ($fileName in $requiredFiles) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $fileName) `
    -Destination (Join-Path $installPath $fileName) -Force
}
Set-Content -LiteralPath (Join-Path $installPath '.codex-translation-plugin') `
  -Value 'Codex Translation Plugin' -Encoding ASCII

$iconSource = Find-CodexIconSource
$iconPath = Join-Path $installPath 'codex.ico'
if ($iconSource) {
  if ([IO.Path]::GetExtension($iconSource) -eq '.ico') {
    Copy-Item -LiteralPath $iconSource -Destination $iconPath -Force
  } else {
    Add-Type -AssemblyName System.Drawing
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconSource)
    if ($icon) {
      $iconStream = [IO.File]::Create($iconPath)
      try {
        $icon.Save($iconStream)
      } finally {
        $iconStream.Dispose()
        $icon.Dispose()
      }
    }
  }
}

$shortcutDirectory = Split-Path -Parent $shortcutFullPath
New-Item -ItemType Directory -Path $shortcutDirectory -Force | Out-Null
$wscriptPath = Join-Path $env:WINDIR 'System32\wscript.exe'
if (-not (Test-Path -LiteralPath $wscriptPath -PathType Leaf)) {
  throw "Windows Script Host was not found: $wscriptPath"
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutFullPath)
$shortcut.TargetPath = $wscriptPath
$shortcut.Arguments = '"' + (Join-Path $installPath 'launch-hidden.vbs') + '"'
$shortcut.WorkingDirectory = $installPath
$shortcut.Description = 'Start Codex with selection translation enabled'
if (Test-Path -LiteralPath $iconPath -PathType Leaf) {
  $shortcut.IconLocation = "$iconPath,0"
} elseif ($iconSource) {
  $shortcut.IconLocation = "$iconSource,0"
}
$shortcut.Save()

Write-Host "Installed launcher: $installPath"
Write-Host "Created shortcut:  $shortcutFullPath"
if ($shortcut.IconLocation) { Write-Host "Shortcut icon:     $($shortcut.IconLocation)" }
Write-Host 'Fully exit Codex before using the shortcut for the first time.'
