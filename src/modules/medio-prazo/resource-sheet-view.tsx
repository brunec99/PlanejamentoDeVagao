'use client';
import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, TriangleAlert, Users } from 'lucide-react';
import type { PlanTask, Team } from '@/domain/entities';
import type { TaskSchedule, WorkCalendar } from '@/domain/plan-schedule';
import { resourceRows, resourceTasks, type ResourceRow } from '@/domain/resource-usage';
import { workPath } from '@/shared/format';
import { formatHours, hoursPerDayOf, saneTasks, workLabel } from './resource-usage-view';

/* Planilha de Recursos, no molde da visão homônima do Project: uma linha por recurso, com o Id, os
 * indicadores, o "Nome do recurso", o "Tipo" (toda equipe é recurso de trabalho), as "Iniciais",
 * o "Grupo" (aqui, a empresa da equipe), as "Unid. máximas" (a capacidade cadastrada em atividades
 * simultâneas × 100%: capacidade 2 dá 200%), o "Pico" (o maior número de tarefas no mesmo dia útil,
 * também em %), o "Trabalho" em horas (dias úteis trabalhados × jornada, sem a pausa da tarefa
 * dividida — conta do domínio) e quantas tarefas a equipe tem no
 * plano. O recurso superalocado — pico acima das unidades máximas — fica com a linha inteira em
 * vermelho e o ícone de aviso, como no Project. Clicar no cabeçalho ordena pela coluna (crescente,
 * decrescente e de volta à ordem do Id). Diferente do Project, a planilha é só de leitura: as
 * equipes são cadastradas em Configurações da obra, e o botão "Configurar recursos" leva para lá.
 * Ficam de fora as colunas de custo, calendário e código, que a obra não usa. As iniciais saem das
 * palavras do nome ("Equipe Alvenaria" → "EA"), não só da primeira letra como o Project preenche,
 * para distinguir "Eletricista" de "Encanador". O visual é o do Obra 360, sem a faixa de opções, o
 * azul e o tema escuro do Project. Linhas, iniciais e ordenação ficam em funções puras exportadas,
 * cobertas por tests/resource-views.test.ts; a carga é do domínio (src/domain/resource-usage.ts). */

export interface ResourceSheetViewProps {
  tasks: PlanTask[];
  info: ReadonlyMap<string, TaskSchedule>;
  teams: Team[];
  calendar: WorkCalendar;
  workId: string;
  className?: string;
}

// ————— Funções puras —————

const UNITS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
/** "Unid. máximas" e "Pico": atividades simultâneas × 100%, como "200%". */
export const unitsLabel = (units: number) => `${UNITS.format(Number.isFinite(units) ? units * 100 : 0)}%`;

/** Palavras que não entram nas iniciais. */
const CONNECTIVES = new Set(['a', 'e', 'o', 'as', 'os', 'da', 'de', 'do', 'das', 'dos', 'em', 'na', 'no', 'para', 'com']);
/** Iniciais das palavras do nome, até três, em maiúsculas: "Mestre de obras" → "MO". Nome de uma
 * palavra só dá uma letra, como o Project; símbolo no começo da palavra é pulado. */
export function initialsOf(name: string): string {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(word => /[\p{L}\p{N}]/u.test(word));
  const main = words.filter(word => !CONNECTIVES.has(word.toLocaleLowerCase('pt-BR')));
  return (main.length ? main : words)
    .slice(0, 3)
    .map(word => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .join('')
    .toLocaleUpperCase('pt-BR');
}

export interface ResourceSheetRow {
  id: string;
  /** Posição na ordem do cadastro (empresa e nome): o Id da planilha do Project. */
  index: number;
  name: string;
  type: 'Trabalho';
  initials: string;
  /** Empresa da equipe. */
  group: string;
  /** Unidades máximas, em atividades simultâneas. */
  capacity: number;
  /** Maior número de tarefas no mesmo dia útil. */
  peak: number;
  /** Trabalho em horas. */
  work: number;
  tasks: number;
  overallocated: boolean;
}

/** Uma linha por equipe, na ordem do domínio; a faixa das não atribuídas não é recurso e fica de fora. */
export function resourceSheetRows(rows: readonly ResourceRow[], hoursPerDay: number): ResourceSheetRow[] {
  return rows
    .filter((row): row is ResourceRow & { team: Team } => !!row.team)
    .map((row, at) => ({
      id: row.team.id,
      index: at + 1,
      name: row.team.name,
      type: 'Trabalho' as const,
      initials: initialsOf(row.team.name),
      group: row.team.company,
      capacity: row.capacity,
      peak: row.peak,
      work: row.workDays * hoursPerDay,
      tasks: row.tasks.length,
      overallocated: row.overallocated,
    }));
}

export type ResourceSheetKey = 'index' | 'name' | 'type' | 'initials' | 'group' | 'capacity' | 'peak' | 'work' | 'tasks';
export interface ResourceSort {
  key: ResourceSheetKey;
  dir: 'asc' | 'desc';
}
const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Ordena pela coluna: texto pela ordem do português (sem diferenciar acento e caixa, "Equipe 2"
 * antes de "Equipe 10"), número pelo valor; empate e ordenação desligada ficam na ordem do Id. */
export function sortResourceRows(rows: readonly ResourceSheetRow[], sort?: ResourceSort): ResourceSheetRow[] {
  const out = [...rows];
  if (!sort) return out.sort((a, b) => a.index - b.index);
  const sign = sort.dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const x = a[sort.key],
      y = b[sort.key];
    const diff = typeof x === 'number' && typeof y === 'number' ? x - y : COLLATOR.compare(String(x), String(y));
    return diff * sign || a.index - b.index;
  });
}

/** Clique no cabeçalho: crescente, depois decrescente, depois volta à ordem do Id. Outra coluna começa crescente. */
export function nextSort(current: ResourceSort | undefined, key: ResourceSheetKey): ResourceSort | undefined {
  if (current?.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : undefined;
}

// ————— Componente —————

interface SheetColumn {
  key: ResourceSheetKey | 'ind';
  label: string;
  width: number;
  right?: boolean;
  title?: string;
}
const COLUMNS: SheetColumn[] = [
  { key: 'index', label: 'Id', width: 44, right: true, title: 'Ordem do cadastro: empresa e nome' },
  { key: 'ind', label: 'Indicadores', width: 32 },
  { key: 'name', label: 'Nome do recurso', width: 220 },
  { key: 'type', label: 'Tipo', width: 84, title: 'Toda equipe é recurso de trabalho' },
  { key: 'initials', label: 'Iniciais', width: 70 },
  { key: 'group', label: 'Grupo', width: 180, title: 'Empresa (empreiteiro) da equipe' },
  { key: 'capacity', label: 'Unid. máximas', width: 92, right: true, title: 'Capacidade cadastrada: atividades simultâneas × 100%' },
  { key: 'peak', label: 'Pico', width: 70, right: true, title: 'Maior número de tarefas no mesmo dia útil × 100%' },
  { key: 'work', label: 'Trabalho', width: 92, right: true, title: 'Dias úteis das tarefas × jornada do calendário' },
  { key: 'tasks', label: 'Tarefas', width: 70, right: true, title: 'Tarefas do plano atribuídas à equipe' },
];
const TABLE_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 0);
const HEAD =
  'sticky top-0 z-20 h-11 border-b border-r border-slate-200 bg-brand-50 px-1.5 align-bottom text-[11px] font-semibold leading-tight text-brand-900';
const BODY = 'h-[26px] border-b border-r border-slate-200 px-1.5 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums';
const SCROLL =
  '[scrollbar-gutter:stable] [scrollbar-width:auto] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-slate-100';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const cellText = (row: ResourceSheetRow, key: ResourceSheetKey) =>
  key === 'capacity' || key === 'peak' ? unitsLabel(row[key]) : key === 'work' ? workLabel(row.work) : String(row[key]);

export function ResourceSheetView({ tasks, info, teams, calendar, workId, className = '' }: ResourceSheetViewProps): JSX.Element {
  const hours = hoursPerDayOf(calendar);
  const rows = useMemo(() => resourceRows(saneTasks(resourceTasks(tasks, info)), teams, calendar), [tasks, info, teams, calendar]);
  const sheet = useMemo(() => resourceSheetRows(rows, hours), [rows, hours]);
  const [sort, setSort] = useState<ResourceSort>();
  const [current, setCurrent] = useState<string>();
  const ordered = useMemo(() => sortResourceRows(sheet, sort), [sheet, sort]);
  const overCount = sheet.filter(row => row.overallocated).length;
  const looseCount = rows.find(row => !row.team)?.tasks.length ?? 0;
  const settings = workPath(workId, 'configuracoes');

  return (
    <div className={`flex min-h-0 min-w-0 flex-col bg-white ${className}`} data-tour="medio-planilha-recursos">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <p className="text-xs text-slate-600">
          {plural(sheet.length, 'recurso', 'recursos')} ·{' '}
          <span className={overCount ? 'font-semibold text-danger' : ''}>{plural(overCount, 'superalocado', 'superalocados')}</span>
          {looseCount > 0 && ` · ${plural(looseCount, 'tarefa sem equipe', 'tarefas sem equipe')}`} · jornada de {formatHours(hours)} h ·{' '}
          <span className="text-slate-500">somente leitura: as equipes vêm de Configurações da obra</span>
        </p>
        <Link className="button-ghost px-2.5 py-1 text-xs" href={settings} data-tour="medio-planilha-configurar">
          <Users size={14} aria-hidden />
          Configurar recursos
        </Link>
      </div>
      <div role="region" aria-label="Planilha de recursos" tabIndex={-1} className={`min-h-0 flex-1 overflow-auto ${SCROLL}`}>
        {sheet.length === 0 ? (
          <p className="p-4 text-sm leading-6 text-slate-500">
            Nenhuma equipe cadastrada nesta obra.{' '}
            <Link className="text-link" href={settings}>
              Cadastre empreiteiros e equipes
            </Link>{' '}
            para que virem recursos do cronograma, com a capacidade como unidades máximas.
          </p>
        ) : (
          <table
            aria-label="Planilha de recursos: equipes da obra com unidades máximas, pico e trabalho"
            className="border-separate border-spacing-0 text-xs text-slate-700"
            style={{ tableLayout: 'fixed', width: TABLE_WIDTH }}
          >
            <colgroup>
              {COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map(col => {
                  if (col.key === 'ind')
                    return (
                      <th key={col.key} scope="col" title="Indicadores" className={`${HEAD} text-center`}>
                        <span aria-hidden>ⓘ</span>
                        <span className="sr-only">Indicadores</span>
                      </th>
                    );
                  const key = col.key;
                  const active = sort?.key === key ? sort.dir : undefined;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
                      className={`${HEAD} ${col.right ? 'text-right' : 'text-left'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSort(prev => nextSort(prev, key))}
                        title={`${col.title ? `${col.title}. ` : ''}Clique para ordenar por ${col.label.toLowerCase()}`}
                        className={`inline-flex w-full items-end gap-1 rounded hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-primary ${
                          col.right ? 'justify-end text-right' : 'text-left'
                        }`}
                      >
                        {col.label}
                        {active === 'asc' && <ArrowUp size={12} className="mb-px shrink-0" aria-hidden />}
                        {active === 'desc' && <ArrowDown size={12} className="mb-px shrink-0" aria-hidden />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ordered.map(row => {
                const selected = row.id === current;
                const tone = row.overallocated ? 'font-semibold text-danger' : '';
                return (
                  <tr
                    key={row.id}
                    onClick={() => setCurrent(row.id)}
                    className={`${selected ? '[&>td]:bg-primary-soft' : '[&>td]:bg-white hover:[&>td]:bg-brand-50/60'} cursor-default`}
                  >
                    {COLUMNS.map(col => {
                      if (col.key === 'ind')
                        return (
                          <td key={col.key} className={`${BODY} text-center`}>
                            {row.overallocated && (
                              <span
                                className="inline-flex align-middle text-danger"
                                title={`Superalocado: pico de ${unitsLabel(row.peak)} acima das unidades máximas de ${unitsLabel(row.capacity)}`}
                              >
                                <TriangleAlert size={13} aria-hidden />
                                <span className="sr-only">Superalocado</span>
                              </span>
                            )}
                          </td>
                        );
                      if (col.key === 'index')
                        return (
                          <th key={col.key} scope="row" className={`${BODY} bg-slate-50 text-right font-medium text-slate-500`}>
                            {row.index}
                          </th>
                        );
                      const text = cellText(row, col.key);
                      return (
                        <td
                          key={col.key}
                          className={`${BODY} ${col.right ? 'text-right' : ''} ${tone}`}
                          title={col.key === 'name' || col.key === 'group' ? text : undefined}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
