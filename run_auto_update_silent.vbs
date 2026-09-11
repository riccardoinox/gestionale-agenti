Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "R:\App Agenti"
WshShell.Run "python ""R:\App Agenti\update_and_deploy.py""", 0, True
