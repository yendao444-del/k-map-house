@echo off
setlocal
cd /d "%~dp0\..\.."
echo AN KHANG HOME - KIEM NGHIEM THANH TOAN PHONG 999
echo Gemini OCR that - du lieu chi luu trong RAM - KHONG ghi Supabase/Electron
echo Mo trinh duyet tai: http://127.0.0.1:5298/?screen=payment
echo Dong cua so nay de dung server kiem nghiem.
powershell.exe -NoProfile -Command "try { $r = Invoke-RestMethod 'http://127.0.0.1:5298/api/tenant-payments' -Method Post -ContentType 'application/json' -Body '{\"action\":\"state\"}' -TimeoutSec 3; if ($r.simulation.noWrites -eq $true) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  start "" "http://127.0.0.1:5298/?screen=payment"
  exit /b 0
)
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { try { $r=Invoke-RestMethod 'http://127.0.0.1:5298/api/tenant-payments' -Method Post -ContentType 'application/json' -Body '{\"action\":\"state\"}' -TimeoutSec 2; if ($r.simulation.noWrites -eq $true) { Start-Process 'http://127.0.0.1:5298/?screen=payment'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }"
call npm run test:payment-room999
if errorlevel 1 pause
