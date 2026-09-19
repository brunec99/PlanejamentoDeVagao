'use client';
import { useState, type FocusEvent } from 'react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES, type Team, type WeeklyCommitment } from '@/domain/entities';
import { ppc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const NAMES = { 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB' } as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);
/** Campos que a linha em branco acumula antes de existir: só a atividade é obrigatória. */
type Draft = { supplier: string; startDate: string; endDate: string; name: string; teamId: string };
const EMPTY_DRAFT: Draft = { supplier: '', startDate: '', endDate: '', name: '', teamId: '' };

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const readOnly = actor.role === 'viewer';

  const teams = data.teams.filter(t => t.workId === workId).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name, 'pt-BR'));
  const commitments = data.commitments.filter(c => c.workId === workId);
  const currentWeek = startOfWeek(planning.today);
  const weeks = [...new Set([currentWeek, ...commitments.map(c => c.weekStart)])].sort().reverse();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  const firstWeek = startOfWeek(commitments.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), planning.today));
  const weekNumber = (start: string) => Math.floor((Date.parse(start) - Date.parse(firstWeek)) / 604800000) + 1;
  const rows = commitments.filter(c => c.weekStart === week).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt));
  const stats = ppc(rows);

  const run = async (command: Command, key: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try { await context.execute(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  };
  const save = (row: WeeklyCommitment, patch: Partial<Pick<WeeklyCommitment, 'name' | 'supplier' | 'teamId' | 'weekStart' | 'startDate' | 'endDate'>>) => {
    const next = { ...row, ...patch };
    if (next.name === row.name && next.supplier === row.supplier && next.teamId === row.teamId
      && next.weekStart === row.weekStart && next.startDate === row.startDate && next.endDate === row.endDate) return;
    return run({ type: 'update_commitment', commitmentId: row.id, name: next.name, supplier: next.supplier,
      teamId: next.teamId ?? null, weekStart: next.weekStart, startDate: next.startDate, endDate: next.endDate }, row.id);
  };
  /** Trocar a Semana move a linha inteira: o período anda o mesmo número de semanas e conserva o
   * dia da semana. Sem isso o comando recusaria o período por estar fora da semana nova. */
  const moveWeek = (row: WeeklyCommitment, value: string) => {
    if (!value) return;
    const weekStart = startOfWeek(value);
    const shift = Math.round((Date.parse(weekStart) - Date.parse(row.weekStart)) / 604800000) * 7;
    if (!shift) return;
    return save(row, { weekStart, startDate: addDays(row.startDate, shift), endDate: addDays(row.endDate, shift) });
  };
  /** Início depois do término não é período: o término acompanha, senão adiar o começo de uma
   * linha só devolveria erro. */
  const saveStart = (row: WeeklyCommitment, startDate: string) =>
    save(row, { startDate, endDate: row.endDate < startDate ? startDate : row.endDate });

  const weekEnd = addDays(week, 6);
  const columns = WEEKDAYS.map(day => ({ day, date: addDays(week, day - 1) }));

  return <>
    <p className="eyebrow">{selected.work.code}</p>
    <h1 className="page-title">Planejamento e controle da produção</h1>

    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
      <label className="flex items-center gap-2">Semana analisada
        <select className="field max-w-52 py-1.5" value={week} onChange={e => setChosen(e.target.value)}>
          {weeks.map(w => <option key={w} value={w}>{weekNumber(w)} · {dayMonth(w)} a {dayMonth(addDays(w, 5))}</option>)}
        </select>
      </label>
      <span>Semana atual: <span className="tabular-nums text-slate-900">{weekNumber(currentWeek)}</span></span>
      <span>PPC: <span className="tabular-nums text-slate-900">{stats.planned ? `${Math.round(stats.percent)}%` : '—'}</span>
        {stats.pending > 0 && <span className="ml-1 font-normal text-slate-400">({stats.pending} sem status)</span>}</span>
    </div>

    <p className="mt-2 text-xs leading-5 text-slate-500">
      As células de SEG a SÁB se preenchem a partir de Início e Término — é a única automação da tela.<br />
      Trocar a Semana de uma linha desloca Início e Término pelo mesmo número de semanas, e a linha sai da semana exibida.
    </p>

    {error && <div className="mt-3"><Callout tone="danger" role="alert">{error}</Callout></div>}

    <div className="panel mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Planilha da semana ${weekNumber(week)}`} tabIndex={0}>
      <table data-tour="curto-commitments" className="w-full min-w-[1400px] text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <tr>
            <th scope="col" className="w-40 px-2 py-2">Fornecedor</th>
            <th scope="col" className="w-32 px-2 py-2">Semana</th>
            <th scope="col" className="w-32 px-2 py-2">Início</th>
            <th scope="col" className="w-32 px-2 py-2">Término</th>
            <th scope="col" className="px-2 py-2">Atividade</th>
            <th scope="col" className="w-36 px-2 py-2">Equipe</th>
            {columns.map(({ day, date }) => <th scope="col" key={day} className="w-11 px-1 py-2 text-center">{NAMES[day]}<span className="block font-semibold tabular-nums text-slate-400">{dayMonth(date)}</span></th>)}
            <th scope="col" className="w-20 px-2 py-2">Status</th>
            <th scope="col" className="w-44 px-2 py-2">Causas</th>
            <th scope="col" className="w-44 px-2 py-2">Justificativa</th>
            <th scope="col" className="w-8"><span className="sr-only">Excluir</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const saving = busy === row.id;
            return <tr key={row.id} className={`border-t border-slate-100 ${saving ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}`}>
              <td className="px-1 py-1">
                <input className="cell" defaultValue={row.supplier} disabled={readOnly} aria-label={`Fornecedor da linha ${index + 1}`} placeholder="—"
                  onBlur={e => save(row, { supplier: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              </td>
              <td className="px-1 py-1">
                <input className="cell tabular-nums" type="date" defaultValue={row.weekStart} disabled={readOnly}
                  aria-label={`Semana da linha ${index + 1}, qualquer dia da semana`} title={`Semana ${weekNumber(row.weekStart)}`}
                  onBlur={e => moveWeek(row, e.target.value)} />
              </td>
              <td className="px-1 py-1">
                <input className="cell tabular-nums" type="date" defaultValue={row.startDate} disabled={readOnly} min={row.weekStart} max={row.weekEnd}
                  aria-label={`Início da linha ${index + 1}`} onBlur={e => { if (e.target.value) saveStart(row, e.target.value); }} />
              </td>
              <td className="px-1 py-1">
                <input className="cell tabular-nums" type="date" defaultValue={row.endDate} disabled={readOnly} min={row.startDate} max={row.weekEnd}
                  aria-label={`Término da linha ${index + 1}`} onBlur={e => { if (e.target.value) save(row, { endDate: e.target.value }); }} />
              </td>
              <td className="px-1 py-1">
                <input className="cell" defaultValue={row.name} disabled={readOnly} aria-label={`Atividade da linha ${index + 1}`}
                  onBlur={e => save(row, { name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              </td>
              <td className="px-1 py-1">
                <select className="cell" defaultValue={row.teamId ?? ''} disabled={readOnly} aria-label={`Equipe da linha ${index + 1}`}
                  onChange={e => save(row, { teamId: e.target.value || undefined })}>
                  <option value="">Sem equipe</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </td>
              {WEEKDAYS.map(day => {
                const date = addDays(week, day - 1);
                const marked = row.startDate <= date && date <= row.endDate;
                return <td key={day} className={`px-1 py-1 text-center font-bold ${marked ? 'bg-blue-100 text-blue-800' : 'text-slate-200'}`}>{marked ? 'x' : ''}</td>;
              })}
              <td className="px-1 py-1">
                <select className="cell" disabled={readOnly} aria-label={`Status da linha ${index + 1}`}
                  value={row.fulfilled === undefined ? '' : row.fulfilled ? 'sim' : 'nao'}
                  onChange={e => { if (e.target.value) run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: e.target.value === 'sim', cause: e.target.value === 'nao' ? row.cause ?? NON_FULFILLMENT_CAUSES[0] : undefined, justification: row.justification }, row.id); }}>
                  <option value="">—</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </td>
              <td className="px-1 py-1">
                <select className="cell" disabled={readOnly || row.fulfilled !== false} aria-label={`Causa da linha ${index + 1}`} value={row.cause ?? ''}
                  onChange={e => run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: false, cause: e.target.value, justification: row.justification }, row.id)}>
                  {NON_FULFILLMENT_CAUSES.map(cause => <option key={cause} value={cause}>{cause}</option>)}
                </select>
              </td>
              <td className="px-1 py-1">
                <input className="cell" defaultValue={row.justification ?? ''} disabled={readOnly || row.fulfilled === undefined} aria-label={`Justificativa da linha ${index + 1}`}
                  onBlur={e => { if (row.fulfilled !== undefined && e.target.value !== (row.justification ?? '')) run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: row.fulfilled, cause: row.cause, justification: e.target.value }, row.id); }} />
              </td>
              <td className="px-1 py-1">
                {!readOnly && <button type="button" onClick={() => run({ type: 'delete_commitment', commitmentId: row.id }, row.id)}
                  aria-label={`Excluir a linha ${row.name}`} title="Excluir linha"
                  className="rounded px-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600">✕</button>}
              </td>
            </tr>;
          })}
          {!readOnly && <BlankRow workId={workId} week={week} weekEnd={weekEnd} teams={teams} responsibleId={actor.id} busy={busy === 'nova'} onSave={run} />}
        </tbody>
      </table>
      {rows.length === 0 && <div className="border-t border-slate-100 p-4"><Empty>Semana em branco. Escreva a primeira atividade na última linha da planilha.</Empty></div>}
    </div>
  </>;
}

/** Linha em branco no fim: escreveu a atividade, a linha existe. Fornecedor, equipe e datas podem
 * ficar em branco — sem período, a linha nasce no primeiro dia da semana e se ajusta na planilha. */
function BlankRow({ workId, week, weekEnd, teams, responsibleId, busy, onSave }: { workId: string; week: string; weekEnd: string; teams: Team[]; responsibleId: string; busy: boolean; onSave: (command: Command, key: string) => Promise<void> }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const change = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const create = async (next: Draft) => {
    if (!next.name.trim() || busy) return;
    setDraft(EMPTY_DRAFT);
    await onSave({ type: 'create_commitment', workId, name: next.name.trim(), weekStart: week, responsibleId,
      supplier: next.supplier.trim(), teamId: next.teamId || null,
      startDate: next.startDate || undefined, endDate: next.endDate || undefined }, 'nova');
  };
  /** Só cria quando o foco deixa a linha em branco: andar de célula em célula é continuar
   * preenchendo a mesma linha, não gravá-la a cada campo. */
  const leave = (event: FocusEvent<HTMLElement>) => {
    const row = event.currentTarget.closest('tr');
    if (!row?.contains(event.relatedTarget)) create(draft);
  };
  return <tr className="border-t border-slate-100 bg-blue-50/30">
    <td className="px-1 py-1">
      <input className="cell" value={draft.supplier} disabled={busy} aria-label="Fornecedor da nova linha" placeholder="Fornecedor"
        onChange={e => change({ supplier: e.target.value })} onBlur={leave} />
    </td>
    <td className="px-2 py-1 tabular-nums text-slate-400">{dayMonth(week)}</td>
    <td className="px-1 py-1">
      <input className="cell tabular-nums" type="date" value={draft.startDate} disabled={busy} min={week} max={weekEnd}
        aria-label="Início da nova linha" onChange={e => change({ startDate: e.target.value })} onBlur={leave} />
    </td>
    <td className="px-1 py-1">
      <input className="cell tabular-nums" type="date" value={draft.endDate} disabled={busy} min={draft.startDate || week} max={weekEnd}
        aria-label="Término da nova linha" onChange={e => change({ endDate: e.target.value })} onBlur={leave} />
    </td>
    <td className="px-1 py-1">
      <input className="cell" value={draft.name} disabled={busy} aria-label="Atividade da nova linha"
        placeholder={busy ? 'Criando…' : 'Escreva a atividade e tecle Enter'}
        onChange={e => change({ name: e.target.value })} onBlur={leave}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(draft); } }} />
    </td>
    <td className="px-1 py-1">
      <select className="cell" value={draft.teamId} disabled={busy} aria-label="Equipe da nova linha"
        onChange={e => change({ teamId: e.target.value })} onBlur={leave}>
        <option value="">Sem equipe</option>
        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </td>
    <td colSpan={10} className="px-2 py-1 text-slate-400">o calendário sai do período depois de criar a linha</td>
  </tr>;
}
