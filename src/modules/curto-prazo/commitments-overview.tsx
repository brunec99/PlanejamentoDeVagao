'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES, type Activity, type Wagon, type WeeklyCommitment } from '@/domain/entities';
import { causePareto, leadTimeDeadline, ppc, ppcSeries, type WeekPpc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { CHART } from '@/shared/palette';
import { formatDate, wagonLabel, workPath } from '@/shared/format';
import { ColumnFilter, PillCombo, PillSelect } from '@/modules/curto-prazo/sheet-controls';
import { useWorkSettings } from '@/modules/configuracoes/work-settings';
import { ColumnResizeHandle, useColumnWidths, useWideScreen } from '@/modules/curto-prazo/column-widths';
import { PrintDialog } from '@/modules/curto-prazo/print-dialog';
import type { PrintKind } from '@/modules/curto-prazo/print-sheet';
import { weekNumberFrom } from '@/domain/week-numbering';
import { canEditWeek, isWeekLocked, weekLockLastDay } from '@/domain/week-lock';
import {
  applySheetView,
  companyOptions,
  compareText,
  distinctValues,
  textKey,
  weekOptions,
  type Accessor,
  type SheetFilters,
  type SheetSort,
} from '@/modules/curto-prazo/sheet-view';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const NAMES = { 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB' } as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);
/** Campos que a linha em branco acumula antes de existir: só a atividade é obrigatória. */
type Draft = { supplier: string; startDate: string; endDate: string; name: string; teamName: string };
const EMPTY_DRAFT: Draft = { supplier: '', startDate: '', endDate: '', name: '', teamName: '' };
/** Capacidade de uma equipe criada na própria planilha. É um ponto de partida, não uma medição:
 * o planejador ajusta nas configurações da obra, e a análise de carga do médio prazo usa o valor. */
const NEW_TEAM_CAPACITY = 3;
/** Larguras iniciais (px) das colunas da planilha, na ordem em que aparecem; cada pessoa ajusta
 * arrastando a borda do cabeçalho, e o ajuste fica no navegador dela. */
const COLUMN_DEFAULTS: Record<string, number> = {
  empresa: 176,
  semana: 112,
  inicio: 128,
  termino: 128,
  atividade: 320,
  equipe: 160,
  d1: 68,
  d2: 68,
  d3: 68,
  d4: 68,
  d5: 68,
  d6: 68,
  status: 96,
  causas: 224,
  justificativa: 224,
  seguimento: 208,
  excluir: 36,
};
const COLUMN_ORDER = Object.keys(COLUMN_DEFAULTS);
/** O mínimo legível de cada coluna no "Ajustar à tela": abaixo disso a lista de empresa ou a data cortam. */
const COLUMN_MIN: Record<string, number> = {
  empresa: 110,
  semana: 84,
  inicio: 108,
  termino: 108,
  atividade: 200,
  equipe: 100,
  d1: 40,
  d2: 40,
  d3: 40,
  d4: 40,
  d5: 40,
  d6: 40,
  status: 76,
  causas: 130,
  justificativa: 130,
  seguimento: 120,
  excluir: 32,
};

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  // A restrição vai para o quadro do longo prazo, que ainda está em desenvolvimento.
  const developer = useDeveloper();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pendencyFor, setPendencyFor] = useState('');
  const [filters, setFilters] = useState<SheetFilters>({});
  const [sort, setSort] = useState<SheetSort>();
  const [awaitingCause, setAwaitingCause] = useState<string[]>([]);
  const [printing, setPrinting] = useState<PrintKind>();
  const { weekOneStart } = useWorkSettings(workId);
  const columnWidths = useColumnWidths('obra360.curto-prazo.colunas', COLUMN_DEFAULTS, COLUMN_MIN);
  const wide = useWideScreen();
  const sheetPanel = useRef<HTMLDivElement | null>(null);
  const autoFitted = useRef(false);
  /** Fila das gravações: cada uma espera a anterior terminar. Antes, sair de uma célula enquanto
   * outra linha gravava descartava a edição em silêncio. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** Ordem das linhas da semana como estão na tela. Linha nova entra no fim e linha editada não muda de
   * lugar, como no Sheets (pedido da obra, 09/10/2026): reordenar a cada gravação atrapalhava escrever o
   * planejamento. Volta à ordem por empresa ao trocar de semana, recarregar ou pedir "Organizar". */
  const [pinned, setPinned] = useState<{ week: string; ids: string[] }>({ week: '', ids: [] });
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const viewer = actor.role === 'viewer';

  const teams = data.teams
    .filter(t => t.workId === workId)
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name, 'pt-BR'));
  const commitments = data.commitments.filter(c => c.workId === workId);
  const currentWeek = startOfWeek(planning.today);
  // A semana 1 vem das configurações da obra; sem ela, é a primeira semana com linha na planilha.
  const firstWeek =
    weekOneStart ?? startOfWeek(commitments.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), planning.today));
  // Da primeira semana da obra até quatro à frente, mais qualquer semana já usada fora desse intervalo.
  const weeks = [...new Set([...weekOptions(firstWeek, currentWeek), ...commitments.map(c => c.weekStart)])].sort();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  // Semana encerrada (depois da terça seguinte): só admin altera; o servidor confere o mesmo.
  const locked = isWeekLocked(week, planning.today);
  const readOnly = viewer || (locked && actor.role !== 'admin');
  const weekNumber = (start: string) => weekNumberFrom(firstWeek, start);
  const weekRows = commitments.filter(c => c.weekStart === week);
  const stats = ppc(weekRows);
  const series = ppcSeries(commitments);
  const wagonIds = new Set(selected.wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
  const pendencyRow = weekRows.find(r => r.id === pendencyFor);

  /** O erro de gravação aparece em dois lugares de propósito: no aviso flutuante, que se vê de
   * qualquer ponto de uma planilha longa, e no Callout acima dela, que fica até a próxima ação. */
  const fail = (cause: unknown) => {
    const title = 'Não foi possível salvar.';
    const message = cause instanceof Error ? cause.message : title;
    setError(message);
    toast({ title, description: message === title ? undefined : message, tone: 'danger' });
  };
  /** Põe uma gravação na fila. `busy` é a chave da linha gravando naquele momento (realce âmbar);
   * resolve `true` só quando a tarefa inteira terminou sem erro. */
  const enqueue = (key: string, task: () => Promise<unknown>) => {
    const turn = queue.current.then(async () => {
      setBusy(key);
      setError('');
      try {
        await task();
        return true;
      } catch (cause) {
        fail(cause);
        return false;
      } finally {
        setBusy('');
      }
    });
    queue.current = turn;
    return turn;
  };
  const run = (command: Command, key: string) => enqueue(key, () => context.execute(command));
  const save = (
    row: WeeklyCommitment,
    patch: Partial<Pick<WeeklyCommitment, 'name' | 'supplier' | 'teamId' | 'weekStart' | 'startDate' | 'endDate'>>,
  ) => {
    const next = { ...row, ...patch };
    if (
      next.name === row.name &&
      next.supplier === row.supplier &&
      next.teamId === row.teamId &&
      next.weekStart === row.weekStart &&
      next.startDate === row.startDate &&
      next.endDate === row.endDate
    )
      return;
    return run(
      {
        type: 'update_commitment',
        commitmentId: row.id,
        name: next.name,
        supplier: next.supplier,
        teamId: next.teamId ?? null,
        weekStart: next.weekStart,
        startDate: next.startDate,
        endDate: next.endDate,
      },
      row.id,
    );
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
  const carry = async (row: WeeklyCommitment) => {
    const target = weekNumber(addDays(row.weekStart, 7));
    const done = await run(
      {
        type: 'create_commitment',
        workId,
        name: row.name,
        weekStart: addDays(row.weekStart, 7),
        responsibleId: actor.id,
        supplier: row.supplier,
        teamId: row.teamId ?? null,
        startDate: addDays(row.startDate, 7),
        endDate: addDays(row.endDate, 7),
      },
      row.id,
    );
    if (done)
      toast({
        title: `Linha levada para a semana ${target}.`,
        description: `“${row.name}” entrou na semana ${target} sem apontamento. Esta semana continua com o Não.`,
        tone: 'success',
      });
  };
  const alreadyCarried = (row: WeeklyCommitment) =>
    commitments.some(c => c.weekStart === addDays(row.weekStart, 7) && c.name === row.name && c.supplier === row.supplier);
  /** O ✕ apaga a linha e, com ela, o Sim/Não e a causa: por isso pergunta antes. */
  const removeRow = async (row: WeeklyCommitment) => {
    const ok = await confirm({
      title: `Excluir a linha “${row.name}”?`,
      description: `Isto apaga o apontamento da semana ${weekNumber(row.weekStart)}${row.fulfilled === undefined ? '' : ', com o Status e a causa'}. A série do PPC e o Pareto deixam de contar esta linha.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok && (await run({ type: 'delete_commitment', commitmentId: row.id }, row.id)))
      toast({ title: 'Linha excluída.', tone: 'success' });
  };

  const weekEnd = addDays(week, 6);
  const columns = WEEKDAYS.map(day => ({ day, date: addDays(week, day - 1) }));
  const marked = (row: WeeklyCommitment, day: number) => {
    const date = addDays(row.weekStart, day - 1);
    return row.startDate <= date && date <= row.endDate;
  };
  const teamOf = (row: WeeklyCommitment) => teams.find(t => t.id === row.teamId);
  /** A empresa da linha é o fornecedor escrito nela; sem ele, a empresa da equipe alocada. */
  const companyOf = (row: WeeklyCommitment) => row.supplier.trim() || teamOf(row)?.company || '';
  const companies = companyOptions(
    teams.map(t => t.company),
    commitments.map(c => c.supplier),
  );
  const teamsOfCompany = (company: string) => (company.trim() ? teams.filter(t => textKey(t.company) === textKey(company)) : []);
  // "Não" escolhido e ainda sem causa não é gravado: o comando exige a causa, e inventar uma
  // poluiria o Pareto. A linha fica marcada até a causa ser escolhida, inclusive quando corrige um
  // Sim já gravado — antes a marca só valia para linha sem Status, e o Sim não tinha volta.
  const statusOf = (row: WeeklyCommitment) =>
    awaitingCause.includes(row.id) ? 'Não' : row.fulfilled === undefined ? '' : row.fulfilled ? 'Sim' : 'Não';
  const weekLabel = (start: string) => `${weekNumber(start)} · ${dayMonth(start)}`;

  const accessors: Record<string, Accessor<WeeklyCommitment>> = {
    empresa: companyOf,
    semana: r => String(weekNumber(r.weekStart)),
    inicio: r => dayMonth(r.startDate),
    termino: r => dayMonth(r.endDate),
    atividade: r => r.name,
    equipe: r => teamOf(r)?.name ?? '',
    ...Object.fromEntries(WEEKDAYS.map(day => [`d${day}`, (r: WeeklyCommitment) => (marked(r, day) ? 'x' : '')])),
    status: statusOf,
    causas: r => r.cause ?? '',
    justificativa: r => r.justification ?? '',
  };
  const sortKeys: Record<string, Accessor<WeeklyCommitment>> = { inicio: r => r.startDate, termino: r => r.endDate };
  // Ordem da planilha de origem: as linhas de cada empresa juntas, e dentro dela pela data de início.
  const byCompany = (a: WeeklyCommitment, b: WeeklyCommitment) => {
    const [x, y] = [companyOf(a), companyOf(b)];
    if ((x === '') !== (y === '')) return x === '' ? 1 : -1;
    return compareText(x, y) || a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt);
  };
  // Ordem padrão = ordem de inclusão (09/10/2026, pedido da obra): linha nova entra embaixo e fica
  // embaixo, inclusive depois de recarregar, como numa planilha. O histórico importado tem o mesmo
  // horário de inclusão por lote, e aí o desempate é o da planilha de origem (empresa, início).
  const defaultOrder = (a: WeeklyCommitment, b: WeeklyCommitment) => a.createdAt.localeCompare(b.createdAt) || byCompany(a, b);
  const defaultIds = [...weekRows].sort(defaultOrder).map(r => r.id);
  const companyIds = [...weekRows].sort(byCompany).map(r => r.id);
  const known = new Set(defaultIds);
  const orderIds =
    pinned.week === week ? [...pinned.ids.filter(id => known.has(id)), ...defaultIds.filter(id => !pinned.ids.includes(id))] : defaultIds;
  if (pinned.week !== week || orderIds.length !== pinned.ids.length || orderIds.some((id, i) => id !== pinned.ids[i]))
    setPinned({ week, ids: orderIds });
  const position = new Map(orderIds.map((id, i) => [id, i]));
  const byPin = (a: WeeklyCommitment, b: WeeklyCommitment) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0);
  const byCompanyNow = orderIds.every((id, i) => id === companyIds[i]);
  // Classificar pelo funil é uma ação de uma vez, como no Sheets: reescreve a ordem presa e pronto.
  // Classificação contínua reordenava a linha a cada apontamento (Status A→Z levava a linha recém
  // marcada para junto das outras "Sim"), e foi isso que a obra viu como "a tarefa sobe" (09/10/2026).
  // `sort` fica só como indicador no cabeçalho; as linhas novas continuam entrando embaixo.
  const sortOnce = (column: string, dir: 'asc' | 'desc' | undefined) => {
    setSort(dir ? { column, dir } : undefined);
    setPinned(
      dir
        ? { week, ids: applySheetView([...weekRows], accessors, {}, { column, dir }, byPin, sortKeys).map(r => r.id) }
        : { week: '', ids: [] },
    );
  };
  const rows = applySheetView([...weekRows], accessors, filters, undefined, byPin, sortKeys);
  const filtered = Object.values(filters).some(Boolean) || !!sort;
  const waiting = weekRows.filter(r => awaitingCause.includes(r.id)).length;

  const resizeHandle = (column: string, label: string) => (
    <ColumnResizeHandle
      label={label}
      width={columnWidths.widths[column]}
      onResize={width => columnWidths.resize(column, width)}
      onReset={() => columnWidths.reset(column)}
    />
  );
  const header = (column: string, label: string, className: string, align: 'left' | 'center' = 'left') => (
    <th key={column} scope="col" className={`relative overflow-hidden ${className}`}>
      {resizeHandle(column, label)}
      <ColumnFilter
        label={label}
        align={align}
        values={distinctValues(weekRows, accessors[column])}
        selected={filters[column]}
        onChange={next => setFilters(current => ({ ...current, [column]: next }))}
        sort={sort?.column === column ? sort.dir : undefined}
        onSort={dir => sortOnce(column, dir)}
      />
    </th>
  );

  const teamCreated = (name: string, company: string) =>
    toast({
      title: `Equipe “${name}” criada em ${company}.`,
      description: `Capacidade inicial de ${NEW_TEAM_CAPACITY} atividades por semana, ajustável nas configurações da obra.`,
      tone: 'success',
    });
  /** Equipe existente da empresa é só alocada; nome novo entra no cadastro daquela empresa antes. */
  const assignTeam = async (row: WeeklyCommitment, name: string) => {
    const company = companyOf(row);
    const existing = teamsOfCompany(company).find(t => textKey(t.name) === textKey(name));
    if (existing) return save(row, { teamId: existing.id, supplier: row.supplier || existing.company });
    if (!company) {
      setError('Escolha a empresa da linha antes de criar uma equipe.');
      toast({ title: 'Escolha a empresa da linha antes de criar uma equipe.', tone: 'info' });
      return;
    }
    return enqueue(row.id, async () => {
      const teamId = await context.execute({ type: 'create_team', workId, company, name: name.trim(), weeklyCapacity: NEW_TEAM_CAPACITY });
      await context.execute({
        type: 'update_commitment',
        commitmentId: row.id,
        name: row.name,
        supplier: row.supplier || company,
        teamId,
        weekStart: row.weekStart,
        startDate: row.startDate,
        endDate: row.endDate,
      });
      teamCreated(name.trim(), company);
    });
  };
  /** Trocar a empresa desfaz a equipe de outra empresa: a equipe pertence a uma empresa só. */
  const assignCompany = (row: WeeklyCommitment, company: string) => {
    const team = teamOf(row);
    return save(row, { supplier: company, teamId: team && textKey(team.company) !== textKey(company) ? undefined : row.teamId });
  };
  /** A marca "aguarda causa" só sai depois que o servidor gravou: se a gravação falhar, a linha
   * continua marcada em vez de voltar calada ao Status anterior. */
  const settled = (row: WeeklyCommitment) => setAwaitingCause(ids => ids.filter(id => id !== row.id));
  const setStatus = async (row: WeeklyCommitment, value: string) => {
    if (value === 'Sim') {
      // Sim já gravado: desistir do Não pendente não precisa de ida ao servidor.
      if (row.fulfilled === true) return settled(row);
      if (await run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: true, justification: row.justification }, row.id))
        settled(row);
      return;
    }
    if (value === 'Não' && row.fulfilled !== false) setAwaitingCause(ids => (ids.includes(row.id) ? ids : [...ids, row.id]));
  };
  const setCause = async (row: WeeklyCommitment, cause: string) => {
    if (!cause) return;
    if (await run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: false, cause, justification: row.justification }, row.id))
      settled(row);
  };
  /** Resolve `true` só com a linha criada: é o sinal para a linha em branco limpar o rascunho. */
  const createRow = (draft: Draft) =>
    enqueue('nova', async () => {
      const company = draft.supplier.trim();
      let teamId: string | undefined;
      let created = '';
      if (draft.teamName.trim() && company) {
        teamId = teamsOfCompany(company).find(t => textKey(t.name) === textKey(draft.teamName))?.id;
        if (!teamId) {
          teamId = await context.execute({
            type: 'create_team',
            workId,
            company,
            name: draft.teamName.trim(),
            weeklyCapacity: NEW_TEAM_CAPACITY,
          });
          created = draft.teamName.trim();
        }
      }
      await context.execute({
        type: 'create_commitment',
        workId,
        name: draft.name.trim(),
        weekStart: week,
        responsibleId: actor.id,
        supplier: company,
        teamId: teamId ?? null,
        startDate: draft.startDate || undefined,
        endDate: draft.endDate || undefined,
      });
      if (created) teamCreated(created, company);
    });

  /** Os controles de uma linha são os mesmos na tabela (telas largas) e no cartão (celular): só a
   * disposição muda, a gravação é uma. Os campos de texto recebem a classe de quem os monta,
   * porque a célula sem borda da tabela não se sustenta sozinha dentro de um cartão. */
  const controls = (row: WeeklyCommitment, index: number) => {
    const saving = busy === row.id;
    const status = statusOf(row);
    const missingCause = status === 'Não' && !row.cause;
    const company = companyOf(row);
    const nextWeek = weekNumber(addDays(row.weekStart, 7));
    // Levar para a próxima só mexe na semana seguinte, e é ela que o servidor confere: a linha de
    // uma semana encerrada pode ser levada por quem não é admin, desde que a próxima esteja aberta.
    const canCarry = !viewer && canEditWeek(addDays(row.weekStart, 7), planning.today, actor.role);
    // As listas travam só na linha que está gravando; as demais seguem editáveis, a fila guarda a ordem.
    return {
      saving,
      missingCause,
      company: (
        <PillCombo
          value={company}
          options={companies}
          disabled={readOnly || saving}
          ariaLabel={`Empresa da linha ${index + 1}`}
          placeholder="Empresa"
          onCommit={value => assignCompany(row, value)}
        />
      ),
      week: (
        <PillSelect
          value={row.weekStart}
          disabled={readOnly || saving}
          ariaLabel={`Semana da linha ${index + 1}`}
          title={`${dayMonth(row.weekStart)} a ${dayMonth(addDays(row.weekStart, 5))}`}
          options={weeks.map(w => ({ value: w, label: weekLabel(w) }))}
          onChange={value => moveWeek(row, value)}
        />
      ),
      // Campos de texto não controlados, com a chave no próprio valor: quando a atualização silenciosa
      // muda a linha, o campo é remontado com o valor novo em vez de mostrar o antigo (o mesmo
      // padrão do editor de atividades do vagão). Só grava o que mudou de fato.
      start: (className = 'cell tabular-nums') => (
        <input
          key={row.startDate}
          className={className}
          type="date"
          defaultValue={row.startDate}
          disabled={readOnly}
          min={row.weekStart}
          max={row.weekEnd}
          aria-label={`Início da linha ${index + 1}`}
          onBlur={e => {
            if (e.target.value && e.target.value !== row.startDate) saveStart(row, e.target.value);
          }}
        />
      ),
      end: (className = 'cell tabular-nums') => (
        <input
          key={row.endDate}
          className={className}
          type="date"
          defaultValue={row.endDate}
          disabled={readOnly}
          min={row.startDate}
          max={row.weekEnd}
          aria-label={`Término da linha ${index + 1}`}
          onBlur={e => {
            if (e.target.value && e.target.value !== row.endDate) save(row, { endDate: e.target.value });
          }}
        />
      ),
      name: (className = 'cell') => (
        <input
          key={row.name}
          className={className}
          defaultValue={row.name}
          disabled={readOnly}
          aria-label={`Atividade da linha ${index + 1}`}
          onBlur={e => {
            const name = e.target.value.trim();
            // Linha sem atividade não existe: apagar o nome só devolve o que estava.
            if (!name) e.target.value = row.name;
            else if (name !== row.name) save(row, { name });
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      ),
      team: (
        <PillCombo
          value={teamOf(row)?.name ?? ''}
          options={teamsOfCompany(company).map(t => t.name)}
          disabled={readOnly || saving}
          allowCreate={!!company}
          emptyHint={company ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
          createLabel={text => `Criar equipe “${text}” em ${company}`}
          ariaLabel={`Equipe da linha ${index + 1}`}
          placeholder="Equipe"
          onCommit={value => assignTeam(row, value)}
        />
      ),
      statusPill: (
        <PillSelect
          value={status}
          tone={status === 'Sim' ? 'success' : status === 'Não' ? 'danger' : 'neutral'}
          // Realizado, causa e justificativa ficam abertos mesmo na semana encerrada (09/10/2026).
          disabled={viewer || saving}
          ariaLabel={`Status da linha ${index + 1}`}
          options={[
            { value: 'Sim', label: 'Sim' },
            { value: 'Não', label: 'Não' },
          ]}
          onChange={value => setStatus(row, value)}
        />
      ),
      causePill: (
        <PillSelect
          value={row.cause ?? ''}
          tone={missingCause ? 'required' : 'neutral'}
          disabled={viewer || saving || status !== 'Não'}
          ariaLabel={`Causa da linha ${index + 1}`}
          placeholder={missingCause ? 'Escolha a causa' : ''}
          title={status !== 'Não' ? 'A causa só é pedida quando o Status é Não.' : undefined}
          options={NON_FULFILLMENT_CAUSES.map(cause => ({ value: cause, label: cause }))}
          onChange={value => setCause(row, value)}
        />
      ),
      justification: (className = 'cell') => (
        <input
          key={row.justification ?? ''}
          className={className}
          defaultValue={row.justification ?? ''}
          disabled={viewer || row.fulfilled === undefined}
          aria-label={`Justificativa da linha ${index + 1}`}
          onBlur={e => {
            if (row.fulfilled !== undefined && e.target.value !== (row.justification ?? ''))
              run(
                {
                  type: 'record_fulfillment',
                  commitmentId: row.id,
                  fulfilled: row.fulfilled,
                  cause: row.cause,
                  justification: e.target.value,
                },
                row.id,
              );
          }}
        />
      ),
      followUp:
        row.fulfilled === false && canCarry ? (
          <>
            <button
              type="button"
              className="button-ghost justify-start px-2 py-1 text-xs"
              disabled={saving}
              aria-label={`Levar ${row.name} para a próxima semana`}
              title={
                alreadyCarried(row)
                  ? `Já existe uma linha com esta atividade e este fornecedor na semana ${nextWeek}`
                  : `Cria a mesma linha na semana ${nextWeek}, sem apontamento`
              }
              onClick={() => carry(row)}
            >
              {alreadyCarried(row) ? 'Levar de novo' : 'Levar p/ próxima'}
            </button>
            {developer && (
              <button
                type="button"
                className="button-ghost justify-start px-2 py-1 text-xs"
                aria-haspopup="dialog"
                aria-label={`Gerar restrição a partir de ${row.name}`}
                onClick={() => setPendencyFor(row.id)}
              >
                Gerar restrição
              </button>
            )}
          </>
        ) : null,
      deleteButton: readOnly ? null : (
        <button
          type="button"
          onClick={() => removeRow(row)}
          aria-label={`Excluir a linha ${row.name}`}
          title="Excluir linha"
          className="rounded px-1.5 text-slate-300 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          ✕
        </button>
      ),
    };
  };
  const sheetLabel = `Planilha da semana ${weekNumber(week)}`;
  const emptyState =
    weekRows.length === 0 ? (
      <Empty>Semana em branco. Escreva a primeira atividade na linha de nova atividade.</Empty>
    ) : rows.length === 0 ? (
      <Empty>Nenhuma linha com esses filtros.</Empty>
    ) : null;

  return (
    <>
      <TabHeader
        workId={workId}
        section="curto-prazo"
        helpTitle="Como funciona: curto prazo"
        description="A planilha da semana: empresa, equipe, período, cumprimento (Sim/Não) e causa do não cumprimento."
        help={
          <>
            <p>
              A planilha é a mesma que a equipe já preenche: empresa, semana, início, término, atividade e equipe, todos editáveis na
              célula. Escreva a atividade na última linha e a linha existe; a equipe é opcional.
            </p>
            <p>
              O calendário de SEG a SÁB é a única coisa que se marca sozinha, a partir de Início e Término. Trocar a semana de uma linha
              move o período inteiro, conservando o dia da semana.
            </p>
            <p>
              Ao encerrar a semana, registre Sim ou Não em cada linha. O Não só é gravado depois que a causa é escolhida na lista: é dela
              que saem o PPC e o Pareto. Do não cumprido, leve a linha para a próxima semana
              {developer ? ' ou gere uma restrição no longo prazo' : ''}; a linha original fica como registro do que aconteceu.
            </p>
            <p>
              A semana fica aberta até a terça-feira seguinte. Depois disso ela é encerrada: incluir, editar ou excluir linhas, só
              administradores. Realizado, causa e justificativa podem ser lançados ou corrigidos a qualquer momento.
            </p>
            <p>
              A semana 1 vem das configurações da obra; sem ela, é a primeira semana com linha na planilha. O número de cada semana é
              contado a partir daí.
            </p>
          </>
        }
      />
      {printing && (
        <PrintDialog
          workId={workId}
          week={week}
          kind={printing}
          companies={distinctValues(weekRows, companyOf)}
          initialSelected={filters.empresa}
          onClose={() => setPrinting(undefined)}
        />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
        <label className="flex items-center gap-2">
          Semana analisada
          <select
            className="field max-w-60 py-1.5"
            value={week}
            onChange={e => {
              setChosen(e.target.value);
              setPendencyFor('');
            }}
          >
            {[...weeks].reverse().map(w => (
              <option key={w} value={w}>
                {weekNumber(w)} · {dayMonth(w)} a {dayMonth(addDays(w, 5))}
                {w === currentWeek ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <span>
          Semana atual: <span className="tabular-nums text-slate-900">{weekNumber(currentWeek)}</span>
          <Link className="text-link ml-2 font-normal" href={workPath(workId, 'configuracoes')}>
            {weekOneStart ? 'alterar semana 1' : 'definir semana 1'}
          </Link>
        </span>
        <span data-tour="curto-ppc">
          PPC: <span className="tabular-nums text-slate-900">{stats.planned ? `${Math.round(stats.percent)}%` : '—'}</span>
          {stats.pending > 0 && <span className="ml-1 font-normal text-slate-400">({stats.pending} sem status)</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <HelpNote title="Como preencher a planilha" label="Como preencher" align="end">
            <p>
              Empresa e Equipe: escolha na lista ou digite um nome novo. Equipe nova entra no cadastro da empresa da linha, com capacidade
              de {NEW_TEAM_CAPACITY} atividades por semana, ajustável nas configurações.
            </p>
            <p>
              Os dias de SEG a SÁB se marcam a partir de Início e Término. No celular, os filtros de coluna ficam só na tabela de telas
              largas.
            </p>
          </HelpNote>
          <Link className="text-link" href={workPath(workId, 'configuracoes')}>
            {viewer ? 'Consultar recursos' : 'Gerenciar empreiteiros e equipes'}
          </Link>
          {/* PDFs no formato da planilha da obra: antes, a janela de empreiteiros e ordem; depois, uma aba
            própria já no diálogo de impressão ("Salvar como PDF"), com o nome "PCP-<código> - Semana N". */}
          <button type="button" className="button-secondary" onClick={() => setPrinting('planejamento')}>
            PDF do planejamento
          </button>
          <button type="button" className="button-secondary" onClick={() => setPrinting('fechamento')}>
            PDF do fechamento
          </button>
          {wide && (
            <button
              type="button"
              className="text-link"
              title="Reduz as colunas para a planilha caber na largura da tela"
              onClick={() => columnWidths.fit(sheetPanel.current?.clientWidth ?? 0, true)}
            >
              Ajustar à tela
            </button>
          )}
        </span>
      </div>

      {locked && !viewer && (
        <div className="mt-3">
          <Callout tone={readOnly ? 'warning' : 'info'} role="status">
            {readOnly
              ? `Semana encerrada em ${formatDate(weekLockLastDay(week))}: Realizado, causa e justificativa continuam abertos; incluir, editar ou excluir linhas, só administradores.`
              : `Semana encerrada em ${formatDate(weekLockLastDay(week))}: você está alterando como administrador.`}
          </Callout>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        </div>
      )}
      {waiting > 0 && (
        <div className="mt-3">
          <Callout tone="warning" role="status">
            {waiting === 1 ? '1 linha marcada como Não aguarda' : `${waiting} linhas marcadas como Não aguardam`} a causa. O Não só é
            gravado depois que a causa é escolhida.
          </Callout>
        </div>
      )}
      {filtered && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            Mostrando {rows.length} de {weekRows.length} linhas.
          </span>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setFilters({});
              sortOnce('', undefined);
            }}
          >
            Limpar filtros e classificação
          </button>
        </div>
      )}

      {weekRows.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            {sort
              ? 'Linhas classificadas uma vez pelo funil; marcar Status ou editar não as move, e as novas entram embaixo.'
              : byCompanyNow
                ? 'Linhas organizadas por empresa; as novas entram embaixo.'
                : 'Linhas na ordem em que foram incluídas; a nova entra embaixo.'}
          </span>
          {sort || byCompanyNow ? (
            <button type="button" className="text-link" onClick={() => sortOnce('', undefined)}>
              Voltar à ordem de inclusão
            </button>
          ) : (
            <button type="button" className="text-link" onClick={() => setPinned({ week, ids: companyIds })}>
              Organizar por empresa
            </button>
          )}
        </div>
      )}

      {/* O `data-tour` fica no invólucro das duas versões: no celular a tabela não tem área e o
        passo do tour pularia a planilha. Só uma das duas é desenhada (`useWideScreen`). */}
      <div data-tour="curto-commitments" className="mt-4">
        {wide ? (
          <div
            ref={element => {
              sheetPanel.current = element;
              // Na primeira vez, sem larguras escolhidas, a planilha já abre cabendo na tela.
              if (element && !autoFitted.current && !columnWidths.saved) {
                autoFitted.current = true;
                columnWidths.fit(element.clientWidth, false);
              }
            }}
            // `relative`: os ícones absolutos das células passam a ser cortados por este quadro em vez de
            // alargar a página inteira (ela chegava a 2.473 px numa tela de 1.366, 09/10/2026). A altura
            // limitada traz a barra de rolagem lateral para a vista, com o cabeçalho fixo no topo.
            className="panel custom-scrollbar relative max-h-[calc(100dvh-12rem)] overflow-auto"
            role="region"
            aria-label={sheetLabel}
            tabIndex={0}
          >
            <table className="table-fixed border-collapse text-left text-xs" style={{ width: columnWidths.total }}>
              <colgroup>
                {COLUMN_ORDER.map(column => (
                  <col key={column} style={{ width: columnWidths.widths[column] }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-[0_1px_0_rgb(226_232_240)]">
                <tr className="text-xs font-semibold normal-case tracking-normal text-slate-400">
                  <th colSpan={6} className="px-2 pt-1.5" />
                  {columns.map(({ day, date }) => (
                    <th key={day} scope="col" className="border-l border-slate-200 px-1 pt-1.5 text-center tabular-nums">
                      {dayMonth(date)}
                    </th>
                  ))}
                  <th colSpan={5} />
                </tr>
                <tr className="border-b border-slate-200">
                  {header('empresa', 'Empresa', 'px-2 py-1.5')}
                  {header('semana', 'Semana', 'px-2 py-1.5')}
                  {header('inicio', 'Início', 'px-2 py-1.5')}
                  {header('termino', 'Término', 'px-2 py-1.5')}
                  {header('atividade', 'Atividade', 'px-2 py-1.5')}
                  {header('equipe', 'Equipe', 'px-2 py-1.5')}
                  {columns.map(({ day }) => header(`d${day}`, NAMES[day], 'border-l border-slate-200 px-1 py-1.5', 'center'))}
                  {header('status', 'Status', 'px-2 py-1.5')}
                  {header('causas', 'Causas', 'px-2 py-1.5')}
                  {header('justificativa', 'Justificativas', 'px-2 py-1.5')}
                  <th scope="col" className="relative overflow-hidden px-2 py-1.5">
                    {resizeHandle('seguimento', 'Do não cumprido')}
                    Do não cumprido
                  </th>
                  <th scope="col">
                    <span className="sr-only">Excluir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const c = controls(row, index);
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-100 ${c.saving ? 'bg-amber-50/60' : c.missingCause ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}`}
                    >
                      <td className="px-1 py-1">{c.company}</td>
                      <td className="px-1 py-1">{c.week}</td>
                      <td className="px-1 py-1">{c.start()}</td>
                      <td className="px-1 py-1">{c.end()}</td>
                      <td className="px-1 py-1">{c.name()}</td>
                      <td className="px-1 py-1">{c.team}</td>
                      {WEEKDAYS.map(day => (
                        <td
                          key={day}
                          className={`border-l border-slate-100 px-1 py-1 text-center font-bold ${marked(row, day) ? 'bg-primary-soft text-primary-ink' : 'text-slate-200'}`}
                        >
                          {marked(row, day) ? 'x' : ''}
                        </td>
                      ))}
                      <td className="px-1 py-1">{c.statusPill}</td>
                      <td className="px-1 py-1">{c.causePill}</td>
                      <td className="px-1 py-1">{c.justification()}</td>
                      <td className="px-1 py-1">{c.followUp && <div className="flex gap-1 whitespace-nowrap">{c.followUp}</div>}</td>
                      <td className="px-1 py-1">{c.deleteButton}</td>
                    </tr>
                  );
                })}
                {!readOnly && (
                  <BlankRow
                    week={week}
                    weekEnd={weekEnd}
                    weekNumber={weekNumber(week)}
                    companies={companies}
                    teamNames={company => teamsOfCompany(company).map(t => t.name)}
                    onCreate={createRow}
                  />
                )}
              </tbody>
            </table>
            {emptyState && <div className="border-t border-slate-100 p-4">{emptyState}</div>}
          </div>
        ) : (
          /* No celular, uma linha é um cartão: a tabela larga só serviria para rolar de lado. */
          <div className="space-y-3" role="region" aria-label={sheetLabel}>
            {rows.map((row, index) => {
              const c = controls(row, index);
              return (
                <article
                  key={row.id}
                  aria-label={`Linha ${index + 1}: ${row.name}`}
                  className={`rounded-xl border p-3 shadow-sm ${c.saving ? 'border-amber-200 bg-amber-50/60' : c.missingCause ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">{c.name('field py-1.5 font-semibold')}</div>
                    {c.deleteButton}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <CardField label="Empresa">{c.company}</CardField>
                    <CardField label="Equipe">{c.team}</CardField>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <CardField label="Semana">{c.week}</CardField>
                    <CardField label="Início">{c.start('field py-1.5 text-xs tabular-nums')}</CardField>
                    <CardField label="Término">{c.end('field py-1.5 text-xs tabular-nums')}</CardField>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Dias da linha ${index + 1}`}>
                    {WEEKDAYS.map(day => {
                      const on = marked(row, day);
                      return (
                        <li
                          key={day}
                          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${on ? 'border-primary-ring bg-primary-soft text-primary-ink' : 'border-slate-200 text-slate-400'}`}
                        >
                          {NAMES[day]}
                          <span className="sr-only">{on ? ', marcado' : ', não marcado'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <CardField label="Status">{c.statusPill}</CardField>
                    <CardField label="Causa">{c.causePill}</CardField>
                  </div>
                  <CardField label="Justificativa" className="mt-2">
                    {c.justification('field py-1.5 text-xs')}
                  </CardField>
                  {c.followUp && <div className="mt-2 flex flex-wrap gap-1">{c.followUp}</div>}
                </article>
              );
            })}
            {!readOnly && (
              <BlankCard
                week={week}
                weekEnd={weekEnd}
                weekNumber={weekNumber(week)}
                companies={companies}
                teamNames={company => teamsOfCompany(company).map(t => t.name)}
                onCreate={createRow}
              />
            )}
            {emptyState && <div className="rounded-xl border border-slate-200 bg-white p-4">{emptyState}</div>}
          </div>
        )}
      </div>

      <section className="mt-8" aria-labelledby="fechamento-title">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <h2 id="fechamento-title" className="text-lg font-bold text-slate-900">
            Fechamento da semana
          </h2>
          <HelpNote title="Como ler o fechamento" label="Como ler o fechamento" compact>
            <p>
              O PPC de uma semana sozinha diz pouco, e causa coletada e nunca somada não diz nada. O que o Last Planner lê é a série — se o
              comprometimento está sendo aprendido — e o Pareto das causas, que aponta o que está custando a obra.
            </p>
            <p>As duas leituras saem da planilha acima e de mais nada: esta tela não depende do plano do mês.</p>
          </HelpNote>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          A série do PPC diz se o comprometimento está sendo aprendido; o Pareto, o que está custando a obra.
        </p>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <PpcSeries series={series} week={week} label={weekNumber} />
          {/* A semana inteira, não as linhas filtradas: o filtro de coluna é da planilha, não do Pareto. */}
          <CausesPareto all={commitments} weekRows={weekRows} weekLabel={weekNumber(week)} />
        </div>
      </section>

      {developer && pendencyRow && (
        <PendencyDialog
          row={pendencyRow}
          wagons={selected.wagons}
          activities={activities}
          workId={workId}
          actorId={actor.id}
          weekLabel={weekNumber(pendencyRow.weekStart)}
          execute={context.execute}
          onClose={() => setPendencyFor('')}
        />
      )}
    </>
  );
}

/** Rótulo curto sobre um controle do cartão: no celular não há cabeçalho de coluna dizendo o que é. */
function CardField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-0.5 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/** A série do PPC em barras, SVG inline e sem biblioteca. O desenho é decorativo de propósito
 * (`aria-hidden`): quem lê por leitor de tela lê a tabela oculta, com os mesmos números — a tela
 * não pode depender do gráfico. Doze semanas cabem sem espremer a barra e já mostram tendência. */
function PpcSeries({ series, week, label }: { series: WeekPpc[]; week: string; label: (weekStart: string) => number }) {
  const shown = series.slice(-12);
  // Semana com linha sem Status não é PPC fechado: ela entra no desenho, mas fora da média.
  const closed = shown.filter(point => point.pending === 0);
  const average = closed.length ? closed.reduce((sum, point) => sum + point.percent, 0) / closed.length : 0;
  const W = 640,
    H = 172,
    TOP = 16,
    BOTTOM = 38,
    LEFT = 30,
    PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT) / Math.max(1, shown.length);
  const barWidth = Math.min(46, step * 0.58);
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);

  return (
    <section className="panel p-5" aria-labelledby="ppc-serie-title">
      <div className="flex flex-wrap items-center gap-x-1">
        <h3 id="ppc-serie-title" className="text-sm font-bold text-slate-800">
          Série do PPC
        </h3>
        <HelpNote title="Como ler a série do PPC" label="Como ler a série do PPC" compact>
          <p>Cada barra é uma semana da obra, da mais antiga para a mais recente. Barra cheia é semana apurada.</p>
          <p>Barra hachurada e clara é semana ainda em aberto: tem linha sem Status, então aquele PPC não fechou e fica fora da média.</p>
          <p>A faixa âmbar é a semana exibida na planilha, e a linha tracejada é a média das semanas apuradas.</p>
        </HelpNote>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Cada barra é uma semana da obra, da mais antiga para a mais recente.</p>

      {shown.length === 0 ? (
        <div className="mt-4">
          <Empty>Nenhum compromisso registrado ainda: a série começa na primeira linha da planilha.</Empty>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatCard
              label="PPC médio das semanas apuradas"
              tone={closed.length > 0 && average < 70 ? 'warning' : 'default'}
              value={closed.length > 0 ? `${Math.round(average)}%` : '—'}
            />
            <StatCard label="Semanas apuradas · em aberto" value={`${closed.length} · ${shown.length - closed.length}`} />
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" aria-hidden="true">
            <defs>
              {/* Hachura da semana em aberto: o mesmo azul, riscado — barra listrada é "ainda não fechou". */}
              <pattern id="ppc-aberta" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={7} height={7} fill={CHART.planned} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={CHART.surface} strokeWidth={3} />
              </pattern>
            </defs>
            {[0, 50, 100].map(mark => (
              <g key={mark}>
                <line x1={LEFT} y1={y(mark)} x2={W} y2={y(mark)} stroke={CHART.grid} strokeWidth={1} />
                <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={10} fill={CHART.inkFaint}>
                  {mark}
                </text>
              </g>
            ))}
            {/* A semana exibida na planilha ganha a faixa âmbar, o mesmo papel que o âmbar tem nos
              outros gráficos: "é aqui que você está". Faixa, e não contorno, para não cruzar o
              rótulo da barra cheia. */}
            {shown.map((point, index) =>
              point.weekStart === week ? (
                <rect
                  key={`aqui-${point.weekStart}`}
                  x={LEFT + step * index + 1}
                  y={TOP - 10}
                  width={step - 2}
                  height={PLOT + 10}
                  rx={4}
                  fill={CHART.today}
                  opacity={0.12}
                />
              ) : null,
            )}
            {closed.length > 0 && (
              <>
                <line x1={LEFT} y1={y(average)} x2={W} y2={y(average)} stroke={CHART.inkMuted} strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={W - 2} y={y(average) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
                  média {Math.round(average)}%
                </text>
              </>
            )}
            {shown.map((point, index) => {
              const center = LEFT + step * (index + 0.5);
              const height = Math.max(2, (PLOT * point.percent) / 100);
              const open = point.pending > 0,
                here = point.weekStart === week;
              return (
                <g key={point.weekStart}>
                  <rect
                    x={center - barWidth / 2}
                    y={TOP + PLOT - height}
                    width={barWidth}
                    height={height}
                    rx={2}
                    fill={open ? 'url(#ppc-aberta)' : CHART.planned}
                    opacity={open ? 0.75 : 1}
                  />
                  <text
                    x={center}
                    y={TOP + PLOT - height - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill={here ? CHART.today : CHART.ink}
                  >
                    {Math.round(point.percent)}
                  </text>
                  <text
                    x={center}
                    y={H - BOTTOM + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={here ? 700 : 600}
                    fill={here ? CHART.today : CHART.inkMuted}
                  >
                    S{label(point.weekStart)}
                  </text>
                  <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={10} fill={CHART.inkFaint}>
                    {dayMonth(point.weekStart)}
                  </text>
                </g>
              );
            })}
            <line x1={LEFT} y1={TOP + PLOT} x2={W} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeWidth={1} />
          </svg>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            Barra cheia: semana apurada. Barra hachurada: semana em aberto, fora da média. Faixa âmbar: semana da planilha. Tracejado: média
            das apuradas.
          </p>

          <table className="sr-only">
            <caption>PPC por semana da obra</caption>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Período</th>
                <th scope="col">Compromissos</th>
                <th scope="col">Cumpridos</th>
                <th scope="col">Sem status</th>
                <th scope="col">PPC</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(point => (
                <tr key={point.weekStart}>
                  <th scope="row">Semana {label(point.weekStart)}</th>
                  <td>
                    {formatDate(point.weekStart)} a {formatDate(addDays(point.weekStart, 5))}
                  </td>
                  <td>{point.planned}</td>
                  <td>{point.fulfilled}</td>
                  <td>{point.pending}</td>
                  <td>{Math.round(point.percent)}%</td>
                  <td>
                    {point.pending > 0 ? `Em aberto, ${point.pending} sem status` : 'Apurada'}
                    {point.weekStart === week ? ' · semana exibida na planilha' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
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

  return (
    <section className="panel p-5" aria-labelledby="pareto-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 id="pareto-title" className="text-sm font-bold text-slate-800">
              Pareto das causas
            </h3>
            <HelpNote title="Como ler o Pareto" label="Como ler o Pareto" compact>
              <p>
                Só entram as linhas com Status Não e causa apontada. As causas vêm em ordem de ocorrências, com a participação de cada uma e
                o acumulado.
              </p>
              <p>
                As barras em vermelho são as poucas causas que somam os primeiros 80% das falhas: atacar essas é atacar a maior parte do que
                não foi cumprido.
              </p>
              <p>O período padrão é a obra inteira. Numa semana só, cada causa aparece uma ou duas vezes e a ordem é ruído.</p>
            </HelpNote>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Só entram as linhas com Status Não e causa apontada.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Período
          <select className="field max-w-40 py-1.5" value={scope} onChange={e => setScope(e.target.value as 'obra' | 'semana')}>
            <option value="obra">A obra inteira</option>
            <option value="semana">Esta semana</option>
          </select>
        </label>
      </div>

      {tally.length === 0 ? (
        <div className="mt-4">
          <Empty>
            {scope === 'semana'
              ? `Nenhuma falha apurada na semana ${weekLabel}. Troque o período para a obra inteira: é onde o Pareto tem sentido.`
              : 'Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa.'}
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <Callout tone={vital <= 3 && vital < tally.length ? 'warning' : 'info'} role="status">
              {vital === tally.length ? (
                <>
                  As {tally.length} causas apontadas se dividem por {failures} {failures === 1 ? 'falha' : 'falhas'} {period}, sem
                  concentração clara.
                </>
              ) : (
                <>
                  <strong>
                    {vital} {vital === 1 ? 'causa responde' : 'causas respondem'} por {Math.round(tally[vital - 1].accumulated)}%
                  </strong>{' '}
                  das {failures} falhas apuradas {period} —{' '}
                  {tally
                    .slice(0, vital)
                    .map(item => item.cause)
                    .join(', ')}
                  . É aí que está o ganho.
                </>
              )}
            </Callout>
          </div>

          <div className="mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Pareto das causas ${period}`} tabIndex={0}>
            <table className="data-table min-w-[420px]">
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Ocorrências</th>
                  <th scope="col">Participação</th>
                  <th scope="col">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {tally.map((item, index) => {
                  const heavy = index < vital && vital < tally.length;
                  return (
                    <tr key={item.cause}>
                      <th scope="row" className="leading-snug">
                        {item.cause}
                      </th>
                      <td className="tabular-nums">{item.total}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(2, Math.round(item.share))}%`,
                                backgroundColor: heavy ? CHART.late : CHART.planned,
                              }}
                            />
                          </span>
                          <span className="tabular-nums">{Math.round(item.share)}%</span>
                        </div>
                      </td>
                      <td className="tabular-nums font-semibold text-slate-700">{Math.round(item.accumulated)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {vital < tally.length && (
            <p className="mt-2 text-xs text-slate-500">As barras em vermelho são as causas que somam os primeiros 80% das falhas.</p>
          )}
        </>
      )}
    </section>
  );
}

/** A restrição nasce da falha: o Não da planilha vira item do quadro do longo prazo, sem passar
 * pelo plano do mês. O modelo é por vagão — o servidor exige `wagonId` —, e o lead time só existe
 * preso a uma atividade daquele vagão, porque o limite é contado para trás a partir do início
 * previsto dela. Sem lead time, o prazo é digitado. */
function PendencyDialog({
  row,
  wagons,
  activities,
  workId,
  actorId,
  weekLabel,
  execute,
  onClose,
}: {
  row: WeeklyCommitment;
  wagons: Wagon[];
  activities: Activity[];
  workId: string;
  actorId: string;
  weekLabel: number;
  execute: (command: Command) => Promise<string>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    closeButton.current?.focus();
  }, []);
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
    setBusy(true);
    setError('');
    setSavedId('');
    try {
      setSavedId(
        await execute({
          type: 'create_restriction',
          wagonId,
          activityId: activity?.id,
          description: description.trim(),
          responsibleId: actorId,
          dueDate: deadline,
          blocksExecution,
          blocksTerminality,
          leadTimeDays: activity ? leadDays : undefined,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a restrição.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="pendencia-da-falha"
      className="m-auto max-h-[85vh] w-[min(38rem,92vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Semana {weekLabel} · não cumprido</p>
            <h3 id="pendencia-da-falha" className="mt-1 text-base font-bold text-slate-900">
              Gerar restrição
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {row.name}
              {row.supplier && ` · ${row.supplier}`}
              <br />
              {row.cause}
            </p>
          </div>
          <button ref={closeButton} type="button" className="button-ghost" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </div>

        {wagons.length === 0 ? (
          <div className="mt-5 space-y-3">
            <Callout tone="warning" role="status">
              A restrição é pendurada em um vagão, e esta obra ainda não tem nenhum. Enquanto a sequência de vagões não existir, não há onde
              registrar o problema no longo prazo — a causa continua guardada na linha da planilha.
            </Callout>
            <Link className="text-link text-sm" href={workPath(workId)}>
              Abrir os vagões da obra
            </Link>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <Field label="Vagão">
              <select
                className="field"
                value={wagonId}
                required
                onChange={e => {
                  setWagonId(e.target.value);
                  setActivityId('');
                }}
              >
                {wagons.map(wagon => (
                  <option key={wagon.id} value={wagon.id}>
                    {wagonLabel(wagon.number)} · {formatDate(wagon.plannedStart)} a {formatDate(wagon.plannedEnd)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Atividade do vagão (opcional; obrigatória para usar lead time)">
              <select className="field" value={activityId} disabled={options.length === 0} onChange={e => setActivityId(e.target.value)}>
                <option value="">{options.length === 0 ? 'O vagão não tem atividade cadastrada' : 'Sem atividade vinculada'}</option>
                {options.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} · início {formatDate(a.plannedStart)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição da restrição">
              <textarea className="field" rows={3} required value={description} onChange={e => setDescription(e.target.value)} />
            </Field>
            <Field label="Lead time (dias para obter)">
              <input
                className="field"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={lead}
                placeholder="Deixe vazio para digitar o prazo"
                onChange={e => setLead(e.target.value)}
              />
            </Field>
            {leadDays !== undefined ? (
              activity ? (
                <Callout tone="info" role="status">
                  Data limite: <strong>{formatDate(leadTimeDeadline(activity.plannedStart, leadDays))}</strong> — início previsto da
                  atividade ({formatDate(activity.plannedStart)}) menos {leadDays} dias. O servidor recalcula esse limite.
                </Callout>
              ) : (
                <Callout tone="warning" role="status">
                  O lead time é contado a partir do início previsto de uma atividade: escolha a atividade do vagão ou apague o lead time e
                  digite o prazo.
                </Callout>
              )
            ) : (
              <Field label="Prazo para resolver">
                <input className="field" type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </Field>
            )}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={blocksExecution}
                  onChange={e => setBlocksExecution(e.target.checked)}
                />
                Bloqueia execução
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={blocksTerminality}
                  onChange={e => setBlocksTerminality(e.target.checked)}
                />
                Bloqueia terminalidade
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              A restrição entra com você como responsável e a linha da planilha não muda: ela continua com o Não e a causa, que são o
              registro do que aconteceu.
            </p>
            <button className="button" type="submit" disabled={busy || blocked}>
              {busy ? 'Criando…' : savedId ? 'Criar outra restrição' : 'Criar restrição'}
            </button>
            {error && (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            )}
            {savedId && (
              <Callout tone="success" role="status">
                Restrição criada. Acompanhe no{' '}
                <Link className="text-link" href={workPath(workId, 'longo-prazo')}>
                  quadro de restrições
                </Link>
                .
              </Callout>
            )}
          </form>
        )}
      </div>
    </dialog>
  );
}

type BlankProps = {
  week: string;
  weekEnd: string;
  weekNumber: number;
  companies: string[];
  teamNames: (company: string) => string[];
  /** Resolve `true` só com a linha criada; `false` é erro já avisado, e o rascunho fica. */
  onCreate: (draft: Draft) => Promise<boolean>;
};

/** O rascunho da linha nova, o mesmo na tabela e no cartão. Trocar a empresa derruba a equipe que
 * não é dela, porque a equipe pertence a uma empresa só. */
function useDraft(onCreate: (draft: Draft) => Promise<boolean>, teamNames: (company: string) => string[]) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  // Ref, e não só estado: dois Enter seguidos chegam antes de a tela mostrar "Criando…".
  const pending = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const change = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const setCompany = (supplier: string) =>
    change({ supplier, teamName: teamNames(supplier).some(name => textKey(name) === textKey(draft.teamName)) ? draft.teamName : '' });
  /** O rascunho só é limpo depois que a linha existe: antes era apagado antes de gravar, e se a
   * gravação não acontecia (outra linha gravando, erro do servidor) a atividade escrita sumia.
   * `refocus` devolve o foco à atividade para escrever a linha seguinte sem clicar; não vale quando
   * a criação veio de sair da linha, senão roubaria o foco da célula que a pessoa clicou. */
  const create = async (next: Draft, refocus = false) => {
    if (!next.name.trim() || pending.current) return;
    pending.current = true;
    setCreating(true);
    try {
      if (await onCreate(next)) {
        setDraft(EMPTY_DRAFT);
        if (refocus) nameInput.current?.focus();
      }
    } finally {
      pending.current = false;
      setCreating(false);
    }
  };
  return { draft, creating, nameInput, change, setCompany, create };
}

/** Linha em branco no fim: escreveu a atividade, a linha existe. Empresa, equipe e datas podem
 * ficar em branco — sem período, a linha nasce no primeiro dia da semana e se ajusta na planilha. */
function BlankRow({ week, weekEnd, weekNumber, companies, teamNames, onCreate }: BlankProps) {
  const { draft, creating, nameInput, change, setCompany, create } = useDraft(onCreate, teamNames);
  /** Só cria quando o foco deixa a linha em branco: andar de célula em célula — inclusive abrir a
   * lista suspensa de empresa ou equipe — é continuar preenchendo a mesma linha. */
  const leave = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (!event.currentTarget.closest('tr')?.contains(next) && !next?.closest('[data-sheet-popover]')) create(draft);
  };
  return (
    <tr className="border-t border-slate-100 bg-primary-soft/40" onBlur={leave}>
      <td className="px-1 py-1">
        <PillCombo
          value={draft.supplier}
          options={companies}
          disabled={creating}
          ariaLabel="Empresa da nova linha"
          placeholder="Empresa"
          onCommit={setCompany}
        />
      </td>
      <td className="px-2 py-1 tabular-nums text-slate-400">{weekNumber}</td>
      <td className="px-1 py-1">
        <input
          className="cell tabular-nums"
          type="date"
          value={draft.startDate}
          disabled={creating}
          min={week}
          max={weekEnd}
          aria-label="Início da nova linha"
          onChange={e => change({ startDate: e.target.value })}
        />
      </td>
      <td className="px-1 py-1">
        <input
          className="cell tabular-nums"
          type="date"
          value={draft.endDate}
          disabled={creating}
          min={draft.startDate || week}
          max={weekEnd}
          aria-label="Término da nova linha"
          onChange={e => change({ endDate: e.target.value })}
        />
      </td>
      <td className="px-1 py-1">
        {/* `readOnly`, não `disabled`, enquanto cria: o campo desabilitado perde o foco, e a pessoa
          quer emendar a linha seguinte. */}
        <input
          ref={nameInput}
          className="cell"
          value={draft.name}
          readOnly={creating}
          aria-label="Atividade da nova linha"
          placeholder={creating ? 'Criando…' : 'Escreva a atividade e tecle Enter'}
          onChange={e => change({ name: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              create(draft, true);
            }
          }}
        />
      </td>
      <td className="px-1 py-1">
        <PillCombo
          value={draft.teamName}
          options={teamNames(draft.supplier)}
          disabled={creating}
          allowCreate={!!draft.supplier.trim()}
          emptyHint={draft.supplier.trim() ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
          createLabel={text => `Criar equipe “${text}” em ${draft.supplier}`}
          ariaLabel="Equipe da nova linha"
          placeholder="Equipe"
          onCommit={value => change({ teamName: value })}
        />
      </td>
      <td colSpan={11} className="px-2 py-1 text-slate-400">
        os dias se marcam a partir do período depois de criar a linha
      </td>
    </tr>
  );
}

/** A linha em branco no celular: sem a tabela, é um cartão com botão explícito — no toque, sair
 * do campo não é gesto claro o bastante para criar a linha. */
function BlankCard({ week, weekEnd, weekNumber, companies, teamNames, onCreate }: BlankProps) {
  const { draft, creating, nameInput, change, setCompany, create } = useDraft(onCreate, teamNames);
  return (
    <form
      className="rounded-xl border border-dashed border-primary-ring bg-primary-soft/40 p-3"
      aria-label="Nova linha"
      onSubmit={event => {
        event.preventDefault();
        create(draft, true);
      }}
    >
      <p className="text-xs font-semibold text-slate-600">Nova linha · semana {weekNumber}</p>
      <input
        ref={nameInput}
        className="field mt-2 py-1.5"
        value={draft.name}
        readOnly={creating}
        aria-label="Atividade da nova linha"
        placeholder={creating ? 'Criando…' : 'Atividade'}
        onChange={e => change({ name: e.target.value })}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CardField label="Empresa">
          <PillCombo
            value={draft.supplier}
            options={companies}
            disabled={creating}
            ariaLabel="Empresa da nova linha"
            placeholder="Empresa"
            onCommit={setCompany}
          />
        </CardField>
        <CardField label="Equipe">
          <PillCombo
            value={draft.teamName}
            options={teamNames(draft.supplier)}
            disabled={creating}
            allowCreate={!!draft.supplier.trim()}
            emptyHint={draft.supplier.trim() ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
            createLabel={text => `Criar equipe “${text}” em ${draft.supplier}`}
            ariaLabel="Equipe da nova linha"
            placeholder="Equipe"
            onCommit={value => change({ teamName: value })}
          />
        </CardField>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CardField label="Início">
          <input
            className="field py-1.5 text-xs tabular-nums"
            type="date"
            value={draft.startDate}
            disabled={creating}
            min={week}
            max={weekEnd}
            aria-label="Início da nova linha"
            onChange={e => change({ startDate: e.target.value })}
          />
        </CardField>
        <CardField label="Término">
          <input
            className="field py-1.5 text-xs tabular-nums"
            type="date"
            value={draft.endDate}
            disabled={creating}
            min={draft.startDate || week}
            max={weekEnd}
            aria-label="Término da nova linha"
            onChange={e => change({ endDate: e.target.value })}
          />
        </CardField>
      </div>
      <button type="submit" className="button mt-3 w-full" disabled={creating || !draft.name.trim()}>
        {creating ? 'Criando…' : 'Adicionar'}
      </button>
    </form>
  );
}
