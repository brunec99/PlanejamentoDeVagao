import {
  TERMINALITY_LIMITS,
  terminalityPhotoPaths,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityFloor,
  type TerminalityItem,
  type TerminalityPerson,
  type TerminalityPhoto,
  type TerminalityType,
  type TerminalityUnit,
} from '../../domain/terminality';

/** Regras da aba 5 (Terminalidade), sem banco: recebe os dados atuais de UMA obra e devolve o que
 * gravar. A rota carrega a obra, chama o planejador e só então escreve, então tudo o que é recusa
 * de regra sai daqui como erro com mensagem pronta para o usuário. */

export type TerminalityTable = keyof TerminalityData;
export const TERMINALITY_TABLES: readonly TerminalityTable[] = ['floors', 'units', 'types', 'people', 'items', 'photos'];

/** Registros completos (já com `updatedAt`) a inserir ou atualizar, por tabela. */
export interface TerminalityRowSet {
  floors: TerminalityFloor[];
  units: TerminalityUnit[];
  types: TerminalityType[];
  people: TerminalityPerson[];
  items: TerminalityItem[];
  photos: TerminalityPhoto[];
}

/** O que um comando grava. O repositório aplica na ordem: apaga (filhos antes), insere (pais antes),
 * atualiza e, por último, remove os arquivos do bucket — falhar no meio deixa no máximo um arquivo
 * órfão, nunca uma linha apontando para foto que não existe. */
export interface TerminalityMutation {
  workId: string;
  insert: TerminalityRowSet;
  update: TerminalityRowSet;
  delete: Record<TerminalityTable, string[]>;
  /** Caminhos no bucket `terminalidade` a apagar depois das linhas. */
  removeFiles: string[];
}

export interface TerminalityContext {
  actorId: string;
  /** Instante ISO da gravação. */
  now: string;
  /** Data civil de hoje no fuso da obra; sem ela, vale a data UTC de `now`. A rota passa
   * `todayInSaoPaulo()` para "não pode estar no futuro" não errar entre 21h e meia-noite. */
  today?: string;
  newId: () => string;
}

/** Onde o comando atua: direto numa obra ou num registro cuja obra a rota precisa descobrir. */
export type TerminalityTarget = { workId: string } | { table: TerminalityTable; id: string };

export const TERMINALITY_COMMAND_TYPES = [
  'create_floors',
  'rename_floor',
  'reorder_floors',
  'delete_floor',
  'create_units',
  'rename_unit',
  'delete_unit',
  'create_type',
  'update_type',
  'create_person',
  'update_person',
  'create_item',
  'update_item',
  'add_photo',
  'delete_photo',
  'resolve_item',
  'reopen_item',
  'delete_item',
] as const satisfies readonly TerminalityCommand['type'][];

/** Limite de nomes num cadastro em lote: um prédio inteiro cabe com folga. */
export const MAX_BATCH_NAMES = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_SIDE = 20_000;

const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
/** Id opcional: o navegador pode mandar `null` ou texto vazio para "sem unidade", "sem tipo"... */
const optionalId = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value : fail('Identificador inválido.');
};
const requiredId = (value: unknown, message: string) => (typeof value === 'string' && value ? value : fail(message));

/** "Térreo", "terreo" e " TÉRREO " são o mesmo nome: a comparação ignora acento, caixa e espaços repetidos. */
export const normalizeTerminalityName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function validName(value: unknown, label: string) {
  const name = text(value).replace(/\s+/g, ' ');
  if (!name) fail(`Informe o nome ${label}.`);
  if (name.length > TERMINALITY_LIMITS.maxName) fail(`O nome ${label} passa de ${TERMINALITY_LIMITS.maxName} caracteres.`);
  return name;
}

function rejectDuplicate(name: string, existing: { id: string; name: string }[], message: string, selfId?: string) {
  const key = normalizeTerminalityName(name);
  if (existing.some(e => e.id !== selfId && normalizeTerminalityName(e.name) === key)) fail(message);
}

/** Cadastro em lote (pavimentos, unidades): ignora linhas vazias e recusa repetidos no lote ou já cadastrados. */
function batchNames(value: unknown, label: string, existing: { name: string }[], duplicate: (name: string) => string) {
  if (!Array.isArray(value)) fail('Lista de nomes inválida.');
  const names = (value as unknown[]).map(v => text(v)).filter(Boolean);
  if (!names.length) fail(`Informe ao menos um nome ${label}.`);
  if (names.length > MAX_BATCH_NAMES) fail(`Cadastre no máximo ${MAX_BATCH_NAMES} nomes por vez.`);
  const seen = new Set(existing.map(e => normalizeTerminalityName(e.name)));
  return names.map(raw => {
    const name = validName(raw, label);
    const key = normalizeTerminalityName(name);
    if (seen.has(key)) fail(duplicate(name));
    seen.add(key);
    return name;
  });
}

const nextOrder = (rows: { orderIndex: number }[]) => rows.reduce((max, r) => Math.max(max, r.orderIndex), -1) + 1;

function validDate(value: unknown, label: string) {
  const date = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail(`${label} inválida.`);
  return date;
}

function optionalCount(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return fail(`${label} da foto inválido.`);
  if (value > max) return fail(label === 'Tamanho' ? 'A foto passa do tamanho máximo permitido.' : `${label} da foto inválido.`);
  return value;
}

const emptyRows = (): TerminalityRowSet => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });
const emptyDeletes = (): Record<TerminalityTable, string[]> => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });

function mutation(workId: string, parts: Partial<Omit<TerminalityMutation, 'workId'>> = {}): TerminalityMutation {
  return { workId, insert: emptyRows(), update: emptyRows(), delete: emptyDeletes(), removeFiles: [], ...parts };
}
const rows = (partial: Partial<TerminalityRowSet>): TerminalityRowSet => ({ ...emptyRows(), ...partial });
const deletes = (partial: Partial<Record<TerminalityTable, string[]>>) => ({ ...emptyDeletes(), ...partial });

function find<T extends { id: string }>(list: T[], id: unknown, message: string): T {
  return list.find(r => r.id === id) ?? fail(message);
}

/** A obra (ou o registro) que o comando altera; a rota confere o acesso antes de carregar os dados. */
export function terminalityCommandTarget(command: TerminalityCommand): TerminalityTarget {
  switch (command.type) {
    case 'create_floors':
    case 'reorder_floors':
    case 'create_type':
    case 'create_person':
    case 'create_item':
      return { workId: requiredId(command.workId, 'Obra não informada.') };
    case 'rename_floor':
    case 'delete_floor':
    case 'create_units':
      return { table: 'floors', id: requiredId(command.floorId, 'Pavimento não informado.') };
    case 'rename_unit':
    case 'delete_unit':
      return { table: 'units', id: requiredId(command.unitId, 'Unidade não informada.') };
    case 'update_type':
      return { table: 'types', id: requiredId(command.typeId, 'Tipo de pendência não informado.') };
    case 'update_person':
      return { table: 'people', id: requiredId(command.personId, 'Responsável ATR não informado.') };
    case 'update_item':
    case 'add_photo':
    case 'resolve_item':
    case 'reopen_item':
    case 'delete_item':
      return { table: 'items', id: requiredId(command.itemId, 'Pendência não informada.') };
    case 'delete_photo':
      return { table: 'photos', id: requiredId(command.photoId, 'Foto não informada.') };
    default:
      return fail('Comando desconhecido.');
  }
}

/** Confere só o formato mínimo do corpo (objeto com tipo conhecido); o resto o planejador valida. */
export function parseTerminalityCommand(body: unknown): TerminalityCommand {
  const type = (body as { type?: unknown } | null)?.type;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof type !== 'string') return fail('Comando inválido.');
  if (!(TERMINALITY_COMMAND_TYPES as readonly string[]).includes(type)) return fail('Comando desconhecido.');
  return body as TerminalityCommand;
}

type ItemFields = Pick<TerminalityItem, 'floorId' | 'unitId' | 'description' | 'typeId' | 'observedOn' | 'atrPersonId' | 'contractor'>;

/** Campos comuns a criar e editar pendência. Em edição, tipo e responsável já desativados podem
 * continuar na pendência (o histórico não muda), mas não ser escolhidos de novo. */
function itemFields(
  data: TerminalityData,
  workId: string,
  input: Extract<TerminalityCommand, { type: 'create_item' | 'update_item' }>,
  today: string,
  current?: TerminalityItem,
): ItemFields {
  const floor = find(data.floors, input.floorId, 'Pavimento não encontrado.');
  if (floor.workId !== workId) fail('O pavimento não pertence a esta obra.');
  const unitId = optionalId(input.unitId);
  if (unitId) {
    const unit = find(data.units, unitId, 'Unidade não encontrada.');
    if (unit.floorId !== floor.id) fail('A unidade não pertence ao pavimento escolhido.');
  }
  const typeId = optionalId(input.typeId);
  if (typeId) {
    const type = find(data.types, typeId, 'Tipo de pendência não encontrado.');
    if (type.workId !== workId) fail('O tipo de pendência não pertence a esta obra.');
    if (!type.active && current?.typeId !== typeId) fail(`O tipo "${type.name}" está desativado.`);
  }
  const atrPersonId = optionalId(input.atrPersonId);
  if (atrPersonId) {
    const person = find(data.people, atrPersonId, 'Responsável ATR não encontrado.');
    if (person.workId !== workId) fail('O responsável ATR não pertence a esta obra.');
    if (!person.active && current?.atrPersonId !== atrPersonId) fail(`O responsável "${person.name}" está desativado.`);
  }
  const observedOn = validDate(input.observedOn, 'Data da observação');
  if (observedOn > today) fail('A data da observação não pode estar no futuro.');
  const description = text(input.description);
  if (!description) fail('Descreva a pendência.');
  if (description.length > TERMINALITY_LIMITS.maxDescription) fail(`A descrição passa de ${TERMINALITY_LIMITS.maxDescription} caracteres.`);
  if (input.contractor !== undefined && input.contractor !== null && typeof input.contractor !== 'string')
    fail('Responsável terceiro inválido.');
  const contractor = text(input.contractor) || undefined;
  if (contractor && contractor.length > TERMINALITY_LIMITS.maxName)
    fail(`O nome do responsável terceiro passa de ${TERMINALITY_LIMITS.maxName} caracteres.`);
  return { floorId: floor.id, unitId, description, typeId, observedOn, atrPersonId, contractor };
}

/** Planeja a gravação de um comando sobre os dados da obra a que ele se refere. */
export function planTerminalityCommand(data: TerminalityData, command: TerminalityCommand, ctx: TerminalityContext): TerminalityMutation {
  const { now, actorId } = ctx;
  const today = ctx.today ?? now.slice(0, 10);
  const stamp = { createdAt: now, updatedAt: now };

  switch (command.type) {
    case 'create_floors': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      const current = data.floors.filter(f => f.workId === workId);
      const names = batchNames(command.names, 'do pavimento', current, name => `Já existe o pavimento "${name}".`);
      const start = nextOrder(current);
      const floors = names.map((name, i): TerminalityFloor => ({ id: ctx.newId(), workId, name, orderIndex: start + i, ...stamp }));
      return mutation(workId, { insert: rows({ floors }) });
    }
    case 'rename_floor': {
      const floor = find(data.floors, command.floorId, 'Pavimento não encontrado.');
      const name = validName(command.name, 'do pavimento');
      const siblings = data.floors.filter(f => f.workId === floor.workId);
      rejectDuplicate(name, siblings, `Já existe o pavimento "${name}".`, floor.id);
      return mutation(floor.workId, { update: rows({ floors: [{ ...floor, name, updatedAt: now }] }) });
    }
    case 'reorder_floors': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      const current = data.floors.filter(f => f.workId === workId);
      const ids = Array.isArray(command.floorIds) ? command.floorIds : [];
      // A nova ordem tem de citar cada pavimento uma vez: outra pessoa pode ter criado ou apagado um no meio tempo.
      const exact = ids.length === current.length && new Set(ids).size === ids.length && ids.every(id => current.some(f => f.id === id));
      if (!exact) fail('A lista de pavimentos mudou. Recarregue a página e reordene de novo.');
      const floors = ids
        .map((id, orderIndex) => ({ floor: current.find(f => f.id === id)!, orderIndex }))
        .filter(({ floor, orderIndex }) => floor.orderIndex !== orderIndex)
        .map(({ floor, orderIndex }) => ({ ...floor, orderIndex, updatedAt: now }));
      return mutation(workId, { update: rows({ floors }) });
    }
    case 'delete_floor': {
      const floor = find(data.floors, command.floorId, 'Pavimento não encontrado.');
      if (data.items.some(i => i.floorId === floor.id)) fail('O pavimento tem pendências registradas e não pode ser apagado.');
      if (data.units.some(u => u.floorId === floor.id)) fail('Apague as unidades do pavimento antes de apagá-lo.');
      return mutation(floor.workId, { delete: deletes({ floors: [floor.id] }) });
    }
    case 'create_units': {
      const floor = find(data.floors, command.floorId, 'Pavimento não encontrado.');
      const current = data.units.filter(u => u.floorId === floor.id);
      const names = batchNames(command.names, 'da unidade', current, name => `O pavimento ${floor.name} já tem a unidade "${name}".`);
      const start = nextOrder(current);
      const units = names.map((name, i): TerminalityUnit => ({
        id: ctx.newId(),
        workId: floor.workId,
        floorId: floor.id,
        name,
        orderIndex: start + i,
        ...stamp,
      }));
      return mutation(floor.workId, { insert: rows({ units }) });
    }
    case 'rename_unit': {
      const unit = find(data.units, command.unitId, 'Unidade não encontrada.');
      const name = validName(command.name, 'da unidade');
      rejectDuplicate(
        name,
        data.units.filter(u => u.floorId === unit.floorId),
        `O pavimento já tem a unidade "${name}".`,
        unit.id,
      );
      return mutation(unit.workId, { update: rows({ units: [{ ...unit, name, updatedAt: now }] }) });
    }
    case 'delete_unit': {
      const unit = find(data.units, command.unitId, 'Unidade não encontrada.');
      if (data.items.some(i => i.unitId === unit.id)) fail('A unidade tem pendências registradas e não pode ser apagada.');
      return mutation(unit.workId, { delete: deletes({ units: [unit.id] }) });
    }
    case 'create_type': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      const current = data.types.filter(t => t.workId === workId);
      const name = validName(command.name, 'do tipo');
      // Inclui os desativados: o banco tem nome único por obra, e reativar é o caminho para reusar.
      rejectDuplicate(name, current, `Já existe o tipo "${name}". Se estiver desativado, reative-o.`);
      const type: TerminalityType = { id: ctx.newId(), workId, name, orderIndex: nextOrder(current), active: true, ...stamp };
      return mutation(workId, { insert: rows({ types: [type] }) });
    }
    case 'update_type': {
      const type = find(data.types, command.typeId, 'Tipo de pendência não encontrado.');
      const next = { ...type, updatedAt: now };
      if (command.name !== undefined) {
        next.name = validName(command.name, 'do tipo');
        rejectDuplicate(
          next.name,
          data.types.filter(t => t.workId === type.workId),
          `Já existe o tipo "${next.name}".`,
          type.id,
        );
      }
      if (command.active !== undefined) {
        if (typeof command.active !== 'boolean') fail('Situação do tipo inválida.');
        next.active = command.active;
      }
      return mutation(type.workId, { update: rows({ types: [next] }) });
    }
    case 'create_person': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      const name = validName(command.name, 'do responsável');
      rejectDuplicate(
        name,
        data.people.filter(p => p.workId === workId),
        `Já existe o responsável "${name}". Se estiver desativado, reative-o.`,
      );
      const person: TerminalityPerson = { id: ctx.newId(), workId, name, active: true, ...stamp };
      return mutation(workId, { insert: rows({ people: [person] }) });
    }
    case 'update_person': {
      const person = find(data.people, command.personId, 'Responsável ATR não encontrado.');
      const next = { ...person, updatedAt: now };
      if (command.name !== undefined) {
        next.name = validName(command.name, 'do responsável');
        rejectDuplicate(
          next.name,
          data.people.filter(p => p.workId === person.workId),
          `Já existe o responsável "${next.name}".`,
          person.id,
        );
      }
      if (command.active !== undefined) {
        if (typeof command.active !== 'boolean') fail('Situação do responsável inválida.');
        next.active = command.active;
      }
      return mutation(person.workId, { update: rows({ people: [next] }) });
    }
    case 'create_item': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      // O id vem do navegador para a foto subir logo em seguida; tem de ser UUID e inédito.
      if (typeof command.itemId !== 'string' || !UUID.test(command.itemId)) fail('Identificador da pendência inválido.');
      if (data.items.some(i => i.id === command.itemId)) fail('Esta pendência já foi registrada.');
      const fields = itemFields(data, workId, command, today);
      const item: TerminalityItem = { id: command.itemId, workId, ...fields, status: 'open', createdBy: actorId, ...stamp };
      return mutation(workId, { insert: rows({ items: [item] }) });
    }
    case 'update_item': {
      const item = find(data.items, command.itemId, 'Pendência não encontrada.');
      const fields = itemFields(data, item.workId, command, today, item);
      if (item.correctedOn && fields.observedOn > item.correctedOn) fail('A data da observação não pode ser posterior à data da correção.');
      return mutation(item.workId, { update: rows({ items: [{ ...item, ...fields, updatedAt: now }] }) });
    }
    case 'add_photo': {
      const item = find(data.items, command.itemId, 'Pendência não encontrada.');
      if (typeof command.photoId !== 'string' || !UUID.test(command.photoId)) fail('Identificador da foto inválido.');
      if (data.photos.some(p => p.id === command.photoId)) fail('Esta foto já foi registrada.');
      if (command.kind !== 'issue' && command.kind !== 'correction') fail('Tipo de foto inválido.');
      // Só aceita os caminhos que a rota de envio liberou: impede apontar para arquivo de outra obra.
      const paths = terminalityPhotoPaths(item.workId, item.id, command.photoId);
      if (command.storagePath !== paths.storagePath || command.thumbPath !== paths.thumbPath) fail('Caminho da foto inválido.');
      if (data.photos.filter(p => p.itemId === item.id).length >= TERMINALITY_LIMITS.maxPhotosPerItem)
        fail(`A pendência já tem ${TERMINALITY_LIMITS.maxPhotosPerItem} fotos, o máximo permitido.`);
      const photo: TerminalityPhoto = {
        id: command.photoId,
        itemId: item.id,
        workId: item.workId,
        kind: command.kind,
        ...paths,
        width: optionalCount(command.width, 'Largura', MAX_IMAGE_SIDE),
        height: optionalCount(command.height, 'Altura', MAX_IMAGE_SIDE),
        bytes: optionalCount(command.bytes, 'Tamanho', TERMINALITY_LIMITS.maxPhotoBytes),
        createdBy: actorId,
        createdAt: now,
      };
      return mutation(item.workId, { insert: rows({ photos: [photo] }) });
    }
    case 'delete_photo': {
      const photo = find(data.photos, command.photoId, 'Foto não encontrada.');
      const item = data.items.find(i => i.id === photo.itemId);
      if (item?.status === 'resolved' && photo.kind === 'correction') {
        const corrections = data.photos.filter(p => p.itemId === item.id && p.kind === 'correction');
        if (corrections.length <= 1) fail('Reabra a pendência antes de apagar a última foto da correção.');
      }
      return mutation(photo.workId, { delete: deletes({ photos: [photo.id] }), removeFiles: [photo.storagePath, photo.thumbPath] });
    }
    case 'resolve_item': {
      const item = find(data.items, command.itemId, 'Pendência não encontrada.');
      if (item.status !== 'open') fail('A pendência já está resolvida.');
      const correctedOn = validDate(command.correctedOn, 'Data da correção');
      if (correctedOn < item.observedOn) fail('A data da correção não pode ser anterior à data da observação.');
      if (correctedOn > today) fail('A data da correção não pode estar no futuro.');
      if (!data.photos.some(p => p.itemId === item.id && p.kind === 'correction'))
        fail('Envie a foto da correção para marcar como resolvida.');
      const resolved: TerminalityItem = { ...item, status: 'resolved', correctedOn, resolvedAt: now, resolvedBy: actorId, updatedAt: now };
      return mutation(item.workId, { update: rows({ items: [resolved] }) });
    }
    case 'reopen_item': {
      const item = find(data.items, command.itemId, 'Pendência não encontrada.');
      if (item.status !== 'resolved') fail('A pendência já está aberta.');
      const reopened: TerminalityItem = { ...item, status: 'open', updatedAt: now };
      delete reopened.correctedOn;
      delete reopened.resolvedAt;
      delete reopened.resolvedBy;
      return mutation(item.workId, { update: rows({ items: [reopened] }) });
    }
    case 'delete_item': {
      const item = find(data.items, command.itemId, 'Pendência não encontrada.');
      const photos = data.photos.filter(p => p.itemId === item.id);
      return mutation(item.workId, {
        // As linhas das fotos saem pelo cascade, no mesmo comando que apaga a pendência; os arquivos, o repositório remove depois.
        delete: deletes({ items: [item.id] }),
        removeFiles: photos.flatMap(p => [p.storagePath, p.thumbPath]),
      });
    }
    default:
      return fail('Comando desconhecido.');
  }
}
