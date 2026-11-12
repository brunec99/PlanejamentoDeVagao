/** Estilo próprio do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), somado
 * a `DASHBOARD_STYLE` (as classes `dsh-*` dos quadros, dos cartões e das folhas do PDF). Cores fixas, as mesmas
 * do modelo e da paleta do sistema, porque metade do destino é papel. Prefixo `pf-` (portfólio):
 * - `table.pf-cmp` o comparativo das obras: coluna da obra fixa ao rolar de lado, títulos que ordenam,
 *   `.v` valor em negrito e `.s` linha pequena embaixo; `tr.total` o consolidado;
 * - `.pf-state` o estado da obra (cor e texto);
 * - `table.pf-heat` o mapa de calor (obra × balde e empresa × obra): `td.open` hachurado, `td.none` sem linha,
 *   `.here` o período analisado; `.pf-ramp` a legenda da rampa;
 * - `.pf-rows` linhas por obra (longo prazo, vagões, médio prazo, terminalidade): `.pf-rowx` com nome, gráfico
 *   e números; `.pf-bullet` medido × planejado, `.pf-stackb` barra empilhada, `.pf-pair` abertas × resolvidas;
 * - `.pf-g3` grade de três colunas sobre `.dsh-grid` (causas, responsáveis e tipos de apontamento); `.pf-wrap`
 *   deixa o texto quebrar em vez de cortar;
 * - `.pf-mods-2` os quatro quadros dos demais módulos, dois a dois (um só no celular, regra 16);
 * - `.pf-kpis` contêiner dos cartões do topo; `.dsh-kpis.k7` os sete cartões (regra 8 da segurança, 06/11/2026):
 *   uma linha quando a área do conteúdo tem 1000 px ou mais, quatro por linha abaixo e dois no celular; no
 *   papel, sete colunas;
 * - Segurança do trabalho (aba 6): `.pf-sst-box` contêiner do quadro, `.pf-sst-cols` os três blocos (três
 *   colunas a partir de 1100 px de quadro, duas a partir de 820 px com os tipos embaixo, uma abaixo disso),
 *   `.pf-sst` linhas por obra com a coluna do nome mais estreita, `.pf-rowx.total` a linha "Todas" e
 *   `.pf-sst-kpis` os seis números da folha do PDF. Consulta de contêiner, e não de tela, porque a largura do
 *   conteúdo depende da lateral aberta ou recolhida.
 * - Quadros de 12/11/2026: `.dsh-kpis.k9` oito ou nove cartões em duas linhas (cinco por linha na tela larga e
 *   no papel, três na média, dois no celular); `table.pf-svc` "Serviços medidos em mais de uma obra" (o mapa de
 *   calor sem a rampa de cor: `.strong` a melhor obra da linha, `.tot` a coluna "Todas"). */
export const PORTFOLIO_STYLE = `
.pf-mods-2 { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
.pf-xscroll { overflow-x: auto; max-width: 100%; }
.pf-nodata { margin: 4px 0 0; font-size: 12px; color: #59738a; line-height: 1.45; }
.pf-nodata + .pf-nodata { margin-top: 2px; }
.pf-scope .dsh-tag { margin-left: 2px; }
.t-mut { color: #8ea4b7; font-weight: 500; }

/* Comparativo das obras */
table.pf-cmp { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; }
.pf-cmp th { text-align: right; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #59738a; padding: 0 8px 6px; border-bottom: 1px solid #c4d3df; white-space: nowrap; vertical-align: bottom; background: #fff; }
.pf-cmp th .grp { display: block; font-size: 9px; letter-spacing: .08em; color: #8ea4b7; margin-bottom: 2px; }
.pf-cmp th button { all: unset; cursor: pointer; display: inline-flex; gap: 3px; align-items: center; border-radius: 4px; }
.pf-cmp th button:focus-visible { outline: 2px solid #2a8cc0; outline-offset: 2px; }
.pf-cmp th[aria-sort] button { color: #1a719f; }
.pf-cmp th .ar { display: inline-block; min-width: 8px; color: #1a719f; }
.pf-cmp td { padding: 6px 8px; border-bottom: 1px solid #ebf1f6; text-align: right; white-space: nowrap; background: #fff; }
.pf-cmp th:first-child, .pf-cmp td:first-child { text-align: left; position: sticky; left: 0; z-index: 1; box-shadow: 1px 0 0 #ebf1f6; }
.pf-cmp tbody tr.link { cursor: pointer; }
.pf-cmp tbody tr.link:hover td { background: #f5f9fc; }
.pf-cmp tr.total td { font-weight: 700; background: #f5f8fb; border-top: 1px solid #c4d3df; border-bottom: 0; }
.pf-cmp .ob b, .pf-cmp .ob a { display: block; font-weight: 700; color: #0d1f2b; text-decoration: none; }
.pf-cmp .ob a:hover { color: #1a719f; text-decoration: underline; }
.pf-cmp .ob small { display: block; font-size: 10.5px; font-weight: 500; color: #59738a; }
.pf-cmp .v { font-weight: 700; }
.pf-cmp .s { display: block; font-size: 10px; font-weight: 600; }
.pf-state { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 2px 9px; border: 1px solid; }
.pf-state.good { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.pf-state.warn { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.pf-state.bad { color: #be123c; background: #fff1f2; border-color: #fecdd3; }
.pf-state.neutral, .pf-state.here { color: #475569; background: #eef3f7; border-color: #dce6ee; }

/* Mapa de calor */
table.pf-heat { border-collapse: separate; border-spacing: 2px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.pf-heat th { font-size: 10px; font-weight: 600; color: #59738a; padding: 0 2px 2px; white-space: nowrap; }
.pf-heat th.rowh { text-align: left; padding-right: 8px; font-weight: 700; color: #1b3348; font-size: 11.5px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.pf-heat th.here { color: #8a3f06; }
.pf-heat td { min-width: 42px; height: 26px; text-align: center; border-radius: 3px; font-weight: 600; padding: 0 3px; }
.pf-heat td.open { background: repeating-linear-gradient(45deg, #eef3f7 0 4px, #fff 4px 8px); color: #59738a; font-weight: 500; }
.pf-heat td.none { color: #b6c4d0; font-weight: 500; }
.pf-heat td.here { box-shadow: inset 0 0 0 2px #f3a64a; }
.pf-heat td.strong { font-weight: 700; }
.pf-heat tr.total th { color: #0a364d; }
.pf-ramp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; font-size: 10.5px; color: #59738a; }
.pf-ramp .bar { display: inline-flex; height: 8px; width: 160px; border-radius: 2px; overflow: hidden; }
.pf-ramp .bar i { flex: 1; }
.pf-ramp .hatch { display: inline-block; width: 12px; height: 10px; vertical-align: -1px; margin-left: 8px; margin-right: 4px; background: repeating-linear-gradient(45deg, #eef3f7 0 3px, #fff 3px 6px); border: 1px solid #c4d3df; }

/* Linhas por obra */
.pf-rows { display: grid; gap: 9px; margin-top: 4px; }
.pf-rowx { display: grid; grid-template-columns: 138px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.pf-rowx .nm { font-weight: 700; color: #1b3348; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.pf-rowx .nm small { display: block; font-weight: 500; font-size: 10.5px; color: #59738a; overflow: hidden; text-overflow: ellipsis; }
.pf-rowx .meta { text-align: right; white-space: nowrap; font-size: 11.5px; }
.pf-rowx .sub2 { grid-column: 2 / -1; font-size: 11px; color: #59738a; }
.pf-rowx .muted { color: #8ea4b7; font-weight: 500; }
.pf-stackb { display: flex; height: 12px; border-radius: 3px; overflow: hidden; gap: 2px; background: #fff; min-width: 0; }
.pf-stackb b { display: block; height: 100%; }
.pf-bullet { position: relative; height: 16px; background: #eef3f7; border-radius: 3px; min-width: 0; }
.pf-bullet .pl { position: absolute; left: 0; top: 0; bottom: 0; background: #b7d3f6; border-radius: 3px; }
.pf-bullet .me { position: absolute; left: 0; top: 4px; bottom: 4px; background: #1c5cab; border-radius: 2px; }
.pf-pair { display: grid; gap: 3px; min-width: 0; }
.pf-pair > div { display: grid; grid-template-columns: minmax(0, 1fr) 30px; gap: 6px; align-items: center; }
.pf-pair .tr { height: 7px; background: #eef3f7; border-radius: 2px; overflow: hidden; }
.pf-pair .tr b { display: block; height: 100%; border-radius: 2px; }
.pf-pair span.n { text-align: right; font-weight: 700; font-size: 11px; }
.pf-g3 > div { grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1.4fr); gap: 0 10px; }
.pf-g3 .bar { display: block; height: 6px; margin-top: 3px; border-radius: 2px; }
.pf-g3 .cause { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pf-rowx.total { border-top: 1px solid #c4d3df; padding-top: 7px; }
.pf-rowx.total .nm { color: #0a364d; }
.dsh-grid.pf-wrap .txt { white-space: normal; overflow-wrap: anywhere; }
.dsh-grid.pf-wrap .muted.txt { font-size: 11px; line-height: 1.35; }

/* Sete cartões no topo */
.pf-kpis { container-type: inline-size; }
.dsh .dsh-kpis.k7 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@container (min-width: 520px) { .dsh .dsh-kpis.k7 { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 1000px) {
  .dsh .dsh-kpis.k7 { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .dsh .dsh-kpis.k7 .dsh-stat { padding: 11px 12px 12px; }
  .dsh .dsh-kpis.k7 .dsh-stat::before { left: 12px; right: 12px; }
  .dsh .dsh-kpis.k7 .dsh-stat .v { font-size: 22px; gap: 6px; }
}

/* Oito ou nove cartões (12/11/2026): duas linhas */
.dsh .dsh-kpis.k9 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@container (min-width: 520px) { .dsh .dsh-kpis.k9 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (min-width: 1000px) { .dsh .dsh-kpis.k9 { grid-template-columns: repeat(5, minmax(0, 1fr)); } }

/* Quadros de 12/11/2026 */
table.pf-svc td { background: #f5f8fb; color: #1b3348; min-width: 52px; }
table.pf-svc td.none { background: none; }
table.pf-svc td.tot { background: #eaf4fa; color: #0a364d; }
table.pf-svc th.rowh { max-width: 220px; }
.pf-rowx .dsh-tag { vertical-align: 1px; }

/* Segurança do trabalho */
.pf-sst-box { container-type: inline-size; }
.pf-sst-cols { grid-template-columns: minmax(0, 1fr); }
.pf-sst > .pf-rowx { grid-template-columns: 92px minmax(0, 1fr) auto; }
@container (min-width: 820px) {
  .pf-sst-cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .pf-sst-cols > .dsh-blk:nth-child(3) { grid-column: 1 / -1; }
}
@container (min-width: 1100px) {
  .pf-sst-cols { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1fr); }
  .pf-sst-cols > .dsh-blk:nth-child(3) { grid-column: auto; }
}
@container (max-width: 520px) {
  .pf-sst > .pf-rowx { grid-template-columns: 84px minmax(0, 1fr); }
  .pf-sst > .pf-rowx .meta { grid-column: 2; text-align: left; white-space: normal; }
}

@media (max-width: 1080px) { .pf-mods-2 { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) {
  .pf-rowx { grid-template-columns: 96px minmax(0, 1fr); }
  .pf-rowx .meta { grid-column: 2; text-align: left; white-space: normal; }
  .pf-rowx .sub2 { grid-column: 2; }
}

/* Papel */
.dsh-paper table.pf-cmp { font-size: 10px; }
.dsh-paper .pf-cmp th { font-size: 7.5px; padding: 0 5px 4px; }
.dsh-paper .pf-cmp th .grp { font-size: 7px; }
.dsh-paper .pf-cmp td { padding: 4px 4px; }
.dsh-paper .pf-cmp .ob small { font-size: 8.5px; }
.dsh-paper .pf-cmp .s { font-size: 8px; }
.dsh-paper .pf-state { font-size: 8.5px; padding: 1px 6px; }
.dsh-paper table.pf-heat { font-size: 10px; border-spacing: 1.5px; }
.dsh-paper .pf-heat th { font-size: 8.5px; }
.dsh-paper .pf-heat th.rowh { font-size: 10px; }
.dsh-paper .pf-heat td { min-width: 34px; height: 21px; }
.dsh-paper .pf-ramp { font-size: 9px; }
.dsh-paper .pf-rows { gap: 6px; }
.dsh-paper .pf-rowx { font-size: 10.5px; grid-template-columns: 124px minmax(0, 1fr) auto; }
.dsh-paper .pf-rowx .meta { font-size: 10px; }
.dsh-paper .pf-rowx .nm small, .dsh-paper .pf-rowx .sub2 { font-size: 9px; }
.dsh-paper .pf-nodata { font-size: 9.5px; }
.dsh-paper .pf-sst > .pf-rowx { grid-template-columns: 74px minmax(0, 1fr) auto; }
.dsh-paper .pf-rowx.total { padding-top: 5px; }
/* Folha "Controles de obra e SST" com dois ou três quadros lado a lado: os números descem para a linha de baixo, senão a coluna do gráfico some. */
.dsh-paper .pf-narrow .pf-rowx { grid-template-columns: 92px minmax(0, 1fr); }
.dsh-paper .pf-narrow .pf-rowx .meta { grid-column: 2; text-align: left; white-space: normal; }
.dsh-paper .pf-narrow .pf-rowx .sub2 { grid-column: 2; }
.dsh-paper .dsh-grid.pf-wrap .muted.txt { font-size: 9.5px; }
.dsh-paper .dsh-kpis.k7 { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 7px; }
.dsh-paper .dsh-kpis.k7 .dsh-kpi { padding: 6px 8px 7px; }
.dsh-paper .dsh-kpis.k7 .dsh-kpi .v { font-size: 20px; }
.dsh-paper .dsh-kpis.k7 .dsh-kpi .l em { white-space: nowrap; }
.dsh-paper .dsh-kpis.k9 { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px 7px; }
.dsh-paper .dsh-kpis.k9 .dsh-kpi { padding: 4px 8px 5px; }
.dsh-paper .dsh-kpis.k9 .dsh-kpi .v { font-size: 17px; }
.dsh-paper .dsh-kpis.k9 .dsh-kpi .h { font-size: 8.5px; line-height: 1.25; }
.dsh-paper table.pf-svc td { min-width: 40px; }
.dsh-paper .pf-rowx .dsh-tag { font-size: 8.5px; padding: 0 5px; }
.dsh-paper .pf-sst-kpis .dsh-kpi .v.t-bad { color: #be123c; }
.dsh-paper .pf-sst-kpis .dsh-kpi .v.t-good { color: #047857; }
.dsh-paper .pf-sst-kpis .dsh-kpi .v .dl { font-size: 11px; font-weight: 700; }
`;
