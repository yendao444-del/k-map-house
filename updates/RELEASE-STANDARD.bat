@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."
echo ============================================
echo   DBY HOME - STANDARD UPDATE
echo ============================================
rem Releases upload to GitHub by default so production can receive the update.
set ENABLE_GITHUB=1
if /I "%~1"=="--local" set ENABLE_GITHUB=0
if /I "%~1"=="--github" set ENABLE_GITHUB=1
if "!ENABLE_GITHUB!"=="1" (
  gh auth status >nul 2>&1
  if errorlevel 1 ( echo Chua dang nhap GitHub CLI. & exit /b 1 )
)
for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
node scripts\release-version.cjs set !NEW_VERSION! >nul
if errorlevel 1 exit /b 1
call npm run typecheck:node
if errorlevel 1 goto fail
call npm run typecheck:web
if errorlevel 1 goto fail
call npx electron-vite build
if errorlevel 1 goto fail
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win -c.win.signAndEditExecutable=false
if errorlevel 1 goto fail
set INSTALLER=dist\DBYHOME-!NEW_VERSION!-setup.exe
if not exist "!INSTALLER!" goto fail
node scripts\create-update-artifacts.cjs standard
if errorlevel 1 goto fail
set UPDATE_DIR=updates\!NEW_VERSION!
copy /Y "!INSTALLER!" "!UPDATE_DIR!\" >nul
if "!ENABLE_GITHUB!"=="1" (
  git add -A
  git commit -m "v!NEW_VERSION! - Standard update"
  if errorlevel 1 goto fail_after_commit
  git push
  if errorlevel 1 goto fail_after_commit
  gh release create v!NEW_VERSION! "!INSTALLER!" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-standard.zip" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-standard-manifest.json" --title "DBY HOME v!NEW_VERSION! (STANDARD)" --notes "Standard application update with manual installer"
  if errorlevel 1 goto fail_after_commit
)
echo.
echo Da tao goi standard trong %UPDATE_DIR%.
echo Bo cai thu cong: %UPDATE_DIR%\DBYHOME-%NEW_VERSION%-setup.exe
pause
exit /b 0

:fail
node scripts\release-version.cjs set !CURRENT_VERSION! >nul 2>&1
echo STANDARD UPDATE THAT BAI.
exit /b 1

:fail_after_commit
echo Commit da tao nhung push/release that bai. Khong rollback version.
exit /b 1
