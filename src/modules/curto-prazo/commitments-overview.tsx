'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES, type WeeklyCommitment } from '@/domain/entities';
import { ppc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { formatDate, workPath } from '@/shared/format';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const NAMES = { 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB' } as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);
/** As datas saem dos dias marcados, como na planilha: marcou segunda e terça, o período é de
 * segunda a terça. É a única automação da tela. */
const period = (weekStart: string, weekdays: number[]) => {
  const sorted = [...weekdays].sort((a, b) => a - b);
  return { startDate: addDays(weekStart, sorted[0] - 1), endDate: addDays(weekStart, sorted[sorted.length - 1] - 1) };
};

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
  const teamOf = (id: string) => teams.find(t => t.id === id);
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
  const save = (row: WeeklyCommitment, patch: Partial<Pick<WeeklyCommitment, 'name' | 'teamId' | 'weekdays'>>) => {
    const next = { ...row, ...patch };
    if (!next.name.trim() || !next.weekdays.length) return;
    if (next.name === row.name && next.teamId === row.teamId && next.weekdays.join() === row.weekdays.join()) return;
    return run({ type: 'update_commitment', commitmentId: row.id, name: next.name, teamId: next.teamId, weekdays: next.weekdays, ...period(week, next.weekdays) }, row.id);
  };
  const toggle = (row: WeeklyCommitment, day: number) => {
    const weekdays = row.weekdays.includes(day) ? row.weekdays.filter(d => d !== day) : [...row.weekdays, day].sort((a, b) => a - b);
    if (!weekdays.length) return;
    return save(row, { weekdays });
  };

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

    {error && <div className="mt-3"><Callout tone="danger" role="alert">{error}</Callout></div>}

    {teams.length === 0
      ? <div className="mt-6"><Callout tone="warning">Cadastre empresa e equipe no <Link className="text-link" href={workPath(workId, 'medio-prazo')}>planejamento de médio prazo</Link> para montar a semana.</Callout></div>
      : <div className="panel mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Planilha da semana ${weekNumber(week)}`} tabIndex={0}>
          <table data-tour="curto-commitments" className="w-full min-w-[1280px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="w-36 px-2 py-2">Empresa</th>
                <th scope="col" className="w-16 px-2 py-2">Semana</th>
                <th scope="col" className="w-20 px-2 py-2">Início</th>
                <th scope="col" className="w-20 px-2 py-2">Término</th>
                <th scope="col" className="px-2 py-2">Atividade</th>
                <th scope="col" className="w-36 px-2 py-2">Equipe</th>
                {WEEKDAYS.map(day => <th scope="col" key={day} className="w-12 px-1 py-2 text-center">{NAMES[day]}<span className="block font-semibold tabular-nums text-slate-400">{dayMonth(addDays(week, day - 1))}</span></th>)}
                <th scope="col" className="w-24 px-2 py-2">Status</th>
                <th scope="col" className="w-48 px-2 py-2">Causas</th>
                <th scope="col" className="w-48 px-2 py-2">Justificativa</th>
                <th scope="col" className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const team = teamOf(row.teamId);
                const saving = busy === row.id;
                return <tr key={row.id} className={`border-t border-slate-100 ${saving ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-2 py-1 text-slate-600">{team?.company ?? '—'}</td>
                  <td className="px-2 py-1 tabular-nums text-slate-500">{weekNumber(row.weekStart)}</td>
                  <td className="px-2 py-1 tabular-nums text-slate-500">{dayMonth(row.startDate)}</td>
                  <td className="px-2 py-1 tabular-nums text-slate-500">{dayMonth(row.endDate)}</td>
                  <td className="px-1 py-1">
                    <input className="cell" defaultValue={row.name} disabled={readOnly} aria-label="Atividade"
                      onBlur={e => save(row, { name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                  </td>
                  <td className="px-1 py-1">
                    <select className="cell" defaultValue={row.teamId} disabled={readOnly} aria-label="Equipe"
                      onChange={e => save(row, { teamId: e.target.value })}>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  {WEEKDAYS.map(day => <td key={day} className="px-1 py-1 text-center">
                    <button type="button" disabled={readOnly} onClick={() => toggle(row, day)}
                      aria-label={`${NAMES[day]} em ${row.name}`} aria-pressed={row.weekdays.includes(day)}
                      className={`h-6 w-full rounded font-bold ${row.weekdays.includes(day) ? 'bg-blue-100 text-blue-800' : 'text-slate-200 hover:bg-slate-100'}`}>x</button>
                  </td>)}
                  <td className="px-1 py-1">
                    <select className="cell" disabled={readOnly} aria-label="Status"
                      value={row.fulfilled === undefined ? '' : row.fulfilled ? 'sim' : 'nao'}
                      onChange={e => { if (e.target.value) run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: e.target.value === 'sim', cause: e.target.value === 'nao' ? row.cause ?? NON_FULFILLMENT_CAUSES[0] : undefined, justification: row.justification }, row.id); }}>
                      <option value="">—</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select className="cell" disabled={readOnly || row.fulfilled !== false} aria-label="Causa" value={row.cause ?? ''}
                      onChange={e => run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: false, cause: e.target.value, justification: row.justification }, row.id)}>
                      {NON_FULFILLMENT_CAUSES.map(cause => <option key={cause} value={cause}>{cause}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input className="cell" defaultValue={row.justification ?? ''} disabled={readOnly || row.fulfilled === undefined} aria-label="Justificativa"
                      onBlur={e => { if (row.fulfilled !== undefined && e.target.value !== (row.justification ?? '')) run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: row.fulfilled, cause: row.cause, justification: e.target.value }, row.id); }} />
                  </td>
                  <td className="px-1 py-1">
                    {!readOnly && <button type="button" onClick={() => run({ type: 'delete_commitment', commitmentId: row.id }, row.id)}
                      aria-label={`Excluir a linha ${row.name}`} title="Excluir linha"
                      className="rounded px-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600">✕</button>}
                  </td>
                </tr>;
              })}
              {!readOnly && <BlankRow workId={workId} week={week} teamId={teams[0].id} responsibleId={actor.id} busy={busy === 'nova'} onSave={run} />}
            </tbody>
          </table>
          {rows.length === 0 && <div className="border-t border-slate-100 p-4"><Empty>Semana em branco. Escreva a primeira atividade na última linha e marque os dias.</Empty></div>}
        </div>}
  </>;
}

/** Linha em branco no fim: escreveu a atividade e marcou os dias, a linha existe. */
function BlankRow({ workId, week, teamId, responsibleId, busy, onSave }: { workId: string; week: string; teamId: string; responsibleId: string; busy: boolean; onSave: (command: Command, key: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const create = async (weekdays: number[], activity: string) => {
    if (!activity.trim() || !weekdays.length || busy) return;
    setName(''); setDays([]);
    await onSave({ type: 'create_commitment', workId, name: activity.trim(), weekStart: week, responsibleId, teamId, weekdays, ...period(week, weekdays) }, 'nova');
  };
  return <tr className="border-t border-slate-100 bg-blue-50/30">
    <td className="px-2 py-1 text-slate-300">—</td>
    <td className="px-2 py-1" /><td className="px-2 py-1" /><td className="px-2 py-1" />
    <td className="px-1 py-1">
      <input className="cell" value={name} disabled={busy} aria-label="Nova atividade da semana"
        placeholder={busy ? 'Criando…' : 'Escreva a atividade e marque os dias'}
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(days, name); } }} />
    </td>
    <td className="px-2 py-1 text-slate-300">—</td>
    {WEEKDAYS.map(day => <td key={day} className="px-1 py-1 text-center">
      <button type="button" disabled={busy} aria-label={`${NAMES[day]} na nova linha`} aria-pressed={days.includes(day)}
        onClick={() => { const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b); setDays(next); create(next, name); }}
        className={`h-6 w-full rounded font-bold ${days.includes(day) ? 'bg-blue-100 text-blue-800' : 'text-slate-200 hover:bg-slate-100'}`}>x</button>
    </td>)}
    <td colSpan={4} className="px-2 py-1 text-slate-400">o início e o término saem dos dias marcados</td>
  </tr>;
}
