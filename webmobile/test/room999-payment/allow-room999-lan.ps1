# Run with Administrator privileges only if Windows Firewall blocks the phone.
# Allows one test port from the local subnet; does not change the network profile.
$ErrorActionPreference = 'Stop'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $taskPath = $MyInvocation.MyCommand.Path
    $taskArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $taskPath)
    $taskElevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $taskArgs -Wait -PassThru
    exit $taskElevated.ExitCode
}
$taskName = 'AnKhangHome-Room999-LAN-Test'
$taskLocalAddresses = @(Get-NetIPConfiguration | Where-Object IPv4DefaultGateway | ForEach-Object { $_.IPv4Address.IPAddress })
if (-not $taskLocalAddresses.Count) { throw 'Khong tim thay IPv4 mang LAN.' }
if (-not (Get-NetFirewallRule -Name $taskName -ErrorAction SilentlyContinue)) {
    try {
        New-NetFirewallRule -Name $taskName -DisplayName 'An Khang Home - Room 999 LAN test' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5298 -LocalAddress $taskLocalAddresses -RemoteAddress LocalSubnet -Profile Any -ErrorAction Stop | Out-Null
    } catch {
        throw 'Can quyen Administrator de them Firewall rule. Mo PowerShell bang Run as administrator roi chay lai file nay.'
    }
}
Write-Host 'Da cho phep dien thoai cung mang truy cap cong 5298.'
Write-Host 'Sau khi test, go bo bang: Remove-NetFirewallRule -Name AnKhangHome-Room999-LAN-Test'
