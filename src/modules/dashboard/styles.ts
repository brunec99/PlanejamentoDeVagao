/** Estilo dos quadros da aba 0, na tela e no papel (04/11/2026, modelo aprovado). Um só CSS para a tela
 * (`.dsh`) e para o PDF (`.dsh-paper`): os quadros usam estas classes, e não utilitários, para o mesmo
 * componente sair igual nos dois lugares. As cores são as da paleta do sistema (`src/shared/palette.ts`)
 * e os neutros, os da escala `slate` de `globals.css`; fixas, porque metade do destino é papel.
 *
 * Convenções (as mesmas do modelo aprovado):
 * - `.dsh-blk` bloco com `h5` (título) e `.dsh-d` (uma linha de explicação); `svg` dentro ocupa a largura;
 * - `.dsh-cols-2` (1.35fr 1fr), `.dsh-cols-3`, `.dsh-cols-21` (1fr 1fr): grades de blocos;
 * - `.dsh-mini` cartões pequenos (`.l` rótulo, `.v` valor, `.h` ajuda);
 * - `.dsh-grid` tabela em grade: cada linha é um `div` com `grid-template-columns` próprio; `.thd` cabeçalho,
 *   `.num` à direita em negrito, `.txt` corta com reticências; `.dsh-track > b` barra de participação;
 * - `.dsh-hb` lista de barras horizontais (texto, número e a barra na linha de baixo);
 * - `.dsh-stack` barra empilhada; `.dsh-legend` legenda com `i` como amostra de cor;
 * - `.dsh-callout` (+ `.alert`) aviso curto; `.dsh-tag` (+ `.good .warn .bad .neutral .here`) selo;
 *   `.t-good .t-warn .t-bad` cor do texto;
 * - `.dsh-wag` lista de vagões; `.dsh-marks` lista de marcos; `.dsh-donut` rosca com legenda;
 * - `.dsh-xp` painel de papel dos quadros de 12/11/2026 (`extras/panels.tsx`), com os blocos em `.dsh-xp-b`;
 *   `.dsh-kpis.kw` os sete a nove cartões da folha 1 numa linha só. */
export const DASHBOARD_STYLE = `
.dsh, .dsh-paper { color: #0d1f2b; font-variant-numeric: tabular-nums; }
.dsh-blk { min-width: 0; overflow: hidden; }
.dsh-blk h5 { margin: 0; font-size: 12.5px; font-weight: 700; color: #1b3348; line-height: 1.3; }
.dsh-blk .dsh-d { margin: 1px 0 6px; font-size: 11.5px; color: #59738a; line-height: 1.4; }
.dsh-blk svg { display: block; width: 100%; height: auto; }
.dsh-cols-2, .dsh-cols-3, .dsh-cols-21 { display: grid; gap: 14px 18px; min-width: 0; }
.dsh-cols-2 { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
.dsh-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dsh-cols-21 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.dsh-stack-blocks { display: grid; gap: 12px; }
.dsh-legend { margin: 6px 0 0; font-size: 11px; color: #59738a; display: flex; flex-wrap: wrap; gap: 4px 12px; line-height: 1.4; }
.dsh-legend i { display: inline-block; width: 10px; height: 8px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
.dsh-legend i.line { height: 2px; vertical-align: 3px; }
.dsh-legend i.dashed { height: 0; border-top: 2px dashed #59738a; background: none; vertical-align: 3px; }
.dsh-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
.dsh-mini > div { background: #f5f8fb; border: 1px solid #ebf1f6; border-radius: 10px; padding: 8px 10px; min-width: 0; }
.dsh-mini .l { font-size: 10.5px; font-weight: 600; color: #59738a; line-height: 1.3; }
.dsh-mini .v { font-size: 18px; font-weight: 700; color: #0d1f2b; line-height: 1.15; margin-top: 2px; }
.dsh-mini .h { font-size: 10.5px; color: #59738a; margin-top: 2px; line-height: 1.3; }
.dsh-grid { display: grid; margin-top: 6px; font-size: 12px; min-width: 0; }
.dsh-grid > div { display: grid; align-items: center; gap: 0 8px; border-bottom: 1px solid #ebf1f6; padding: 4px 0; min-width: 0; overflow: hidden; }
.dsh-grid > .thd { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #59738a; border-bottom-color: #c4d3df; padding: 0 0 4px; }
.dsh-grid .num { text-align: right; font-weight: 700; }
.dsh-grid .num.plain { font-weight: 400; }
.dsh-grid .txt, .dsh-hb .txt, .dsh-marks .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dsh-grid .share { display: flex; align-items: center; gap: 6px; min-width: 0; }
.dsh-grid .share em { width: 30px; text-align: right; font-style: normal; flex: none; }
.dsh-grid .muted { color: #59738a; }
.dsh-track { display: block; position: relative; height: 9px; background: #eef3f7; border-radius: 2px; overflow: hidden; min-width: 0; flex: 1; }
.dsh-track > b { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 2px; background: #2a78d6; }
.dsh-track.thin { height: 6px; }
.dsh-hb { display: grid; gap: 6px; margin-top: 6px; }
.dsh-hb > div { display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 0 8px; align-items: center; font-size: 12px; }
.dsh-hb > div.ranked { grid-template-columns: minmax(0, 1fr) 22px 64px; }
.dsh-hb .num { text-align: right; font-weight: 700; }
.dsh-hb .rk { font-size: 10px; color: #59738a; text-align: right; }
.dsh-hb .none { font-style: italic; color: #59738a; }
.dsh-hb .dsh-track { grid-column: 1 / -1; height: 6px; }
.dsh-stack { display: flex; height: 14px; border-radius: 4px; overflow: hidden; background: #eef3f7; gap: 2px; margin-top: 8px; }
.dsh-stack b { display: block; height: 100%; }
.dsh-callout { margin-top: 8px; border-left: 3px solid #8ea4b7; background: #f5f8fb; padding: 6px 10px; font-size: 12px; line-height: 1.45; color: #1b3348; border-radius: 0 6px 6px 0; }
.dsh-callout.alert { border-left-color: #be123c; background: #fdf0f3; color: #3b1520; }
.dsh-callout.warn { border-left-color: #b45309; background: #fff7e6; color: #4a2a0a; }
.dsh-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; border-radius: 999px; padding: 1px 8px; letter-spacing: .02em; white-space: nowrap; vertical-align: middle; }
.dsh-tag.good { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.dsh-tag.warn { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.dsh-tag.bad { background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
.dsh-tag.neutral { background: #eef3f7; color: #475569; border: 1px solid #dce6ee; }
.dsh-tag.here { background: #fbe9d4; color: #8a3f06; border: 1px solid #f3c07a; }
.t-good { color: #047857; } .t-warn { color: #b45309; } .t-bad { color: #be123c; }
.dsh-wag { display: grid; gap: 6px; margin-top: 6px; }
.dsh-wag > div { display: grid; grid-template-columns: 78px minmax(0, 1fr) 42px; gap: 0 8px; align-items: center; font-size: 12px; }
.dsh-wag .name { font-weight: 700; color: #1b3348; white-space: nowrap; }
.dsh-wag .when { color: #59738a; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-wag .pct { text-align: right; font-weight: 700; }
.dsh-wag .dsh-track { grid-column: 2; height: 7px; }
.dsh-marks { display: grid; gap: 5px; margin-top: 6px; font-size: 12px; }
.dsh-marks > div { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 0 10px; align-items: center; border-bottom: 1px solid #ebf1f6; padding: 3px 0; }
.dsh-marks .dt { font-weight: 700; color: #1b3348; }
.dsh-donut { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px; align-items: center; }
.dsh-donut svg { width: 110px; height: 110px; }
.dsh-donut-leg { display: grid; gap: 3px; font-size: 11.5px; }
.dsh-donut-leg > div { display: grid; grid-template-columns: 10px minmax(0, 1fr) 28px 36px; gap: 6px; align-items: center; }
.dsh-donut-leg i { width: 10px; height: 10px; border-radius: 2px; display: block; }
.dsh-donut-leg .num { text-align: right; font-weight: 700; }
.dsh-donut-leg .pc { text-align: right; color: #59738a; }
.dsh-donut-leg .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-empty { margin: 8px 0 0; font-size: 12px; color: #59738a; line-height: 1.45; }

/* ── Tela ─────────────────────────────────────────────────────────────────────────────────────── */
.dsh-summary { margin: 0 0 16px; font-size: 14px; line-height: 1.55; color: #1b3348; background: #fff; border: 1px solid #dce6ee; border-left: 4px solid #2a8cc0; border-radius: 10px; padding: 10px 14px; }
.dsh-summary strong { color: #0d1f2b; }
.dsh-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 12px; margin-bottom: 18px; }
.dsh-stat { position: relative; overflow: hidden; background: linear-gradient(135deg, #fff 55%, #f2f8fc); border: 1px solid #dce6ee; border-radius: 14px; padding: 12px 14px 13px; box-shadow: 0 1px 2px rgba(13,31,43,.05); min-width: 0; }
.dsh-stat::before { content: ''; position: absolute; left: 14px; right: 14px; top: 0; height: 2px; border-radius: 0 0 4px 4px; background: linear-gradient(90deg, #2a8cc0, #8cc6e4); opacity: .7; }
.dsh-stat.main { border-color: #2a8cc0; background: linear-gradient(135deg, #f3f8fe 55%, #eaf4fa); }
.dsh-stat .l { font-size: 11px; font-weight: 600; color: #59738a; display: flex; justify-content: space-between; gap: 6px; }
.dsh-stat .l em { font-style: normal; font-weight: 700; color: #8ea4b7; white-space: nowrap; }
.dsh-stat .v { margin-top: 5px; font-size: 24px; font-weight: 700; line-height: 1.1; color: #0d1f2b; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.dsh-stat.main .v { color: #1f5fae; }
.dsh-stat .h { margin-top: 4px; font-size: 11.5px; color: #59738a; line-height: 1.35; }
.dsh-mods { display: grid; gap: 16px; }
.dsh-mod { background: #fff; border: 1px solid #dce6ee; border-radius: 16px; box-shadow: 0 1px 2px rgba(13,31,43,.05); overflow: hidden; min-width: 0; }
.dsh-mod-h { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; padding: 11px 16px; border-bottom: 1px solid #ebf1f6; background: linear-gradient(90deg, rgba(242,248,252,.9), transparent); }
.dsh-mod-h h2 { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; font-weight: 700; color: #0a364d; }
.dsh-mod-h .n { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #2a8cc0, #135a82); flex: none; }
.dsh-mod-h .sub { font-size: 12px; font-weight: 500; color: #59738a; }
.dsh-mod-h a { font-size: 12.5px; font-weight: 600; color: #1a719f; text-decoration: none; white-space: nowrap; }
.dsh-mod-h a:hover { text-decoration: underline; }
.dsh-mod-b { padding: 14px 16px 16px; display: grid; gap: 14px 18px; min-width: 0; }
.dsh-mod-b + .dsh-mod-b { border-top: 1px solid #ebf1f6; }
.dsh-mod-b.unavailable { font-size: 13px; color: #59738a; }
.dsh-foot-note { margin: 14px 0 0; font-size: 12px; color: #59738a; line-height: 1.5; }
@media (max-width: 1023px) { .dsh-cols-2, .dsh-cols-3, .dsh-cols-21 { grid-template-columns: minmax(0, 1fr); } }

/* ── Papel: A4 paisagem com margem de 7 mm (área útil 1069 × 741 px), uma folha por seção ────────── */
.dsh-paper { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; padding: 12px; }
.dsh-paper * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.dsh-sheet { height: 732px; max-width: 1069px; margin: 0 auto 16px; display: flex; flex-direction: column; gap: 9px; break-after: page; page-break-after: always; font-size: 11px; color: #111; }
.dsh-sheet:last-child { break-after: auto; page-break-after: auto; }
.dsh-head { display: grid; grid-template-columns: 26% 52% 22%; border: 1px solid #1f2937; flex: none; }
.dsh-head > div { background: #6d9eeb; height: 44px; display: flex; align-items: center; padding: 0 8px; font-weight: 700; }
.dsh-head .title { justify-content: center; font-size: 15px; text-align: center; }
.dsh-head .week { justify-content: flex-end; text-align: right; font-size: 10px; font-weight: 400; line-height: 1.5; }
.dsh-head .logos { display: inline-flex; align-items: center; gap: 8px; background: #fff; border-radius: 6px; padding: 3px 8px; }
.dsh-head .logos img { height: 22px; width: auto; display: block; }
.dsh-head .logos i { width: 1px; height: 20px; background: #cbd5e1; display: block; }
.dsh-head .pill { display: inline-block; border-radius: 999px; background: #fff; padding: 0 7px; font-weight: 700; }
.dsh-head .sub { grid-column: 1 / -1; background: #c9daf8; border-top: 1px solid #1f2937; height: 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 8px; font-weight: 400; }
.dsh-head .sub b { font-weight: 700; }
.dsh-head .sub span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-paper .dsh-summary { margin: 0; font-size: 11.5px; line-height: 1.45; color: #1f2937; background: none; border: 0; border-radius: 0; padding: 0; flex: none; }
.dsh-paper .dsh-kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; margin: 0; flex: none; }
.dsh-paper .dsh-kpis.k4 { grid-template-columns: repeat(4, 1fr); }
.dsh-paper .dsh-kpis.k5 { grid-template-columns: repeat(5, 1fr); }
.dsh-kpi { border: 1px solid #c4d3df; border-radius: 4px; padding: 7px 10px 8px; display: grid; gap: 1px; align-content: start; min-width: 0; }
.dsh-kpi.main { border-color: #2a78d6; background: #f3f8fe; }
.dsh-kpi .l { font-size: 8.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #59738a; display: flex; justify-content: space-between; gap: 4px; }
.dsh-kpi .l em { font-style: normal; color: #8ea4b7; }
.dsh-kpi .v { font-size: 24px; font-weight: 700; line-height: 1.1; color: #2f4a61; display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
.dsh-kpi.main .v { color: #1f5fae; }
.dsh-kpi .h { font-size: 9.5px; color: #59738a; line-height: 1.35; }
.dsh-row { display: grid; gap: 9px; min-height: 0; flex: 1; }
.dsh-panel { border: 1px solid #c4d3df; border-radius: 4px; padding: 8px 11px 7px; display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
.dsh-panel h3 { margin: 0; font-size: 12px; font-weight: 700; color: #1f2937; }
.dsh-panel .dsh-desc { margin: 1px 0 0; font-size: 9.5px; color: #59738a; }
.dsh-panel .dsh-blk h5 { font-size: 10.5px; }
.dsh-panel svg { display: block; width: 100%; height: auto; margin-top: 4px; }
.dsh-paper .dsh-legend { font-size: 9px; padding-top: 2px; }
.dsh-paper .dsh-grid { font-size: 10.5px; }
.dsh-paper .dsh-grid > .thd { font-size: 8.5px; }
.dsh-paper .dsh-hb > div, .dsh-paper .dsh-wag > div, .dsh-paper .dsh-marks > div, .dsh-paper .dsh-donut-leg { font-size: 10.5px; }
.dsh-paper .dsh-mini .v { font-size: 16px; }
.dsh-paper .dsh-mini .l, .dsh-paper .dsh-mini .h { font-size: 9.5px; }
.dsh-paper .dsh-mini.compact > div { padding: 5px 8px; }
.dsh-paper .dsh-mini.compact .v { font-size: 15px; }
.dsh-paper .dsh-callout { font-size: 10px; }
.dsh-paper .dsh-tag { font-size: 9px; }
.dsh-paper .dsh-blk .dsh-d { font-size: 9.5px; }
.dsh-paper .dsh-empty { font-size: 10px; }
.dsh-paper .dsh-cols-2, .dsh-paper .dsh-cols-3, .dsh-paper .dsh-cols-21 { gap: 8px 12px; }
.dsh-paper .dsh-kpis.kw { gap: 6px; }
.dsh-paper .dsh-kpis.kw .dsh-kpi { padding: 6px 7px 7px; }
.dsh-paper .dsh-kpis.kw .dsh-kpi .l { font-size: 7.5px; letter-spacing: .04em; }
.dsh-paper .dsh-kpis.kw .dsh-kpi .v { font-size: 18px; white-space: normal; flex-wrap: wrap; gap: 2px 5px; }
.dsh-paper .dsh-kpis.kw .dsh-kpi .h { font-size: 8.5px; }
.dsh-paper .dsh-kpis.kw .dsh-tag { font-size: 8px; padding: 0 5px; }
/* Quadros de 12/11/2026 no papel: um painel por quadro, com os blocos lado a lado. */
.dsh-xp-b { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 14px; margin-top: 6px; min-height: 0; align-content: start; }
.dsh-xp .dsh-mini { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
.dsh-xp .dsh-mini > div { border-radius: 6px; }
.dsh-xp .dsh-hb { gap: 4px; }
.dsh-xp .dsh-grid > div { padding: 2px 0; }
.dsh-xp .dsh-callout { margin-top: 5px; padding: 4px 8px; }
.dsh-foot { display: flex; justify-content: space-between; gap: 16px; font-size: 8.5px; color: #59738a; border-top: 1px solid #c4d3df; padding-top: 5px; flex: none; }
.dsh-foot span:last-child { white-space: nowrap; }
.dsh-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; font-size: 13px; font-family: system-ui, sans-serif; }
@media print { .dsh-toolbar { display: none; } .dsh-paper { padding: 0; } .dsh-sheet { margin: 0; } }
`;
