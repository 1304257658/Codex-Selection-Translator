Option Explicit

Dim command, fileSystem, logPath, powerShellScript, scriptDirectory, shell

Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
powerShellScript = fileSystem.BuildPath(scriptDirectory, "start-codex-with-hook.ps1")
logPath = fileSystem.BuildPath(scriptDirectory, "launcher.log")

command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass" _
  & " -WindowStyle Hidden -File " & Quote(powerShellScript) _
  & " -LogPath " & Quote(logPath)

shell.Run command, 0, False

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function
