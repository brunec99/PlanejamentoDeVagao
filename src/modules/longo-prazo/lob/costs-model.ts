/** Funções puras da tela "Custos" da aba 1 (11/11/2026, apropriação de custos por pacote de serviço,
 * para o IDP ponderado por custo): o rascunho dos itens, o que mandar no `save_costs`, a leitura das
 * linhas coladas do orçamento e o preenchimento de uma coluna de valores colada na tabela.
 *
 * O rascunho tem o mesmo formato dos itens do servidor (`LobCostItem`): assim o peso, os cartões e o
 * IDP da tela saem de `lob-performance.ts` sobre o rascunho, antes de gravar. */
import { LOB_LIMITS, normalizeName, type LobCostInput, type LobCostItem, type LobId, type LobService } from '@/domain/lob';
import { parseMoney } from '@/domain/lob-performance';

export type DraftCost = LobCostItem;

/** Descrição do item criado ao digitar o custo direto na linha do pacote. */
export const PACKAGE_COST_DESCRIPTION = 'Custo do pacote';

const cents = (value: number) => Math.round(value * 100) / 100;
const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim();

// ─── Valores digitados ──────────────────────────────────────────────────────────

export type AmountInput = { kind: 'empty' } | { kind: 'invalid'; reason: string } | { kind: 'value'; amount: number };

/** Lê um valor em reais de um campo: vazio, inválido (texto, negativo, acima do teto) ou o valor em
 * centavos. */
export function readAmount(text: string): AmountInput {
  const parsed = parseMoney(text);
  if (parsed === null) return { kind: 'empty' };
  if (Number.isNaN(parsed)) return { kind: 'invalid', reason: 'Valor inválido: use números, como 1.234,56.' };
  if (parsed < 0) return { kind: 'invalid', reason: 'O valor não pode ser negativo.' };
  if (parsed > LOB_LIMITS.maxCostAmount) return { kind: 'invalid', reason: 'Valor acima do limite de um item.' };
  return { kind: 'value', amount: cents(parsed) };
}

// ─── Rascunho ───────────────────────────────────────────────────────────────────

export interface DraftContext {
  workId: LobId;
  actorId: LobId;
  /** Carimbo ISO dos itens novos. */
  now: string;
  newId: () => LobId;
}
export interface NewCost {
  serviceId?: LobId;
  code?: string;
  description: string;
  amount: number;
}

const nextOrder = (draft: readonly DraftCost[]) => draft.reduce((max, item) => Math.max(max, item.orderIndex), -1) + 1;

function makeItem(fields: NewCost, orderIndex: number, context: DraftContext): DraftCost {
  const code = fields.code ? cleanText(fields.code).slice(0, LOB_LIMITS.costCode) : '';
  return {
    id: context.newId(),
    workId: context.workId,
    ...(fields.serviceId ? { serviceId: fields.serviceId } : {}),
    ...(code ? { code } : {}),
    description: cleanText(fields.description).slice(0, LOB_LIMITS.costDescription),
    amount: cents(fields.amount),
    orderIndex,
    createdBy: context.actorId,
    createdAt: context.now,
    updatedAt: context.now,
  };
}

/** Itens na ordem do orçamento (a ordem da gravação; os novos vão para o fim). */
export const byItemOrder = (a: DraftCost, b: DraftCost) => a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt);

export const itemsOf = (draft: readonly DraftCost[], serviceId: LobId) =>
  draft.filter(item => item.serviceId === serviceId).sort(byItemOrder);

export function addItems(draft: readonly DraftCost[], items: readonly NewCost[], context: DraftContext): DraftCost[] {
  const start = nextOrder(draft);
  return [...draft, ...items.map((fields, index) => makeItem(fields, start + index, context))];
}

/** Custo digitado na linha do pacote (0 ou 1 item): cria o item "Custo do pacote", troca o valor do
 * único item ou, com `null` (campo apagado), tira esse item e o pacote volta a "sem custo". Pacote
 * com dois ou mais itens não muda: o custo dele é a soma, editada item a item. */
export function setPackageAmount(draft: readonly DraftCost[], serviceId: LobId, amount: number | null, context: DraftContext): DraftCost[] {
  const items = draft.filter(item => item.serviceId === serviceId);
  if (items.length > 1) return [...draft];
  const [only] = items;
  if (amount === null) return only ? draft.filter(item => item.id !== only.id) : [...draft];
  if (!only) return addItems(draft, [{ serviceId, description: PACKAGE_COST_DESCRIPTION, amount }], context);
  return draft.map(item => (item.id === only.id ? { ...item, amount: cents(amount) } : item));
}

export type ItemPatch = Partial<Pick<DraftCost, 'code' | 'description' | 'amount'>> & { serviceId?: LobId | null };

/** Altera um item; `code` vazio tira o código e `serviceId: null` deixa o item não apropriado. */
export function updateItem(draft: readonly DraftCost[], id: LobId, patch: ItemPatch): DraftCost[] {
  return draft.map(item => {
    if (item.id !== id) return item;
    const next: DraftCost = { ...item };
    if (patch.description !== undefined) next.description = cleanText(patch.description).slice(0, LOB_LIMITS.costDescription);
    if (patch.amount !== undefined) next.amount = cents(patch.amount);
    if (patch.code !== undefined) {
      const code = cleanText(patch.code).slice(0, LOB_LIMITS.costCode);
      if (code) next.code = code;
      else delete next.code;
    }
    if (patch.serviceId !== undefined) {
      if (patch.serviceId) next.serviceId = patch.serviceId;
      else delete next.serviceId;
    }
    return next;
  });
}

export function moveItems(draft: readonly DraftCost[], ids: Iterable<LobId>, serviceId: LobId | null): DraftCost[] {
  const set = new Set(ids);
  return draft.map(item => (set.has(item.id) ? updateItem([item], item.id, { serviceId })[0] : item));
}

export function removeItems(draft: readonly DraftCost[], ids: Iterable<LobId>): DraftCost[] {
  const set = new Set(ids);
  return draft.filter(item => !set.has(item.id));
}

// ─── Gravação ───────────────────────────────────────────────────────────────────

const comparable = (item: DraftCost) => ({
  serviceId: item.serviceId ?? null,
  code: item.code ? cleanText(item.code) : null,
  description: cleanText(item.description),
  amount: cents(item.amount),
});

/** O `save_costs` que leva o servidor ao rascunho: `upsert` com os itens novos e os alterados (na
 * ordem do rascunho) e `remove` com os ids do servidor que saíram. Item igual ao do servidor fica de
 * fora. */
export function costsDiff(server: readonly DraftCost[], draft: readonly DraftCost[]): { upsert: LobCostInput[]; remove: LobId[] } {
  const before = new Map(server.map(item => [item.id, item]));
  const kept = new Set<LobId>();
  const upsert: LobCostInput[] = [];
  for (const item of [...draft].sort(byItemOrder)) {
    kept.add(item.id);
    const now = comparable(item);
    const old = before.get(item.id);
    if (old) {
      const was = comparable(old);
      if (was.serviceId === now.serviceId && was.code === now.code && was.description === now.description && was.amount === now.amount)
        continue;
    }
    upsert.push({ id: item.id, ...now });
  }
  const remove = server.filter(item => !kept.has(item.id)).map(item => item.id);
  return { upsert, remove };
}

export const diffSize = (diff: { upsert: readonly unknown[]; remove: readonly unknown[] }) => diff.upsert.length + diff.remove.length;

/** Por que o rascunho não pode ser gravado como está (limites do servidor), ou nada. O lote conta
 * itens gravados e excluídos juntos, pelo lado seguro. */
export function saveBlocker(
  draft: readonly DraftCost[],
  diff: { upsert: readonly unknown[]; remove: readonly unknown[] },
): string | undefined {
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  if (draft.length > LOB_LIMITS.costItems)
    return `A obra aceita até ${fmt(LOB_LIMITS.costItems)} itens de custo, e o rascunho tem ${fmt(draft.length)}. Exclua ou junte itens antes de salvar.`;
  if (diffSize(diff) > LOB_LIMITS.costBatch)
    return `São ${fmt(diffSize(diff))} alterações, e cada gravação aceita até ${fmt(LOB_LIMITS.costBatch)}. Descarte e faça em etapas menores (por exemplo, importe parte do orçamento, salve e importe o resto).`;
  const blank = draft.filter(item => !cleanText(item.description)).length;
  if (blank) return `${blank === 1 ? 'Um item está' : `${blank} itens estão`} sem descrição.`;
  return undefined;
}

// ─── Colar do orçamento ─────────────────────────────────────────────────────────

export interface BudgetLine {
  /** Número da linha no texto colado (a partir de 1). */
  line: number;
  code?: string;
  description: string;
  amount: number;
  /** Pacote reconhecido pelo nome numa das células; ausente = não apropriado. */
  serviceId?: LobId;
}
export interface IgnoredBudgetLine {
  line: number;
  text: string;
  reason: string;
}
export interface BudgetPaste {
  lines: BudgetLine[];
  ignored: IgnoredBudgetLine[];
}

/** Código de orçamento: curto, só dígitos separados por ponto, traço ou barra, com uma letra
 * opcional no fim ("01.02.003", "3-1", "12a"). */
const CODE = /^\d+(?:[.\-/]\d+)*[a-z]?$/i;
/** Linha de total do orçamento: importar dobraria o custo. */
const TOTAL_LINE = new Set(['total', 'subtotal', 'total geral', 'valor total', 'total da obra', 'total do orcamento']);

/** Separa as células de uma linha colada: tabulação (Excel); sem tabulação, ponto e vírgula (CSV). */
const cellsOf = (row: string) => (row.includes('\t') ? row.split('\t') : row.includes(';') ? row.split(';') : [row]).map(cleanText);

/** Lê as linhas coladas do Excel. Em cada linha: o valor é a última célula que é um número ≥ 0; uma
 * célula com o nome de um pacote (sem diferença de acento ou caixa) aponta o pacote; a primeira célula
 * curta com cara de código, antes da descrição, vira o código; a descrição é o texto restante mais longo (sem texto além do
 * nome do pacote, a descrição é o próprio nome). Linha sem valor ou sem descrição vai para as
 * ignoradas com o motivo; o cabeçalho cai aí por não ter valor. */
export function parseBudgetPaste(text: string, services: readonly Pick<LobService, 'id' | 'name'>[]): BudgetPaste {
  const byName = new Map<string, LobId>();
  for (const s of services) if (!byName.has(normalizeName(s.name))) byName.set(normalizeName(s.name), s.id);
  const lines: BudgetLine[] = [];
  const ignored: IgnoredBudgetLine[] = [];
  text.split(/\r\n|\r|\n/).forEach((row, index) => {
    const line = index + 1;
    if (!row.trim()) return;
    const cells = cellsOf(row);
    const shown = cells.filter(Boolean).join(' · ').slice(0, 160);
    const numbers = cells.map(cell => (cell ? parseMoney(cell) : null));
    let valueAt = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      const n = numbers[i];
      if (n !== null && Number.isFinite(n) && n >= 0) {
        valueAt = i;
        break;
      }
    }
    if (valueAt < 0) {
      const negative = numbers.some(n => n !== null && Number.isFinite(n) && n < 0);
      ignored.push({ line, text: shown, reason: negative ? 'valor negativo' : 'sem valor em reais' });
      return;
    }
    const amount = cents(numbers[valueAt]!);
    if (amount > LOB_LIMITS.maxCostAmount) {
      ignored.push({ line, text: shown, reason: 'valor acima do limite de um item' });
      return;
    }
    let serviceId: LobId | undefined;
    let serviceName: string | undefined;
    let code: string | undefined;
    const texts: string[] = [];
    cells.forEach((cell, i) => {
      if (i === valueAt || !cell) return;
      const service = byName.get(normalizeName(cell));
      if (service && !serviceId) {
        serviceId = service;
        serviceName = cell;
        return;
      }
      // O código vem antes da descrição: um número depois dela é quantidade, não código.
      if (!code && !texts.length && cell.length <= LOB_LIMITS.costCode && CODE.test(cell)) {
        code = cell;
        return;
      }
      // Quantidade, preço unitário e outros números não são descrição.
      const n = numbers[i];
      if (n !== null && Number.isFinite(n)) return;
      texts.push(cell);
    });
    const description = texts.reduce((best, cell) => (cell.length > best.length ? cell : best), '') || serviceName || '';
    if (!description) {
      ignored.push({ line, text: shown, reason: 'sem descrição' });
      return;
    }
    if (
      TOTAL_LINE.has(
        normalizeName(description)
          .replace(/[^a-z ]/g, '')
          .trim(),
      )
    ) {
      ignored.push({ line, text: shown, reason: 'linha de total' });
      return;
    }
    lines.push({
      line,
      ...(code ? { code } : {}),
      description: description.slice(0, LOB_LIMITS.costDescription),
      amount,
      ...(serviceId ? { serviceId } : {}),
    });
  });
  return { lines, ignored };
}

/** Joga as linhas lidas no rascunho: acrescenta ao fim ou, com `replace`, no lugar de todos os itens. */
export function importBudget(
  draft: readonly DraftCost[],
  lines: readonly BudgetLine[],
  replace: boolean,
  context: DraftContext,
): DraftCost[] {
  const base = replace ? [] : draft;
  return addItems(
    base,
    lines.map(l => ({ serviceId: l.serviceId, code: l.code, description: l.description, amount: l.amount })),
    context,
  );
}

// ─── Coluna colada na tabela dos pacotes ────────────────────────────────────────

export interface ColumnFill {
  /** Valor de cada pacote preenchido, na ordem. */
  assignments: { serviceId: LobId; amount: number }[];
  /** Pacotes pulados por terem dois ou mais itens (o valor da linha deles fica de fora). */
  skipped: number;
  /** Linhas com texto que não é valor (o pacote da linha não muda). */
  invalid: number;
  /** Linhas em branco (o pacote da linha não muda). */
  blank: number;
  /** Valores que sobraram depois do último pacote. */
  leftover: number;
}

/** Valores de uma coluna colada: uma linha do texto por pacote, sem a quebra final que o Excel põe.
 * Com várias colunas, vale a última célula que é número. `null` = linha em branco; `NaN` = inválida. */
export function columnValues(text: string): (number | null)[] {
  const rows = text.replace(/(\r\n|\r|\n)+$/, '').split(/\r\n|\r|\n/);
  return rows.map(row => {
    const cells = row.split('\t').map(cleanText).filter(Boolean);
    if (!cells.length) return null;
    for (let i = cells.length - 1; i >= 0; i--) {
      const read = readAmount(cells[i]);
      if (read.kind === 'value') return read.amount;
    }
    return NaN;
  });
}

/** Linha i da coluna colada vai para o i-ésimo pacote a partir do campo onde se colou, na ordem da
 * tabela, como no Excel. Pacote com dois ou mais itens é pulado junto com o valor da linha dele, para
 * as linhas seguintes continuarem alinhadas com os pacotes. */
export function columnFill(
  orderedServiceIds: readonly LobId[],
  startServiceId: LobId,
  values: readonly (number | null)[],
  itemCount: (serviceId: LobId) => number,
): ColumnFill {
  const result: ColumnFill = { assignments: [], skipped: 0, invalid: 0, blank: 0, leftover: 0 };
  const start = orderedServiceIds.indexOf(startServiceId);
  if (start < 0) return { ...result, leftover: values.length };
  values.forEach((value, offset) => {
    const serviceId = orderedServiceIds[start + offset];
    if (serviceId === undefined) result.leftover += 1;
    else if (itemCount(serviceId) > 1) result.skipped += 1;
    else if (value === null) result.blank += 1;
    else if (Number.isNaN(value)) result.invalid += 1;
    else result.assignments.push({ serviceId, amount: value });
  });
  return result;
}

/** Quantas linhas tem um texto colado, sem a quebra final: com 2 ou mais, a colagem num campo é uma coluna. */
export const pastedRows = (text: string) => text.replace(/(\r\n|\r|\n)+$/, '').split(/\r\n|\r|\n/).length;
