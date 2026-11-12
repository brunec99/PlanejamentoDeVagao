'use client';
import { Fragment, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, CopyPlus, PencilLine, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { addDays, formatDay, headcountKey, isWeekend, weekdayName, workdaysBetween } from '@/domain/headcount';
import {
  PRODUCTION_UNITS,
  crewSize,
  entriesOfDay,
  perManDay,
  productionCatalog,
  productionDays,
  productionSummary,
  productivityBy,
  type ProductionEntry,
  type ProductivityRow,
} from '@/domain/production';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { useProduction } from './api';

/** Tela da aba 8, Controle de produtividade (11/11/2026). De cima para baixo: os cartões do período, a
 * folha do dia (onde se lança, como na planilha) e a produtividade por serviço, que abre nos empreiteiros.
 * Tudo é calculado no navegador sobre os lançamentos da obra. */

type Preset = '30' | '90' | '180' | '365' | 'tudo';
const PRESETS: { id: Preset; label: string }[] = [
  { id: '30', label: '30 dias' },
  { id: '90', label: '90 dias' },
  { id: '180', label: '6 meses' },
  { id: '365', label: '12 meses' },
  { id: 'tudo', label: 'Tudo' },
];
const number = (value: number, digits = 0) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const quantityText = (value: number | null) =>
  value === null ? '' : value.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
/** "1.234,56" → 1234.56; "35,5" → 35.5; vazio → null; texto que não é número → NaN (o servidor recusa). */
function parseQuantity(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  return Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
}

type Form = {
  id?: string;
  service: string;
  contractor: string;
  professionals: string;
  helpers: string;
  quantity: string;
  unit: string;
  note: string;
};
const EMPTY: Form = { service: '', contractor: '', professionals: '', helpers: '', quantity: '', unit: '', note: '' };

function ContractorRows({ rows }: { rows: ProductivityRow[] }) {
  if (!rows.length) return null;
  return (
    <>
      {rows.map(row => (
        <tr key={`${row.name}|${row.unit}`} className="bg-slate-50/70 text-slate-600">
          <td className="py-1.5 pl-10 pr-3">{row.name}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">
            {number(row.quantity, 2)} {row.unit}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums">{number(row.manDays)}</td>
          <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{number(row.perManDay, 2)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">
            {number(row.worst, 2)} – {number(row.best, 2)}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums">{row.measured}</td>
        </tr>
      ))}
    </>
  );
}

export function ProductionOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute } = useProduction(workId);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [preset, setPreset] = useState<Preset>('90');
  const [pickedDay, setPickedDay] = useState<string>();
  const [form, setForm] = useState<Form>(EMPTY);
  const [open, setOpen] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const serviceInput = useRef<HTMLInputElement>(null);

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
      section="produtividade"
      helpTitle="Como funciona: controle de produtividade"
      description="O que cada equipe produziu em cada dia: serviço, empreiteiro, profissionais, ajudantes e a produção medida."
      help={
        <>
          <p>
            É a planilha “ATR - Controle da produção” dentro do sistema: cada linha é a equipe de um empreiteiro num serviço, num dia, com a
            produção medida e a unidade.
          </p>
          <p>
            A produção pode ficar em branco: quer dizer “a medir”. Lance a equipe no dia e preencha a produção quando a medição sair, direto
            na linha.
          </p>
          <p>
            “Repetir o último dia” copia as equipes do último dia lançado para um dia ainda vazio, sem a produção: basta ajustar quem mudou
            e medir.
          </p>
          <p>
            A produção por homem-dia é a produção dividida por profissionais mais ajudantes. No quadro por serviço ela é a do período
            inteiro (produção total ÷ homens-dia), e só entram as linhas já medidas.
          </p>
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
            Não foi possível carregar o controle de produtividade. {state.message}
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
          O controle de produtividade ainda não foi ativado no banco: aplique a migração 0046.
        </Callout>
      </>
    );

  const { entries, canEdit } = state.data;
  const days = productionDays(entries);
  const lastDay = days.at(-1);
  const filter = { from: preset === 'tudo' ? (days[0] ?? today) : addDays(today, -(Number(preset) - 1)), to: today };
  const summary = productionSummary(entries, filter);
  const services = productivityBy(entries, filter, 'service');
  const catalog = productionCatalog(entries);

  // Folha do dia: quem lança abre em hoje; quem só consulta, no último dia lançado.
  const day = pickedDay ?? (canEdit ? today : (lastDay ?? today));
  const rows = entriesOfDay(entries, day);
  const previousDay = [...days].reverse().find(d => d < day);
  const nextDay = days.find(d => d > day);
  const idleWorkdays = lastDay ? workdaysBetween(lastDay, today) : 0;
  const dayCrew = rows.reduce((sum, entry) => sum + crewSize(entry), 0);
  const dayPending = rows.filter(entry => entry.quantity === null).length;
  const usualUnit = (service: string) => catalog.services.find(s => headcountKey(s.name) === headcountKey(service))?.unit ?? '';
  const known = (list: { name: string }[], text: string) =>
    !text.trim() || list.some(item => headcountKey(item.name) === headcountKey(text));

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
        ...(form.id ? { id: form.id } : {}),
        workId,
        workedOn: day,
        service: form.service,
        contractor: form.contractor,
        professionals: Number(form.professionals || 0),
        helpers: Number(form.helpers || 0),
        quantity: parseQuantity(form.quantity),
        unit: form.unit,
        note: form.note,
      }),
    );
    if (ok) {
      setForm(EMPTY);
      serviceInput.current?.focus();
    }
  };
  const edit = (entry: ProductionEntry) => {
    setForm({
      id: entry.id,
      service: entry.service,
      contractor: entry.contractor,
      professionals: String(entry.professionals),
      helpers: String(entry.helpers),
      quantity: quantityText(entry.quantity),
      unit: entry.unit,
      note: entry.note,
    });
    serviceInput.current?.focus();
  };
  /** Produção digitada direto na linha: o gesto de todo dia depois de repetir as equipes. */
  const saveQuantity = (entry: ProductionEntry, text: string) => {
    if (text.trim() === quantityText(entry.quantity)) return;
    const unit = entry.unit || usualUnit(entry.service);
    if (text.trim() && !unit) {
      // Sem unidade conhecida para o serviço: abre a linha no formulário para escolher.
      edit(entry);
      setForm(current => ({ ...current, quantity: text }));
      toast({ title: 'Escolha a unidade da produção', tone: 'danger' });
      return;
    }
    void run(() =>
      execute({
        type: 'save_entry',
        id: entry.id,
        workId,
        workedOn: entry.workedOn,
        service: entry.service,
        contractor: entry.contractor,
        professionals: entry.professionals,
        helpers: entry.helpers,
        quantity: parseQuantity(text),
        unit,
        note: entry.note,
      }),
    );
  };
  const remove = async (entry: ProductionEntry) => {
    const ok = await confirm({
      title: `Excluir ${entry.service} da ${entry.contractor}?`,
      description: `Sai do controle de ${formatDay(entry.workedOn)}.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    if (form.id === entry.id) setForm(EMPTY);
    void run(() => execute({ type: 'delete_entry', id: entry.id }), 'Lançamento excluído');
  };

  return (
    <>
      {header}

      <div data-tour="production-cards" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Último dia lançado"
          value={lastDay ? formatDay(lastDay, false) : '—'}
          hint={
            lastDay
              ? `${weekdayName(lastDay)}${idleWorkdays > 1 ? ` · ${idleWorkdays} dias úteis sem lançar` : ' · em dia'}`
              : 'Nenhum dia lançado ainda'
          }
          tone={idleWorkdays > 1 ? 'warning' : 'default'}
        />
        <StatCard
          label="Lançamentos no período"
          value={number(summary.entries)}
          hint={`${summary.days} dias · ${number(summary.manDays)} homens-dia`}
        />
        <StatCard
          label="Sem produção medida"
          value={number(summary.pending)}
          hint={summary.entries ? `${number((summary.pending / summary.entries) * 100)}% dos lançamentos do período` : '—'}
          tone={summary.pending > 0 ? 'warning' : 'default'}
        />
        <StatCard label="Serviços no período" value={number(summary.services)} hint={`${summary.contractors} empreiteiros`} />
      </div>

      {/* Folha do dia */}
      <section data-tour="production-day" className="panel mb-6 p-5" aria-labelledby="pr-day">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="pr-day" className="text-base font-bold text-slate-900">
              Folha do dia
            </h2>
            <p className="text-sm text-slate-500">
              {formatDay(day)} ({weekdayName(day)}
              {isWeekend(day) ? ', fim de semana' : ''}
              {day === today ? ', hoje' : ''}) · {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'} · {dayCrew} pessoas
              {dayPending > 0 ? ` · ${dayPending} sem produção` : ''}
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
              onChange={event => {
                if (!event.target.value) return;
                setPickedDay(event.target.value);
                setForm(EMPTY);
              }}
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
          <form
            data-tour="production-form"
            onSubmit={submit}
            className={`mb-4 grid grid-cols-2 gap-3 rounded-xl p-3 sm:grid-cols-12 ${form.id ? 'bg-primary-soft ring-1 ring-primary-ring' : 'bg-slate-50'}`}
          >
            <label className="col-span-2 sm:col-span-4">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Serviço</span>
              <input
                ref={serviceInput}
                className="field"
                list="pr-services"
                autoComplete="off"
                required
                placeholder="Reboco, Alvenaria, Aço…"
                value={form.service}
                onChange={event => {
                  const service = event.target.value;
                  setForm(current => ({ ...current, service, unit: current.unit || usualUnit(service) }));
                }}
              />
              {!known(catalog.services, form.service) && <span className="mt-1 block text-xs text-warning">Serviço novo nesta obra.</span>}
            </label>
            <label className="col-span-2 sm:col-span-3">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Empreiteiro</span>
              <input
                className="field"
                list="pr-contractors"
                autoComplete="off"
                required
                value={form.contractor}
                onChange={event => setForm(current => ({ ...current, contractor: event.target.value }))}
              />
              {!known(catalog.contractors, form.contractor) && (
                <span className="mt-1 block text-xs text-warning">Empreiteiro novo nesta obra.</span>
              )}
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500" title="Profissionais">
                Prof.
              </span>
              <input
                className="field tabular-nums"
                inputMode="numeric"
                value={form.professionals}
                onChange={event => setForm(current => ({ ...current, professionals: event.target.value.replace(/\D/g, '') }))}
              />
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500" title="Ajudantes">
                Ajud.
              </span>
              <input
                className="field tabular-nums"
                inputMode="numeric"
                value={form.helpers}
                onChange={event => setForm(current => ({ ...current, helpers: event.target.value.replace(/\D/g, '') }))}
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Produção</span>
              <input
                className="field tabular-nums"
                inputMode="decimal"
                placeholder="em branco = a medir"
                value={form.quantity}
                onChange={event => setForm(current => ({ ...current, quantity: event.target.value.replace(/[^\d.,]/g, '') }))}
              />
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Unid.</span>
              <select
                className="field px-2"
                value={form.unit}
                onChange={event => setForm(current => ({ ...current, unit: event.target.value }))}
              >
                <option value="">—</option>
                {PRODUCTION_UNITS.map(unit => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 sm:col-span-9">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Observação (trecho, pavimento, motivo de parada)</span>
              <input
                className="field"
                maxLength={300}
                value={form.note}
                onChange={event => setForm(current => ({ ...current, note: event.target.value }))}
              />
            </label>
            <div className="col-span-2 flex items-end gap-2 sm:col-span-3">
              <button type="submit" className="button flex-1 justify-center" disabled={busy}>
                {form.id ? <Save size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
                {form.id ? 'Salvar alteração' : 'Lançar'}
              </button>
              {form.id && (
                <button type="button" className="button-ghost" aria-label="Cancelar a edição" onClick={() => setForm(EMPTY)}>
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>
            <datalist id="pr-services">
              {catalog.services.map(item => (
                <option key={item.name} value={item.name} />
              ))}
            </datalist>
            <datalist id="pr-contractors">
              {catalog.contractors.map(item => (
                <option key={item.name} value={item.name} />
              ))}
            </datalist>
          </form>
        )}

        {rows.length === 0 ? (
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
                    'Equipes repetidas: agora é só medir a produção',
                  )
                }
              >
                <CopyPlus size={15} aria-hidden />
                Repetir o último dia ({formatDay(previousDay)})
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className="text-left">Serviço</th>
                  <th className="text-left">Empreiteiro</th>
                  <th className="text-right">Prof.</th>
                  <th className="text-right">Ajud.</th>
                  <th className="text-right">Produção</th>
                  <th className="text-right" title="Produção ÷ (profissionais + ajudantes)">
                    Por homem-dia
                  </th>
                  <th className="text-left">Observação</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map(entry => {
                  const rate = perManDay(entry);
                  return (
                    <tr key={entry.id} className={form.id === entry.id ? 'bg-primary-soft' : undefined}>
                      <td className="font-medium text-slate-800">{entry.service}</td>
                      <td>{entry.contractor}</td>
                      <td className="text-right tabular-nums">{entry.professionals}</td>
                      <td className="text-right tabular-nums">{entry.helpers}</td>
                      <td className="whitespace-nowrap text-right">
                        {canEdit ? (
                          <input
                            key={`${entry.id}:${entry.quantity}`}
                            className={`field inline-block w-24 px-2 py-1 text-right tabular-nums ${entry.quantity === null ? 'border-amber-300 bg-amber-50' : ''}`}
                            inputMode="decimal"
                            placeholder="a medir"
                            aria-label={`Produção de ${entry.service} da ${entry.contractor}`}
                            defaultValue={quantityText(entry.quantity)}
                            onBlur={event => saveQuantity(entry, event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
                          />
                        ) : entry.quantity === null ? (
                          <span className="text-xs text-warning">a medir</span>
                        ) : (
                          <span className="tabular-nums">{number(entry.quantity, 2)}</span>
                        )}
                        <span className="inline-block w-7 pl-1.5 text-left text-xs text-slate-400">{entry.unit}</span>
                      </td>
                      <td className="text-right tabular-nums">{rate === null ? '—' : number(rate, 2)}</td>
                      <td className="max-w-[16rem] truncate text-xs text-slate-500" title={entry.note}>
                        {entry.note}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Editar ${entry.service} da ${entry.contractor}`}
                            onClick={() => edit(entry)}
                          >
                            <PencilLine size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-danger"
                            aria-label={`Excluir ${entry.service} da ${entry.contractor}`}
                            disabled={busy}
                            onClick={() => remove(entry)}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Produtividade por serviço */}
      <section data-tour="production-services" className="panel p-5" aria-labelledby="pr-services-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pr-services-title" className="text-base font-bold text-slate-900">
              Produtividade por serviço
            </h2>
            <p className="text-sm text-slate-500">
              Produção total ÷ homens-dia, só com as linhas já medidas. Clique num serviço para ver os empreiteiros.
            </p>
          </div>
          <div role="group" aria-label="Período" className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {PRESETS.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={preset === option.id}
                onClick={() => setPreset(option.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${preset === option.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {services.length === 0 ? (
          <Empty>
            Nenhuma produção medida no período.{summary.pending > 0 ? ` Há ${summary.pending} lançamentos esperando a medição.` : ''}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className="text-left">Serviço</th>
                  <th className="text-right">Produção</th>
                  <th className="text-right" title="Profissionais + ajudantes, somados nos dias medidos">
                    Homens-dia
                  </th>
                  <th className="text-right">Por homem-dia</th>
                  <th className="text-right" title="A pior e a melhor linha do período">
                    Faixa
                  </th>
                  <th className="text-right" title="Linhas medidas; entre parênteses, as que ainda esperam medição">
                    Medições
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map(row => {
                  const key = `${row.name}|${row.unit}`;
                  const expanded = open === key;
                  return (
                    <Fragment key={key}>
                      <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(expanded ? undefined : key)}>
                        <td className="font-medium text-slate-800">
                          <button type="button" className="inline-flex items-center gap-1.5 text-left" aria-expanded={expanded}>
                            <ChevronDown
                              size={14}
                              aria-hidden
                              className={`shrink-0 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
                            />
                            {row.name}
                          </button>
                        </td>
                        <td className="text-right tabular-nums">
                          {number(row.quantity, 2)} {row.unit}
                        </td>
                        <td className="text-right tabular-nums">{number(row.manDays)}</td>
                        <td className="text-right font-bold tabular-nums text-slate-900">
                          {number(row.perManDay, 2)} <span className="text-xs font-normal text-slate-400">{row.unit}</span>
                        </td>
                        <td className="text-right tabular-nums text-slate-500">
                          {number(row.worst, 2)} – {number(row.best, 2)}
                        </td>
                        <td className="text-right tabular-nums">
                          {row.measured}
                          {row.pending > 0 && <span className="text-warning"> (+{row.pending})</span>}
                        </td>
                      </tr>
                      {expanded && (
                        <ContractorRows rows={productivityBy(entries, filter, 'contractor', row.name).filter(c => c.unit === row.unit)} />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
