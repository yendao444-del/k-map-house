@echo off
setlocal
title AN KHANG HOME - Webmobile

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua tim thay Node.js va npm.
  echo Cai Node.js LTS roi chay lai file nay.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Dang cai dependency lan dau, vui long cho...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [LOI] Cai dependency that bai.
    pause
    exit /b 1
  )
)

set "PORT=5188"
set "RUNNING_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT% .*LISTENING"') do set "RUNNING_PID=%%P"

if defined RUNNING_PID (
  powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:%PORT%/' -UseBasicParsing -TimeoutSec 3; if ($r.Content -match 'AN KHANG HOME') { exit 0 } } catch {}; exit 1"
  if errorlevel 1 (
    echo [LOI] Cong %PORT% dang duoc ung dung khac su dung.
    echo Hay dong ung dung do roi chay lai. Khong tu dong dung tien trinh.
    pause
    exit /b 1
  )
  echo Website dang chay tai http://127.0.0.1:%PORT%/
  start "" "http://127.0.0.1:%PORT%/"
  exit /b 0
)

echo Dang khoi dong AN KHANG HOME Webmobile tai http://127.0.0.1:%PORT%/
echo Dang nhap Supabase va OCR Gemini can internet. Secret chi doc o backend local.
echo Giu cua so nay mo de website hoat dong. Nhan Ctrl+C de dung.
rem The hidden helper opens the browser only after this website is ready.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$deadline = (Get-Date).AddSeconds(45); while ((Get-Date) -lt $deadline) { try { $r = Invoke-WebRequest 'http://127.0.0.1:%PORT%/' -UseBasicParsing -TimeoutSec 2; if ($r.Content -match 'AN KHANG HOME') { Start-Process 'http://127.0.0.1:%PORT%/'; exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
call npm run dev -- --host 127.0.0.1 --port %PORT% --strictPort
if errorlevel 1 (
  echo [LOI] Khoi dong website that bai. Xem thong bao o tren.
  pause
  exit /b 1
)
exit /b 0
