$ErrorActionPreference = 'Stop'

$testRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$webRoot = (Resolve-Path (Join-Path $testRoot '..\..')).Path
$runtime = Join-Path $testRoot '.runtime'
$cloudflared = Join-Path $testRoot 'cloudflared-windows-amd64.exe'
$tunnelLog = Join-Path $runtime 'cloudflared.log'
$tunnelErr = Join-Path $runtime 'cloudflared.err'
$serverLog = Join-Path $runtime 'https-server.log'
$serverErr = Join-Path $runtime 'https-server.err'

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

function Test-Room999Server {
  try {
    $state = Invoke-RestMethod 'http://127.0.0.1:5298/api/tenant-payments' -Method Post `
      -ContentType 'application/json' -Body '{"action":"state"}' -TimeoutSec 3
    return ($state.simulation.noWrites -eq $true)
  } catch { return $false }
}

if (-not (Test-Path $cloudflared)) {
  Write-Host 'Chua co Cloudflare Tunnel. Dang tai ban chinh thuc...' -ForegroundColor Yellow
  $release = Invoke-RestMethod 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest' -Headers @{ 'User-Agent' = 'AnKhangHome-Room999-Test' }
  $asset = $release.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
  if (-not $asset) { throw 'Khong tim thay ban cloudflared Windows amd64.' }
  Invoke-WebRequest $asset.browser_download_url -OutFile $cloudflared
}

if (-not (Test-Room999Server)) {
  Write-Host 'Dang khoi dong server kiem nghiem phong 999...' -ForegroundColor Cyan
  Start-Process 'cmd.exe' -ArgumentList '/c', 'npm run test:payment-room999 -- --lan' -WorkingDirectory $webRoot `
    -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline -and -not (Test-Room999Server)) { Start-Sleep -Milliseconds 500 }
  if (-not (Test-Room999Server)) { throw "Khong khoi dong duoc server 5298. Xem $serverErr" }
}

Get-Process -Name 'cloudflared*' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $cloudflared } | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $tunnelLog, $tunnelErr -Force -ErrorAction SilentlyContinue

Write-Host 'Dang tao HTTPS tunnel tam thoi...' -ForegroundColor Cyan
$tunnel = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', 'http://127.0.0.1:5298', '--protocol', 'http2', '--no-autoupdate' `
  -WorkingDirectory $testRoot -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr -PassThru -WindowStyle Hidden

$publicUrl = $null
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  $text = ((Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue))
  $match = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($match.Success) { $publicUrl = $match.Value; break }
  if ($tunnel.HasExited) { throw "Cloudflare Tunnel da dung. Xem $tunnelErr" }
  Start-Sleep -Milliseconds 500
}
if (-not $publicUrl) { throw "Khong lay duoc URL HTTPS trong thoi gian cho. Xem $tunnelLog va $tunnelErr" }

$testUrl = "$publicUrl/?screen=payment"
Write-Host ''
Write-Host 'HTTPS KIEM NGHIEM PHONG 999' -ForegroundColor Green
Write-Host "Mo tren dien thoai: $testUrl" -ForegroundColor White
Write-Host 'Du lieu chi luu trong RAM; khong ghi Supabase/Electron, khong gui Gmail, khong goi SePay.' -ForegroundColor Yellow
Write-Host 'Dong cua so nay de dung tunnel. Server local co the dung rieng.' -ForegroundColor DarkGray
Set-Clipboard -Value $testUrl
Start-Process $testUrl
Write-Host 'URL da duoc copy vao clipboard.' -ForegroundColor Cyan

try { Wait-Process -Id $tunnel.Id } finally {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
}
