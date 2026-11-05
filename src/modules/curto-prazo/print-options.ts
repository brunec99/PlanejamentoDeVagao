import { NO_LOCAL, type LocalOption } from '@/modules/curto-prazo/commitment-local';

/** As escolhas da janela do PDF do curto prazo e o caminho delas até a página de impressão, pela URL. Puro,
 * testado em tests/commitment-local.test.ts. */
export type PrintKind = 'planejamento' | 'fechamento';
/** Por empreiteiro: como a planilha da obra (empresa, depois início). Por início: data, depois empresa. */
export type PrintOrder = 'empreiteiro' | 'inicio';

export type PrintChoices = {
  week: string;
  kind: PrintKind;
  order: PrintOrder;
  /** Painel na primeira página do fechamento; só a caixa desmarcada vai na URL (`painel=0`). */
  panel: boolean;
  /** Empreiteiros desmarcados ('' = linhas sem empreiteiro), em `excluir`. */
  excludedCompanies: readonly string[];
  /** Locais desmarcados (05/11/2026): o id de cada um, em `excluir-local`, e '' para "(sem local)". */
  excludedLocals: readonly string[];
};

/** A busca da URL da impressão. Tudo marcado não vai na URL: sem `excluir` nem `excluir-local`, sai tudo. */
export function printSearchParams(choices: PrintChoices): URLSearchParams {
  const params = new URLSearchParams({ semana: choices.week, tipo: choices.kind, ordem: choices.order });
  if (choices.kind === 'fechamento' && !choices.panel) params.set('painel', '0');
  choices.excludedCompanies.forEach(company => params.append('excluir', company));
  choices.excludedLocals.forEach(local => params.append('excluir-local', local));
  return params;
}

/** Um parâmetro repetível da URL como lista (o Next entrega texto, lista ou nada). */
export const listParam = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** As linhas que vão para o PDF: fora os empreiteiros e os locais desmarcados. */
export function printableRows<T>(
  rows: readonly T[],
  companyOf: (row: T) => string,
  localOf: (row: T) => string,
  excludedCompanies: readonly string[],
  excludedLocals: readonly string[],
): T[] {
  const companies = new Set(excludedCompanies);
  const locals = new Set(excludedLocals);
  return rows.filter(row => !companies.has(companyOf(row)) && !locals.has(localOf(row)));
}

/** O recorte de local no cabeçalho do PDF ("Local: Torre A, Torre B"), com os locais das linhas impressas, de
 * cima para baixo, e "sem local" quando também saem linhas sem local. Sem recorte (nenhum local desmarcado) ou
 * sem linha impressa, nada. */
export function localCutLabel(
  printedKeys: readonly string[],
  locals: readonly LocalOption[],
  excluded: readonly string[],
): string | undefined {
  if (!excluded.length) return undefined;
  const keys = new Set(printedKeys);
  const names = locals.filter(local => keys.has(local.id)).map(local => local.name);
  if (keys.has(NO_LOCAL)) names.push('sem local');
  return names.length ? `Local: ${names.join(', ')}` : undefined;
}
