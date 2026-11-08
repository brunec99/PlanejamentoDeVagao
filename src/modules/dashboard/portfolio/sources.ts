import type { LocalDate, Team, WeeklyCommitment } from '@/domain/entities';
import { companyKey, type DashboardReference, type PortfolioModule } from '../model';
import { buildLongTermPanel, type LongTermPanelData } from '../long-term-panel';
import type { MediumTermPanelData } from '../medium-term-panel';
import type { ShortTermPanelData } from '../short-term-panel';
import { buildTerminalityPanel, type TerminalityPanelData } from '../terminality-panel';
import type { WagonsPanelData } from '../wagons-panel';
import type { PortfolioSource } from './extract';
import { buildSafetyBlock } from './safety';
import type { PortfolioSafety, PortfolioSourcesResponse, PortfolioWork } from './types';

/** Peças do Dashboard geral que a tela (`use-portfolio-data.ts`) e o servidor (`compose.ts`, a ferramenta
 * `panorama_obras` da Claudia) usam igual. Movidas do hook em 08/11/2026, sem mudar nada, para a composição no
 * servidor dar os mesmos números da página: o hook é `'use client'` e não pode ser importado pelo servidor.
 * Tudo puro. */

export type SourceEntry = PortfolioSourcesResponse['works'][number];
export type Reasons = Partial<Record<PortfolioModule, string>>;

export interface WorkLines {
  commitments: WeeklyCommitment[];
  teams: Team[];
  /** Segunda-feira da primeira semana com linha; ausente sem linha. */
  firstWeek?: LocalDate;
  /** A última semana antes da atual com todas as linhas com Status. */
  lastClosed?: LocalDate;
}
export interface LocalSources {
  short: PortfolioSource<ShortTermPanelData>;
  wagons: PortfolioSource<WagonsPanelData>;
  medium: PortfolioSource<MediumTermPanelData>;
}
export interface RemoteSources {
  longTerm: PortfolioSource<LongTermPanelData>;
  terminality: PortfolioSource<TerminalityPanelData>;
  safety: PortfolioSource<PortfolioSafety>;
  reasons: Reasons;
}

/** Os módulos que vêm da rota do Dashboard geral (os demais vêm do planejamento já carregado). */
export const REMOTE_MODULES: PortfolioModule[] = ['longo-prazo', 'terminalidade', 'seguranca'];
const NO_TERMINALITY = 'A terminalidade não está disponível neste ambiente.';
const NO_SAFETY = 'A segurança do trabalho não está disponível neste ambiente.';
const NO_LONG_TERM_SERVICE = 'O plano de longo prazo não tem serviço.';
const NO_TERMINALITY_ITEM = 'Sem pendências de terminalidade nesta obra.';

export const byName = (a: PortfolioWork, b: PortfolioWork) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });

/** O longo prazo de uma obra a partir da resposta da rota: sem acesso, escondido; `null`, sem plano. */
export function longTermSource(
  response: PortfolioSourcesResponse,
  entry: SourceEntry | undefined,
  ref: DashboardReference,
  reasons: Reasons,
): PortfolioSource<LongTermPanelData> {
  if (!response.longTermAccess) return { status: 'hidden' };
  if (entry?.longTermError) return { status: 'error', message: entry.longTermError };
  if (!entry?.longTerm) return { status: 'absent' };
  // Empreiteiro não se aplica ao longo prazo (a medição é por serviço), como na aba 0.
  const data = buildLongTermPanel(entry.longTerm, ref, { week: ref.week });
  if (data) return { status: 'ready', data };
  reasons['longo-prazo'] = NO_LONG_TERM_SERVICE;
  return { status: 'absent' };
}

/** A terminalidade de uma obra a partir da resposta da rota (pendências sem fotos). */
export function terminalitySource(
  response: PortfolioSourcesResponse,
  entry: SourceEntry | undefined,
  ref: DashboardReference,
  reasons: Reasons,
  companies: ReadonlySet<string> | undefined,
): PortfolioSource<TerminalityPanelData> {
  if (!response.terminalityAvailable) {
    reasons.terminalidade = NO_TERMINALITY;
    return { status: 'absent' };
  }
  if (entry?.terminalityError) return { status: 'error', message: entry.terminalityError };
  if (!entry?.terminality) {
    reasons.terminalidade = NO_TERMINALITY_ITEM;
    return { status: 'absent' };
  }
  const data = buildTerminalityPanel(entry.terminality, ref, { week: ref.week, ...(companies ? { companies } : {}) });
  return data ? { status: 'ready', data } : { status: 'absent' };
}

/** A segurança do trabalho de uma obra a partir da resposta da rota (apontamentos sem fotos e a lista única de
 * tipos). Sem recorte de empreiteiro (regra 10 da segurança): a vistoria não registra empresa. */
export function safetySource(
  response: PortfolioSourcesResponse,
  entry: SourceEntry | undefined,
  ref: DashboardReference,
  reasons: Reasons,
  today: string,
): PortfolioSource<PortfolioSafety> {
  if (!response.safetyAvailable) {
    reasons.seguranca = NO_SAFETY;
    return { status: 'absent' };
  }
  if (entry?.safetyError) return { status: 'error', message: entry.safetyError };
  const data = buildSafetyBlock(entry?.safety ?? [], response.safetyTypes ?? [], { start: ref.period.start, end: ref.weekEnd }, today);
  return data ? { status: 'ready', data } : { status: 'absent' };
}

/** Junta opções de seletor vindas de mais de uma fonte e de mais de uma obra, somando as contagens das grafias
 * equivalentes (a grafia que fica é a primeira, que vem da fonte com mais linhas). */
export function mergeCompanyOptions(lists: { value: string; count: number }[][]): { value: string; count: number }[] {
  const merged = new Map<string, { value: string; count: number }>();
  for (const list of lists)
    for (const option of list) {
      const key = companyKey(option.value);
      if (!key) continue;
      const current = merged.get(key);
      if (current) current.count += option.count;
      else merged.set(key, { value: option.value, count: option.count });
    }
  return [...merged.values()].sort((a, b) => a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}
export const teamCompanies = (teams: readonly Team[]) =>
  [...new Set(teams.map(t => t.company.trim()).filter(Boolean))].map(value => ({ value, count: 0 }));

/** O resultado de um construtor como estado de quadro: `undefined` vira "ausente". */
export const fromBuilder = <T>(build: () => T | undefined): PortfolioSource<T> => {
  const data = build();
  return data === undefined ? { status: 'absent' } : { status: 'ready', data };
};
