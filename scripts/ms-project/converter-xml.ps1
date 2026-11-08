# Abre cada .mpp de C:\Users\Public\msp\in no Project e grava o MSPDI (.xml, o "Salvar como XML") em
# C:\Users\Public\msp\out, para importar no médio prazo (scripts/import-medio-prazo.ts).
# Roda na sessão do usuário: `vm.sh enviar arquivo.mpp 'in\arquivo.mpp'` e `vm.sh usuario converter-xml.ps1 300`;
# depois `vm.sh baixar 'out\arquivo.xml' > arquivo.xml`.
# O FileSaveAs vai por InvokeMember com argumentos nomeados (Name + FormatID): a chamada posicional com
# [Type]::Missing não acha a sobrecarga no PowerShell (medido em 08/11/2026).
$ErrorActionPreference = 'Stop'
$d = 'C:\Users\Public\msp'
New-Item -ItemType Directory -Force "$d\out" | Out-Null
$app = New-Object -ComObject MSProject.Application
$app.DisplayAlerts = $false
foreach ($f in Get-ChildItem "$d\in\*.mpp" | sort Name) {
  $out = "$d\out\" + [IO.Path]::GetFileNameWithoutExtension($f.Name) + '.xml'
  try {
    $app.FileOpenEx($f.FullName, $true) | Out-Null
    "aberto: $($f.Name) tarefas=$($app.ActiveProject.Tasks.Count)"
    [void]$app.GetType().InvokeMember('FileSaveAs', [Reflection.BindingFlags]::InvokeMethod, $null, $app, @($out, 'MSProject.XML'), $null, $null, [string[]]@('Name', 'FormatID'))
    "gravado: $out $((Get-Item $out).Length) bytes"
  } catch { "erro $($f.Name): $_" }
  try { $app.FileCloseEx(0) | Out-Null } catch {}
}
$app.Quit(0)
'fim'
