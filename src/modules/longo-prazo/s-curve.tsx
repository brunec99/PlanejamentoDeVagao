'use client';
import { useMemo, useState } from 'react';
import type { CurvePoint } from '@/domain/rules';
import { executedAt, plannedAt, progressCurve } from '@/domain/rules';
import { addDays } from '@/domain/validation';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';

const W = 760, H = 290, PAD = { left: 44, right: 18, top: 16, bottom: 32 };
const PLOT_W = W - PAD.left - PAD.right, PLOT_H = H - PAD.top - PAD.bottom;
const DAY = 86400000;
// Planejado e executado não se distinguem só pela cor: o tracejado contra o contínuo mantém a
// leitura em impressão em preto e branco, que é como a curva chega à reunião de diretoria.
const PLANNED = '#1d4ed8', EXECUTED = '#0f766e', TODAY = '#b45309';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const GRID = [0, 25, 50, 75, 100];

const one = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number) => `${one(value)}%`;
const signed = (value: number) => `${value > 0.05 ? '+' : ''}${one(Math.abs(value) < 0.05 ? 0 : value)}`;
const dayLabel = (days: number) => `${days} ${days === 1 ? 'dia' : 'dias'}`;
const min = (dates: string[]) => dates.reduce((low, date) => (date < low ? date : low));
const max = (dates: string[]) => dates.reduce((high, date) => (date > high ? date : high));

type Reference = { plannedStart: string; plannedEnd: string; weight: number }[];

/** A data em que o planejado valia o percentual dado. O planejado só cresce com o tempo, então a
 * busca binária acha o dia exato sem varrer uma obra de anos dia a dia. Devolve indefinido quando
 * o planejado nunca chega lá — não há data honesta a mostrar, e inventar uma seria pior que calar. */
function dateWherePlannedReaches(items: Reference, target: number, from: string, to: string) {
  if (target <= 0 || from > to || !items.length || plannedAt(items, to) < target) return undefined;
  let low = 0, high = Math.round((Date.parse(to) - Date.parse(from)) / DAY);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (plannedAt(items, addDays(from, mid)) >= target) high = mid; else low = mid + 1;
  }
  return addDays(from, low);
}

export function SCurve({ workId }: { workId: string }) {
  const context = usePlanning();
  const [referenceId, setReferenceId] = useState<string>();
  const [range, setRange] = useState<{ from: string; to: string }>();

  const model = useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    const { data, today } = context.planning;
    const actor = data.users.find(u => u.id === context.actorId);
    if (!selected || !actor?.workIds.includes(workId)) return undefined;

    const wagonIds = new Set(selected.wagons.map(w => w.id));
    const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
    const activityIds = new Set(activities.map(a => a.id));
    const entries = data.progressEntries.filter(e => activityIds.has(e.activityId));
    const baselines = data.baselines.filter(b => b.workId === workId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Sem escolha do usuário a referência é a linha de base mais recente: medir o executado contra
    // o planejamento atual, que já foi reprogramado, é medir a obra contra a desculpa dela.
    const chosen = referenceId ?? baselines[0]?.id ?? '';
    const baseline = baselines.find(b => b.id === chosen);
    const reference: Reference = baseline ? baseline.activities : activities;

    const dates = [...activities.flatMap(a => [a.plannedStart, a.plannedEnd]), ...(baseline?.activities.flatMap(a => [a.plannedStart, a.plannedEnd]) ?? [])];
    // Hoje entra no padrão do período mesmo fora do cronograma: é nele que a leitura se apoia, e
    // uma curva que termina antes de hoje não responde se a obra está adiantada ou atrasada.
    const defaults = dates.length ? { from: min(dates), to: max([...dates, today]) } : { from: today, to: today };
    const period = range ?? defaults;
    const invalid = period.from > period.to;

    const measured = entries.some(e => e.recordedDate <= today);
    const plannedToday = activities.length ? plannedAt(reference, today) : 0;
    const executedToday = measured ? executedAt(activities, entries, today) : 0;
    const deviation = executedToday - plannedToday;
    const insideToday = today >= period.from && today <= period.to;

    const points = invalid || !activities.length ? [] : progressCurve({ activities, entries, baseline, from: period.from, to: period.to });
    const rows: CurvePoint[] = insideToday && points.length && !points.some(p => p.date === today)
      ? [...points, { date: today, planned: plannedToday, executed: executedToday }].sort((a, b) => a.date.localeCompare(b.date))
      : points;

    const refDates = reference.flatMap(a => [a.plannedStart, a.plannedEnd]);
    const sameAs = measured && refDates.length ? dateWherePlannedReaches(reference, executedToday, min(refDates), max(refDates)) : undefined;
    const drift = sameAs ? Math.round((Date.parse(today) - Date.parse(sameAs)) / DAY) : undefined;

    const weight = activities.reduce((sum, a) => sum + a.weight, 0);
    const declared = weight ? activities.reduce((sum, a) => sum + a.progress * a.weight, 0) / weight : 0;

    const months: { date: string; label: string }[] = [];
    if (rows.length) {
      const [y0, m0] = period.from.split('-').map(Number);
      const [y1, m1] = period.to.split('-').map(Number);
      for (let i = 0, count = (y1 - y0) * 12 + (m1 - m0); i <= count; i++) {
        const month = m0 - 1 + i;
        const first = new Date(Date.UTC(y0, month, 1)).toISOString().slice(0, 10);
        if (first >= period.from) months.push({ date: first, label: `${MONTHS[((month % 12) + 12) % 12]}/${String((y0 + Math.floor(month / 12)) % 100).padStart(2, '0')}` });
      }
    }

    return { today, activities, baselines, chosen, baseline, defaults, period, invalid, points, rows, months, measured, plannedToday, executedToday, deviation, insideToday, sameAs, drift, declared };
  }, [context, workId, referenceId, range]);

  if (context.state !== 'ready' || !model) return null;
  const { today, activities, baselines, chosen, baseline, defaults, period, invalid, rows, months, measured, plannedToday, executedToday, deviation, insideToday, sameAs, drift, declared } = model;

  const heading = <h2 className="text-sm font-bold text-slate-800">Curva de avanço acumulado</h2>;
  if (!activities.length) return <section data-tour="longo-curva-s" className="panel mt-6 p-5">
    {heading}
    <div className="mt-2"><Empty>Esta obra ainda não tem atividade planejada: sem frentes com início e término não há avanço para acumular no tempo.</Empty></div>
  </section>;

  const x = (date: string) => PAD.left + ((Date.parse(date) - Date.parse(period.from)) / Math.max(DAY, Date.parse(period.to) - Date.parse(period.from))) * PLOT_W;
  const y = (value: number) => PAD.top + (1 - Math.min(100, Math.max(0, value)) / 100) * PLOT_H;
  const line = (list: CurvePoint[], key: 'planned' | 'executed') => list.map(p => `${x(p.date).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const executedLine = rows.filter(p => p.date <= today);
  const step = Math.max(1, Math.ceil(months.length / 12));
  const tone = !measured || deviation >= -0.05 ? 'default' : deviation < -5 ? 'danger' : 'warning';
  const swatch = (color: string, dash?: string) => <svg width="22" height="8" aria-hidden="true" className="shrink-0"><line x1="0" y1="4" x2="22" y2="4" stroke={color} strokeWidth={2.5} strokeDasharray={dash} /></svg>;

  return <section data-tour="longo-curva-s" className="panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        {heading}
        <p className="mt-0.5 text-xs text-slate-500">
          Planejado: <strong className="text-slate-700">{baseline ? baseline.name : 'planejamento atual'}</strong>
          {!baseline && (baselines.length > 0
            ? <> — já reprogramado; escolha uma linha de base para comparar com o que foi prometido</>
            : <> — nenhuma linha de base salva, então a comparação é com o cronograma de hoje</>)}
          {' · '}{formatDate(period.from)} a {formatDate(period.to)} · {activities.length} atividades
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {baselines.length > 0
          ? <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Planejado de
              <select className="field max-w-48 py-1.5" value={chosen} onChange={e => setReferenceId(e.target.value)}>
                <option value="">Planejamento atual</option>
                {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          : <span className="badge-muted">Sem linha de base salva</span>}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">De
          <input type="date" className="field max-w-40 py-1.5" value={period.from} onChange={e => setRange({ from: e.target.value || defaults.from, to: period.to })} />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">até
          <input type="date" className="field max-w-40 py-1.5" value={period.to} onChange={e => setRange({ from: period.from, to: e.target.value || defaults.to })} />
        </label>
        {range && <button type="button" className="button-ghost" onClick={() => setRange(undefined)}>Período padrão</button>}
      </div>
    </div>

    <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={`Planejado até ${formatDate(today)}`} value={pct(plannedToday)} />
      <StatCard label="Executado medido até hoje" value={measured ? pct(executedToday) : '—'} />
      <StatCard label="Desvio de hoje (executado − planejado)" value={measured ? `${signed(deviation)} p.p.` : '—'} tone={tone} />
      {drift !== undefined && drift !== 0 && <StatCard label={drift > 0 ? 'Atraso medido em tempo' : 'Avanço medido em tempo'} value={dayLabel(Math.abs(drift))} tone={drift > 0 ? (drift > 30 ? 'danger' : 'warning') : 'default'} />}
    </div>

    <div className="px-5 pb-4">
      {measured
        ? <Callout tone={deviation >= -0.05 ? 'success' : deviation < -5 ? 'danger' : 'warning'} role="status">
            {Math.abs(deviation) < 0.05
              ? <>A obra está <strong>em dia</strong> com o planejado de hoje: {pct(executedToday)} executados contra {pct(plannedToday)} previstos.</>
              : <>A obra está <strong>{deviation > 0 ? 'adiantada' : 'atrasada'}</strong> em {one(Math.abs(deviation))} pontos percentuais — {pct(executedToday)} executados contra {pct(plannedToday)} previstos para {formatDate(today)}.</>}
            {sameAs && drift !== undefined && drift !== 0 && <> O avanço de hoje é o que o planejado {drift > 0 ? 'já marcava' : 'só marcaria'} em <strong>{formatDate(sameAs)}</strong>: {dayLabel(Math.abs(drift))} {drift > 0 ? 'atrás' : 'à frente'}.</>}
          </Callout>
        : <Callout tone="info">Ainda não há lançamento datado nesta obra, então só o planejado está desenhado.{declared > 0 && <> As atividades declaram {pct(declared)} de avanço, mas o percentual atual não tem data: sem ela não dá para colocá-lo no tempo, e a curva executada ficaria em zero sem dizer por quê.</>}</Callout>}
      {baseline && baseline.activities.length === 0 && <div className="mt-3"><Callout tone="warning">A linha de base <strong>{baseline.name}</strong> não guardou atividades, então não há planejado para desenhar a partir dela.</Callout></div>}
    </div>

    {invalid
      ? <div className="px-5 pb-5"><Callout tone="warning">A data inicial do período é posterior à final. Ajuste o intervalo para a curva voltar a ser desenhada.</Callout></div>
      : <div className="overflow-x-auto custom-scrollbar px-5 pb-2" role="region" aria-label="Curva de avanço acumulado, planejado e executado" tabIndex={0}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img"
            aria-label={`Avanço acumulado de ${formatDate(period.from)} a ${formatDate(period.to)}. Planejado hoje ${pct(plannedToday)}${measured ? `, executado hoje ${pct(executedToday)}` : ', sem medição datada'}. Os valores estão na tabela abaixo do gráfico.`}>
            {GRID.map(value => <g key={value}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke={value === 0 ? '#94a3b8' : '#e2e8f0'} strokeWidth={1} />
              <text x={PAD.left - 7} y={y(value) + 3.5} textAnchor="end" fontSize={10} fill="#475569" className="tabular-nums">{value}%</text>
            </g>)}
            {months.map((month, index) => <g key={month.date}>
              <line x1={x(month.date)} x2={x(month.date)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#f1f5f9" strokeWidth={1} />
              {index % step === 0 && <text x={x(month.date)} y={PAD.top + PLOT_H + 15} textAnchor="middle" fontSize={10} fill="#475569">{month.label}</text>}
            </g>)}
            <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#94a3b8" strokeWidth={1} />
            {insideToday && <>
              <line x1={x(today)} x2={x(today)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke={TODAY} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={Math.min(x(today) + 5, W - PAD.right - 28)} y={PAD.top + 10} fontSize={10} fontWeight={700} fill={TODAY}>hoje</text>
            </>}
            <polyline points={line(rows, 'planned')} fill="none" stroke={PLANNED} strokeWidth={2} strokeDasharray="7 4" strokeLinejoin="round" strokeLinecap="round" />
            {measured && executedLine.length > 1 && <polyline points={line(executedLine, 'executed')} fill="none" stroke={EXECUTED} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {insideToday && <circle cx={x(today)} cy={y(plannedToday)} r={3.5} fill={PLANNED} />}
            {insideToday && measured && <circle cx={x(today)} cy={y(executedToday)} r={3.5} fill={EXECUTED} />}
          </svg>
        </div>}

    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-3 text-xs text-slate-600">
      <span className="inline-flex items-center gap-2">{swatch(PLANNED, '7 4')}Planejado — {baseline ? baseline.name : 'planejamento atual'}</span>
      <span className="inline-flex items-center gap-2">{swatch(EXECUTED)}Executado, até hoje</span>
      <span className="inline-flex items-center gap-2">{swatch(TODAY, '5 4')}Hoje, {formatDate(today)}</span>
    </div>

    <details className="border-t border-slate-100 px-5 py-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">Ver os pontos da curva em tabela ({rows.length})</summary>
      <div className="mt-3 max-h-72 overflow-auto custom-scrollbar" role="region" aria-label="Pontos da curva de avanço em tabela" tabIndex={0}>
        <table className="data-table min-w-[420px]">
          <thead><tr>{['Data', 'Planejado', 'Executado'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(point => <tr key={point.date}>
            <th scope="row" className="whitespace-nowrap tabular-nums">{formatDate(point.date)}{point.date === today && <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">hoje</span>}</th>
            <td className="tabular-nums">{pct(point.planned)}</td>
            <td className="tabular-nums">{!measured || point.date > today ? '—' : pct(point.executed)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>

    <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">O planejado supõe avanço linear de cada frente entre o início e o término previstos — é aproximação declarada, e não uma curva de produção medida. O executado não é aproximado: sai dos lançamentos datados, e por isso a curva para em hoje; depois dela não existe medição, e prolongar a linha inventaria avanço.</p>
  </section>;
}
