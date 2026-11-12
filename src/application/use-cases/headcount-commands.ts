import {
  cleanHeadcountName,
  existingSpelling,
  HEADCOUNT_LIMITS,
  headcountKey,
  isIsoDate,
  type HeadcountCommand,
  type HeadcountData,
  type HeadcountEntry,
} from '../../domain/headcount';

/** Regras da aba 7, Histograma (11/11/2026). Mesmo desenho da segurança (`safety-commands.ts`): o comando
 * chega como JSON, `parseHeadcountCommand` confere a forma, `planHeadcountCommand` aplica as regras sobre
 * os dados atuais da obra e devolve só o que gravar. Puro, sem banco: a rota carrega, planeja e aplica.
 * Toda recusa de regra sai como erro com mensagem pronta para o usuário. */

/** O que um comando grava: linhas completas a inserir e a atualizar, e ids a apagar. */
export interface HeadcountMutation {
  workId: string;
  insert: HeadcountEntry[];
  update: HeadcountEntry[];
  delete: string[];
}

export interface HeadcountContext {
  actorId: string;
  /** Instante ISO da gravação. */
  now: string;
  /** Data civil de hoje no fuso da obra (a rota passa `todayInSaoPaulo()`). */
  today?: string;
  newId: () => string;
  /** Importação da planilha: a linha nasce com origem `planilha`. */
  importing?: boolean;
}

/** Onde o comando atua: direto numa obra ou numa linha cuja obra a rota precisa descobrir. */
export type HeadcountTarget = { workId: string } | { entryId: string };

/** Lançam quem tem o módulo e não é do papel consulta (a rota confere o módulo; aqui, o papel). */
export const canWriteHeadcount = (profile: { role?: string } | null | undefined): boolean => !!profile && profile.role !== 'viewer';

const fail = (message: string): never => {
  throw new Error(message);
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string): string => (typeof value === 'string' ? value : fail(`Campo inválido: ${field}.`));

export function parseHeadcountCommand(body: unknown): HeadcountCommand {
  if (!isRecord(body)) return fail('Comando inválido.');
  switch (body.type) {
    case 'save_entry': {
      if (body.id !== undefined && typeof body.id !== 'string') return fail('Campo inválido: id.');
      if (typeof body.quantity !== 'number') return fail('Campo inválido: quantity.');
      if (body.note !== undefined && typeof body.note !== 'string') return fail('Campo inválido: note.');
      return {
        type: 'save_entry',
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        workId: text(body.workId, 'workId'),
        workedOn: text(body.workedOn, 'workedOn'),
        company: text(body.company, 'company'),
        role: text(body.role, 'role'),
        quantity: body.quantity,
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

export function headcountCommandTarget(command: HeadcountCommand): HeadcountTarget {
  if (command.type === 'delete_entry') return { entryId: command.id };
  if (command.type === 'save_entry' && command.id) return { entryId: command.id };
  return { workId: command.workId };
}

function checkDay(day: string, ctx: HeadcountContext, label = 'Data') {
  if (!isIsoDate(day)) fail(`${label} inválida.`);
  if (day < '2020-01-01') fail(`${label} anterior a 2020: confira o ano.`);
  const today = ctx.today ?? ctx.now.slice(0, 10);
  if (day > today) fail(`${label} no futuro: o efetivo é lançado no dia ou depois dele.`);
}

const sameSlot = (a: Pick<HeadcountEntry, 'workedOn' | 'company' | 'role'>, b: Pick<HeadcountEntry, 'workedOn' | 'company' | 'role'>) =>
  a.workedOn === b.workedOn && headcountKey(a.company) === headcountKey(b.company) && headcountKey(a.role) === headcountKey(b.role);

/** Aplica as regras de um comando sobre o efetivo atual da obra (`data` é só dela). */
export function planHeadcountCommand(
  data: HeadcountData,
  command: HeadcountCommand,
  ctx: HeadcountContext,
  workId: string,
): HeadcountMutation {
  const mutation: HeadcountMutation = { workId, insert: [], update: [], delete: [] };

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
    if (source.length > HEADCOUNT_LIMITS.copy) fail(`O dia de origem tem mais de ${HEADCOUNT_LIMITS.copy} linhas.`);
    for (const entry of source) {
      mutation.insert.push({
        id: ctx.newId(),
        workId,
        workedOn: command.to,
        company: entry.company,
        role: entry.role,
        quantity: entry.quantity,
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
  const companyText = cleanHeadcountName(command.company);
  const roleText = cleanHeadcountName(command.role);
  if (!companyText) fail('Informe a empresa.');
  if (!roleText) fail('Informe a função.');
  if (companyText.length > HEADCOUNT_LIMITS.name || roleText.length > HEADCOUNT_LIMITS.name)
    fail(`Empresa e função: até ${HEADCOUNT_LIMITS.name} caracteres.`);
  if (!Number.isInteger(command.quantity) || command.quantity < 1) fail('O número de funcionários deve ser um inteiro a partir de 1.');
  if (command.quantity > HEADCOUNT_LIMITS.quantity) fail(`Mais de ${HEADCOUNT_LIMITS.quantity} pessoas numa linha: confira o número.`);
  const note = cleanHeadcountName(command.note ?? '');
  if (note.length > HEADCOUNT_LIMITS.note) fail(`Observação: até ${HEADCOUNT_LIMITS.note} caracteres.`);

  // A grafia que a obra já usa vence: "ATR " vira "ATR", "pedreiro" vira "Pedreiro".
  const company = existingSpelling(
    companyText,
    data.entries.map(e => e.company),
  );
  const role = existingSpelling(
    roleText,
    data.entries.map(e => e.role),
  );
  const slot = { workedOn: command.workedOn, company, role };

  if (command.id) {
    const current = data.entries.find(e => e.id === command.id);
    if (!current) return fail('Lançamento não encontrado. Recarregue a página.');
    if (data.entries.some(e => e.id !== current.id && sameSlot(e, slot)))
      fail(`Já existe um lançamento de ${role} da ${company} neste dia. Edite aquela linha.`);
    mutation.update.push({ ...current, ...slot, quantity: command.quantity, note, updatedAt: ctx.now });
    return mutation;
  }

  const twin = data.entries.find(e => sameSlot(e, slot));
  if (twin) fail(`${role} da ${company} já está lançado neste dia (${twin.quantity}). Edite a quantidade na linha.`);
  mutation.insert.push({
    id: ctx.newId(),
    workId,
    ...slot,
    quantity: command.quantity,
    note,
    origin: ctx.importing ? 'planilha' : 'app',
    createdBy: ctx.actorId,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  });
  return mutation;
}

/** O mesmo resultado que o banco terá depois da gravação: a tela aplica na hora, sem reler a obra inteira
 * (uma obra de dois anos passa de dez mil linhas). */
export function applyHeadcountMutation(
  entries: readonly HeadcountEntry[],
  mutation: Pick<HeadcountMutation, 'insert' | 'update' | 'delete'>,
): HeadcountEntry[] {
  const removed = new Set(mutation.delete);
  const updated = new Map(mutation.update.map(e => [e.id, e]));
  return [...entries.filter(e => !removed.has(e.id)).map(e => updated.get(e.id) ?? e), ...mutation.insert];
}
