@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo AN KHANG HOME - CAU HINH GMAIL TEST
echo Keo file JSON OAuth tai tu Google Cloud vao cua so nay, roi Enter.
set /p "gmail_oauth_file=File JSON: "
if not defined gmail_oauth_file exit /b 1
node --use-system-ca webmobile\scripts\import-gmail-test-oauth.mjs "%gmail_oauth_file:"=%"
pause
