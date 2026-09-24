@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   DBY HOME - Full Release
echo ============================================
echo.

cd /d "%~dp0"

set ENABLE_GITHUB=1
if /I "%~1"=="--local" set ENABLE_GITHUB=0
if /I "%~1"=="--github" set ENABLE_GITHUB=1
set VERSION_COMMITTED=0

where node >nul 2>&1
if errorlevel 1 (
    echo [X] Khong tim thay Node.js trong PATH.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [X] Khong tim thay npm trong PATH.
    pause
    exit /b 1
)

if "!ENABLE_GITHUB!"=="1" (
    git remote get-url origin >nul 2>&1
    if errorlevel 1 (
        echo [X] Chua cau hinh git remote origin.
        echo     Can them remote truoc khi chay RELEASE.bat
        pause
        exit /b 1
    )

    gh auth status >nul 2>&1
    if errorlevel 1 (
        echo [X] Chua dang nhap GitHub CLI.
        echo     Chay: gh auth login
        pause
        exit /b 1
    )
)

for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
if errorlevel 1 ( echo [X] Khong doc duoc version hien tai. & pause & exit /b 1 )
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
if errorlevel 1 ( echo [X] Khong tinh duoc version patch tiep theo. & pause & exit /b 1 )
set NOTES=Bug fixes and improvements

echo Tang version: v!CURRENT_VERSION! ^> v!NEW_VERSION!
node scripts\release-version.cjs set !NEW_VERSION! >nul
if errorlevel 1 ( echo [X] Khong cap nhat duoc version. & pause & exit /b 1 )

echo [1/5] Tat app neu dang chay...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "DBY HOME.exe" >nul 2>&1
taskkill /F /IM "K-Map House.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/5] Don dist cu...
call npm run clean:dist
if errorlevel 1 ( echo CLEAN DIST THAT BAI! & goto rollback_fail )

echo [3/5] Build app (TypeScript + electron-vite)...
call npm run typecheck:node
if errorlevel 1 (
    echo [X] NODE TYPECHECK THAT BAI!
    goto rollback_fail
)

call npm run typecheck:web
if errorlevel 1 (
    echo [X] WEB TYPECHECK THAT BAI!
    goto rollback_fail
)

call npx electron-vite build
if errorlevel 1 (
    echo [X] BUILD THAT BAI! Co loi TypeScript hoac electron-vite.
    echo     Kiem tra log loi o tren, sua code roi chay lai RELEASE.bat.
    goto rollback_fail
)

echo [4/5] Package NSIS installer...
set CSC_IDENTITY_AUTO_DISCOVERY=false
rem Keep electron-builder's executable editing enabled so the packaged EXE,
rem installer and shortcuts all receive the DBY HOME icon and metadata.
call npx electron-builder --win
if errorlevel 1 (
    echo [X] DONG GOI INSTALLER THAT BAI!
    goto rollback_fail
)
set INSTALLER=dist\DBYHOME-!NEW_VERSION!-setup.exe
if not exist "!INSTALLER!" (
    echo [X] Khong tim thay installer sau khi build: !INSTALLER!
    goto rollback_fail
)
set UNPACKED_EXE=dist\win-unpacked\DBY Home.exe
if not exist "!UNPACKED_EXE!" (
    echo [X] Khong tim thay app exe sau khi build: !UNPACKED_EXE!
    goto rollback_fail
)
set LATEST_YML=dist\latest.yml
set INSTALLER_BLOCKMAP=dist\DBYHOME-!NEW_VERSION!-setup.exe.blockmap
if not exist "!LATEST_YML!" (
    echo [X] Khong tim thay metadata auto-update: !LATEST_YML!
    goto rollback_fail
)
if not exist "!INSTALLER_BLOCKMAP!" (
    echo [X] Khong tim thay blockmap auto-update: !INSTALLER_BLOCKMAP!
    goto rollback_fail
)

echo [5/5] Apply runtime workaround for Electron...
set RUNTIME_SRC=node_modules\electron\dist
set RUNTIME_DST=dist\win-unpacked
if not exist "!RUNTIME_DST!" (
    echo [X] Khong tim thay thu muc !RUNTIME_DST!
    goto rollback_fail
)
for %%F in (resources.pak v8_context_snapshot.bin libGLESv2.dll d3dcompiler_47.dll chrome_200_percent.pak vk_swiftshader.dll version) do (
    if exist "!RUNTIME_SRC!\%%F" copy /Y "!RUNTIME_SRC!\%%F" "!RUNTIME_DST!\%%F" >nul
)
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo start "" "DBY Home.exe" ".\resources\app"
) > "!RUNTIME_DST!\RUN-DBYHOME.bat"
set PORTABLE_ZIP=dist\DBYHOME-!NEW_VERSION!-portable-win-unpacked.zip
powershell -NoProfile -Command "if (Test-Path '!PORTABLE_ZIP!') { Remove-Item '!PORTABLE_ZIP!' -Force }; Compress-Archive -Path 'dist\\win-unpacked\\*' -DestinationPath '!PORTABLE_ZIP!' -Force"
if not exist "!PORTABLE_ZIP!" (
    echo [X] Khong tao duoc portable zip: !PORTABLE_ZIP!
    goto rollback_fail
)

echo [5/7] Tao goi cap nhat thong minh (quick + standard)...
call node scripts\create-update-artifacts.cjs quick
if errorlevel 1 (
    echo [X] Khong tao duoc goi quick update.
    goto rollback_fail
)
call node scripts\create-update-artifacts.cjs standard
if errorlevel 1 (
    echo [X] Khong tao duoc goi standard update.
    goto rollback_fail
)
set QUICK_ZIP=updates\!NEW_VERSION!\DBYHOME-!NEW_VERSION!-quick.zip
set QUICK_MANIFEST=updates\!NEW_VERSION!\DBYHOME-!NEW_VERSION!-quick-manifest.json
set STANDARD_ZIP=updates\!NEW_VERSION!\DBYHOME-!NEW_VERSION!-standard.zip
set STANDARD_MANIFEST=updates\!NEW_VERSION!\DBYHOME-!NEW_VERSION!-standard-manifest.json
if not exist "!QUICK_ZIP!" goto rollback_fail
if not exist "!QUICK_MANIFEST!" goto rollback_fail
if not exist "!STANDARD_ZIP!" goto rollback_fail
if not exist "!STANDARD_MANIFEST!" goto rollback_fail

echo     Luu cac artifact vao updates\!NEW_VERSION!...
set UPDATE_DIR=updates\!NEW_VERSION!
if not exist "!UPDATE_DIR!" mkdir "!UPDATE_DIR!"
copy /Y "!INSTALLER!" "!UPDATE_DIR!\" >nul
copy /Y "!LATEST_YML!" "!UPDATE_DIR!\" >nul
copy /Y "!INSTALLER_BLOCKMAP!" "!UPDATE_DIR!\" >nul
copy /Y "!PORTABLE_ZIP!" "!UPDATE_DIR!\" >nul

if "!ENABLE_GITHUB!"=="1" (
    echo [6/7] Git commit + push...
    git add -A
    git commit -m "v!NEW_VERSION! - !NOTES!"
    if errorlevel 1 ( echo GIT COMMIT THAT BAI! & goto rollback_fail )
    set VERSION_COMMITTED=1

    for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%b
    git rev-parse --abbrev-ref --symbolic-full-name @{u} >nul 2>&1
    if errorlevel 1 (
        echo     Branch !CURRENT_BRANCH! chua co upstream, dang set upstream origin/!CURRENT_BRANCH!...
        git push --set-upstream origin !CURRENT_BRANCH!
    ) else (
        git push
    )
    if errorlevel 1 ( echo GIT PUSH THAT BAI! & goto fail_after_commit )

    echo [7/7] Tao GitHub Release...
    gh release create v!NEW_VERSION! "!INSTALLER!" "!LATEST_YML!" "!INSTALLER_BLOCKMAP!" "!PORTABLE_ZIP!" "!QUICK_ZIP!" "!QUICK_MANIFEST!" "!STANDARD_ZIP!" "!STANDARD_MANIFEST!" --title "DBY HOME v!NEW_VERSION!" --notes "!NOTES!"
    if errorlevel 1 ( echo GITHUB RELEASE THAT BAI! & goto fail_after_commit )
) else (
    echo [6/7] Dang o che do local-only: bo qua Git push va GitHub Release.
    echo     Neu muon upload de production auto-update, chay: RELEASE.bat --github
)

echo.
echo ============================================
echo   RELEASE HOAN TAT - v!NEW_VERSION!
echo ============================================
pause
exit /b 0

:rollback_fail
echo.
if "!VERSION_COMMITTED!"=="0" (
    echo [WARN] Dang rollback version ve v!CURRENT_VERSION!...
    node scripts\release-version.cjs set !CURRENT_VERSION! >nul 2>&1
)
pause
exit /b 1

:fail_after_commit
echo.
echo [WARN] Commit v!NEW_VERSION! da duoc tao. Khong rollback version de tranh lech lich su git.
echo     Sua loi ben tren roi chay lai lenh push/release neu can.
pause
exit /b 1
