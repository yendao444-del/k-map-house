param(
  [ValidateRange(1, 20)][int]$Runs = 3,
  [ValidateRange(1, 60)][int]$TimeoutSeconds = 7,
  [ValidateSet('software', 'gpu', 'both')][string]$Mode = 'software',
  [string]$Executable = "$PSScriptRoot\..\dist\win-unpacked\DBY Home.exe",
  [string]$OutputPath = "$PSScriptRoot\..\electron-start-benchmark.json"
)

$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
$results = @()
$envNames = @('APPDATA', 'LOCALAPPDATA', 'KMAP_SAFE_WINDOW', 'KMAP_ENABLE_GPU', 'KMAP_STARTUP_MARKER', 'KMAP_BENCHMARK', 'KMAP_BENCHMARK_PROFILE')
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$asar = Join-Path (Split-Path $exe) 'resources\app.asar'
$modes = if ($Mode -eq 'both') { @('software', 'gpu') } else { @($Mode) }

try {
  foreach ($graphicsMode in $modes) {
    for ($run = 1; $run -le $Runs; $run++) {
      $profile = Join-Path $tempRoot "dbyhome-bench-$([guid]::NewGuid().ToString('N'))"
      $process = $null
      try {
        New-Item -ItemType Directory -Path $profile | Out-Null
        $env:APPDATA = $profile
        $env:LOCALAPPDATA = $profile
        $env:KMAP_BENCHMARK = '1'
        $env:KMAP_BENCHMARK_PROFILE = $profile
        Remove-Item Env:KMAP_SAFE_WINDOW -ErrorAction SilentlyContinue
        $marker = Join-Path $profile 'startup-marker.jsonl'
        $env:KMAP_STARTUP_MARKER = $marker
        if ($graphicsMode -eq 'gpu') { $env:KMAP_ENABLE_GPU = '1' }
        else { Remove-Item Env:KMAP_ENABLE_GPU -ErrorAction SilentlyContinue }
        $startedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $process = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        $marks = @()
        do {
          Start-Sleep -Milliseconds 25
          $process.Refresh()
          # A read can race an append. Ignore an incomplete last JSONL line.
          $marks = if (Test-Path -LiteralPath $marker) {
            @(Get-Content -LiteralPath $marker | ForEach-Object { try { $_ | ConvertFrom-Json } catch {} })
          } else { @() }
          $names = @($marks | ForEach-Object { $_.name })
          $complete = ($names -contains 'profile-isolated') -and ($names -contains 'login-painted') -and ($names -contains 'module-code-ready') -and ($names -contains 'icon-style-ready')
          $failed = ($names -contains 'module-code-error') -or ($names -contains 'renderer-error') -or ($names -contains 'authenticated-painted') -or ($names -contains 'icon-style-error')
        } while (!$complete -and !$failed -and !$process.HasExited -and (Get-Date) -lt $deadline)
        $timings = [ordered]@{}
        foreach ($mark in $marks) {
          if (!$timings.Contains($mark.name)) { $timings[$mark.name] = [math]::Round(([int64]$mark.at - $startedAt) / 1000, 3) }
        }
        $results += [pscustomobject]@{
          Mode = $graphicsMode
          Run = $run
          Status = if ($failed) { 'error' } elseif ($process.HasExited) { 'exited' } elseif ($complete) { 'complete' } else { 'timeout' }
          Scope = 'isolated fresh profile: login screen and module code only'
          MilestonesSeconds = $timings
          AuthenticatedDataTested = $false
          MainWorkingSetMB = if (!$process.HasExited) { [math]::Round($process.WorkingSet64 / 1MB, 1) } else { $null }
        }
      } finally {
        if ($process -and !$process.HasExited) {
          & taskkill.exe /PID $process.Id /T /F | Out-Null
          $process.WaitForExit(5000) | Out-Null
        }
        # Delete only the generated direct child of the OS temp directory.
        $resolvedProfile = [IO.Path]::GetFullPath($profile)
        if ((Split-Path $resolvedProfile) -eq $tempRoot.TrimEnd('\') -and
            (Split-Path $resolvedProfile -Leaf) -match '^dbyhome-bench-[a-f0-9]{32}$') {
          Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }
} finally {
  foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process') }
}
# Hash after the timed runs: hashing before launch warms the file cache and
# makes a purported first-after-package measurement less representative.
$asarHash = if (Test-Path -LiteralPath $asar) { (Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash } else { $null }
$unpacked = "${asar}.unpacked"
$unpackedHashes = @()
if (Test-Path -LiteralPath $unpacked) {
  $unpackedHashes = @(Get-ChildItem -LiteralPath $unpacked -File -Recurse | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{ Path = $_.FullName.Substring($unpacked.Length + 1); SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
  })
}
foreach ($result in $results) { $result | Add-Member -NotePropertyName AsarSHA256 -NotePropertyValue $asarHash }
$report = [pscustomobject]@{
  CapturedAt = [DateTimeOffset]::UtcNow.ToString('o')
  Executable = $exe
  ExecutableSHA256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
  UnpackedFiles = $unpackedHashes
  Note = 'These results do not prove authenticated modules are ready under 3 seconds.'
  Results = @($results)
}
$json = $report | ConvertTo-Json -Depth 6
$json | Set-Content -LiteralPath $OutputPath -Encoding utf8
$archiveDir = Join-Path $PSScriptRoot '..\phase\benchmarks'
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null
$archive = Join-Path $archiveDir ("startup-{0}-{1}.json" -f [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'), [guid]::NewGuid().ToString('N').Substring(0,8))
$json | Set-Content -LiteralPath $archive -Encoding utf8
$results | Format-Table Mode, Run, Status, MainWorkingSetMB, MilestonesSeconds -AutoSize
Write-Host "Saved $OutputPath and $archive"
