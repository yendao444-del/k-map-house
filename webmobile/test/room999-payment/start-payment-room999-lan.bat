@echo off
setlocal
title AN KHANG HOME - Phong 999 LAN
cd /d "%~dp0\..\.."
echo AN KHANG HOME - KIEM NGHIEM PHONG 999 QUA WIFI/LAN
echo Khong ghi database, khong gui email, khong chuyen tien that.
echo Dien thoai va may tinh can cung WiFi/mang LAN. May tinh phai bat.
echo Dia chi dien thoai se hien o dong DIEN THOAI CUNG WIFI ben duoi.
echo HTTP LAN dung camera dien thoai; khung scan trong trang can HTTPS.
powershell.exe -NoProfile -Command "try { $r=Invoke-RestMethod 'http://127.0.0.1:5298/api/tenant-payments' -Method Post -ContentType 'application/json' -Body '{\"action\":\"state\"}' -TimeoutSec 3; if ($r.simulation.noWrites -eq $true -and $r.simulation.lan -eq $true) { Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | ForEach-Object { Write-Host ('DIEN THOAI CUNG WIFI: http://' + $_.IPAddress + ':5298/?screen=payment') }; exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  start "" "http://127.0.0.1:5298/?screen=payment"
  pause
  exit /b 0
)
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { try { $r=Invoke-RestMethod 'http://127.0.0.1:5298/api/tenant-payments' -Method Post -ContentType 'application/json' -Body '{\"action\":\"state\"}' -TimeoutSec 2; if ($r.simulation.lan -eq $true) { Start-Process 'http://127.0.0.1:5298/?screen=payment'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }"
call npm run test:payment-room999 -- --lan
if errorlevel 1 pause
