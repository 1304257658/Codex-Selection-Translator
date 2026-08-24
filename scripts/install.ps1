# Keep this file ASCII-compatible because Windows PowerShell 5.1 misreads UTF-8 without a BOM.
[CmdletBinding()]
param(
  [string]$InstallDir = $(Join-Path $env:LOCALAPPDATA 'CodexSelectionTranslator'),
  [string]$ShortcutPath = $(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex Selection Translator.lnk')
)

$ErrorActionPreference = 'Stop'
$scriptsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceRoot = Split-Path -Parent $scriptsRoot
$installPath = [IO.Path]::GetFullPath($InstallDir)
$shortcutFullPath = [IO.Path]::GetFullPath($ShortcutPath)
$requiredFiles = @(
  @{ Source = 'src\hook.mjs'; Destination = 'src\hook.mjs' },
  @{ Source = 'src\renderer.js'; Destination = 'src\renderer.js' },
  @{ Source = 'scripts\start-codex-with-hook.ps1'; Destination = 'scripts\start-codex-with-hook.ps1' },
  @{ Source = 'scripts\launch-hidden.vbs'; Destination = 'scripts\launch-hidden.vbs' },
  @{ Source = 'scripts\uninstall.ps1'; Destination = 'scripts\uninstall.ps1' },
  @{ Source = '.env.example'; Destination = '.env.example' },
  @{ Source = 'assets\gts-root-r4.pem'; Destination = 'codex-ca-bundle.pem' }
)
$optionalFiles = @('.env', 'codex-ca-bundle.pem')

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

foreach ($file in $requiredFiles) {
  $sourcePath = Join-Path $sourceRoot $file.Source
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required file is missing: $sourcePath"
  }
}

New-Item -ItemType Directory -Path $installPath -Force | Out-Null
foreach ($file in $requiredFiles) {
  $destinationPath = Join-Path $installPath $file.Destination
  New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file.Source) -Destination $destinationPath -Force
}
foreach ($fileName in $optionalFiles) {
  $sourcePath = Join-Path $sourceRoot $fileName
  if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $installPath $fileName) -Force
  }
}
$installedEnvPath = Join-Path $installPath '.env'
if (-not (Test-Path -LiteralPath $installedEnvPath -PathType Leaf)) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot '.env.example') -Destination $installedEnvPath
}
Set-Content -LiteralPath (Join-Path $installPath '.codex-selection-translator') `
  -Value 'Codex Selection Translator' -Encoding ASCII

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
$shortcut.Arguments = '"' + (Join-Path $installPath 'scripts\launch-hidden.vbs') + '"'
$shortcut.WorkingDirectory = $installPath
$shortcut.Description = 'Start Codex with Codex Selection Translator enabled'
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
