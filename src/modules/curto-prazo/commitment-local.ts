import type { Command } from '@/application/use-cases/commands';
import type { WeeklyCommitment } from '@/domain/entities';
import { addDays } from '@/domain/validation';

/** Local da linha do curto prazo (pedido do usuário, 05/11/2026): campo opcional para filtrar as tarefas por
 * local ao gerar o PDF, com a mesma lista do longo prazo (os "Locais da obra" da Linha de Balanço). A linha
 * guarda o id do local; a tela mostra o nome. Funções puras, testadas em tests/commitment-local.test.ts. */

/** "Sem local": a chave das linhas sem local (ou com um local que saiu da lista) no filtro do PDF e na URL da
 * impressão (`excluir-local=`), como '' é "sem empreiteiro" em `excluir`. */
export const NO_LOCAL = '';
export const NO_LOCAL_LABEL = '(sem local)';
/** O que a coluna diz quando a obra ainda não tem locais. */
export const LOCALS_HINT = 'Cadastre os locais em Configurações da obra (Locais da obra)';

export type LocalOption = { id: string; name: string };

/** A chave do local da linha: o id, se o local ainda está na lista da obra; senão, sem local. Id que saiu da
 * lista (local apagado, ou lista que não carregou) aparece vazio na célula e conta como "sem local". */
export const localKeyOf = (localId: string | undefined, known: ReadonlySet<string>): string =>
  localId && known.has(localId) ? localId : NO_LOCAL;

/** As opções da lista suspensa da célula: "(sem local)" só aparece quando a linha tem local, para tirá-lo; a
 * linha sem local mostra a célula vazia. */
export function localChoices(locals: readonly LocalOption[], current: string): { value: string; label: string }[] {
  const options = locals.map(local => ({ value: local.id, label: local.name }));
  return current ? [{ value: NO_LOCAL, label: NO_LOCAL_LABEL }, ...options] : options;
}

/** Grava o local de uma linha (`null` tira). `update_commitment` exige todas as células: vão as atuais da
 * linha, e o local explícito, porque sem ele o servidor mantém o que a linha tem. */
export function localCommand(row: WeeklyCommitment, localId: string | null): Command {
  return {
    type: 'update_commitment',
    commitmentId: row.id,
    name: row.name,
    supplier: row.supplier,
    teamId: row.teamId ?? null,
    weekStart: row.weekStart,
    startDate: row.startDate,
    endDate: row.endDate,
    localId,
  };
}

/** "Levar ›": a mesma linha na semana seguinte, sem apontamento, com a mesma empresa, equipe, período (uma
 * semana depois) e o mesmo local. */
export function carryCommand(row: WeeklyCommitment, responsibleId: string): Command {
  const week = (date: string) => addDays(date, 7);
  return {
    type: 'create_commitment',
    workId: row.workId,
    name: row.name,
    weekStart: week(row.weekStart),
    responsibleId,
    supplier: row.supplier,
    teamId: row.teamId ?? null,
    startDate: week(row.startDate),
    endDate: week(row.endDate),
    ...(row.localId && { localId: row.localId }),
  };
}

/** Alça de arrastar na célula Local: as linhas que recebem o local da origem. Linha que não se edita (semana
 * encerrada para quem não é admin, semana anterior nas vizinhas) fica de fora e é contada; a que já tem o
 * mesmo local não precisa de gravação. */
export function localFill(
  source: WeeklyCommitment,
  targets: readonly WeeklyCommitment[],
  known: ReadonlySet<string>,
  editable: (row: WeeklyCommitment) => boolean,
): { localId: string | null; changes: WeeklyCommitment[]; skipped: number } {
  const value = localKeyOf(source.localId, known);
  const changes: WeeklyCommitment[] = [];
  let skipped = 0;
  for (const row of targets) {
    if (!editable(row)) skipped++;
    else if (localKeyOf(row.localId, known) !== value) changes.push(row);
  }
  return { localId: value || null, changes, skipped };
}

/** O filtro da coluna Local da planilha (marcado por nome, '' = vazias) como seleção inicial do PDF (por id,
 * '' = sem local). Sem filtro, nada: a janela começa com todos. */
export function localSelectionFromFilter(filter: ReadonlySet<string> | undefined, locals: readonly LocalOption[]): Set<string> | undefined {
  if (!filter) return undefined;
  const chosen = new Set<string>();
  if (filter.has('')) chosen.add(NO_LOCAL);
  for (const local of locals) if (filter.has(local.name)) chosen.add(local.id);
  return chosen;
}

/** A lista "Local" da janela do PDF: "(sem local)" primeiro, como "(sem empreiteiro)", e os locais da obra que
 * têm linha na semana, de cima para baixo, cada um com o número de linhas. Vazia quando nenhuma linha da semana
 * tem local: aí não há o que recortar. */
export function printLocalOptions(
  rowKeys: readonly string[],
  locals: readonly LocalOption[],
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const key of rowKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  const named = locals
    .filter(local => counts.has(local.id))
    .map(local => ({ value: local.id, label: local.name, count: counts.get(local.id)! }));
  if (!named.length) return [];
  const without = counts.get(NO_LOCAL);
  return [...(without ? [{ value: NO_LOCAL, label: NO_LOCAL_LABEL, count: without }] : []), ...named];
}
