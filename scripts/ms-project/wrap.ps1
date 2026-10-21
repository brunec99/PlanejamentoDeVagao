# Executado pelo vm.sh na VM: roda C:\Users\Public\msp\<nome>, grava a saída em <nome>.out e marca <nome>.done.
param([string]$name)
$ErrorActionPreference = 'Continue'
$d = 'C:\Users\Public\msp'
Remove-Item "$d\$name.out","$d\$name.done" -ErrorAction SilentlyContinue
& "$d\$name" *>&1 | Out-File -Encoding utf8 -Width 250 "$d\$name.out"
'ok' | Out-File "$d\$name.done"
