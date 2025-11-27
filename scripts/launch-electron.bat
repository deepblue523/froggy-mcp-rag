@echo off
REM Launch Electron without showing console window
start "" /B "%~dp0..\node_modules\.bin\electron.cmd" "%~dp0.." %*

