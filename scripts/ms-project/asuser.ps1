# Executado como SYSTEM pelo vm.sh: roda o script indicado em target.txt na sessão interativa do
# usuário logado (tarefa agendada "msp-runner") e espera até timeout.txt segundos.
$d = 'C:\Users\Public\msp'
$target = (Get-Content "$d\target.txt" -Raw).Trim()
$limit = [int](Get-Content "$d\timeout.txt" -Raw)
Remove-Item "$d\$target.uout","$d\$target.udone" -ErrorAction SilentlyContinue
$user = (Get-CimInstance Win32_ComputerSystem).UserName
$cmd = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"& '$d\$target' *>&1 | Out-File -Encoding utf8 -Width 250 '$d\$target.uout'; 'ok' | Out-File '$d\$target.udone'`""
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $cmd
$pri = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'msp-runner' -Action $act -Principal $pri -Settings $set -Force | Out-Null
Start-ScheduledTask -TaskName 'msp-runner'
for ($i = 0; $i -lt $limit; $i++) { if (Test-Path "$d\$target.udone") { break }; Start-Sleep 1 }
if (-not (Test-Path "$d\$target.udone")) {
  # Project preso num diálogo invisível: encerra para não travar a próxima rodada.
  "TIMEOUT apos $limit s"
  Get-Process WINPROJ -ErrorAction SilentlyContinue | Stop-Process -Force
}
Get-Content "$d\$target.uout" -ErrorAction SilentlyContinue
