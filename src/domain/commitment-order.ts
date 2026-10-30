import type { WeeklyCommitment } from './entities';

/** Ordem das linhas da planilha do curto prazo. Mora no domínio porque a tela e o servidor precisam
 * da mesma regra: quem insere ou arrasta uma linha (30/10/2026) grava a ordem da semana inteira, e o
 * servidor numera as linhas na ordem que a tela mostrava. */

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export const compareText = (a: string, b: string) => collator.compare(a, b);

type Compare = (a: WeeklyCommitment, b: WeeklyCommitment) => number;
/** A empresa da linha: o fornecedor escrito nela ou, sem ele, a empresa da equipe alocada. */
type CompanyOf = (row: WeeklyCommitment) => string;

/** Ordem da planilha de origem: as linhas de cada empresa juntas (sem empresa por último), dentro dela
 * pela data de início. */
export function byCompany(companyOf: CompanyOf): Compare {
  return (a, b) => {
    const [x, y] = [companyOf(a), companyOf(b)];
    if ((x === '') !== (y === '')) return x === '' ? 1 : -1;
    return compareText(x, y) || a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt);
  };
}

/** Ordem salva da semana. A linha com posição gravada (`order`) vem primeiro, pela posição; as demais
 * seguem a ordem de inclusão, então a linha nova entra embaixo e fica embaixo (pedido da obra,
 * 09/10/2026). O histórico importado tem o mesmo horário de inclusão por lote, e aí o desempate é o da
 * planilha de origem (empresa, início). */
export function sheetOrder(companyOf: CompanyOf): Compare {
  const company = byCompany(companyOf);
  return (a, b) => {
    if ((a.order === undefined) !== (b.order === undefined)) return a.order === undefined ? 1 : -1;
    return (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt) || company(a, b);
  };
}

/** Posições 1, 2, 3… das linhas da semana na ordem `ids` (a da tela). Linha da semana que não está em
 * `ids`, criada por outra pessoa enquanto isso, vai para o fim, na ordem salva; id que não é da semana
 * é ignorado. Numera a semana inteira de uma vez, então daí em diante a ordem não depende mais do
 * horário de inclusão. */
export function orderPositions(week: WeeklyCommitment[], ids: readonly string[], companyOf: CompanyOf): Map<string, number> {
  const inWeek = new Set(week.map(c => c.id));
  const listed = [...new Set(ids)].filter(id => inWeek.has(id));
  const seen = new Set(listed);
  const rest = week
    .filter(c => !seen.has(c.id))
    .sort(sheetOrder(companyOf))
    .map(c => c.id);
  return new Map([...listed, ...rest].map((id, index) => [id, index + 1]));
}

/** A ordem da semana com a linha nova `id` logo acima de `beforeId`, a partir da ordem da tela (`ids`) ou,
 * sem ela, da salva. É o que o servidor grava e a tela projeta ao inserir no meio. A referência que não
 * está mais na semana (excluída por outra pessoa nesse meio-tempo) não é erro: a linha nova entra embaixo. */
export function insertionOrder(
  week: WeeklyCommitment[],
  id: string,
  beforeId: string | undefined,
  ids: readonly string[] | undefined,
  companyOf: CompanyOf,
): string[] {
  const rows = week.filter(c => c.id !== id);
  const inWeek = new Set(rows.map(c => c.id));
  const base = ids ? ids.filter(other => inWeek.has(other)) : [...rows].sort(sheetOrder(companyOf)).map(c => c.id);
  return placeBefore(base, id, beforeId && inWeek.has(beforeId) ? beforeId : undefined);
}

/** `ids` com `id` logo acima de `beforeId`; sem `beforeId`, ou se ele não está na lista, no fim. Tira
 * `id` de onde estava antes, então serve tanto para inserir quanto para mover. */
export function placeBefore(ids: readonly string[], id: string, beforeId?: string | null): string[] {
  const rest = ids.filter(other => other !== id);
  const at = beforeId ? rest.indexOf(beforeId) : -1;
  return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}
