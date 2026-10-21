# Monta cada cenário no MS Project real, tarefa a tarefa por COM, deixa o Project calcular e grava
# o resultado de todas as tarefas. Roda na sessão do usuário: `vm.sh usuario montar-no-project.ps1`.
# Lê C:\Users\Public\msp\<entrada>.json e grava <saida>.json e mpp\<saida>\NN.mpp, com
# "<entrada>,<saida>" em entrada.txt (padrão: cenarios,project).
# Modelo: início do projeto = menor "inicio" do cenário; "inicio" mais tarde vira NIAD; restrição de
# término e prazo final às DefaultFinishTime, de início às DefaultStartTime; nada é manual nem estimado.
$ErrorActionPreference = 'Stop'
$d = 'C:\Users\Public\msp'
$cfg = (Get-Content "$d\entrada.txt" -ErrorAction SilentlyContinue) -split ','
if (-not $cfg) { $cfg = 'cenarios','project' }
$cen = Get-Content "$d\$($cfg[0]).json" -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory "$d\mpp\$($cfg[1])" -Force | Out-Null
$app = New-Object -ComObject MSProject.Application
$app.DisplayAlerts = $false
$fd = 188743709  # pjTaskDuration; FieldNameToFieldConstant devolve o da duração agendada
$linkType = @{ TI = 1; II = 3; TT = 0; IT = 2 }
$consType = @{ ASAP = 0; ALAP = 1; MSO = 2; MFO = 3; SNET = 4; SNLT = 5; FNET = 6; FNLT = 7 }
function dia($x) { if ($x -eq $null -or $x -is [string]) { return $null }; ([datetime]$x).ToString('yyyy-MM-dd') }
function hora($x) { if ($x -eq $null -or $x -is [string]) { return "$x" }; ([datetime]$x).ToString('yyyy-MM-dd HH:mm') }
$saida = @()
$n = 0
foreach ($c in $cen) {
  $n++
  $res = [ordered]@{ nome = $c.nome; tarefas = [ordered]@{}; erros = @() }
  try {
    $p = $app.Projects.Add()
    $ini = @($c.tarefas | ? { $_.inicio } | % { [datetime]$_.inicio } | sort)[0]
    if (-not $ini) { $ini = [datetime]'2026-09-07' }
    $hIni = ([datetime]$p.DefaultStartTime).TimeOfDay; $hFim = ([datetime]$p.DefaultFinishTime).TimeOfDay
    $p.ProjectStart = $ini.Date + $hIni
    foreach ($f in @($c.feriados)) { if ($f) { $p.Calendar.Period([datetime]$f).Working = $false } }
    $t = @{}
    foreach ($x in $c.tarefas) {
      $k = $p.Tasks.Add($x.id); $k.Manual = $false
      $t[$x.id] = $k
      if ($x.dur -match '^(\d+)dd$') { $txt = $app.DurationFormat([int]$matches[1] * 1440, 8); try { $k.SetField($fd, $txt) } catch { $k.Duration = $txt } }
      elseif ($x.dur -match '^(\d+)d$') { $k.Duration = [int]$matches[1] * 480 }
      $k.Estimated = $false
    }
    # recuos só depois de criar todas, senão a linha seguinte herda o nível
    foreach ($x in $c.tarefas) { if ($x.nivel -gt 0) { for ($i = 0; $i -lt $x.nivel; $i++) { $t[$x.id].OutlineIndent() | Out-Null } } }
    foreach ($v in @($c.vinculos)) {
      if (-not $v) { continue }
      $tipo = if ($v.tipo) { $v.tipo } else { 'TI' }
      $lag = if ($v.lag) { [int]$v.lag } else { 0 }
      $lagArg = if ($v.corrido) { $app.DurationFormat($lag * 1440, 8) } else { $lag * 480 }
      $t[$v.para].TaskDependencies.Add($t[$v.de], $linkType[$tipo], $lagArg) | Out-Null
    }
    foreach ($x in $c.tarefas) {
      $k = $t[$x.id]
      if ($x.inicio -and ([datetime]$x.inicio) -gt $ini) { $k.ConstraintType = 4; $k.ConstraintDate = ([datetime]$x.inicio).Date + $hIni }
      if ($x.restricao) {
        $k.ConstraintType = $consType[$x.restricao.tipo]
        if ($x.restricao.data) {
          $h = if ($x.restricao.tipo -in 'MFO','FNET','FNLT') { $hFim } else { $hIni }
          $k.ConstraintDate = ([datetime]$x.restricao.data).Date + $h
        }
      }
      if ($x.prazo) { $k.Deadline = ([datetime]$x.prazo).Date + $hFim }
      if ($x.inicioReal) { $k.ActualStart = ([datetime]$x.inicioReal).Date + $hIni }
      if ($x.terminoReal) { $k.ActualFinish = ([datetime]$x.terminoReal).Date + $hFim }
      if ($x.progresso) { $k.PercentComplete = [int]$x.progresso }
    }
    $app.CalculateProject() | Out-Null
    $mpd = [double]$p.HoursPerDay * 60; if (-not $mpd) { $mpd = 480 }
    foreach ($x in $c.tarefas) {
      $k = $t[$x.id]
      $conf = $false
      foreach ($dep in $k.TaskDependencies) {
        if ($dep.To.ID -ne $k.ID) { continue }
        $pr = $dep.From
        $lagMin = [double]$dep.Lag
        $base = switch ([int]$dep.Type) { 1 { $pr.Finish } 3 { $pr.Start } 0 { $pr.Finish } 2 { $pr.Start } }
        $alvo = if ([int]$dep.Type -in 1, 3) { $k.Start } else { $k.Finish }
        # vínculo desrespeitado: o lado da sucessora fica antes do que a predecessora exige
        $req = if ([int]$dep.LagType -in 4,6,8,10,12,20) { ([datetime]$base).AddMinutes($lagMin) } elseif ($lagMin -lt 0) { $app.DateSubtract($base, -$lagMin) } else { $app.DateAdd($base, $lagMin) }
        if ($app.DateDifference($alvo, $req) -gt 0) { $conf = $true }
      }
      $drv = @()
      try { $drv = @($k.StartDriver.PredecessorDrivers | % { $_.From.Name }) } catch {}
      $res.tarefas[$x.id] = [ordered]@{
        inicio = dia $k.Start; termino = dia $k.Finish
        inicioTardio = dia $k.LateStart; terminoTardio = dia $k.LateFinish
        folgaTotal = [math]::Round([double]$k.TotalSlack / $mpd, 2); folgaLivre = [math]::Round([double]$k.FreeSlack / $mpd, 2)
        critica = [bool]$k.Critical; conflito = $conf
        prazoPerdido = $(if ($x.prazo) { [datetime]$k.Finish -gt [datetime]$k.Deadline } else { $false })
        determinantes = @($drv | sort)
        bruto = "ini $(hora $k.Start) fim $(hora $k.Finish) iniT $(hora $k.LateStart) fimT $(hora $k.LateFinish) dur '$($k.GetField($fd))' FT $($k.TotalSlack)min FL $($k.FreeSlack)min restr $($k.ConstraintType) $(hora $k.ConstraintDate) | cedo $(hora $k.EarlyStart)-$(hora $k.EarlyFinish) | parada $(hora $k.Stop) retomada $(hora $k.Resume) durReal '$($k.GetField(188743708))' durRest '$($k.GetField(188743711))'"
      }
    }
    try { $app.FileSaveAs("$d\mpp\$($cfg[1])\{0:00}.mpp" -f $n) | Out-Null } catch { $res.erros += "salvar: $_" }
  } catch { $res.erros += "$($_.InvocationInfo.ScriptLineNumber): $_" }
  try { $app.FileCloseEx(0) | Out-Null } catch { try { $app.FileClose(0) | Out-Null } catch {} }
  $saida += $res
}
$app.Quit(0)
$saida | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 "$d\$($cfg[1]).json"
"ok: $($saida.Count) cenarios; com erro: $(@($saida | ? { $_.erros.Count }).Count)"
