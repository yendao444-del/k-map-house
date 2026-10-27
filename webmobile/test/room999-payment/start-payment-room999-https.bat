@echo off
setlocal
title AN KHANG HOME - PHONG 999 HTTPS TEST
cd /d "%~dp0"
echo AN KHANG HOME - KIEM NGHIEM PHONG 999 QUA HTTPS
echo Khong ghi database, khong gui email, khong chuyen tien that.
echo URL HTTPS tam thoi se hien sau khi khoi dong Cloudflare Tunnel.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-payment-room999-https.ps1"
if errorlevel 1 (
  echo.
  echo Khong khoi dong duoc. Xem cac file .runtime\cloudflared.log va .runtime\cloudflared.err
  pause
)
