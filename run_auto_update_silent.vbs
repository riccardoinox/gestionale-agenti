Option Explicit
Dim WshShell, fso
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If Not fso.FileExists("R:\App Agenti\update_and_deploy.py") Then
    WshShell.Run "net use R: ""\\srvbus\Società\Riccardo"" /persistent:yes", 0, True
End If

If fso.FileExists("R:\App Agenti\update_and_deploy.py") Then
    WshShell.CurrentDirectory = "R:\App Agenti"
    WshShell.Run "python ""R:\App Agenti\update_and_deploy.py""", 0, True
End If
