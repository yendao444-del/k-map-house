@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."
echo ============================================
echo   DBY HOME - QUICK UPDATE
echo ============================================
rem Releases upload to GitHub by default so production can receive the update.
set ENABLE_GITHUB=1
if /I "%~1"=="--local" set ENABLE_GITHUB=0
if /I "%~1"=="--github" set ENABLE_GITHUB=1
set STEP=Kiem tra moi truong
if "!ENABLE_GITHUB!"=="1" (
  echo [1/8] Kiem tra dang nhap GitHub...
  gh auth status >nul 2>&1
  if errorlevel 1 ( echo [FAILED] Chua dang nhap GitHub CLI. & exit /b 1 )
)
set STEP=Doc va tang version
echo [2/8] Doc version va tao version moi...
for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
node scripts\release-version.cjs set !NEW_VERSION! >nul
if errorlevel 1 goto fail
echo     v!CURRENT_VERSION! ^> v!NEW_VERSION!
set STEP=Typecheck Node
echo [3/8] Kiem tra main process...
call npm run typecheck:node
if errorlevel 1 goto fail
set STEP=Typecheck Web
echo [4/8] Kiem tra renderer...
call npm run typecheck:web
if errorlevel 1 goto fail
set STEP=Build renderer
echo [5/8] Build ung dung...
call npx electron-vite build
if errorlevel 1 goto fail
set STEP=Dong goi installer
echo [6/8] Dong goi installer Windows...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win
if errorlevel 1 goto fail
set INSTALLER=dist\DBYHOME-!NEW_VERSION!-setup.exe
if not exist "!INSTALLER!" (
  echo [FAILED] Khong tim thay !INSTALLER!
  goto fail
)
if not exist "dist\win-unpacked\locales\vi.pak" (
  echo [FAILED] Thieu locale vi.pak trong goi Electron.
  goto fail
)
if not exist "dist\win-unpacked\locales\en-US.pak" (
  echo [FAILED] Thieu locale en-US.pak trong goi Electron.
  goto fail
)
set STEP=Tao goi cap nhat
echo [7/8] Tao quick + standard ZIP...
node scripts\create-update-artifacts.cjs quick
if errorlevel 1 goto fail
call node scripts\create-update-artifacts.cjs standard
if errorlevel 1 goto fail
set UPDATE_DIR=updates\!NEW_VERSION!
copy /Y "!INSTALLER!" "!UPDATE_DIR!\" >nul
if "!ENABLE_GITHUB!"=="1" (
  set STEP=Push GitHub
  echo [8/8] Commit va push GitHub...
  git add -A
  git commit -m "v!NEW_VERSION! - Quick update"
  if errorlevel 1 goto fail_after_commit
  git push
  if errorlevel 1 goto fail_after_commit
  set STEP=Tao GitHub Release
  echo     Tao release v!NEW_VERSION!...
  gh release create v!NEW_VERSION! "!INSTALLER!" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-quick.zip" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-quick-manifest.json" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-standard.zip" "!UPDATE_DIR!\DBYHOME-!NEW_VERSION!-standard-manifest.json" --title "DBY HOME v!NEW_VERSION! (QUICK)" --notes "Quick delta update with standard fallback and manual installer"
  if errorlevel 1 goto fail_after_commit
  echo     GitHub Release da tao thanh cong.
)
echo.
echo Da tao goi quick + standard trong %UPDATE_DIR%.
echo Bo cai thu cong: %UPDATE_DIR%\DBYHOME-%NEW_VERSION%-setup.exe
echo Goi quick chi ap dung tu dung phien ban fromVersion trong manifest.
echo.
echo [SUCCESS] RELEASE v!NEW_VERSION! HOAN TAT.
if "!ENABLE_GITHUB!"=="1" (
  echo [SUCCESS] GitHub da nhan commit va release v!NEW_VERSION!.
  echo [URL] https://github.com/yendao444-del/k-map-house/releases/tag/v!NEW_VERSION!
)
pause
exit /b 0

:fail
node scripts\release-version.cjs set !CURRENT_VERSION! >nul 2>&1
echo.
echo [FAILED] QUICK UPDATE THAT BAI TAI BUOC: !STEP!
echo [FAILED] Version da rollback ve v!CURRENT_VERSION!.
pause
exit /b 1

:fail_after_commit
echo.
echo [FAILED] QUICK UPDATE THAT BAI TAI BUOC: !STEP!
echo [WARNING] Commit v!NEW_VERSION! da tao, khong rollback version.
echo [WARNING] Kiem tra GitHub va chay lai push/release bang tay.
pause
exit /b 1
