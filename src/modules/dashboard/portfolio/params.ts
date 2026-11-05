import { isDashboardModule, type DashboardModule } from '../model';
import { parsePeriodParams, periodSearchEntries, type PeriodSelection } from '../period';

/** A URL do Dashboard geral (regras 4 e 14): escala e período, obras e quadros. A tela e a página de impressão
 * leem os mesmos parâmetros, para o PDF sair igual à tela. `obra` se repete; `quadros` é separado por vírgula. */

export interface PortfolioParams {
  selection?: PeriodSelection;
  workIds?: ReadonlySet<string>;
  modules?: ReadonlySet<DashboardModule>;
}

const list = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

export function portfolioSearchParams(params: PortfolioParams): URLSearchParams {
  const out = new URLSearchParams(params.selection ? periodSearchEntries(params.selection) : []);
  if (params.workIds) for (const id of params.workIds) out.append('obra', id);
  if (params.modules) out.set('quadros', [...params.modules].join(','));
  return out;
}

export function parsePortfolioParams(raw: Record<string, string | string[] | undefined>): PortfolioParams {
  const selection = parsePeriodParams(raw);
  const workIds = list(raw.obra).filter(Boolean);
  const modules = list(raw.quadros)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(isDashboardModule);
  return {
    ...(selection ? { selection } : {}),
    ...(workIds.length ? { workIds: new Set(workIds) } : {}),
    ...(modules.length ? { modules: new Set(modules) } : {}),
  };
}

export const PORTFOLIO_PATH = '/dashboard';
export const portfolioPath = (params: PortfolioParams) => {
  const query = portfolioSearchParams(params).toString();
  return query ? `${PORTFOLIO_PATH}?${query}` : PORTFOLIO_PATH;
};
export const printPortfolioPath = (params: PortfolioParams) => {
  const query = portfolioSearchParams(params).toString();
  return `/imprimir/dashboard-geral${query ? `?${query}` : ''}`;
};
