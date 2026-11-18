' Starts the rental website with no black window (for Task Scheduler or the Startup folder).
' Use Rentals Control.bat to see it, or to stop it.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c start-rentals.bat", 0, False
