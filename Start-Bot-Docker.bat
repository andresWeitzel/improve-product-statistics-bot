@echo off
setlocal
title Improve Product Statistics Bot - Docker build + start
cd /d "%~dp0"
echo.
echo Improve Product Statistics Bot
echo Build Docker image + start container
echo.
echo Prerequisite: Docker Desktop already open and Engine running.
echo Order: 1) Docker Desktop  2) this script (image + start container)
echo Then control Start/Stop of container improve-product-statistics-bot in Docker Desktop.
echo This launcher will NOT start Docker Desktop.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Bot-Docker.ps1" %*
set EXITCODE=%ERRORLEVEL%
echo.
if %EXITCODE% neq 0 (
  echo Failed with exit code %EXITCODE%.
  echo If Docker Desktop is stuck: Quit it from the tray, reopen, wait for Engine running, retry.
) else (
  echo Finished OK.
)
pause
exit /b %EXITCODE%
