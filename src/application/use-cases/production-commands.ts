import { cleanHeadcountName, existingSpelling, isIsoDate } from '../../domain/headcount';
import {
  normalizeUnit,
  PRODUCTION_LIMITS,
  type ProductionCommand,
  type ProductionData,
  type ProductionEntry,
} from '../../domain/production';

/** Regras da aba 8, Controle de produtividade (11/11/2026). Mesmo desenho do histograma
 * (`headcount-commands.ts`): `parseProductionCommand` confere a forma, `planProductionCommand` aplica as
 * regras sobre os dados atuais da obra e devolve só o que gravar. Puro, sem banco. Toda recusa de regra
 * sai como erro com mensagem pronta para o usuário. */

export interface ProductionMutation {
  workId: string;
  insert: ProductionEntry[];
  update: ProductionEntry[];
  delete: string[];
}

export interface ProductionContext {
  actorId: string;
  now: string;
  /** Data civil de hoje no fuso da obra (a rota passa `todayInSaoPaulo()`). */
  today?: string;
  newId: () => string;
  /** Importação da planilha: a linha nasce com origem `planilha`. */
  importing?: boolean;
}

export type ProductionTarget = { workId: string } | { entryId: string };

/** Lançam quem tem o módulo e não é do papel consulta (a rota confere o módulo; aqui, o papel). */
export const canWriteProduction = (profile: { role?: string } | null | undefined): boolean => !!profile && profile.role !== 'viewer';

const fail = (message: string): never => {
  throw new Error(message);
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string): string => (typeof value === 'string' ? value : fail(`Campo inválido: ${field}.`));
const count = (value: unknown, field: string): number => (typeof value === 'number' ? value : fail(`Campo inválido: ${field}.`));

export function parseProductionCommand(body: unknown): ProductionCommand {
  if (!isRecord(body)) return fail('Comando inválido.');
  switch (body.type) {
    case 'save_entry': {
      if (body.id !== undefined && typeof body.id !== 'string') return fail('Campo inválido: id.');
      if (body.quantity !== null && typeof body.quantity !== 'number') return fail('Campo inválido: quantity.');
      if (body.note !== undefined && typeof body.note !== 'string') return fail('Campo inválido: note.');
      return {
        type: 'save_entry',
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        workId: text(body.workId, 'workId'),
        workedOn: text(body.workedOn, 'workedOn'),
        service: text(body.service, 'service'),
        contractor: text(body.contractor, 'contractor'),
        professionals: count(body.professionals, 'professionals'),
        helpers: count(body.helpers, 'helpers'),
        quantity: body.quantity,
        unit: typeof body.unit === 'string' ? body.unit : '',
        ...(typeof body.note === 'string' ? { note: body.note } : {}),
      };
    }
    case 'delete_entry':
      return { type: 'delete_entry', id: text(body.id, 'id') };
    case 'copy_day':
      return { type: 'copy_day', workId: text(body.workId, 'workId'), from: text(body.from, 'from'), to: text(body.to, 'to') };
    default:
      return fail('Comando desconhecido.');
  }
}

export function productionCommandTarget(command: ProductionCommand): ProductionTarget {
  if (command.type === 'delete_entry') return { entryId: command.id };
  if (command.type === 'save_entry' && command.id) return { entryId: command.id };
  return { workId: command.workId };
}

function checkDay(day: string, ctx: ProductionContext, label = 'Data') {
  if (!isIsoDate(day)) fail(`${label} inválida.`);
  if (day < '2020-01-01') fail(`${label} anterior a 2020: confira o ano.`);
  if (day > (ctx.today ?? ctx.now.slice(0, 10))) fail(`${label} no futuro: a produção é lançada no dia ou depois dele.`);
}

/** Aplica as regras de um comando sobre os lançamentos atuais da obra (`data` é só dela). */
export function planProductionCommand(
  data: ProductionData,
  command: ProductionCommand,
  ctx: ProductionContext,
  workId: string,
): ProductionMutation {
  const mutation: ProductionMutation = { workId, insert: [], update: [], delete: [] };

  if (command.type === 'delete_entry') {
    if (!data.entries.some(e => e.id === command.id)) fail('Lançamento não encontrado. Recarregue a página.');
    mutation.delete.push(command.id);
    return mutation;
  }

  if (command.type === 'copy_day') {
    checkDay(command.from, ctx, 'Data de origem');
    checkDay(command.to, ctx);
    if (command.from === command.to) fail('Escolha um dia diferente para repetir.');
    if (data.entries.some(e => e.workedOn === command.to))
      fail('Este dia já tem lançamentos. Edite as linhas em vez de repetir outro dia.');
    const source = data.entries.filter(e => e.workedOn === command.from);
    if (!source.length) fail('O dia de origem não tem lançamentos.');
    if (source.length > PRODUCTION_LIMITS.copy) fail(`O dia de origem tem mais de ${PRODUCTION_LIMITS.copy} linhas.`);
    for (const entry of source) {
      mutation.insert.push({
        id: ctx.newId(),
        workId,
        workedOn: command.to,
        service: entry.service,
        contractor: entry.contractor,
        professionals: entry.professionals,
        helpers: entry.helpers,
        // A equipe se repete; a produção do dia novo ainda vai ser medida. A unidade fica como referência.
        quantity: null,
        unit: entry.unit,
        note: '',
        origin: 'app',
        createdBy: ctx.actorId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
    }
    return mutation;
  }

  // save_entry
  checkDay(command.workedOn, ctx);
  const serviceText = cleanHeadcountName(command.service);
  const contractorText = cleanHeadcountName(command.contractor);
  if (!serviceText) fail('Informe o serviço.');
  if (!contractorText) fail('Informe o empreiteiro.');
  if (serviceText.length > PRODUCTION_LIMITS.name || contractorText.length > PRODUCTION_LIMITS.name)
    fail(`Serviço e empreiteiro: até ${PRODUCTION_LIMITS.name} caracteres.`);
  for (const [value, label] of [
    [command.professionals, 'profissionais'],
    [command.helpers, 'ajudantes'],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) fail(`O número de ${label} deve ser um inteiro a partir de zero.`);
    if (value > PRODUCTION_LIMITS.crew) fail(`Mais de ${PRODUCTION_LIMITS.crew} ${label} numa linha: confira o número.`);
  }
  if (command.professionals + command.helpers === 0) fail('Informe ao menos uma pessoa na equipe.');
  const quantity = command.quantity;
  if (quantity !== null) {
    if (!Number.isFinite(quantity) || quantity <= 0) fail('A produção deve ser maior que zero. Deixe em branco enquanto não foi medida.');
    if (quantity > PRODUCTION_LIMITS.quantity) fail('Produção grande demais: confira o número.');
  }
  const unit = normalizeUnit(command.unit);
  if (cleanHeadcountName(command.unit) && !unit) fail('Unidade desconhecida. Use m², m³, m, kg, un, vb ou t.');
  if (quantity !== null && !unit) fail('Escolha a unidade da produção.');
  const note = cleanHeadcountName(command.note ?? '');
  if (note.length > PRODUCTION_LIMITS.note) fail(`Observação: até ${PRODUCTION_LIMITS.note} caracteres.`);

  // A grafia que a obra já usa vence: "reboco " vira "Reboco".
  const fields = {
    workedOn: command.workedOn,
    service: existingSpelling(
      serviceText,
      data.entries.map(e => e.service),
    ),
    contractor: existingSpelling(
      contractorText,
      data.entries.map(e => e.contractor),
    ),
    professionals: command.professionals,
    helpers: command.helpers,
    quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000,
    unit,
    note,
  };

  if (command.id) {
    const current = data.entries.find(e => e.id === command.id);
    if (!current) return fail('Lançamento não encontrado. Recarregue a página.');
    mutation.update.push({ ...current, ...fields, updatedAt: ctx.now });
    return mutation;
  }
  mutation.insert.push({
    id: ctx.newId(),
    workId,
    ...fields,
    origin: ctx.importing ? 'planilha' : 'app',
    createdBy: ctx.actorId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
  return mutation;
}

/** O mesmo resultado que o banco terá depois da gravação: a tela aplica na hora, sem reler a obra. */
export function applyProductionMutation(
  entries: readonly ProductionEntry[],
  mutation: Pick<ProductionMutation, 'insert' | 'update' | 'delete'>,
): ProductionEntry[] {
  const removed = new Set(mutation.delete);
  const updated = new Map(mutation.update.map(e => [e.id, e]));
  return [...entries.filter(e => !removed.has(e.id)).map(e => updated.get(e.id) ?? e), ...mutation.insert];
}
