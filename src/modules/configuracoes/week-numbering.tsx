'use client';
import { useState, type FormEvent } from 'react';
import { CalendarDays } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { normalizeWeekOne, weekNumberFrom, weekOneFromCurrent } from '@/domain/week-numbering';
import { addDays, startOfWeek } from '@/domain/validation';
import { formatDate } from '@/shared/format';
import { useWorkSettings } from './work-settings';

const range = (monday: string) => `${formatDate(monday)} a ${formatDate(addDays(monday, 5))}`;

/** A semana 1 da obra: a origem da numeração das semanas no curto prazo. Pode ser informada pela
 * data ou, como quem vem da planilha costuma saber, pelo número da semana atual. */
export function WeekNumbering({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, weekOneStart, saveWeekOne } = useWorkSettings(workId);
  const [mode, setMode] = useState<'numero' | 'data'>('numero');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (context.state !== 'ready' || state.status === 'loading') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  const readOnly = !actor || actor.role === 'viewer';
  const currentWeek = startOfWeek(context.planning.today);

  let candidate: string | undefined;
  try { candidate = mode === 'numero' ? (number ? weekOneFromCurrent(currentWeek, Number(number)) : undefined) : (date ? normalizeWeekOne(date) : undefined); }
  catch { candidate = undefined; }

  const persist = async (value: string | null, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await saveWeekOne(value); setMessage(success); setNumber(''); setDate(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (candidate) persist(candidate, 'Semana 1 salva. A planilha do curto prazo já usa a nova numeração.'); };

  return <section className="panel p-5" aria-labelledby="semana-1-title">
    <div className="flex items-start gap-3">
      <CalendarDays size={18} className="mt-0.5 shrink-0 text-blue-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id="semana-1-title" className="text-base font-bold text-slate-900">Numeração das semanas</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Define qual é a <strong className="font-semibold text-slate-700">semana 1</strong> desta obra. É dela que sai o número de cada semana no cronograma de curto prazo — use o mesmo da planilha da obra.</p>

        <p className="mt-3 text-sm text-slate-700">
          {weekOneStart
            ? <>Semana 1: <strong>{range(weekOneStart)}</strong>. A semana atual ({range(currentWeek)}) é a <strong className="tabular-nums">{weekNumberFrom(weekOneStart, currentWeek)}</strong>.</>
            : <>Sem semana 1 definida: a numeração começa na primeira semana com linha na planilha.</>}
        </p>

        {state.status === 'error' && <div className="mt-3"><Callout tone="danger">Não foi possível ler a configuração. Atualize a página para tentar de novo.</Callout></div>}
        {state.status === 'ready' && !state.available && <div className="mt-3"><Callout tone="warning">Para salvar a semana 1, aplique a migração <code>0025_work_settings.sql</code> no Supabase. Até lá, a numeração continua automática.</Callout></div>}

        {!readOnly && state.status === 'ready' && state.available && <form className="mt-4 space-y-3" onSubmit={submit}>
          <fieldset className="flex flex-wrap gap-4 text-sm text-slate-700">
            <legend className="sr-only">Como informar a semana 1</legend>
            <label className="flex items-center gap-2"><input type="radio" className="accent-blue-700" checked={mode === 'numero'} onChange={() => setMode('numero')} />Pelo número da semana atual</label>
            <label className="flex items-center gap-2"><input type="radio" className="accent-blue-700" checked={mode === 'data'} onChange={() => setMode('data')} />Pela data da semana 1</label>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            {mode === 'numero'
              ? <label className="text-xs font-semibold text-slate-600">Número da semana de {range(currentWeek)}
                  <input className="field mt-1 block w-40" type="number" min={1} step={1} inputMode="numeric" placeholder="ex.: 113" value={number} onChange={e => setNumber(e.target.value)} />
                </label>
              : <label className="text-xs font-semibold text-slate-600">Qualquer dia da semana 1
                  <input className="field mt-1 block w-48" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </label>}
            <button className="button" type="submit" disabled={busy || !candidate}>{busy ? 'Salvando…' : 'Salvar semana 1'}</button>
            {weekOneStart && <button className="button-ghost" type="button" disabled={busy} onClick={() => persist(null, 'Semana 1 removida. A numeração voltou a ser automática.')}>Voltar à numeração automática</button>}
          </div>
          {candidate && <p className="text-xs text-slate-500" role="status">Semana 1 será {range(candidate)}; a semana atual passa a ser a <strong className="tabular-nums text-slate-700">{weekNumberFrom(candidate, currentWeek)}</strong>.</p>}
        </form>}

        {error && <div className="mt-3"><Callout tone="danger" role="alert">{error}</Callout></div>}
        {message && <div className="mt-3"><Callout tone="success" role="status">{message}</Callout></div>}
      </div>
    </div>
  </section>;
}
