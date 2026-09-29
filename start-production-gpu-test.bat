@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "APP_EXE=dist\win-unpacked\DBY Home.exe"
if not exist "%APP_EXE%" (
  echo Khong tim thay ban production: %APP_EXE%
  echo Hay build bang: npm run build:win
  pause
  exit /b 1
)

echo Dang mo DBY HOME voi GPU de benchmark rieng...
set "KMAP_ENABLE_GPU=1"
start "DBY HOME GPU TEST" "%APP_EXE%"
exit /b 0
