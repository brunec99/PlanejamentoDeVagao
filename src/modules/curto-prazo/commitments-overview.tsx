'use client';
import Link from 'next/link';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Command, FulfillmentItem } from '@/application/use-cases/commands';
import { selectWorkPlanning, type Planning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES, type Activity, type User, type Wagon, type WeeklyCommitment } from '@/domain/entities';
import { leadTimeDeadline, ppc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { formatDate, wagonLabel, workPath } from '@/shared/format';
import { ColumnFilter, PillCombo, PillSelect } from '@/modules/curto-prazo/sheet-controls';
import { FillHandle, type FillColumn } from '@/modules/curto-prazo/fill-handle';
import { BulkBar, bulkFulfillmentItems, type BulkChoice } from '@/modules/curto-prazo/bulk-bar';
import { handleRowKey } from '@/modules/curto-prazo/row-navigation';
import { useWorkSettings } from '@/modules/configuracoes/work-settings';
import { ColumnResizeHandle, useColumnWidths, useWideScreen } from '@/modules/curto-prazo/column-widths';
import { SectionNav } from '@/modules/curto-prazo/section-nav';
import { PrintDialog } from '@/modules/curto-prazo/print-dialog';
import type { PrintKind } from '@/modules/curto-prazo/print-sheet';
import { weekNumberFrom } from '@/domain/week-numbering';
import { canEditWeek, isWeekLocked, weekLockLastDay } from '@/domain/week-lock';
import {
  applySheetView,
  companyOptions,
  compareText,
  distinctValues,
  neighborWeeks,
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
/** O combo de equipe só lista as cadastradas, e a obra não percebia que digitar cria uma (11/10/2026). */
const TEAM_CREATE_HINT = 'Não achou? Digite o nome para criar uma equipe nova.';
/** Larguras iniciais (px) das colunas da planilha, na ordem em que aparecem; cada pessoa ajusta
 * arrastando a borda do cabeçalho, e o ajuste fica no navegador dela. */
const COLUMN_DEFAULTS: Record<string, number> = {
  // Caixa de marcar das linhas (26/10/2026), para apontar várias de uma vez; some para quem só consulta.
  marcar: 28,
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
  // "Levar" e "Limpar" lado a lado, curtos: empilhados, dobravam a altura da linha e cabiam 11 linhas na
  // tela onde o Sheets mostra 20 (vídeo da obra, 23/10/2026).
  seguimento: 168,
  excluir: 32,
};
const COLUMN_ORDER = Object.keys(COLUMN_DEFAULTS);
/** A visão "Semanas vizinhas" é preferência de quem planeja, guardada no navegador como as larguras. */
const NEIGHBORS_KEY = 'obra360.curto-prazo.vizinhas';
/** O mínimo legível de cada coluna no "Ajustar à tela": abaixo disso a lista de empresa ou a data cortam. */
const COLUMN_MIN: Record<string, number> = {
  marcar: 28,
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
  seguimento: 112,
  excluir: 32,
};

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  // A planilha fica num componente próprio para que, sem saídas antecipadas, ela possa usar efeitos
  // e manter as ações das linhas estáveis (é disso que o memo das linhas depende).
  return <Sheet workId={workId} planning={planning} wagons={selected.wagons} actor={actor} execute={context.execute} />;
}

/** O que uma linha sabe fazer. A identidade é estável entre renderizações (`useLiveActions`), então
 * a linha memorizada só redesenha quando os dados dela mudam. */
type RowActions = {
  assignCompany: (row: WeeklyCommitment, company: string) => unknown;
  moveWeek: (row: WeeklyCommitment, value: string) => unknown;
  saveStart: (row: WeeklyCommitment, startDate: string) => unknown;
  saveEnd: (row: WeeklyCommitment, endDate: string) => unknown;
  saveName: (row: WeeklyCommitment, name: string) => unknown;
  assignTeam: (row: WeeklyCommitment, name: string) => unknown;
  setStatus: (row: WeeklyCommitment, value: string) => unknown;
  setCause: (row: WeeklyCommitment, cause: string) => unknown;
  saveJustification: (row: WeeklyCommitment, justification: string) => unknown;
  carry: (row: WeeklyCommitment) => unknown;
  openPendency: (row: WeeklyCommitment) => unknown;
  remove: (row: WeeklyCommitment) => unknown;
  clearFulfillment: (row: WeeklyCommitment) => unknown;
  toggleSelect: (row: WeeklyCommitment) => unknown;
  /** Alça de arrastar: copia a célula da linha de origem nas linhas alvo. */
  fill: (column: FillColumn, sourceId: string, targetIds: string[]) => unknown;
};

/** Versão estável das ações: o objeto devolvido nunca muda, mas cada chamada cai na versão mais
 * recente, que enxerga o estado de agora (fila, semana, marcas de "aguarda causa"). */
function useLiveActions<T extends Record<string, (...args: never[]) => unknown>>(actions: T): T {
  const live = useRef(actions);
  useLayoutEffect(() => {
    live.current = actions;
  });
  const [stable] = useState(
    // O ref só é lido dentro de cada ação, na hora do clique; o lint vê o ref entrar na função e avisa.
    // eslint-disable-next-line react-hooks/refs
    () =>
      Object.fromEntries(
        Object.keys(actions).map(key => [key, (...args: unknown[]) => (live.current[key] as (...a: unknown[]) => unknown)(...args)]),
      ) as unknown as T,
  );
  return stable;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
/** Igualdade por valor de arrays e objetos simples. A recarga troca todos os objetos do planejamento,
 * e por identidade cada gravação redesenharia as 120 linhas com suas listas; o que importa é o conteúdo. */
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => same(item, b[i]));
  if (isPlain(a) && isPlain(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => key in b && same(a[key], b[key]));
  }
  return false;
};
const sameProps = <P extends object>(prev: P, next: P) => (Object.keys(prev) as (keyof P)[]).every(key => same(prev[key], next[key]));

function Sheet({
  workId,
  planning,
  wagons,
  actor,
  execute,
}: {
  workId: string;
  planning: Planning;
  wagons: Wagon[];
  actor: User;
  execute: (command: Command) => Promise<string>;
}) {
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
  /** Justificativa escrita antes do Status (26/10/2026): guardada por linha e gravada junto com o Sim ou
   * a causa. No Sheets a célula é livre, e a obra escreve a justificativa em qualquer ordem. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Linhas marcadas para o apontamento em lote (barra de seleção). */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [printing, setPrinting] = useState<PrintKind>();
  const [neighbors, setNeighbors] = useStoredFlag(NEIGHBORS_KEY);
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
  // Semanas vizinhas (pedido da obra, 19/10/2026): quem planeja vê a semana anterior, para levar o que
  // não foi feito, e a próxima, para ver a continuidade. A trava não muda: a anterior só aceita apontamento.
  const around = neighbors ? neighborWeeks(week, firstWeek) : undefined;
  const previousRows = around?.previous ? commitments.filter(c => c.weekStart === around.previous) : [];
  const nextRows = around ? commitments.filter(c => c.weekStart === around.next) : [];
  const nextReadOnly = !around || viewer || (isWeekLocked(around.next, planning.today) && actor.role !== 'admin');
  const wagonIds = new Set(wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
  const pendencyRow = commitments.find(r => r.id === pendencyFor);

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
  const run = (command: Command, key: string) => enqueue(key, () => execute(command));
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
   * PPC daquela semana e a causa no Pareto. Reaproveitar a linha apagaria a série. Nas semanas
   * vizinhas, a linha com Sim ou sem Status também pode continuar na semana seguinte: vira um
   * compromisso novo daquela semana, sem marca de continuação, e a de origem não muda. */
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
        description: `“${row.name}” entrou na semana ${target} sem apontamento. ${row.fulfilled === false ? 'A semana de origem continua com o Não.' : 'A linha de origem não muda.'}`,
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
  const weekChoices = weeks.map(w => ({ value: w, label: weekLabel(w) }));

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
  // As vizinhas seguem os mesmos filtros de coluna (o de empresa é o que a obra usa, um empreiteiro por
  // vez), na ordem de inclusão; a classificação pelo funil vale só para a semana analisada.
  const previousShown = applySheetView([...previousRows], accessors, filters, undefined, defaultOrder, sortKeys);
  const nextShown = applySheetView([...nextRows], accessors, filters, undefined, defaultOrder, sortKeys);
  const filterRows = around ? [...previousRows, ...weekRows, ...nextRows] : weekRows;
  const filtered = Object.values(filters).some(Boolean) || !!sort;
  const waiting = filterRows.filter(r => awaitingCause.includes(r.id)).length;
  // A seleção vale para o que está na lista: ao filtrar, as marcadas que saem de vista deixam de contar.
  const shownRows = [...previousShown, ...rows, ...nextShown];
  const selectedRows = viewer ? [] : shownRows.filter(r => selected.has(r.id));
  const allShownSelected = shownRows.length > 0 && selectedRows.length === shownRows.length;
  // A coluna "Do não cumprido" só existe quando há apontamento na semana (um Não a levar, ou um
  // Sim/Não a limpar): na semana de planejamento ela era 208 px de vazio. Nas semanas vizinhas ela
  // fica sempre, porque qualquer linha pode ser levada para a semana seguinte.
  const showFollowUp = !!around || weekRows.some(r => r.fulfilled !== undefined) || waiting > 0;
  const visibleColumns = COLUMN_ORDER.filter(column => (column !== 'seguimento' || showFollowUp) && (column !== 'marcar' || !viewer));
  const tableWidth = visibleColumns.reduce((sum, column) => sum + columnWidths.widths[column], 0);

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
        values={distinctValues(filterRows, accessors[column])}
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
      const teamId = await execute({ type: 'create_team', workId, company, name: name.trim(), weeklyCapacity: NEW_TEAM_CAPACITY });
      await execute({
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
  /** A marca "aguarda causa" e o rascunho da justificativa só saem depois que o servidor gravou: se a
   * gravação falhar, a linha continua marcada em vez de voltar calada ao Status anterior. */
  const settledAll = (ids: string[]) => {
    const gone = new Set(ids);
    setAwaitingCause(current => current.filter(id => !gone.has(id)));
    setDrafts(current =>
      ids.some(id => id in current) ? Object.fromEntries(Object.entries(current).filter(([id]) => !gone.has(id))) : current,
    );
  };
  const settled = (row: WeeklyCommitment) => settledAll([row.id]);
  /** A justificativa que vai junto do apontamento: a gravada ou a escrita antes do Status. */
  const justificationOf = (row: WeeklyCommitment) => row.justification ?? drafts[row.id];
  const setStatus = async (row: WeeklyCommitment, value: string) => {
    if (value === 'Sim') {
      // Sim já gravado: desistir do Não pendente não precisa de ida ao servidor.
      if (row.fulfilled === true) return settled(row);
      if (await run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: true, justification: justificationOf(row) }, row.id))
        settled(row);
      return;
    }
    if (value === 'Não' && row.fulfilled !== false) setAwaitingCause(ids => (ids.includes(row.id) ? ids : [...ids, row.id]));
  };
  const setCause = async (row: WeeklyCommitment, cause: string) => {
    if (!cause) return;
    if (
      await run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: false, cause, justification: justificationOf(row) }, row.id)
    )
      settled(row);
  };
  const saveJustification = (row: WeeklyCommitment, justification: string) => {
    // Sem Status ainda, o texto fica na linha e sobe com o Sim ou com a causa.
    if (row.fulfilled === undefined) {
      setDrafts(current =>
        justification.trim()
          ? { ...current, [row.id]: justification }
          : Object.fromEntries(Object.entries(current).filter(([id]) => id !== row.id)),
      );
      return;
    }
    if (justification === (row.justification ?? '')) return;
    return run({ type: 'record_fulfillment', commitmentId: row.id, fulfilled: row.fulfilled, cause: row.cause, justification }, row.id);
  };
  const toggleSelect = (row: WeeklyCommitment) =>
    setSelected(current => {
      const next = new Set(current);
      if (!next.delete(row.id)) next.add(row.id);
      return next;
    });
  /** Apontamento em lote (26/10/2026): barra de seleção e alça de arrastar mandam UM comando com N
   * linhas, uma ida só ao servidor, em vez de uma gravação por linha. */
  const recordMany = async (items: FulfillmentItem[], skipped: { count: number; why: string }) => {
    if (!items.length) {
      toast({
        title: skipped.count ? `Nenhuma linha recebeu o valor: ${skipped.why}.` : 'Nada a aplicar: as linhas já estão assim.',
        tone: 'info',
      });
      return false;
    }
    const ok = await run({ type: 'record_fulfillments', items }, 'lote');
    if (ok) {
      settledAll(items.map(item => item.commitmentId));
      toast({
        title: `${items.length} ${items.length === 1 ? 'linha apontada' : 'linhas apontadas'}.`,
        description: skipped.count ? `${skipped.count} ${skipped.count === 1 ? 'ficou' : 'ficaram'} de fora: ${skipped.why}.` : undefined,
        tone: 'success',
      });
    }
    return ok;
  };
  const applyBulk = async (choice: BulkChoice) => {
    const { items, skipped } = bulkFulfillmentItems(selectedRows, choice);
    if (await recordMany(items, { count: skipped, why: choice.status === 'Não' ? 'Não sem causa' : 'sem Status' })) setSelected(new Set());
  };
  /** A alça copia a célula de origem nas linhas por onde passou, como no Sheets, respeitando as regras
   * da planilha: Não precisa de causa (sem ela, a linha fica aguardando a causa, como no clique); a causa
   * só entra em linha com Não; a justificativa em linha sem Status fica como rascunho. */
  const fill = (column: FillColumn, sourceId: string, targetIds: string[]) => {
    const byId = new Map(filterRows.map(r => [r.id, r]));
    const source = byId.get(sourceId);
    if (!source) return;
    const targets = targetIds.flatMap(id => byId.get(id) ?? []);
    const items: FulfillmentItem[] = [];
    const pendingNo: string[] = [];
    const draftFor: Record<string, string> = {};
    let skipped = 0;
    let why = '';
    if (column === 'status') {
      const status = statusOf(source);
      if (!status) return void toast({ title: 'A linha de origem está sem Status.', tone: 'info' });
      for (const t of targets) {
        if (status === 'Sim') items.push({ commitmentId: t.id, fulfilled: true, justification: justificationOf(t) });
        else if (t.cause ?? source.cause)
          items.push({ commitmentId: t.id, fulfilled: false, cause: t.cause ?? source.cause, justification: justificationOf(t) });
        else pendingNo.push(t.id);
      }
    } else if (column === 'causas') {
      if (!source.cause) return void toast({ title: 'A linha de origem está sem causa.', tone: 'info' });
      why = 'sem Não';
      for (const t of targets) {
        if (statusOf(t) === 'Não')
          items.push({ commitmentId: t.id, fulfilled: false, cause: source.cause, justification: justificationOf(t) });
        else skipped++;
      }
    } else {
      const text = justificationOf(source) ?? '';
      for (const t of targets) {
        if (t.fulfilled === undefined) draftFor[t.id] = text;
        else if ((t.justification ?? '') !== text)
          items.push({ commitmentId: t.id, fulfilled: t.fulfilled, cause: t.cause, justification: text });
      }
    }
    if (pendingNo.length) setAwaitingCause(ids => [...ids, ...pendingNo.filter(id => !ids.includes(id))]);
    if (Object.keys(draftFor).length) setDrafts(current => ({ ...current, ...draftFor }));
    // Só marcas locais (Não aguardando causa, rascunhos): nada a gravar ainda.
    if (!items.length && (pendingNo.length || Object.keys(draftFor).length)) return;
    void recordMany(items, { count: skipped, why });
  };
  /** Sim marcado por engano não tinha volta: o Status só trocava para Não (pedido da obra, 11/10/2026).
   * O Não ainda pendente só sai da marca local; o apontamento gravado pergunta e vai ao servidor. */
  const clearFulfillment = async (row: WeeklyCommitment) => {
    if (row.fulfilled === undefined) return settled(row);
    const ok = await confirm({
      title: `Limpar o apontamento de “${row.name}”?`,
      description: 'O Sim/Não, a causa e a justificativa saem; a linha continua.',
      confirmLabel: 'Limpar',
    });
    if (ok && (await run({ type: 'clear_fulfillment', commitmentId: row.id }, row.id))) {
      settled(row);
      toast({ title: 'Apontamento limpo.', description: `“${row.name}” voltou a ficar sem Status.`, tone: 'success' });
    }
  };
  const actions = useLiveActions<RowActions>({
    assignCompany,
    moveWeek,
    saveStart,
    saveEnd: (row, endDate) => save(row, { endDate }),
    saveName: (row, name) => save(row, { name }),
    assignTeam,
    setStatus,
    setCause,
    saveJustification,
    carry,
    openPendency: row => setPendencyFor(row.id),
    remove: removeRow,
    clearFulfillment,
    toggleSelect,
    fill,
  });
  /** Resolve `true` só com a linha criada: é o sinal para a linha em branco limpar o rascunho. */
  const createRow = (draft: Draft) =>
    enqueue('nova', async () => {
      const company = draft.supplier.trim();
      let teamId: string | undefined;
      let created = '';
      if (draft.teamName.trim() && company) {
        teamId = teamsOfCompany(company).find(t => textKey(t.name) === textKey(draft.teamName))?.id;
        if (!teamId) {
          teamId = await execute({
            type: 'create_team',
            workId,
            company,
            name: draft.teamName.trim(),
            weeklyCapacity: NEW_TEAM_CAPACITY,
          });
          created = draft.teamName.trim();
        }
      }
      await execute({
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

  // Levar para a próxima só mexe na semana seguinte, e é ela que o servidor confere: a linha de
  // uma semana encerrada pode ser levada por quem não é admin, desde que a próxima esteja aberta.
  const canCarryRow = (row: WeeklyCommitment) => !viewer && canEditWeek(addDays(row.weekStart, 7), planning.today, actor.role);
  // Tour "Como usar": cada botão da coluna Apontamento leva a marca na primeira linha da tela que o tem,
  // para o valor do `data-tour` não se repetir.
  const firstWith = (button: keyof FollowUp) =>
    [...previousShown, ...rows, ...nextShown].find(
      row => followUpOf(row, statusOf(row), canCarryRow(row), !!around, developer, viewer)[button],
    )?.id;
  const tourRows = { carry: firstWith('carry'), restriction: firstWith('restriction'), clear: firstWith('clear') };
  /** Tudo o que uma linha precisa, em valores simples: a linha memorizada compara por valor e só
   * redesenha a que mudou (um Status numa semana de 120 linhas redesenhava todas, 11/10/2026). */
  const rowProps = (row: WeeklyCommitment, index: number, scope: WeekScope = 'analisada'): RowProps => {
    const company = companyOf(row);
    return {
      row,
      line: scope === 'analisada' ? String(index + 1) : `${index + 1} da semana ${weekNumber(row.weekStart)}`,
      saving: busy === row.id,
      selected: !viewer && selected.has(row.id),
      draftJustification: drafts[row.id] ?? '',
      status: statusOf(row),
      company,
      teamName: teamOf(row)?.name ?? '',
      teamOptions: teamsOfCompany(company).map(t => t.name),
      companies,
      weekOptions: weekChoices,
      nextWeek: weekNumber(addDays(row.weekStart, 7)),
      canCarry: canCarryRow(row),
      carried: alreadyCarried(row),
      carryAny: !!around,
      muted: scope === 'anterior',
      developer,
      viewer,
      // A anterior só aceita apontamento e "Levar", mesmo aberta: mexer nas linhas dela é escolhê-la no seletor.
      readOnly: scope === 'anterior' ? true : scope === 'proxima' ? nextReadOnly : readOnly,
      tour: {
        cells: scope === 'analisada' && index === 0,
        carry: tourRows.carry === row.id,
        restriction: tourRows.restriction === row.id,
        clear: tourRows.clear === row.id,
      },
      actions,
    };
  };
  /** As faixas das semanas vizinhas: a anterior em cima, a próxima embaixo, a analisada no meio. */
  const neighborSections = around
    ? {
        previous: around.previous
          ? { scope: 'anterior' as const, start: around.previous, rows: previousShown, total: previousRows.length }
          : undefined,
        next: { scope: 'proxima' as const, start: around.next, rows: nextShown, total: nextRows.length },
      }
    : undefined;
  const band = (scope: WeekScope, start: string, shown: number, total: number) => ({
    scope,
    label: `Semana ${weekNumber(start)} · ${dayMonth(start)} a ${dayMonth(addDays(start, 5))}`,
    stats: ppc(commitments.filter(c => c.weekStart === start)),
    shown,
    total,
    note:
      scope === 'anterior'
        ? 'Só apontamento e "Levar p/ próxima". Para editar as linhas, escolha esta semana no seletor.'
        : scope === 'proxima' && nextReadOnly && !viewer
          ? 'Semana encerrada: só apontamento.'
          : undefined,
  });
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
              {developer ? ' ou gere uma restrição no longo prazo' : ''}; a linha original fica como registro do que aconteceu. Marcou por
              engano? "Limpar apontamento" devolve a linha ao estado sem Status.
            </p>
            <p>
              A semana fica aberta até a terça-feira seguinte. Depois disso ela é encerrada: incluir, editar ou excluir linhas, só
              administradores. Realizado, causa e justificativa podem ser lançados ou corrigidos a qualquer momento.
            </p>
            <p>
              "Semanas vizinhas" mostra a semana anterior acima e a próxima abaixo, na mesma planilha e com os mesmos filtros: filtre a
              Empresa para planejar um empreiteiro de cada vez. Da anterior, aponte o que faltar e leve para a semana analisada o que não
              foi feito ou continua; da analisada, leve para a próxima. Nessa visão qualquer linha pode ser levada, não só a do Não.
            </p>
            <p>
              A semana 1 vem das configurações da obra; sem ela, é a primeira semana com linha na planilha. O número de cada semana é
              contado a partir daí.
            </p>
          </>
        }
      >
        <SectionNav workId={workId} section="planilha" />
      </TabHeader>
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
        <label data-tour="curto-semana" className="flex items-center gap-2">
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
        <span data-tour="curto-semana-atual">
          Semana atual: <span className="tabular-nums text-slate-900">{weekNumber(currentWeek)}</span>
          <Link className="text-link ml-2 font-normal" href={workPath(workId, 'configuracoes')}>
            {weekOneStart ? 'alterar semana 1' : 'definir semana 1'}
          </Link>
        </span>
        <span data-tour="curto-ppc">
          PPC: <span className="tabular-nums text-slate-900">{stats.planned ? `${Math.round(stats.percent)}%` : '—'}</span>
          {stats.pending > 0 && <span className="ml-1 font-normal text-slate-400">({stats.pending} sem status)</span>}
        </span>
        {/* A gravação segue por trás; a planilha não trava. O aviso só diz que ainda há algo subindo. */}
        {busy && (
          <span className="font-normal text-amber-700" role="status">
            Gravando…
          </span>
        )}
        <label
          data-tour="curto-vizinhas"
          className="flex items-center gap-1.5"
          title="Mostra a semana anterior e a próxima na mesma planilha"
        >
          <input type="checkbox" className="accent-primary" checked={neighbors} onChange={e => setNeighbors(e.target.checked)} />
          Semanas vizinhas
        </label>
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {/* O `HelpNote` é comum às telas: a marca do tour fica num invólucro daqui. */}
          <span data-tour="curto-como-preencher" className="inline-flex">
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
          </span>
          <Link data-tour="curto-recursos" className="text-link" href={workPath(workId, 'configuracoes')}>
            {viewer ? 'Consultar recursos' : 'Gerenciar empreiteiros e equipes'}
          </Link>
          {/* PDFs no formato da planilha da obra: antes, a janela de empreiteiros e ordem; depois, uma aba
            própria já no diálogo de impressão ("Salvar como PDF"), com o nome "PCP-<código> - Semana N". */}
          <button data-tour="curto-pdf-planejamento" type="button" className="button-secondary" onClick={() => setPrinting('planejamento')}>
            PDF do planejamento
          </button>
          <button data-tour="curto-pdf-fechamento" type="button" className="button-secondary" onClick={() => setPrinting('fechamento')}>
            PDF do fechamento
          </button>
          {wide && (
            <button
              data-tour="curto-ajustar"
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
        <div data-tour="curto-semana-encerrada" className="mt-3">
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
      {selectedRows.length > 0 && (
        <div className="mt-3">
          <BulkBar
            count={selectedRows.length}
            total={shownRows.length}
            rows={selectedRows}
            causes={NON_FULFILLMENT_CAUSES}
            busy={busy === 'lote'}
            onApply={applyBulk}
            onSelectAll={() => setSelected(new Set(shownRows.map(r => r.id)))}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}
      {filtered && (
        <div data-tour="curto-limpar-filtros" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
        <div data-tour="curto-ordem" className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
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
            <table className="table-fixed border-collapse text-left text-xs" style={{ width: tableWidth }}>
              <colgroup>
                {visibleColumns.map(column => (
                  <col key={column} style={{ width: columnWidths.widths[column] }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-20 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-[0_1px_0_rgb(226_232_240)]">
                <tr className="text-xs font-semibold normal-case tracking-normal text-slate-400">
                  <th colSpan={viewer ? 6 : 7} className="px-2 pt-1.5" />
                  {columns.map(({ day, date }) => (
                    <th key={day} scope="col" className="border-l border-slate-200 px-1 pt-1.5 text-center tabular-nums">
                      {/* Com as vizinhas, cada faixa traz o próprio período: a data do dia valeria só para a do meio. */}
                      {around ? '' : dayMonth(date)}
                    </th>
                  ))}
                  <th colSpan={showFollowUp ? 5 : 4} />
                </tr>
                <tr data-tour="curto-colunas" className="border-b border-slate-200">
                  {!viewer && (
                    <th scope="col" data-tour="curto-marcar" className="px-1 py-1.5">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={allShownSelected}
                        aria-label={allShownSelected ? 'Desmarcar todas as linhas' : 'Marcar todas as linhas visíveis'}
                        title={allShownSelected ? 'Desmarcar todas' : 'Marcar todas as linhas visíveis'}
                        onChange={() => setSelected(allShownSelected ? new Set() : new Set(shownRows.map(r => r.id)))}
                      />
                    </th>
                  )}
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
                  {showFollowUp && (
                    <th scope="col" className="relative overflow-hidden px-2 py-1.5">
                      {resizeHandle('seguimento', 'Apontamento')}
                      Apontamento
                    </th>
                  )}
                  <th scope="col">
                    <span className="sr-only">Excluir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {neighborSections?.previous && (
                  <>
                    <WeekBandRow
                      band={band(
                        'anterior',
                        neighborSections.previous.start,
                        neighborSections.previous.rows.length,
                        neighborSections.previous.total,
                      )}
                      span={visibleColumns.length}
                    />
                    {neighborSections.previous.rows.map((row, index) => (
                      <SheetRow key={row.id} {...rowProps(row, index, 'anterior')} showFollowUp={showFollowUp} />
                    ))}
                  </>
                )}
                {around && (
                  <WeekBandRow
                    band={band('analisada', week, rows.length, weekRows.length)}
                    span={visibleColumns.length}
                    tourId="curto-faixa-semana"
                  />
                )}
                {rows.map((row, index) => (
                  <SheetRow key={row.id} {...rowProps(row, index)} showFollowUp={showFollowUp} />
                ))}
                {!readOnly && (
                  <BlankRow
                    week={week}
                    weekEnd={weekEnd}
                    weekNumber={weekNumber(week)}
                    companies={companies}
                    teamNames={company => teamsOfCompany(company).map(t => t.name)}
                    onCreate={createRow}
                    trailingSpan={showFollowUp ? 11 : 10}
                  />
                )}
                {neighborSections && (
                  <>
                    <WeekBandRow
                      band={band('proxima', neighborSections.next.start, neighborSections.next.rows.length, neighborSections.next.total)}
                      span={visibleColumns.length}
                    />
                    {neighborSections.next.rows.map((row, index) => (
                      <SheetRow key={row.id} {...rowProps(row, index, 'proxima')} showFollowUp={showFollowUp} />
                    ))}
                  </>
                )}
              </tbody>
            </table>
            {emptyState && !around && <div className="border-t border-slate-100 p-4">{emptyState}</div>}
          </div>
        ) : (
          /* No celular, uma linha é um cartão: a tabela larga só serviria para rolar de lado. A barra de
            seleção fica fixa no rodapé; o espaço embaixo evita que ela cubra o último cartão. */
          <div className={`space-y-3 ${selectedRows.length ? 'pb-40' : ''}`} role="region" aria-label={sheetLabel}>
            {neighborSections?.previous && (
              <>
                <WeekBandCard
                  band={band(
                    'anterior',
                    neighborSections.previous.start,
                    neighborSections.previous.rows.length,
                    neighborSections.previous.total,
                  )}
                />
                {neighborSections.previous.rows.map((row, index) => (
                  <SheetCard key={row.id} {...rowProps(row, index, 'anterior')} />
                ))}
              </>
            )}
            {around && <WeekBandCard band={band('analisada', week, rows.length, weekRows.length)} tourId="curto-faixa-semana" />}
            {rows.map((row, index) => (
              <SheetCard key={row.id} {...rowProps(row, index)} />
            ))}
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
            {neighborSections && (
              <>
                <WeekBandCard
                  band={band('proxima', neighborSections.next.start, neighborSections.next.rows.length, neighborSections.next.total)}
                />
                {neighborSections.next.rows.map((row, index) => (
                  <SheetCard key={row.id} {...rowProps(row, index, 'proxima')} />
                ))}
              </>
            )}
            {emptyState && !around && <div className="rounded-xl border border-slate-200 bg-white p-4">{emptyState}</div>}
          </div>
        )}
      </div>

      {developer && pendencyRow && (
        <PendencyDialog
          row={pendencyRow}
          wagons={wagons}
          activities={activities}
          workId={workId}
          actorId={actor.id}
          weekLabel={weekNumber(pendencyRow.weekStart)}
          execute={execute}
          onClose={() => setPendencyFor('')}
        />
      )}
    </>
  );
}

const marked = (row: WeeklyCommitment, day: number) => {
  const date = addDays(row.weekStart, day - 1);
  return row.startDate <= date && date <= row.endDate;
};

type RowProps = {
  row: WeeklyCommitment;
  /** Número da linha nos rótulos de acessibilidade; nas semanas vizinhas leva a semana junto. */
  line: string;
  /** A linha está gravando agora (filete âmbar). Nada trava: a célula já mostra o valor escolhido
   * (projeção adiantada do provedor) e a fila guarda a ordem das gravações. */
  saving: boolean;
  /** Marcada para o apontamento em lote. */
  selected: boolean;
  /** Justificativa escrita antes do Status, ainda não gravada. */
  draftJustification: string;
  /** '' | 'Sim' | 'Não', já contando o Não pendente de causa. */
  status: string;
  company: string;
  teamName: string;
  teamOptions: string[];
  companies: string[];
  weekOptions: { value: string; label: string }[];
  nextWeek: number;
  canCarry: boolean;
  /** Já existe a mesma linha na semana seguinte. */
  carried: boolean;
  /** Semanas vizinhas: qualquer linha pode ser levada, não só a do Não. */
  carryAny: boolean;
  /** Linha da semana anterior nas vizinhas, desenhada esmaecida. */
  muted: boolean;
  developer: boolean;
  viewer: boolean;
  readOnly: boolean;
  tour: RowTour;
  actions: RowActions;
};

type FollowUp = { carry: boolean; restriction: boolean; clear: boolean };
/** Os botões da coluna Apontamento de uma linha. A mesma regra desenha a linha e escolhe onde ficam as
 * marcas do tour. Apontamento é livre mesmo na semana encerrada, por isso o "Limpar" olha só o leitor. */
const followUpOf = (
  row: WeeklyCommitment,
  status: string,
  canCarry: boolean,
  carryAny: boolean,
  developer: boolean,
  viewer: boolean,
): FollowUp => ({
  carry: canCarry && (row.fulfilled === false || carryAny),
  restriction: row.fulfilled === false && canCarry && developer,
  clear: !viewer && status !== '',
});
/** As marcas do tour "Como usar" (`data-tour`) que a linha leva: as das células e a do ✕ só na primeira
 * linha da semana analisada; a de cada botão de Apontamento, na primeira linha da tela que tem o botão. */
type RowTour = FollowUp & { cells: boolean };

/** Peças com marca do tour. O valor vai escrito por extenso em `tourId` (o teste dos alvos lê o código) e só
 * vira `data-tour` quando `tour` é verdadeiro, para não se repetir em cada linha da planilha. */
function Cell({
  tour,
  tourId,
  className = 'px-1 py-1',
  children,
}: {
  tour: boolean;
  tourId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td data-tour={tour ? tourId : undefined} className={className}>
      {children}
    </td>
  );
}
function Mark({ tour, tourId, className, children }: { tour: boolean; tourId: string; className?: string; children: ReactNode }) {
  return (
    <div data-tour={tour ? tourId : undefined} className={className}>
      {children}
    </div>
  );
}
function RowButton({ tour, tourId, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tour: boolean; tourId: string }) {
  return <button type="button" {...props} data-tour={tour ? tourId : undefined} />;
}

/** Os controles de uma linha são os mesmos na tabela (telas largas) e no cartão (celular): só a
 * disposição muda, a gravação é uma. Os campos de texto recebem a classe de quem os monta,
 * porque a célula sem borda da tabela não se sustenta sozinha dentro de um cartão. */
function rowControls({
  row,
  line,
  saving,
  selected,
  draftJustification,
  status,
  company,
  teamName,
  teamOptions,
  companies,
  weekOptions,
  nextWeek,
  canCarry,
  carried,
  carryAny,
  developer,
  viewer,
  readOnly,
  tour,
  actions,
}: RowProps) {
  const missingCause = status === 'Não' && !row.cause;
  const { carry: carryable, restriction, clear: clearable } = followUpOf(row, status, canCarry, carryAny, developer, viewer);
  // Enter desce e Shift+Enter sobe na mesma coluna, como no Sheets; as setas só nos campos de texto.
  const keys = (arrows: boolean) => (event: KeyboardEvent<HTMLElement>) => void handleRowKey(event, { arrows });
  return {
    saving,
    missingCause,
    select: viewer ? null : (
      <input
        type="checkbox"
        className="accent-primary"
        checked={selected}
        aria-label={`Marcar a linha ${line}`}
        onChange={() => actions.toggleSelect(row)}
      />
    ),
    /** A alça de arrastar do Sheets, nas células de apontamento; a célula precisa ser `relative group`. */
    fillHandle: (column: FillColumn) => (viewer ? null : <FillHandle rowId={row.id} column={column} onFill={actions.fill} />),
    company: (
      <PillCombo
        value={company}
        options={companies}
        disabled={readOnly}
        ariaLabel={`Empresa da linha ${line}`}
        placeholder="Empresa"
        onCommit={value => actions.assignCompany(row, value)}
      />
    ),
    week: (
      <PillSelect
        value={row.weekStart}
        disabled={readOnly}
        ariaLabel={`Semana da linha ${line}`}
        title={`${dayMonth(row.weekStart)} a ${dayMonth(addDays(row.weekStart, 5))}`}
        options={weekOptions}
        dataCol="semana"
        onKeyDown={keys(false)}
        onChange={value => actions.moveWeek(row, value)}
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
        data-col="inicio"
        aria-label={`Início da linha ${line}`}
        onKeyDown={keys(false)}
        onBlur={e => {
          if (e.target.value && e.target.value !== row.startDate) actions.saveStart(row, e.target.value);
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
        data-col="termino"
        aria-label={`Término da linha ${line}`}
        onKeyDown={keys(false)}
        onBlur={e => {
          if (e.target.value && e.target.value !== row.endDate) actions.saveEnd(row, e.target.value);
        }}
      />
    ),
    name: (className = 'cell') => (
      <input
        key={row.name}
        className={className}
        defaultValue={row.name}
        disabled={readOnly}
        data-col="atividade"
        aria-label={`Atividade da linha ${line}`}
        onBlur={e => {
          const name = e.target.value.trim();
          // Linha sem atividade não existe: apagar o nome só devolve o que estava.
          if (!name) e.target.value = row.name;
          else if (name !== row.name) actions.saveName(row, name);
        }}
        onKeyDown={keys(true)}
      />
    ),
    team: (
      <PillCombo
        value={teamName}
        options={teamOptions}
        disabled={readOnly}
        allowCreate={!!company}
        emptyHint={company ? 'Nenhuma equipe cadastrada. Digite para criar.' : 'Escolha a empresa primeiro.'}
        createHint={TEAM_CREATE_HINT}
        createLabel={text => `Criar equipe “${text}” em ${company}`}
        ariaLabel={`Equipe da linha ${line}`}
        placeholder="Equipe"
        onCommit={value => actions.assignTeam(row, value)}
      />
    ),
    statusPill: (
      <PillSelect
        value={status}
        tone={status === 'Sim' ? 'success' : status === 'Não' ? 'danger' : 'neutral'}
        // Realizado, causa e justificativa ficam abertos mesmo na semana encerrada (09/10/2026).
        disabled={viewer}
        ariaLabel={`Status da linha ${line}`}
        options={[
          { value: 'Sim', label: 'Sim' },
          { value: 'Não', label: 'Não' },
        ]}
        dataCol="status"
        onKeyDown={keys(false)}
        onChange={value => actions.setStatus(row, value)}
      />
    ),
    causePill: (
      <PillSelect
        value={row.cause ?? ''}
        tone={missingCause ? 'required' : 'neutral'}
        disabled={viewer || status !== 'Não'}
        ariaLabel={`Causa da linha ${line}`}
        placeholder={missingCause ? 'Escolha a causa' : ''}
        title={status !== 'Não' ? 'A causa só é pedida quando o Status é Não.' : undefined}
        options={NON_FULFILLMENT_CAUSES.map(cause => ({ value: cause, label: cause }))}
        dataCol="causas"
        onKeyDown={keys(false)}
        onChange={value => actions.setCause(row, value)}
      />
    ),
    // Aberta mesmo sem Status: o texto fica na linha (rascunho) e sobe junto com o Sim ou a causa.
    justification: (className = 'cell') => (
      <input
        key={row.justification ?? draftJustification}
        className={className}
        defaultValue={row.justification ?? draftJustification}
        disabled={viewer}
        data-col="justificativa"
        aria-label={`Justificativa da linha ${line}`}
        title={row.fulfilled === undefined && draftJustification ? 'Será gravada junto com o Status.' : undefined}
        onKeyDown={keys(true)}
        onBlur={e => actions.saveJustification(row, e.target.value)}
      />
    ),
    followUp:
      carryable || clearable ? (
        <>
          {carryable && (
            <RowButton
              tour={tour.carry}
              tourId="curto-levar"
              className="button-ghost justify-start whitespace-nowrap px-2 py-1 text-xs"
              aria-label={`Levar ${row.name} para a próxima semana`}
              title={
                carried
                  ? `Já existe uma linha com esta atividade e este fornecedor na semana ${nextWeek}. Levar de novo cria outra.`
                  : `Levar para a próxima: cria a mesma linha na semana ${nextWeek}, sem apontamento`
              }
              onClick={() => actions.carry(row)}
            >
              {carried ? 'Levar de novo' : 'Levar ›'}
            </RowButton>
          )}
          {restriction && (
            <RowButton
              tour={tour.restriction}
              tourId="curto-gerar-restricao"
              className="button-ghost justify-start whitespace-nowrap px-2 py-1 text-xs"
              aria-haspopup="dialog"
              aria-label={`Gerar restrição a partir de ${row.name}`}
              title="Gerar restrição no longo prazo a partir desta falha"
              onClick={() => actions.openPendency(row)}
            >
              Restrição
            </RowButton>
          )}
          {clearable && (
            <RowButton
              tour={tour.clear}
              tourId="curto-limpar-apontamento"
              className="button-ghost justify-start whitespace-nowrap px-2 py-1 text-xs text-slate-500"
              aria-label={`Limpar o apontamento de ${row.name}`}
              title={
                row.fulfilled === undefined
                  ? 'Limpar apontamento: desfaz o Não que ainda aguarda a causa'
                  : 'Limpar apontamento: tira o Sim/Não, a causa e a justificativa; a linha continua'
              }
              onClick={() => actions.clearFulfillment(row)}
            >
              Limpar
            </RowButton>
          )}
        </>
      ) : null,
    deleteButton: readOnly ? null : (
      <RowButton
        tour={tour.cells}
        tourId="curto-linha-excluir"
        onClick={() => actions.remove(row)}
        aria-label={`Excluir a linha ${row.name}`}
        title="Excluir linha"
        className="rounded px-1.5 text-slate-300 transition-colors hover:bg-danger-soft hover:text-danger"
      >
        ✕
      </RowButton>
    ),
  };
}

/** Uma linha da tabela. Memorizada por valor (`sameProps`): o Status de uma linha não redesenha as
 * outras 119 com seus combos, e a recarga que troca os objetos também não. */
const SheetRow = memo(function SheetRow(props: RowProps & { showFollowUp: boolean }) {
  const { row, showFollowUp, muted, tour } = props;
  const c = rowControls(props);
  return (
    <tr
      data-row-id={row.id}
      aria-busy={c.saving || undefined}
      className={`border-t border-slate-100 ${c.saving ? 'bg-amber-50/40 shadow-[inset_3px_0_0_#f59e0b]' : c.missingCause ? 'bg-rose-50/40' : muted ? 'bg-slate-50 hover:bg-slate-100/60' : 'hover:bg-slate-50/60'}`}
    >
      {c.select && <td className="px-1 py-1 text-center">{c.select}</td>}
      <Cell tour={tour.cells} tourId="curto-linha-empresa">
        {c.company}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-semana">
        {c.week}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-inicio">
        {c.start()}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-termino">
        {c.end()}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-atividade">
        {c.name()}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-equipe">
        {c.team}
      </Cell>
      {WEEKDAYS.map(day => (
        <Cell
          key={day}
          tour={tour.cells && day === 1}
          tourId="curto-linha-dias"
          className={`border-l border-slate-100 px-1 py-1 text-center font-bold ${marked(row, day) ? 'bg-primary-soft text-primary-ink' : 'text-slate-200'}`}
        >
          {marked(row, day) ? 'x' : ''}
        </Cell>
      ))}
      <Cell tour={tour.cells} tourId="curto-linha-status" className="group relative px-1 py-1">
        {c.statusPill}
        {c.fillHandle('status')}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-causa" className="group relative px-1 py-1">
        {c.causePill}
        {c.fillHandle('causas')}
      </Cell>
      <Cell tour={tour.cells} tourId="curto-linha-justificativa" className="group relative px-1 py-1">
        {c.justification()}
        {c.fillHandle('justificativa')}
      </Cell>
      {showFollowUp && <td className="px-1 py-1">{c.followUp && <div className="flex flex-nowrap gap-1">{c.followUp}</div>}</td>}
      <td className="px-1 py-1">{c.deleteButton}</td>
    </tr>
  );
}, sameProps);

/** A mesma linha como cartão do celular, memorizada do mesmo jeito. */
const SheetCard = memo(function SheetCard(props: RowProps) {
  const { row, line, muted, tour } = props;
  const c = rowControls(props);
  return (
    <article
      aria-label={`Linha ${line}: ${row.name}`}
      className={`rounded-xl border p-3 shadow-sm ${c.saving ? 'border-amber-200 bg-amber-50/60' : c.missingCause ? 'border-rose-200 bg-rose-50/40' : muted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex items-start gap-2">
        {c.select && <span className="flex h-9 items-center">{c.select}</span>}
        <Mark tour={tour.cells} tourId="curto-linha-atividade" className="min-w-0 flex-1">
          {c.name('field py-1.5 font-semibold')}
        </Mark>
        {c.deleteButton}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CardField label="Empresa" tour={tour.cells} tourId="curto-linha-empresa">
          {c.company}
        </CardField>
        <CardField label="Equipe" tour={tour.cells} tourId="curto-linha-equipe">
          {c.team}
        </CardField>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <CardField label="Semana" tour={tour.cells} tourId="curto-linha-semana">
          {c.week}
        </CardField>
        <CardField label="Início" tour={tour.cells} tourId="curto-linha-inicio">
          {c.start('field py-1.5 text-xs tabular-nums')}
        </CardField>
        <CardField label="Término" tour={tour.cells} tourId="curto-linha-termino">
          {c.end('field py-1.5 text-xs tabular-nums')}
        </CardField>
      </div>
      <Mark tour={tour.cells} tourId="curto-linha-dias" className="mt-2">
        <ul className="flex flex-wrap gap-1" aria-label={`Dias da linha ${line}`}>
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
      </Mark>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <CardField label="Status" tour={tour.cells} tourId="curto-linha-status">
          {c.statusPill}
        </CardField>
        <CardField label="Causa" tour={tour.cells} tourId="curto-linha-causa">
          {c.causePill}
        </CardField>
      </div>
      <CardField label="Justificativa" className="mt-2" tour={tour.cells} tourId="curto-linha-justificativa">
        {c.justification('field py-1.5 text-xs')}
      </CardField>
      {c.followUp && <div className="mt-2 flex flex-wrap gap-1">{c.followUp}</div>}
    </article>
  );
}, sameProps);

type WeekScope = 'anterior' | 'analisada' | 'proxima';
const SCOPE_TITLES: Record<WeekScope, string> = { anterior: 'Semana anterior', analisada: 'Semana analisada', proxima: 'Próxima semana' };
type WeekBand = { scope: WeekScope; label: string; stats: ReturnType<typeof ppc>; shown: number; total: number; note?: string };

/** Cabeçalho de cada semana nas vizinhas: qual é, o período, as linhas (quantas passam no filtro) e o PPC. */
function WeekBandContent({ band }: { band: WeekBand }) {
  const count =
    band.total === 0
      ? 'sem linhas'
      : band.shown === band.total
        ? `${band.total} ${band.total === 1 ? 'linha' : 'linhas'}`
        : `${band.shown} de ${band.total} linhas com esses filtros`;
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="font-bold text-slate-800">{SCOPE_TITLES[band.scope]}</span>
      <span className="tabular-nums">{band.label}</span>
      <span>{count}</span>
      {band.stats.planned > 0 && (
        <span className="tabular-nums">
          PPC {Math.round(band.stats.percent)}%{band.stats.pending > 0 ? ` (${band.stats.pending} sem status)` : ''}
        </span>
      )}
      {band.note && <span className="text-slate-500">{band.note}</span>}
    </span>
  );
}

/** `tourId`: a marca do tour vai só na faixa da semana analisada, que é uma só e existe com qualquer semana 1. */
function WeekBandRow({ band, span, tourId }: { band: WeekBand; span: number; tourId?: string }) {
  return (
    <tr data-tour={tourId} className="border-t border-slate-200 bg-slate-100">
      <th scope="rowgroup" colSpan={span} className="px-2 py-1.5 text-left text-xs font-normal text-slate-600">
        <WeekBandContent band={band} />
      </th>
    </tr>
  );
}

function WeekBandCard({ band, tourId }: { band: WeekBand; tourId?: string }) {
  return (
    <h3 data-tour={tourId} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-normal text-slate-600">
      <WeekBandContent band={band} />
    </h3>
  );
}

/** Liga/desliga guardado no navegador. Carrega depois da montagem, como as larguras das colunas: no
 * servidor não há localStorage. Sem armazenamento (janela anônima), começa desligado e só não lembra. */
function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(key) === '1') setOn(true);
    } catch {}
  }, [key]);
  const set = (next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch {}
  };
  return [on, set];
}

/** Rótulo curto sobre um controle do cartão: no celular não há cabeçalho de coluna dizendo o que é. */
function CardField({
  label,
  children,
  className = '',
  tour = false,
  tourId,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tour?: boolean;
  tourId?: string;
}) {
  return (
    <div data-tour={tour ? tourId : undefined} className={`min-w-0 ${className}`}>
      <span className="mb-0.5 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/** A série do PPC em barras, SVG inline e sem biblioteca. O desenho é decorativo de propósito
 * (`aria-hidden`): quem lê por leitor de tela lê a tabela oculta, com os mesmos números — a tela
 * não pode depender do gráfico. Doze semanas cabem sem espremer a barra e já mostram tendência. */
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
function BlankRow({ week, weekEnd, weekNumber, companies, teamNames, onCreate, trailingSpan }: BlankProps & { trailingSpan: number }) {
  const { draft, creating, nameInput, change, setCompany, create } = useDraft(onCreate, teamNames);
  /** Só cria quando o foco deixa a linha em branco: andar de célula em célula — inclusive abrir a
   * lista suspensa de empresa ou equipe — é continuar preenchendo a mesma linha. */
  const leave = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (!event.currentTarget.closest('tr')?.contains(next) && !next?.closest('[data-sheet-popover]')) create(draft);
  };
  return (
    <tr data-tour="curto-linha-nova" className="border-t border-slate-100 bg-primary-soft/40" onBlur={leave}>
      {/* A coluna da caixa de marcar: a linha em branco só existe para quem edita, que sempre a tem. */}
      <td className="px-1 py-1" />
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
          createHint={TEAM_CREATE_HINT}
          createLabel={text => `Criar equipe “${text}” em ${draft.supplier}`}
          ariaLabel="Equipe da nova linha"
          placeholder="Equipe"
          onCommit={value => change({ teamName: value })}
        />
      </td>
      {/* `trailingSpan` acompanha a coluna "Do não cumprido", que só aparece com apontamento na semana. */}
      <td colSpan={trailingSpan} className="px-2 py-1 text-slate-400">
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
      data-tour="curto-linha-nova"
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
            createHint={TEAM_CREATE_HINT}
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
