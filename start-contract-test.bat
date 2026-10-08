@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   AN KHANG HOME - ELECTRON TEST - PHONG 999
echo   Giao dien Electron, database va profile TEST rieng
echo ==================================================
node --use-system-ca webmobile\scripts\start-contract-test.mjs
if errorlevel 1 pause
