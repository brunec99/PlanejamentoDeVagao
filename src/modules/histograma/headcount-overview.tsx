'use client';
import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, CopyPlus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  CONTRACTOR_LABEL,
  OTHERS_LABEL,
  OWN_LABEL,
  addDays,
  crewsOfDay,
  formatDay,
  headcountCatalog,
  headcountKey,
  headcountRanking,
  headcountSeries,
  headcountSummary,
  isWeekend,
  launchedDays,
  weekdayName,
  workdaysBetween,
  type HeadcountCut,
  type HeadcountEntry,
  type HeadcountGrain,
  type HeadcountRankRow,
  type HeadcountSeries,
} from '@/domain/headcount';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { CHART, seriesColor } from '@/shared/palette';
import { useHeadcount } from './api';

/** Tela da aba 7, Histograma de mão de obra (11/11/2026). De cima para baixo: a folha do dia (onde se
 * lança, como na planilha), os cartões do período, o histograma empilhado e os rankings por empresa e
 * função. Tudo é calculado no navegador sobre o efetivo inteiro da obra. */

type Preset = '30' | '90' | '180' | '365' | 'tudo';
const PRESETS: { id: Preset; label: string }[] = [
  { id: '30', label: '30 dias' },
  { id: '90', label: '90 dias' },
  { id: '180', label: '6 meses' },
  { id: '365', label: '12 meses' },
  { id: 'tudo', label: 'Tudo' },
];
const GRAINS: { id: HeadcountGrain; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];
const CUTS: { id: HeadcountCut; label: string }[] = [
  { id: 'vinculo', label: 'Próprio × empreiteiro' },
  { id: 'empresa', label: 'Empresa' },
  { id: 'funcao', label: 'Função' },
];
const OWN_COLOR = CHART.planned;
const CONTRACTOR_COLOR = '#eb6834';
const OTHERS_COLOR = CHART.gridStrong;
const number = (value: number, digits = 0) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${value === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const colorOf = (key: string, index: number) =>
  key === OWN_LABEL ? OWN_COLOR : key === CONTRACTOR_LABEL ? CONTRACTOR_COLOR : key === OTHERS_LABEL ? OTHERS_COLOR : seriesColor(index);

/** Barras empilhadas em HTML: uma coluna por período, com o total em cima e o detalhe no título e na
 * tabela "ver os números" abaixo do gráfico (a cor nunca é a única pista). */
function StackedBars({ series, grain }: { series: HeadcountSeries; grain: HeadcountGrain }) {
  const max = Math.max(1, ...series.points.map(point => point.total));
  const dense = series.points.length > 40;
  const every = Math.max(1, Math.ceil(series.points.length / 14));
  const digits = grain === 'dia' ? 0 : 1;
  return (
    <div>
      <div className="flex h-64 items-end gap-px overflow-x-auto pb-1" role="img" aria-label="Efetivo por período, empilhado">
        {series.points.map((point, index) => (
          <div
            key={point.start}
            className="group flex h-full min-w-[6px] flex-1 flex-col justify-end"
            title={`${grain === 'semana' ? 'Semana de ' : ''}${point.label}: ${number(point.total, digits)}\n${series.keys
              .filter(key => point.values[key] > 0)
              .map(key => `${key}: ${number(point.values[key], digits)}`)
              .join('\n')}`}
          >
            {!dense && (
              <span className="mb-0.5 text-center text-[10px] font-semibold tabular-nums text-slate-500">{number(point.total)}</span>
            )}
            <div
              className="flex flex-col-reverse overflow-hidden rounded-t-sm group-hover:opacity-80"
              style={{ height: `${(point.total / max) * 88}%` }}
            >
              {series.keys.map((key, k) =>
                point.values[key] > 0 ? <div key={key} style={{ flexGrow: point.values[key], backgroundColor: colorOf(key, k) }} /> : null,
              )}
            </div>
            <span className="mt-1 h-4 truncate text-center text-[10px] tabular-nums text-slate-400">
              {index % every === 0 ? point.label : ''}
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.keys.map((key, k) => (
          <li key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(key, k) }} />
            {key}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ranking({ rows, color, limit = 12 }: { rows: HeadcountRankRow[]; color: (row: HeadcountRankRow) => string; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <Empty>Sem lançamentos no período.</Empty>;
  const max = rows[0].manDays;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <th className="py-2 font-bold">Nome</th>
            <th className="w-20 py-2 text-right font-bold" title="Soma de pessoas × dias no período">
              Homens-dia
            </th>
            <th className="w-16 py-2 text-right font-bold" title="Tamanho típico da equipe nos dias em que esteve na obra">
              Média
            </th>
            <th className="w-14 py-2 text-right font-bold" title="Dias com presença no período">
              Dias
            </th>
          </tr>
        </thead>
        <tbody className={all ? 'block max-h-[30rem] overflow-y-auto [&>tr]:table [&>tr]:w-full [&>tr]:table-fixed' : undefined}>
          {shown.map(row => (
            <tr key={row.name} className="border-b border-slate-50">
              <td className="py-1.5 pr-3">
                <span className="block truncate text-slate-700" title={row.name}>
                  {row.name}
                </span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-slate-100">
                  <span
                    className="block h-1.5 rounded-full"
                    style={{ width: `${Math.max(2, (row.manDays / max) * 100)}%`, backgroundColor: color(row) }}
                  />
                </span>
              </td>
              <td className="w-20 py-1.5 text-right font-semibold tabular-nums text-slate-900">{number(row.manDays)}</td>
              <td className="w-16 py-1.5 text-right tabular-nums text-slate-600">{number(row.averagePresent, 1)}</td>
              <td className="w-14 py-1.5 text-right tabular-nums text-slate-400">{row.daysPresent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <button type="button" className="text-link mt-3 text-xs" onClick={() => setAll(value => !value)}>
          {all ? 'Mostrar só as maiores' : `Ver todas (${rows.length})`}
        </button>
      )}
    </div>
  );
}

export function HeadcountOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute } = useHeadcount(workId);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [preset, setPreset] = useState<Preset>('90');
  const [grain, setGrain] = useState<HeadcountGrain>('semana');
  const [cut, setCut] = useState<HeadcountCut>('vinculo');
  const [pickedDay, setPickedDay] = useState<string>();
  const [form, setForm] = useState({ company: '', role: '', quantity: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const work = planning.data.works.find(w => w.id === workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  // "Hoje" no fuso da obra (America/Sao_Paulo), o mesmo das outras abas.
  const today = planning.today;

  const header = (
    <TabHeader
      workId={workId}
      section="histograma"
      helpTitle="Como funciona: histograma de mão de obra"
      description="O efetivo de cada dia, por empresa e função: quem estava na obra, quanto é próprio e quanto é empreiteiro."
      help={
        <>
          <p>
            É a planilha “ATR Histograma” dentro do sistema: cada linha diz quantas pessoas de uma função, de uma empresa, estavam na obra
            num dia.
          </p>
          <p>
            Lança-se na folha do dia. “Repetir o último dia” copia as equipes do último dia lançado para um dia ainda vazio; depois basta
            ajustar as quantidades que mudaram.
          </p>
          <p>
            A mesma empresa e função só aparece uma vez por dia: lançar de novo pede para editar a linha. Nomes digitados com outra grafia
            (“ATR ”, “pedreiro”) são gravados como a obra já escreve.
          </p>
          <p>Nas visões por semana e por mês, o número é a média por dia útil lançado; sábado e domingo ficam fora da média.</p>
        </>
      }
    />
  );

  if (state.status === 'loading') return <LoadState rows={8} />;
  if (state.status === 'error')
    return (
      <>
        {header}
        <div className="panel space-y-4 p-6">
          <Callout tone="danger" role="alert">
            Não foi possível carregar o histograma. {state.message}
          </Callout>
          <button
            type="button"
            className="button-ghost"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              reload().finally(() => setRetrying(false));
            }}
          >
            <RefreshCw size={15} aria-hidden />
            {retrying ? 'Tentando…' : 'Tentar de novo'}
          </button>
        </div>
      </>
    );
  if (state.status === 'unavailable')
    return (
      <>
        {header}
        <Callout tone="warning" role="status">
          O histograma ainda não foi ativado no banco: aplique a migração 0045.
        </Callout>
      </>
    );

  const { entries, canEdit } = state.data;
  const days = launchedDays(entries);
  const lastDay = days.at(-1);
  const firstDay = days[0];
  const filter = { from: preset === 'tudo' ? (firstDay ?? today) : addDays(today, -(Number(preset) - 1)), to: today };
  const summary = headcountSummary(entries, filter);
  const series = headcountSeries(entries, filter, grain, cut);
  const companies = headcountRanking(entries, filter, 'empresa');
  const roles = headcountRanking(entries, filter, 'funcao');
  const catalog = headcountCatalog(entries);

  // Folha do dia: quem lança abre em hoje; quem só consulta, no último dia lançado.
  const day = pickedDay ?? (canEdit ? today : (lastDay ?? today));
  const crews = crewsOfDay(entries, day);
  const dayTotal = crews.reduce((sum, crew) => sum + crew.total, 0);
  const previousDay = [...days].reverse().find(d => d < day);
  const nextDay = days.find(d => d > day);
  const lastTotal = lastDay ? entries.filter(e => e.workedOn === lastDay).reduce((sum, e) => sum + e.quantity, 0) : 0;
  const idleWorkdays = lastDay ? workdaysBetween(lastDay, today) : 0;
  const known = (list: string[], text: string) => !text.trim() || list.some(name => headcountKey(name) === headcountKey(text));

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) toast({ title: done });
      return true;
    } catch (error) {
      toast({ title: 'Não foi possível gravar', description: error instanceof Error ? error.message : undefined, tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(() =>
      execute({
        type: 'save_entry',
        workId,
        workedOn: day,
        company: form.company,
        role: form.role,
        quantity: Number(form.quantity),
        note: form.note,
      }),
    );
    // A empresa fica: o comum é lançar várias funções da mesma empresa em seguida.
    if (ok) setForm(current => ({ company: current.company, role: '', quantity: '', note: '' }));
  };
  const saveQuantity = (entry: HeadcountEntry, text: string) => {
    const quantity = Number(text);
    if (text.trim() === '' || quantity === entry.quantity) return;
    void run(() =>
      execute({
        type: 'save_entry',
        id: entry.id,
        workId,
        workedOn: entry.workedOn,
        company: entry.company,
        role: entry.role,
        quantity,
        note: entry.note,
      }),
    );
  };
  const remove = async (entry: HeadcountEntry) => {
    const ok = await confirm({
      title: `Excluir ${entry.role} da ${entry.company}?`,
      description: `Sai do efetivo de ${formatDay(entry.workedOn)}.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok) void run(() => execute({ type: 'delete_entry', id: entry.id }), 'Lançamento excluído');
  };

  return (
    <>
      {header}

      <div data-tour="headcount-cards" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Efetivo no último dia lançado"
          value={lastDay ? number(lastTotal) : '—'}
          hint={
            lastDay
              ? `${formatDay(lastDay)} (${weekdayName(lastDay)})${idleWorkdays > 1 ? ` · ${idleWorkdays} dias úteis sem lançar` : ''}`
              : 'Nenhum dia lançado ainda'
          }
          tone={idleWorkdays > 1 ? 'warning' : 'default'}
        />
        <StatCard label="Média por dia útil" value={number(summary.dailyAverage, 1)} hint={`no período · ${summary.days} dias lançados`} />
        <StatCard
          label="Pico do período"
          value={number(summary.peak)}
          hint={summary.peakDay ? `em ${formatDay(summary.peakDay)} (${weekdayName(summary.peakDay)})` : '—'}
        />
        <StatCard
          label="Empreiteiros"
          value={`${number(summary.contractorShare * 100)}%`}
          hint={`dos ${number(summary.manDays)} homens-dia · ${summary.companies} empresas`}
        />
      </div>

      {/* Folha do dia */}
      <section data-tour="headcount-day" className="panel mb-6 p-5" aria-labelledby="hc-day">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="hc-day" className="text-base font-bold text-slate-900">
              Folha do dia
            </h2>
            <p className="text-sm text-slate-500">
              {formatDay(day)} ({weekdayName(day)}
              {isWeekend(day) ? ', fim de semana' : ''}
              {day === today ? ', hoje' : ''}) · {number(dayTotal)} pessoas em {crews.length} {crews.length === 1 ? 'empresa' : 'empresas'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="button-ghost"
              aria-label="Dia lançado anterior"
              title={previousDay ? `Dia lançado anterior: ${formatDay(previousDay)}` : 'Não há dia lançado antes deste'}
              disabled={!previousDay}
              onClick={() => previousDay && setPickedDay(previousDay)}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <input
              type="date"
              className="field w-auto"
              aria-label="Dia da folha"
              value={day}
              max={today}
              onChange={event => event.target.value && setPickedDay(event.target.value)}
            />
            <button
              type="button"
              className="button-ghost"
              aria-label="Próximo dia lançado"
              title={nextDay ? `Próximo dia lançado: ${formatDay(nextDay)}` : 'Não há dia lançado depois deste'}
              disabled={!nextDay}
              onClick={() => nextDay && setPickedDay(nextDay)}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            {day !== today && (
              <button type="button" className="button-ghost" onClick={() => setPickedDay(today)}>
                Hoje
              </button>
            )}
          </div>
        </div>

        {canEdit && (
          <form data-tour="headcount-form" onSubmit={submit} className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-12">
            <label className="sm:col-span-4">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Empresa</span>
              <input
                className="field"
                list="hc-companies"
                autoComplete="off"
                required
                value={form.company}
                onChange={event => setForm(current => ({ ...current, company: event.target.value }))}
              />
              {!known(catalog.companies, form.company) && <span className="mt-1 block text-xs text-warning">Empresa nova nesta obra.</span>}
            </label>
            <label className="sm:col-span-3">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Função</span>
              <input
                className="field"
                list="hc-roles"
                autoComplete="off"
                required
                value={form.role}
                onChange={event => setForm(current => ({ ...current, role: event.target.value }))}
              />
              {!known(catalog.roles, form.role) && <span className="mt-1 block text-xs text-warning">Função nova nesta obra.</span>}
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Qtd.</span>
              <input
                className="field tabular-nums"
                inputMode="numeric"
                required
                value={form.quantity}
                onChange={event => setForm(current => ({ ...current, quantity: event.target.value.replace(/\D/g, '') }))}
              />
            </label>
            <label className="sm:col-span-3">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Observação</span>
              <input
                className="field"
                maxLength={300}
                placeholder="falta, atestado, day off…"
                value={form.note}
                onChange={event => setForm(current => ({ ...current, note: event.target.value }))}
              />
            </label>
            <div className="flex items-end sm:col-span-1">
              <button type="submit" className="button w-full justify-center" disabled={busy} title="Lançar no dia da folha">
                <Plus size={16} aria-hidden />
                <span className="sm:sr-only">Lançar</span>
              </button>
            </div>
            <datalist id="hc-companies">
              {catalog.companies.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="hc-roles">
              {catalog.roles.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </form>
        )}

        {crews.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Empty>Nada lançado neste dia.</Empty>
            {canEdit && previousDay && (
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => execute({ type: 'copy_day', workId, from: previousDay, to: day }),
                    'Equipes repetidas: ajuste as quantidades que mudaram',
                  )
                }
              >
                <CopyPlus size={15} aria-hidden />
                Repetir o último dia ({formatDay(previousDay)})
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {crews.map(crew => (
              <div key={crew.company} className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                    {crew.company}
                    {crew.own && <span className="badge-muted ml-2">próprio</span>}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">{crew.total}</span>
                </div>
                <ul className="divide-y divide-slate-50">
                  {crew.rows.map(entry => (
                    <li key={entry.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-700">{entry.role}</span>
                        {entry.note && <span className="block truncate text-xs text-warning">{entry.note}</span>}
                      </span>
                      {canEdit ? (
                        <>
                          <input
                            key={`${entry.id}:${entry.quantity}`}
                            className="field w-16 px-2 py-1 text-right tabular-nums"
                            inputMode="numeric"
                            aria-label={`Quantidade de ${entry.role} da ${crew.company}`}
                            defaultValue={entry.quantity}
                            onBlur={event => saveQuantity(entry, event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
                          />
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-danger"
                            aria-label={`Excluir ${entry.role} da ${crew.company}`}
                            disabled={busy}
                            onClick={() => remove(entry)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </>
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{entry.quantity}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Histograma */}
      <section data-tour="headcount-chart" className="panel mb-6 p-5" aria-labelledby="hc-chart">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="hc-chart" className="text-base font-bold text-slate-900">
              {grain === 'dia' ? 'Efetivo por dia' : grain === 'semana' ? 'Efetivo médio por semana' : 'Efetivo médio por mês'}
            </h2>
            <p className="text-sm text-slate-500">
              {grain === 'dia'
                ? 'Total de pessoas lançadas em cada dia.'
                : 'Média de pessoas por dia útil lançado; sábado e domingo ficam fora da média.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented label="Período" value={preset} options={PRESETS} onChange={setPreset} />
            <Segmented label="Agrupar o tempo por" value={grain} options={GRAINS} onChange={setGrain} />
            <Segmented label="Empilhar por" value={cut} options={CUTS} onChange={setCut} />
          </div>
        </div>
        {series.points.length === 0 ? (
          <Empty>Sem lançamentos no período. Aumente o período.</Empty>
        ) : (
          <StackedBars series={series} grain={grain} />
        )}
      </section>

      <div data-tour="headcount-ranking" className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="hc-companies-title">
          <h2 id="hc-companies-title" className="text-base font-bold text-slate-900">
            Por empresa
          </h2>
          <p className="mb-3 text-sm text-slate-500">{companies.length} empresas no período · azul é mão de obra própria</p>
          <Ranking rows={companies} color={row => (row.own ? OWN_COLOR : CONTRACTOR_COLOR)} />
        </section>
        <section className="panel p-5" aria-labelledby="hc-roles-title">
          <h2 id="hc-roles-title" className="text-base font-bold text-slate-900">
            Por função
          </h2>
          <p className="mb-3 text-sm text-slate-500">{roles.length} funções no período</p>
          <Ranking rows={roles} color={() => seriesColor(6)} />
        </section>
      </div>
    </>
  );
}
