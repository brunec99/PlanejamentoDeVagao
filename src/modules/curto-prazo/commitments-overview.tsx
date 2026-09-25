'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES, type Activity, type Wagon, type WeeklyCommitment } from '@/domain/entities';
import { causePareto, leadTimeDeadline, ppc, ppcSeries, type WeekPpc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { formatDate, wagonLabel, workPath } from '@/shared/format';
import { ColumnFilter, PillCombo, PillSelect } from '@/modules/curto-prazo/sheet-controls';
import { applySheetView, companyOptions, compareText, distinctValues, textKey, weekOptions, type Accessor, type SheetFilters, type SheetSort } from '@/modules/curto-prazo/sheet-view';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const NAMES = { 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB' } as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);
// Os mesmos tons da Linha de Balanço (longo-prazo/line-of-balance): azul para a série, âmbar para
// "onde você está" — o papel que a linha de hoje já tem nos outros gráficos — e rosa para o que
// exige atenção. Nenhuma paleta nova: o que muda de tela para tela é o significado, não o tom.
const BAR = '#1d4ed8', HERE = '#b45309', HEAVY = '#be123c';
/** Campos que a linha em branco acumula antes de existir: só a atividade é obrigatória. */
type Draft = { supplier: string; startDate: string; endDate: string; name: string; teamName: string };
const EMPTY_DRAFT: Draft = { supplier: '', startDate: '', endDate: '', name: '', teamName: '' };
/** Capacidade de uma equipe criada na própria planilha. É um ponto de partida, não uma medição:
 * o planejador ajusta nas configurações da obra, e a análise de carga do médio prazo usa o valor. */
const NEW_TEAM_CAPACITY = 3;

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pendencyFor, setPendencyFor] = useState('');
  const [filters, setFilters] = useState<SheetFilters>({});
  const [sort, setSort] = useState<SheetSort>();
  const [awaitingCause, setAwaitingCause] = useState<string[]>([]);
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
  const firstWeek = startOfWeek(commitments.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), planning.today));
  // Da primeira semana da obra até quatro à frente, mais qualquer semana já usada fora desse intervalo.
  const weeks = [...new Set([...weekOptions(firstWeek, currentWeek), ...commitments.map(c => c.weekStart)])].sort();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  const weekNumber = (start: string) => Math.floor((Date.parse(start) - Date.parse(firstWeek)) / 604800000) + 1;
  const weekRows = commitments.filter(c => c.weekStart === week);
  const stats = ppc(weekRows);
  const series = ppcSeries(commitments);
  const wagonIds = new Set(selected.wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
  const pendencyRow = weekRows.find(r => r.id === pendencyFor);

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

  /** Arrastar o não cumprido cria uma linha nova na semana seguinte, sem apontamento. A linha
   * original não se move nem perde o Não: ela é o registro do que aconteceu, e é dela que saem o
   * PPC daquela semana e a causa no Pareto. Reaproveitar a linha apagaria a série. */
  const carry = (row: WeeklyCommitment) => run({
    type: 'create_commitment', workId, name: row.name, weekStart: addDays(row.weekStart, 7), responsibleId: actor.id,
    supplier: row.supplier, teamId: row.teamId ?? null,
    startDate: addDays(row.startDate, 7), endDate: addDays(row.endDate, 7),
  }, row.id);
  const alreadyCarried = (row: WeeklyCommitment) =>
    commitments.some(c => c.weekStart === addDays(row.weekStart, 7) && c.name === row.name && c.supplier === row.supplier);

  const weekEnd = addDays(week, 6);
  const columns = WEEKDAYS.map(day => ({ day, date: addDays(week, day - 1) }));
  const marked = (row: WeeklyCommitment, day: number) => { const date = addDays(row.weekStart, day - 1); return row.startDate <= date && date <= row.endDate; };
  const teamOf = (row: WeeklyCommitment) => teams.find(t => t.id === row.teamId);
  /** A empresa da linha é o fornecedor escrito nela; sem ele, a empresa da equipe alocada. */
  const companyOf = (row: WeeklyCommitment) => row.supplier.trim() || teamOf(row)?.company || '';
  const companies = companyOptions(teams.map(t => t.company), commitments.map(c => c.supplier));
  const teamsOfCompany = (company: string) => company.trim() ? teams.filter(t => textKey(t.company) === textKey(company)) : [];
  // "Não" escolhido e ainda sem causa não é gravado: o comando exige a causa, e inventar uma
  // poluiria o Pareto. A linha fica marcada até a causa ser escolhida.
  const statusOf = (row: WeeklyCommitment) => row.fulfilled === undefined ? (awaitingCause.includes(row.id) ? 'Não' : '') : row.fulfilled ? 'Sim' : 'Não';
  const weekLabel = (start: string) => `${weekNumber(start)} · ${dayMonth(start)}`;

  const accessors: Record<string, Accessor<WeeklyCommitment>> = {
    empresa: companyOf, semana: r => String(weekNumber(r.weekStart)), inicio: r => dayMonth(r.startDate), termino: r => dayMonth(r.endDate),
    atividade: r => r.name, equipe: r => teamOf(r)?.name ?? '',
    ...Object.fromEntries(WEEKDAYS.map(day => [`d${day}`, (r: WeeklyCommitment) => marked(r, day) ? 'x' : ''])),
    status: statusOf, causas: r => r.cause ?? '', justificativa: r => r.justification ?? '',
  };
  const sortKeys: Record<string, Accessor<WeeklyCommitment>> = { inicio: r => r.startDate, termino: r => r.endDate };
  // Ordem da planilha de origem: as linhas de cada empresa juntas, e dentro dela pela data de início.
  const defaultOrder = (a: WeeklyCommitment, b: WeeklyCommitment) => {
    const [x, y] = [companyOf(a), companyOf(b)];
    if ((x === '') !== (y === '')) return x === '' ? 1 : -1;
    return compareText(x, y) || a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt);
  };
  const rows = applySheetView([...weekRows], accessors, filters, sort, defaultOrder, sortKeys);
  const filtered = Object.values(filters).some(Boolean) || !!sort;
  const waiting = weekRows.filter(r => r.fulfilled === undefined && awaitingCause.includes(r.id)).length;

  const header = (column: string, label: string, className: string, align: 'left' | 'center' = 'left') =>
    <th key={column} scope="col" className={className}><ColumnFilter label={label} align={align} values={distinctValues(weekRows, accessors[column])}
      selected={filters[column]} onChange={next => setFilters(current => ({ ...current, [column]: next }))}
      sort={sort?.column === column ? sort.dir : undefined} onSort={dir => setSort(dir ? { column, dir } : undefined)} /></th>;

  /** Equipe existente da empresa é só alocada; nome novo entra no cadastro daquela empresa antes. */
  const assignTeam = async (row: WeeklyCommitment, name: string) => {
    const company = companyOf(row);
    const existing = teamsOfCompany(company).find(t => textKey(t.name) === textKey(name));
    if (existing) return save(row, { teamId: existing.id, supplier: row.supplier || existing.company });
    if (!company) { setError('Escolha a empresa da linha antes de criar uma equipe.'); return; }
    if (busy) return;
    setBusy(row.id); setError('');
    try {
      const teamId = await context.execute({ type: 'create_team', workId, company, name: name.trim(), weeklyCapacity: NEW_TEAM_CAPACITY });
      await context.execute({ type: 'update_commitment', commitmentId: row.id, name: row.name, supplier: row.supplier || company, teamId, weekStart: row.weekStart, startDate: row.startDate, endDate: row.endDate });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  };
  /** Trocar a empresa desfaz a equipe de outra empresa: a equipe pertence a uma empresa só. */
  const assignCompany = (row: WeeklyCommitment, company: string) => {
    const team = teamOf(row);
    return save(row, { supplier: company, teamId: team && textKey(team.company) !== textKey(company) ? undefined : row.teamId });
  };
  const setStatus = (row: WeeklyCommitment, value: string) => {
    if (value === 'Sim') {
      setAwaitingCause(ids => ids.filter(id => id !== row.id));
      return run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: true, justification: row.justification }, row.id);
    }
    if (value === 'Não' && row.fulfilled !== false) setAwaitingCause(ids => ids.includes(row.id) ? ids : [...ids, row.id]);
  };
  const setCause = (row: WeeklyCommitment, cause: string) => {
    if (!cause) return;
    setAwaitingCause(ids => ids.filter(id => id !== row.id));
    return run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: false, cause, justification: row.justification }, row.id);
  };
  const createRow = async (draft: Draft) => {
    if (busy) return;
    setBusy('nova'); setError('');
    try {
      const company = draft.supplier.trim();
      let teamId: string | undefined;
      if (draft.teamName.trim() && company) {
        teamId = teamsOfCompany(company).find(t => textKey(t.name) === textKey(draft.teamName))?.id
          ?? await context.execute({ type: 'create_team', workId, company, name: draft.teamName.trim(), weeklyCapacity: NEW_TEAM_CAPACITY });
      }
      await context.execute({ type: 'create_commitment', workId, name: draft.name.trim(), weekStart: week, responsibleId: actor.id,
        supplier: company, teamId: teamId ?? null, startDate: draft.startDate || undefined, endDate: draft.endDate || undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  };

  return <>
    <p className="eyebrow">Aba 4 · {selected.work.code} · {selected.work.name}</p>
    <h1 className="page-title">Cronograma de curto prazo</h1>
    <p className="mt-1 text-sm text-slate-500">Planejamento e controle da produção: a planilha da semana, com empresa, equipe, cumprimento (Sim/Não) e causa do não cumprimento.</p>

    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
      <label className="flex items-center gap-2">Semana analisada
        <select className="field max-w-60 py-1.5" value={week} onChange={e => { setChosen(e.target.value); setPendencyFor(''); }}>
          {[...weeks].reverse().map(w => <option key={w} value={w}>{weekNumber(w)} · {dayMonth(w)} a {dayMonth(addDays(w, 5))}{w === currentWeek ? ' (atual)' : ''}</option>)}
        </select>
      </label>
      <span>Semana atual: <span className="tabular-nums text-slate-900">{weekNumber(currentWeek)}</span></span>
      <span>PPC: <span className="tabular-nums text-slate-900">{stats.planned ? `${Math.round(stats.percent)}%` : '—'}</span>
        {stats.pending > 0 && <span className="ml-1 font-normal text-slate-400">({stats.pending} sem status)</span>}</span>
    </div>

    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
      <p className="text-slate-600">Empresa e Equipe: escolha na lista ou digite um nome novo. Equipe nova entra no cadastro da empresa da linha, com capacidade de {NEW_TEAM_CAPACITY} atividades por semana, ajustável nas configurações. Os dias de SEG a SÁB se marcam a partir de Início e Término.</p>
      <Link className="text-link shrink-0" href={workPath(workId, 'configuracoes')}>{readOnly ? 'Consultar recursos' : 'Gerenciar empreiteiros e equipes'}</Link>
    </div>

    {error && <div className="mt-3"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {waiting > 0 && <div className="mt-3"><Callout tone="warning" role="status">{waiting === 1 ? '1 linha marcada como Não aguarda' : `${waiting} linhas marcadas como Não aguardam`} a causa. O Não só é gravado depois que a causa é escolhida.</Callout></div>}
    {filtered && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span>Mostrando {rows.length} de {weekRows.length} linhas.</span>
      <button type="button" className="text-link" onClick={() => { setFilters({}); setSort(undefined); }}>Limpar filtros e classificação</button>
    </div>}

    <div className="panel mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Planilha da semana ${weekNumber(week)}`} tabIndex={0}>
      <table data-tour="curto-commitments" className="w-full min-w-[1760px] border-collapse text-left text-xs">
        <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <tr className="text-[10px] font-semibold normal-case tracking-normal text-slate-400">
            <th colSpan={6} className="px-2 pt-1.5" />
            {columns.map(({ day, date }) => <th key={day} scope="col" className="border-l border-slate-200 px-1 pt-1.5 text-center tabular-nums">{dayMonth(date)}</th>)}
            <th colSpan={5} />
          </tr>
          <tr className="border-b border-slate-200">
            {header('empresa', 'Empresa', 'w-44 px-2 py-1.5')}
            {header('semana', 'Semana', 'w-28 px-2 py-1.5')}
            {header('inicio', 'Início', 'w-32 px-2 py-1.5')}
            {header('termino', 'Término', 'w-32 px-2 py-1.5')}
            {header('atividade', 'Atividade', 'min-w-72 px-2 py-1.5')}
            {header('equipe', 'Equipe', 'w-40 px-2 py-1.5')}
            {columns.map(({ day }) => header(`d${day}`, NAMES[day], 'w-14 border-l border-slate-200 px-1 py-1.5', 'center'))}
            {header('status', 'Status', 'w-24 px-2 py-1.5')}
            {header('causas', 'Causas', 'min-w-[14rem] px-2 py-1.5')}
            {header('justificativa', 'Justificativas', 'w-56 px-2 py-1.5')}
            <th scope="col" className="min-w-[13rem] px-2 py-1.5">Do não cumprido</th>
            <th scope="col" className="w-8"><span className="sr-only">Excluir</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const saving = busy === row.id;
            const status = statusOf(row);
            const missingCause = status === 'Não' && !row.cause;
            return <tr key={row.id} className={`border-t border-slate-100 ${saving ? 'bg-amber-50/60' : missingCause ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}`}>
              <td className="px-1 py-1">
                <PillCombo value={companyOf(row)} options={companies} disabled={readOnly || !!busy} ariaLabel={`Empresa da linha ${index + 1}`} placeholder="Empresa"
                  onCommit={value => assignCompany(row, value)} />
              </td>
              <td className="px-1 py-1">
                <PillSelect value={row.weekStart} disabled={readOnly || !!busy} ariaLabel={`Semana da linha ${index + 1}`} title={`${dayMonth(row.weekStart)} a ${dayMonth(addDays(row.weekStart, 5))}`}
                  options={weeks.map(w => ({ value: w, label: weekLabel(w) }))} onChange={value => moveWeek(row, value)} />
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
                <PillCombo value={teamOf(row)?.name ?? ''} options={teamsOfCompany(companyOf(row)).map(t => t.name)} disabled={readOnly || !!busy}
                  allowCreate={!!companyOf(row)} emptyHint={companyOf(row) ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
                  createLabel={text => `Criar equipe “${text}” em ${companyOf(row)}`} ariaLabel={`Equipe da linha ${index + 1}`} placeholder="Equipe"
                  onCommit={value => assignTeam(row, value)} />
              </td>
              {WEEKDAYS.map(day => <td key={day} className={`border-l border-slate-100 px-1 py-1 text-center font-bold ${marked(row, day) ? 'bg-blue-100 text-blue-800' : 'text-slate-200'}`}>{marked(row, day) ? 'x' : ''}</td>)}
              <td className="px-1 py-1">
                <PillSelect value={status} tone={status === 'Sim' ? 'success' : status === 'Não' ? 'danger' : 'neutral'} disabled={readOnly || !!busy}
                  ariaLabel={`Status da linha ${index + 1}`} options={[{ value: 'Sim', label: 'Sim' }, { value: 'Não', label: 'Não' }]} onChange={value => setStatus(row, value)} />
              </td>
              <td className="px-1 py-1">
                <PillSelect value={row.cause ?? ''} tone={missingCause ? 'required' : 'neutral'} disabled={readOnly || !!busy || status !== 'Não'}
                  ariaLabel={`Causa da linha ${index + 1}`} placeholder={missingCause ? 'Escolha a causa' : ''} title={status !== 'Não' ? 'A causa só é pedida quando o Status é Não.' : undefined}
                  options={NON_FULFILLMENT_CAUSES.map(cause => ({ value: cause, label: cause }))} onChange={value => setCause(row, value)} />
              </td>
              <td className="px-1 py-1">
                <input className="cell" defaultValue={row.justification ?? ''} disabled={readOnly || row.fulfilled === undefined} aria-label={`Justificativa da linha ${index + 1}`}
                  onBlur={e => { if (row.fulfilled !== undefined && e.target.value !== (row.justification ?? '')) run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: row.fulfilled, cause: row.cause, justification: e.target.value }, row.id); }} />
              </td>
              <td className="px-1 py-1">
                {row.fulfilled === false && !readOnly && <div className="flex gap-1 whitespace-nowrap">
                  <button type="button" className="button-ghost justify-start px-2 py-1 text-[11px]" disabled={saving}
                    aria-label={`Levar ${row.name} para a próxima semana`}
                    title={alreadyCarried(row)
                      ? `Já existe uma linha com esta atividade e este fornecedor na semana ${weekNumber(addDays(row.weekStart, 7))}`
                      : `Cria a mesma linha na semana ${weekNumber(addDays(row.weekStart, 7))}, sem apontamento`}
                    onClick={() => carry(row)}>{alreadyCarried(row) ? 'Levar de novo' : 'Levar p/ próxima'}</button>
                  <button type="button" className="button-ghost justify-start px-2 py-1 text-[11px]" aria-haspopup="dialog"
                    aria-label={`Gerar restrição a partir de ${row.name}`} onClick={() => setPendencyFor(row.id)}>Gerar restrição</button>
                </div>}
              </td>
              <td className="px-1 py-1">
                {!readOnly && <button type="button" onClick={() => run({ type: 'delete_commitment', commitmentId: row.id }, row.id)}
                  aria-label={`Excluir a linha ${row.name}`} title="Excluir linha"
                  className="rounded px-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600">✕</button>}
              </td>
            </tr>;
          })}
          {!readOnly && <BlankRow week={week} weekEnd={weekEnd} weekNumber={weekNumber(week)} companies={companies}
            teamNames={company => teamsOfCompany(company).map(t => t.name)} busy={busy === 'nova'} onCreate={createRow} />}
        </tbody>
      </table>
      {weekRows.length === 0 && <div className="border-t border-slate-100 p-4"><Empty>Semana em branco. Escreva a primeira atividade na última linha da planilha.</Empty></div>}
      {weekRows.length > 0 && rows.length === 0 && <div className="border-t border-slate-100 p-4"><Empty>Nenhuma linha com esses filtros.</Empty></div>}
    </div>

    <section className="mt-8" aria-labelledby="fechamento-title">
      <h2 id="fechamento-title" className="text-lg font-bold text-slate-900">Fechamento da semana</h2>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
        O PPC de uma semana sozinha diz pouco, e causa coletada e nunca somada não diz nada. O que o Last Planner lê é a série —
        se o comprometimento está sendo aprendido — e o Pareto das causas, que aponta o que está custando a obra. As duas leituras
        saem da planilha acima e de mais nada: esta tela não depende do plano do mês.
      </p>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <PpcSeries series={series} week={week} label={weekNumber} />
        <CausesPareto all={commitments} weekRows={rows} weekLabel={weekNumber(week)} />
      </div>
    </section>

    {pendencyRow && <PendencyDialog row={pendencyRow} wagons={selected.wagons} activities={activities} workId={workId}
      actorId={actor.id} weekLabel={weekNumber(pendencyRow.weekStart)} execute={context.execute} onClose={() => setPendencyFor('')} />}
  </>;
}

/** A série do PPC em barras, SVG inline e sem biblioteca. O desenho é decorativo de propósito
 * (`aria-hidden`): quem lê por leitor de tela lê a tabela oculta, com os mesmos números — a tela
 * não pode depender do gráfico. Doze semanas cabem sem espremer a barra e já mostram tendência. */
function PpcSeries({ series, week, label }: { series: WeekPpc[]; week: string; label: (weekStart: string) => number }) {
  const shown = series.slice(-12);
  // Semana com linha sem Status não é PPC fechado: ela entra no desenho, mas fora da média.
  const closed = shown.filter(point => point.pending === 0);
  const average = closed.length ? closed.reduce((sum, point) => sum + point.percent, 0) / closed.length : 0;
  const W = 640, H = 172, TOP = 16, BOTTOM = 38, LEFT = 30, PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT) / Math.max(1, shown.length);
  const barWidth = Math.min(46, step * 0.58);
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);

  return <section className="panel p-5" aria-labelledby="ppc-serie-title">
    <h3 id="ppc-serie-title" className="text-sm font-bold text-slate-800">Série do PPC</h3>
    <p className="mt-0.5 text-xs text-slate-500">Cada barra é uma semana da obra, da mais antiga para a mais recente.</p>

    {shown.length === 0
      ? <div className="mt-4"><Empty>Nenhum compromisso registrado ainda: a série começa na primeira linha da planilha.</Empty></div>
      : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <StatCard label="PPC médio das semanas apuradas" tone={closed.length > 0 && average < 70 ? 'warning' : 'default'}
            value={closed.length > 0 ? `${Math.round(average)}%` : '—'} />
          <StatCard label="Semanas apuradas · em aberto" value={`${closed.length} · ${shown.length - closed.length}`} />
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" aria-hidden="true">
          <defs>
            {/* Hachura da semana em aberto: o mesmo azul, riscado — barra listrada é "ainda não fechou". */}
            <pattern id="ppc-aberta" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={7} height={7} fill={BAR} />
              <line x1={0} y1={0} x2={0} y2={7} stroke="#ffffff" strokeWidth={3} />
            </pattern>
          </defs>
          {[0, 50, 100].map(mark => <g key={mark}>
            <line x1={LEFT} y1={y(mark)} x2={W} y2={y(mark)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{mark}</text>
          </g>)}
          {/* A semana exibida na planilha ganha a faixa âmbar, o mesmo papel que o âmbar tem nos
              outros gráficos: "é aqui que você está". Faixa, e não contorno, para não cruzar o
              rótulo da barra cheia. */}
          {shown.map((point, index) => point.weekStart === week
            ? <rect key={`aqui-${point.weekStart}`} x={LEFT + step * index + 1} y={TOP - 10} width={step - 2} height={PLOT + 10} rx={4} fill="#fef3c7" />
            : null)}
          {closed.length > 0 && <>
            <line x1={LEFT} y1={y(average)} x2={W} y2={y(average)} stroke="#64748b" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - 2} y={y(average) - 4} textAnchor="end" fontSize={9} fontWeight={700} fill="#64748b">média {Math.round(average)}%</text>
          </>}
          {shown.map((point, index) => {
            const center = LEFT + step * (index + 0.5);
            const height = Math.max(2, (PLOT * point.percent) / 100);
            const open = point.pending > 0, here = point.weekStart === week;
            return <g key={point.weekStart}>
              <rect x={center - barWidth / 2} y={TOP + PLOT - height} width={barWidth} height={height} rx={2}
                fill={open ? 'url(#ppc-aberta)' : BAR} opacity={open ? 0.75 : 1} />
              <text x={center} y={TOP + PLOT - height - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={here ? HERE : '#475569'}>{Math.round(point.percent)}</text>
              <text x={center} y={H - BOTTOM + 14} textAnchor="middle" fontSize={10} fontWeight={here ? 700 : 600} fill={here ? HERE : '#64748b'}>S{label(point.weekStart)}</text>
              <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={9} fill="#94a3b8">{dayMonth(point.weekStart)}</text>
            </g>;
          })}
          <line x1={LEFT} y1={TOP + PLOT} x2={W} y2={TOP + PLOT} stroke="#cbd5e1" strokeWidth={1} />
        </svg>

        <p className="mt-2 text-xs leading-5 text-slate-500">
          Barra cheia é semana apurada. <strong className="font-semibold text-slate-600">Barra hachurada e clara é semana ainda em aberto</strong> — tem linha sem Status,
          então aquele PPC não fechou e fica fora da média. A faixa âmbar é a semana exibida na planilha, e a linha tracejada é a média das apuradas.
        </p>

        <table className="sr-only">
          <caption>PPC por semana da obra</caption>
          <thead><tr>
            <th scope="col">Semana</th><th scope="col">Período</th><th scope="col">Compromissos</th>
            <th scope="col">Cumpridos</th><th scope="col">Sem status</th><th scope="col">PPC</th><th scope="col">Situação</th>
          </tr></thead>
          <tbody>{shown.map(point => <tr key={point.weekStart}>
            <th scope="row">Semana {label(point.weekStart)}</th>
            <td>{formatDate(point.weekStart)} a {formatDate(addDays(point.weekStart, 5))}</td>
            <td>{point.planned}</td><td>{point.fulfilled}</td><td>{point.pending}</td><td>{Math.round(point.percent)}%</td>
            <td>{point.pending > 0 ? `Em aberto, ${point.pending} sem status` : 'Apurada'}{point.weekStart === week ? ' · semana exibida na planilha' : ''}</td>
          </tr>)}</tbody>
        </table>
      </>}
  </section>;
}

/** O Pareto das causas. O período padrão é a obra inteira: numa semana só, cada causa aparece uma
 * ou duas vezes e a ordem é ruído — o Pareto só diz alguma coisa com massa de falhas atrás. */
function CausesPareto({ all, weekRows, weekLabel }: { all: WeeklyCommitment[]; weekRows: WeeklyCommitment[]; weekLabel: number }) {
  const [scope, setScope] = useState<'obra' | 'semana'>('obra');
  const tally = causePareto(scope === 'semana' ? weekRows : all);
  const failures = tally.reduce((sum, item) => sum + item.total, 0);
  // As poucas vitais: as primeiras causas até fechar 80% das falhas. É a leitura que importa —
  // atacar essas causas é atacar a maior parte do que não foi cumprido.
  const vital = tally.findIndex(item => item.accumulated >= 80) + 1;
  const period = scope === 'semana' ? `na semana ${weekLabel}` : 'na obra';

  return <section className="panel p-5" aria-labelledby="pareto-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="pareto-title" className="text-sm font-bold text-slate-800">Pareto das causas</h3>
        <p className="mt-0.5 text-xs text-slate-500">Só entram as linhas com Status Não e causa apontada.</p>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Período
        <select className="field max-w-40 py-1.5" value={scope} onChange={e => setScope(e.target.value as 'obra' | 'semana')}>
          <option value="obra">A obra inteira</option>
          <option value="semana">Esta semana</option>
        </select>
      </label>
    </div>

    {tally.length === 0
      ? <div className="mt-4"><Empty>{scope === 'semana'
          ? `Nenhuma falha apurada na semana ${weekLabel}. Troque o período para a obra inteira: é onde o Pareto tem sentido.`
          : 'Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa.'}</Empty></div>
      : <>
        <div className="mt-4">
          <Callout tone={vital <= 3 && vital < tally.length ? 'warning' : 'info'} role="status">
            {vital === tally.length
              ? <>As {tally.length} causas apontadas se dividem por {failures} {failures === 1 ? 'falha' : 'falhas'} {period}, sem concentração clara.</>
              : <><strong>{vital} {vital === 1 ? 'causa responde' : 'causas respondem'} por {Math.round(tally[vital - 1].accumulated)}%</strong> das {failures} falhas apuradas {period}
                  {' '}— {tally.slice(0, vital).map(item => item.cause).join(', ')}. É aí que está o ganho.</>}
          </Callout>
        </div>

        <div className="mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Pareto das causas ${period}`} tabIndex={0}>
          <table className="data-table min-w-[420px]">
            <thead><tr>
              <th scope="col">Causa</th><th scope="col">Ocorrências</th><th scope="col">Participação</th><th scope="col">Acumulado</th>
            </tr></thead>
            <tbody>{tally.map((item, index) => {
              const heavy = index < vital && vital < tally.length;
              return <tr key={item.cause}>
                <th scope="row" className="leading-snug">{item.cause}</th>
                <td className="tabular-nums">{item.total}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.round(item.share))}%`, backgroundColor: heavy ? HEAVY : BAR }} />
                    </span>
                    <span className="tabular-nums">{Math.round(item.share)}%</span>
                  </div>
                </td>
                <td className="tabular-nums font-semibold text-slate-700">{Math.round(item.accumulated)}%</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {vital < tally.length && <p className="mt-2 text-xs text-slate-500">As barras em vermelho são as causas que somam os primeiros 80% das falhas.</p>}
      </>}
  </section>;
}

/** A restrição nasce da falha: o Não da planilha vira item do quadro do longo prazo, sem passar
 * pelo plano do mês. O modelo é por vagão — o servidor exige `wagonId` —, e o lead time só existe
 * preso a uma atividade daquele vagão, porque o limite é contado para trás a partir do início
 * previsto dela. Sem lead time, o prazo é digitado. */
function PendencyDialog({ row, wagons, activities, workId, actorId, weekLabel, execute, onClose }: {
  row: WeeklyCommitment; wagons: Wagon[]; activities: Activity[]; workId: string; actorId: string; weekLabel: number;
  execute: (command: Command) => Promise<string>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); closeButton.current?.focus(); }, []);
  const linked = activities.find(a => a.id === row.activityId);
  const [wagonId, setWagonId] = useState(linked?.wagonId ?? wagons[0]?.id ?? '');
  const [activityId, setActivityId] = useState(linked?.id ?? '');
  const [lead, setLead] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState([row.name, row.cause, row.justification].filter(Boolean).join(' — '));
  const [blocksExecution, setBlocksExecution] = useState(true);
  const [blocksTerminality, setBlocksTerminality] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');

  const options = activities.filter(a => a.wagonId === wagonId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const activity = options.find(a => a.id === activityId);
  const leadDays = /^\d+$/.test(lead) ? Number(lead) : undefined;
  const deadline = leadDays !== undefined && activity ? leadTimeDeadline(activity.plannedStart, leadDays) : dueDate;
  const blocked = !wagonId || !description.trim() || (leadDays !== undefined ? !activity : !dueDate);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || blocked) return;
    setBusy(true); setError(''); setSavedId('');
    try {
      setSavedId(await execute({ type: 'create_restriction', wagonId, activityId: activity?.id, description: description.trim(),
        responsibleId: actorId, dueDate: deadline, blocksExecution, blocksTerminality,
        leadTimeDays: activity ? leadDays : undefined }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar a restrição.'); }
    finally { setBusy(false); }
  };

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="pendencia-da-falha"
    className="m-auto max-h-[85vh] w-[min(38rem,92vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55">
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Semana {weekLabel} · não cumprido</p>
          <h3 id="pendencia-da-falha" className="mt-1 text-base font-bold text-slate-900">Gerar restrição</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{row.name}{row.supplier && ` · ${row.supplier}`}<br />{row.cause}</p>
        </div>
        <button ref={closeButton} type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>

      {wagons.length === 0
        ? <div className="mt-5 space-y-3">
            <Callout tone="warning" role="status">A restrição é pendurada em um vagão, e esta obra ainda não tem nenhum. Enquanto a sequência de vagões não existir, não há onde registrar o problema no longo prazo — a causa continua guardada na linha da planilha.</Callout>
            <Link className="text-link text-sm" href={workPath(workId)}>Abrir os vagões da obra</Link>
          </div>
        : <form className="mt-5 space-y-4" onSubmit={submit}>
            <Field label="Vagão">
              <select className="field" value={wagonId} required
                onChange={e => { setWagonId(e.target.value); setActivityId(''); }}>
                {wagons.map(wagon => <option key={wagon.id} value={wagon.id}>{wagonLabel(wagon.number)} · {formatDate(wagon.plannedStart)} a {formatDate(wagon.plannedEnd)}</option>)}
              </select>
            </Field>
            <Field label="Atividade do vagão (opcional; obrigatória para usar lead time)">
              <select className="field" value={activityId} disabled={options.length === 0} onChange={e => setActivityId(e.target.value)}>
                <option value="">{options.length === 0 ? 'O vagão não tem atividade cadastrada' : 'Sem atividade vinculada'}</option>
                {options.map(a => <option key={a.id} value={a.id}>{a.name} · início {formatDate(a.plannedStart)}</option>)}
              </select>
            </Field>
            <Field label="Descrição da restrição">
              <textarea className="field" rows={3} required value={description} onChange={e => setDescription(e.target.value)} />
            </Field>
            <Field label="Lead time (dias para obter)">
              <input className="field" type="number" min={0} step={1} inputMode="numeric" value={lead}
                placeholder="Deixe vazio para digitar o prazo" onChange={e => setLead(e.target.value)} />
            </Field>
            {leadDays !== undefined
              ? activity
                ? <Callout tone="info" role="status">Data limite: <strong>{formatDate(leadTimeDeadline(activity.plannedStart, leadDays))}</strong> — início previsto da atividade ({formatDate(activity.plannedStart)}) menos {leadDays} dias. O servidor recalcula esse limite.</Callout>
                : <Callout tone="warning" role="status">O lead time é contado a partir do início previsto de uma atividade: escolha a atividade do vagão ou apague o lead time e digite o prazo.</Callout>
              : <Field label="Prazo para resolver">
                  <input className="field" type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </Field>}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-blue-700" checked={blocksExecution} onChange={e => setBlocksExecution(e.target.checked)} />Bloqueia execução
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-blue-700" checked={blocksTerminality} onChange={e => setBlocksTerminality(e.target.checked)} />Bloqueia terminalidade
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">A restrição entra com você como responsável e a linha da planilha não muda: ela continua com o Não e a causa, que são o registro do que aconteceu.</p>
            <button className="button" type="submit" disabled={busy || blocked}>{busy ? 'Criando…' : savedId ? 'Criar outra restrição' : 'Criar restrição'}</button>
            {error && <Callout tone="danger" role="alert">{error}</Callout>}
            {savedId && <Callout tone="success" role="status">Restrição criada. Acompanhe no <Link className="text-link" href={workPath(workId, 'longo-prazo')}>quadro de restrições</Link>.</Callout>}
          </form>}
    </div>
  </dialog>;
}

/** Linha em branco no fim: escreveu a atividade, a linha existe. Empresa, equipe e datas podem
 * ficar em branco — sem período, a linha nasce no primeiro dia da semana e se ajusta na planilha. */
function BlankRow({ week, weekEnd, weekNumber, companies, teamNames, busy, onCreate }: { week: string; weekEnd: string; weekNumber: number; companies: string[]; teamNames: (company: string) => string[]; busy: boolean; onCreate: (draft: Draft) => Promise<void> }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const change = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const create = async (next: Draft) => {
    if (!next.name.trim() || busy) return;
    setDraft(EMPTY_DRAFT);
    await onCreate(next);
  };
  /** Só cria quando o foco deixa a linha em branco: andar de célula em célula — inclusive abrir a
   * lista suspensa de empresa ou equipe — é continuar preenchendo a mesma linha. */
  const leave = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (!event.currentTarget.closest('tr')?.contains(next) && !next?.closest('[data-sheet-popover]')) create(draft);
  };
  return <tr className="border-t border-slate-100 bg-blue-50/30" onBlur={leave}>
    <td className="px-1 py-1">
      <PillCombo value={draft.supplier} options={companies} disabled={busy} ariaLabel="Empresa da nova linha" placeholder="Empresa"
        onCommit={value => change({ supplier: value, teamName: teamNames(value).some(name => textKey(name) === textKey(draft.teamName)) ? draft.teamName : '' })} />
    </td>
    <td className="px-2 py-1 tabular-nums text-slate-400">{weekNumber}</td>
    <td className="px-1 py-1">
      <input className="cell tabular-nums" type="date" value={draft.startDate} disabled={busy} min={week} max={weekEnd}
        aria-label="Início da nova linha" onChange={e => change({ startDate: e.target.value })} />
    </td>
    <td className="px-1 py-1">
      <input className="cell tabular-nums" type="date" value={draft.endDate} disabled={busy} min={draft.startDate || week} max={weekEnd}
        aria-label="Término da nova linha" onChange={e => change({ endDate: e.target.value })} />
    </td>
    <td className="px-1 py-1">
      <input className="cell" value={draft.name} disabled={busy} aria-label="Atividade da nova linha"
        placeholder={busy ? 'Criando…' : 'Escreva a atividade e tecle Enter'}
        onChange={e => change({ name: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(draft); } }} />
    </td>
    <td className="px-1 py-1">
      <PillCombo value={draft.teamName} options={teamNames(draft.supplier)} disabled={busy} allowCreate={!!draft.supplier.trim()}
        emptyHint={draft.supplier.trim() ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
        createLabel={text => `Criar equipe “${text}” em ${draft.supplier}`} ariaLabel="Equipe da nova linha" placeholder="Equipe"
        onCommit={value => change({ teamName: value })} />
    </td>
    <td colSpan={11} className="px-2 py-1 text-slate-400">os dias se marcam a partir do período depois de criar a linha</td>
  </tr>;
}
