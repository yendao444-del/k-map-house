param(
  [int]$Runs = 3,
  [int]$WarmupSeconds = 2,
  [string]$Executable = "$PSScriptRoot\..\dist\win-unpacked\DBY Home.exe"
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
$results = @()

foreach ($mode in @('software', 'gpu')) {
  for ($run = 1; $run -le $Runs; $run++) {
    $profile = Join-Path ([IO.Path]::GetTempPath()) "dbyhome-bench-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $profile -Force | Out-Null
    $env:APPDATA = $profile
    $env:LOCALAPPDATA = $profile
    $env:KMAP_SAFE_WINDOW = '1'
    if ($mode -eq 'gpu') { $env:KMAP_ENABLE_GPU = '1' } else { Remove-Item Env:KMAP_ENABLE_GPU -ErrorAction SilentlyContinue }

    $started = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds $WarmupSeconds
    $process.Refresh()
    $results += [pscustomobject]@{
      Mode = $mode
      Run = $run
      Alive = !$process.HasExited
      StartupSeconds = [math]::Round($started.Elapsed.TotalSeconds, 2)
      WorkingSetMB = if (!$process.HasExited) { [math]::Round($process.WorkingSet64 / 1MB, 1) } else { 0 }
      Pid = $process.Id
    }
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force }
    Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$results | Format-Table -AutoSize
$results | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path (Get-Location) 'electron-start-benchmark.json') -Encoding utf8
Write-Host "Saved electron-start-benchmark.json"
