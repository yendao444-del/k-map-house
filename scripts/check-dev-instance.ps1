# A packaged app holds Electron's shared single-instance lock. Starting dev
# while it is open otherwise appears successful but only focuses the old UI.
$workspacePath = Split-Path -Parent $PSScriptRoot
$packagedPath = [IO.Path]::GetFullPath((Join-Path $workspacePath 'dist\win-unpacked\DBY Home.exe'))
$runningApp = Get-Process -Name 'DBY Home' -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and [IO.Path]::GetFullPath($_.Path) -ieq $packagedPath } catch { $false }
}
if ($runningApp) {
    Write-Host '  [!] DBY HOME ban dong goi cu dang mo trong dist\win-unpacked.'
    Write-Host '      Hay dong cua so DBY HOME do, sau do chay lai start.bat.'
    Write-Host '      Neu khong, Electron chi dua ban cu len thay vi mo giao dien dev moi.'
    exit 1
}

# Dev port is fixed (strictPort) so localStorage keeps the same origin.
# An old dev session left open makes Vite fail with "Port 5173 is already in use".
$devPort = 5173
$listener = Get-NetTCPConnection -LocalPort $devPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $ownerName = if ($owner) { $owner.Name } else { 'khong ro' }
    Write-Host "  [!] Cong $devPort dang bi chiem boi PID $($listener.OwningProcess) ($ownerName)."
    Write-Host '      Co the ban dev cu van dang chay. Dong cua so DBY HOME / terminal dev cu,'
    Write-Host "      hoac chay: Stop-Process -Id $($listener.OwningProcess)  roi chay lai start.bat."
    exit 1
}
exit 0
