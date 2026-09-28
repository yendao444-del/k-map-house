@echo off
setlocal
title DBY HOME - Backup

set "ROOT=%~dp0"
set "LOCAL_BACKUP_ROOT=F:\BACKUP"
set "ONLINE_BACKUP_ROOT=H:\My Drive\BACKUP"

cd /d "%ROOT%"

where node >nul 2>nul
if errorlevel 1 goto node_missing

echo Starting DBY HOME backup...
node "%ROOT%scripts\backup-supabase.mjs" --local "%LOCAL_BACKUP_ROOT%" --online "%ONLINE_BACKUP_ROOT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo ============================================================
  echo  BACKUP FAILED - no complete backup was confirmed.
  echo  Read the error above. Any local file already created is kept.
  echo ============================================================
  goto finish
)
if /I "%~1"=="--dry-run" goto dry_run

echo.
echo ============================================================
echo  BACKUP SUCCESSFUL
echo  Local:        %LOCAL_BACKUP_ROOT%
echo  Google Drive: %ONLINE_BACKUP_ROOT%
echo  Check the ZIP filename and SHA-256 printed above.
echo ============================================================
goto finish

:dry_run
echo.
echo ============================================================
echo  DRY RUN SUCCESSFUL - no backup file was created.
echo ============================================================
goto finish

:node_missing
set "EXIT_CODE=1"
echo.
echo ============================================================
echo  BACKUP FAILED - Node.js was not found in PATH.
echo ============================================================

:finish
if /I not "%BACKUP_NO_PAUSE%"=="1" (
  echo.
  pause
)
exit /b %EXIT_CODE%
