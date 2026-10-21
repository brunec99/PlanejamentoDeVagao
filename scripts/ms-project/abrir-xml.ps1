# Abre no Project cada .xml de C:\Users\Public\msp\xml (o MSPDI do "Exportar para o Project"), deixa
# recalcular e grava o resultado por tarefa em xml-aberto.json, para comparar com a montagem direta.
# Roda na sessão do usuário: `vm.sh usuario abrir-xml.ps1`.
$ErrorActionPreference = 'Stop'
$d = 'C:\Users\Public\msp'
$app = New-Object -ComObject MSProject.Application
$app.DisplayAlerts = $false
function dia($x) { if ($x -eq $null -or $x -is [string]) { return $null }; ([datetime]$x).ToString('yyyy-MM-dd') }
function hora($x) { if ($x -eq $null -or $x -is [string]) { return "$x" }; ([datetime]$x).ToString('yyyy-MM-dd HH:mm') }
$saida = @()
foreach ($f in Get-ChildItem "$d\xml\*.xml" | sort Name) {
  $res = [ordered]@{ arquivo = $f.Name; tarefas = [ordered]@{}; erros = @() }
  try {
    $app.FileOpenEx($f.FullName, $true) | Out-Null
    $p = $app.ActiveProject
    $app.CalculateProject() | Out-Null
    $mpd = [double]$p.HoursPerDay * 60
    foreach ($k in $p.Tasks) {
      if ($k -eq $null) { continue }
      $drv = @(); try { $drv = @($k.StartDriver.PredecessorDrivers | % { $_.From.Name }) } catch {}
      $res.tarefas[$k.Name] = [ordered]@{
        inicio = dia $k.Start; termino = dia $k.Finish; inicioTardio = dia $k.LateStart; terminoTardio = dia $k.LateFinish
        folgaTotal = [math]::Round([double]$k.TotalSlack / $mpd, 2); folgaLivre = [math]::Round([double]$k.FreeSlack / $mpd, 2)
        critica = [bool]$k.Critical; determinantes = @($drv | sort)
        bruto = "ini $(hora $k.Start) fim $(hora $k.Finish) dur '$($k.GetField(188743709))' restr $($k.ConstraintType) $(hora $k.ConstraintDate) prazo $(hora $k.Deadline) real $(hora $k.ActualStart)/$(hora $k.ActualFinish) $($k.PercentComplete)% manual $($k.Manual)"
      }
    }
  } catch { $res.erros += "$($_.InvocationInfo.ScriptLineNumber): $_" }
  try { $app.FileCloseEx(0) | Out-Null } catch {}
  $saida += $res
}
$app.Quit(0)
$saida | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 "$d\xml-aberto.json"
"ok: $($saida.Count) arquivos; com erro: $(@($saida | ? { $_.erros.Count }).Count)"
