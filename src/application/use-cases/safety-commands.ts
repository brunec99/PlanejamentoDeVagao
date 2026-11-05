import {
  isSafetyConsequence,
  isSafetyProbability,
  SAFETY_LIMITS,
  safetyPhotoPaths,
  type SafetyCommand,
  type SafetyConsequence,
  type SafetyData,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyProbability,
  type SafetyType,
} from '../../domain/safety';

/** Regras da aba 6 (Segurança do trabalho), sem banco: recebe os tipos (todos, a lista é única) e os
 * apontamentos de UMA obra e devolve o que gravar. O processo é o da terminalidade
 * (`terminality-commands.ts`); quem pode gravar (só TST) não é assunto daqui: a rota confere antes,
 * com `canWriteSafety`. Toda recusa de regra sai como erro com mensagem pronta para o usuário. */

export type SafetyTable = 'types' | 'items' | 'photos';
export const SAFETY_TABLES: readonly SafetyTable[] = ['types', 'items', 'photos'];

/** Registros completos (já com `updatedAt`) a inserir ou atualizar, por tabela. */
export interface SafetyRowSet {
  types: SafetyType[];
  items: SafetyItem[];
  photos: SafetyPhoto[];
}

/** O que um comando grava. O repositório aplica na ordem: apaga (filhos antes), insere (pais antes),
 * atualiza e, por último, remove os arquivos do bucket — falhar no meio deixa no máximo um arquivo
 * órfão, nunca uma linha apontando para foto que não existe. */
export interface SafetyMutation {
  /** Obra dos apontamentos e fotos gravados. Ausente só nos comandos de tipo, que são da lista única. */
  workId?: string;
  insert: SafetyRowSet;
  update: SafetyRowSet;
  delete: Record<SafetyTable, string[]>;
  /** Caminhos no bucket `seguranca` a apagar depois das linhas. */
  removeFiles: string[];
}

export interface SafetyContext {
  actorId: string;
  /** Instante ISO da gravação. */
  now: string;
  /** Data civil de hoje no fuso da obra; sem ela, vale a data UTC de `now` (a rota passa `todayInSaoPaulo()`). */
  today?: string;
  newId: () => string;
  /** importação da planilha: create_item grava origin 'planilha' e resolve_item dispensa a foto da correção */
  importing?: boolean;
}

/** Onde o comando atua: direto numa obra, num registro cuja obra a rota precisa descobrir ou na lista
 * única de tipos (sem obra; a rota exige só que a pessoa tenha acesso à obra aberta na tela). */
export type SafetyTarget = { workId: string } | { table: SafetyTable; id: string } | { global: true };

export const SAFETY_COMMAND_TYPES = [
  'create_type',
  'update_type',
  'reorder_types',
  'create_item',
  'update_item',
  'update_items',
  'add_photo',
  'delete_photo',
  'resolve_item',
  'reopen_item',
  'delete_item',
] as const satisfies readonly SafetyCommand['type'][];

/** Só quem está marcado como TST grava na aba 6; papel (nem admin) não basta. Os demais com a obra
 * liberada consultam. Usada pelas rotas, e pela tela só para esconder botões. */
export const canWriteSafety = (profile: { tst?: boolean } | null | undefined): boolean => profile?.tst === true;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_SIDE = 20_000;

const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
/** Id opcional: o navegador pode mandar `null` ou texto vazio para "sem tipo". */
const optionalId = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'string' ? value : fail('Identificador inválido.');
};
const requiredId = (value: unknown, message: string) => (typeof value === 'string' && value ? value : fail(message));

/** "Sinalização", "sinalizacao" e " SINALIZAÇÃO " são o mesmo nome: a comparação ignora acento, caixa e
 * espaços repetidos (a pontuação conta: "EPI's" e "EPIs" são nomes diferentes). */
export const normalizeSafetyName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function validTypeName(value: unknown) {
  const name = text(value).replace(/\s+/g, ' ');
  if (!name) fail('Informe o nome do tipo.');
  if (name.length > SAFETY_LIMITS.maxName) fail(`O nome do tipo passa de ${SAFETY_LIMITS.maxName} caracteres.`);
  return name;
}

function rejectDuplicate(name: string, existing: { id: string; name: string }[], message: string, selfId?: string) {
  const key = normalizeSafetyName(name);
  if (existing.some(e => e.id !== selfId && normalizeSafetyName(e.name) === key)) fail(message);
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

function validConsequence(value: unknown): SafetyConsequence {
  if (value === undefined || value === null || value === '') return fail('Informe a consequência do risco.');
  return isSafetyConsequence(value) ? value : fail('Consequência do risco inválida.');
}

function validProbability(value: unknown): SafetyProbability {
  if (value === undefined || value === null || value === '') return fail('Informe a probabilidade do risco.');
  return isSafetyProbability(value) ? value : fail('Probabilidade do risco inválida.');
}

/** "Local" é texto livre e opcional: o histórico da planilha tem linhas sem local, então vazio vale. */
function validLocation(value: unknown) {
  if (value !== undefined && value !== null && typeof value !== 'string') fail('Local inválido.');
  const location = text(value).replace(/\s+/g, ' ');
  if (location.length > SAFETY_LIMITS.maxLocation) fail(`O local passa de ${SAFETY_LIMITS.maxLocation} caracteres.`);
  return location;
}

const emptyRows = (): SafetyRowSet => ({ types: [], items: [], photos: [] });
const emptyDeletes = (): Record<SafetyTable, string[]> => ({ types: [], items: [], photos: [] });

function mutation(workId: string | undefined, parts: Partial<Omit<SafetyMutation, 'workId'>> = {}): SafetyMutation {
  return { ...(workId ? { workId } : {}), insert: emptyRows(), update: emptyRows(), delete: emptyDeletes(), removeFiles: [], ...parts };
}
const rows = (partial: Partial<SafetyRowSet>): SafetyRowSet => ({ ...emptyRows(), ...partial });
const deletes = (partial: Partial<Record<SafetyTable, string[]>>) => ({ ...emptyDeletes(), ...partial });

function find<T extends { id: string }>(list: T[], id: unknown, message: string): T {
  return list.find(r => r.id === id) ?? fail(message);
}

/** A obra (ou o registro) que o comando altera; a rota confere o acesso antes de carregar os dados. */
export function safetyCommandTarget(command: SafetyCommand): SafetyTarget {
  switch (command.type) {
    case 'create_type':
    case 'reorder_types':
      return { global: true };
    case 'update_type':
      requiredId(command.typeId, 'Tipo de apontamento não informado.');
      return { global: true };
    case 'create_item':
    case 'update_items':
      return { workId: requiredId(command.workId, 'Obra não informada.') };
    case 'update_item':
    case 'add_photo':
    case 'resolve_item':
    case 'reopen_item':
    case 'delete_item':
      return { table: 'items', id: requiredId(command.itemId, 'Apontamento não informado.') };
    case 'delete_photo':
      return { table: 'photos', id: requiredId(command.photoId, 'Foto não informada.') };
    default:
      return fail('Comando desconhecido.');
  }
}

/** Confere só o formato mínimo do corpo (objeto com tipo conhecido); o resto o planejador valida. */
export function parseSafetyCommand(body: unknown): SafetyCommand {
  const type = (body as { type?: unknown } | null)?.type;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof type !== 'string') return fail('Comando inválido.');
  if (!(SAFETY_COMMAND_TYPES as readonly string[]).includes(type)) return fail('Comando desconhecido.');
  return body as SafetyCommand;
}

type ItemFields = Pick<SafetyItem, 'typeId' | 'consequence' | 'probability' | 'description' | 'location' | 'observedOn'>;

/** Campos comuns a criar e editar apontamento. Em edição, um tipo já desativado pode continuar no
 * apontamento (o histórico não muda), mas não ser escolhido de novo. */
function itemFields(
  data: SafetyData,
  input: Extract<SafetyCommand, { type: 'create_item' | 'update_item' }>,
  today: string,
  current?: SafetyItem,
): ItemFields {
  const typeId = optionalId(input.typeId);
  if (typeId) {
    const type = find(data.types, typeId, 'Tipo de apontamento não encontrado.');
    if (!type.active && current?.typeId !== typeId) fail(`O tipo "${type.name}" está desativado.`);
  }
  const consequence = validConsequence(input.consequence);
  const probability = validProbability(input.probability);
  const description = text(input.description);
  if (!description) fail('Descreva o apontamento.');
  if (description.length > SAFETY_LIMITS.maxDescription) fail(`A descrição passa de ${SAFETY_LIMITS.maxDescription} caracteres.`);
  const location = validLocation(input.location);
  const observedOn = validDate(input.observedOn, 'Data do apontamento');
  if (observedOn > today) fail('A data do apontamento não pode estar no futuro.');
  return { typeId, consequence, probability, description, location, observedOn };
}

/** Planeja a gravação de um comando sobre os tipos e os apontamentos da obra a que ele se refere. */
export function planSafetyCommand(data: SafetyData, command: SafetyCommand, ctx: SafetyContext): SafetyMutation {
  const { now, actorId } = ctx;
  const today = ctx.today ?? now.slice(0, 10);
  const stamp = { createdAt: now, updatedAt: now };

  switch (command.type) {
    case 'create_type': {
      const name = validTypeName(command.name);
      // Inclui os desativados: o banco tem nome único, e reativar é o caminho para reusar.
      rejectDuplicate(name, data.types, `Já existe o tipo "${name}". Se estiver desativado, reative-o.`);
      const type: SafetyType = { id: ctx.newId(), name, orderIndex: nextOrder(data.types), active: true, ...stamp };
      return mutation(undefined, { insert: rows({ types: [type] }) });
    }
    case 'update_type': {
      const type = find(data.types, command.typeId, 'Tipo de apontamento não encontrado.');
      const next = { ...type, updatedAt: now };
      if (command.name !== undefined) {
        next.name = validTypeName(command.name);
        rejectDuplicate(next.name, data.types, `Já existe o tipo "${next.name}". Se estiver desativado, reative-o.`, type.id);
      }
      if (command.active !== undefined) {
        if (typeof command.active !== 'boolean') fail('Situação do tipo inválida.');
        next.active = command.active;
      }
      return mutation(undefined, { update: rows({ types: [next] }) });
    }
    case 'reorder_types': {
      const ids = Array.isArray(command.typeIds) ? command.typeIds : [];
      // A nova ordem tem de citar cada tipo uma vez: outro TST pode ter criado um no meio tempo.
      const exact =
        ids.length === data.types.length && new Set(ids).size === ids.length && ids.every(id => data.types.some(t => t.id === id));
      if (!exact) fail('A lista de tipos mudou. Recarregue a página e reordene de novo.');
      const types = ids
        .map((id, orderIndex) => ({ type: data.types.find(t => t.id === id)!, orderIndex }))
        .filter(({ type, orderIndex }) => type.orderIndex !== orderIndex)
        .map(({ type, orderIndex }) => ({ ...type, orderIndex, updatedAt: now }));
      return mutation(undefined, { update: rows({ types }) });
    }
    case 'create_item': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      // O id vem do navegador para a foto subir logo em seguida; tem de ser UUID e inédito.
      if (typeof command.itemId !== 'string' || !UUID.test(command.itemId)) fail('Identificador do apontamento inválido.');
      if (data.items.some(i => i.id === command.itemId)) fail('Este apontamento já foi registrado.');
      const fields = itemFields(data, command, today);
      const item: SafetyItem = {
        id: command.itemId,
        workId,
        ...fields,
        status: 'open',
        origin: ctx.importing ? 'planilha' : 'app',
        createdBy: actorId,
        ...stamp,
      };
      return mutation(workId, { insert: rows({ items: [item] }) });
    }
    case 'update_item': {
      const item = find(data.items, command.itemId, 'Apontamento não encontrado.');
      const fields = itemFields(data, command, today, item);
      if (item.correctedOn && fields.observedOn > item.correctedOn)
        fail('A data do apontamento não pode ser posterior à data da correção.');
      // Status, origem e autor não mudam na edição: só os campos da planilha.
      return mutation(item.workId, { update: rows({ items: [{ ...item, ...fields, updatedAt: now }] }) });
    }
    case 'update_items': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      if (!Array.isArray(command.itemIds) || !command.itemIds.length) fail('Escolha ao menos um apontamento.');
      if (command.itemIds.length > SAFETY_LIMITS.maxBulkItems) fail(`Edite até ${SAFETY_LIMITS.maxBulkItems} apontamentos de cada vez.`);
      const ids = [...new Set(command.itemIds)];
      const items = ids.map(id =>
        find(data.items, typeof id === 'string' ? id : '', 'Um dos apontamentos não foi encontrado. Recarregue a página.'),
      );
      if (items.some(item => item.workId !== workId)) fail('Os apontamentos precisam ser desta obra.');
      const change: Partial<Pick<SafetyItem, 'typeId' | 'consequence' | 'probability' | 'location'>> = {};
      // Na edição em lote não se escolhe tipo desativado: a lista da tela só mostra os ativos.
      if (command.typeId !== undefined) {
        if (command.typeId === null || command.typeId === '') change.typeId = undefined;
        else {
          const type = find(data.types, command.typeId, 'Tipo de apontamento não encontrado.');
          if (!type.active) fail(`O tipo "${type.name}" está desativado.`);
          change.typeId = type.id;
        }
      }
      if (command.consequence !== undefined) change.consequence = validConsequence(command.consequence);
      if (command.probability !== undefined) change.probability = validProbability(command.probability);
      if (command.location !== undefined) change.location = validLocation(command.location);
      if (!Object.keys(change).length) fail('Escolha o que mudar: tipo, consequência, probabilidade ou local.');
      return mutation(workId, { update: rows({ items: items.map(item => ({ ...item, ...change, updatedAt: now })) }) });
    }
    case 'add_photo': {
      const item = find(data.items, command.itemId, 'Apontamento não encontrado.');
      if (typeof command.photoId !== 'string' || !UUID.test(command.photoId)) fail('Identificador da foto inválido.');
      if (data.photos.some(p => p.id === command.photoId)) fail('Esta foto já foi registrada.');
      if (command.kind !== 'issue' && command.kind !== 'correction') fail('Tipo de foto inválido.');
      // Só aceita os caminhos que a rota de envio liberou: impede apontar para arquivo de outra obra.
      const paths = safetyPhotoPaths(item.workId, item.id, command.photoId);
      if (command.storagePath !== paths.storagePath || command.thumbPath !== paths.thumbPath) fail('Caminho da foto inválido.');
      if (data.photos.filter(p => p.itemId === item.id).length >= SAFETY_LIMITS.maxPhotosPerItem)
        fail(`O apontamento já tem ${SAFETY_LIMITS.maxPhotosPerItem} fotos, o máximo permitido.`);
      const photo: SafetyPhoto = {
        id: command.photoId,
        itemId: item.id,
        workId: item.workId,
        kind: command.kind,
        ...paths,
        width: optionalCount(command.width, 'Largura', MAX_IMAGE_SIDE),
        height: optionalCount(command.height, 'Altura', MAX_IMAGE_SIDE),
        bytes: optionalCount(command.bytes, 'Tamanho', SAFETY_LIMITS.maxPhotoBytes),
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
        if (corrections.length <= 1) fail('Reabra o apontamento antes de apagar a última foto da correção.');
      }
      return mutation(photo.workId, { delete: deletes({ photos: [photo.id] }), removeFiles: [photo.storagePath, photo.thumbPath] });
    }
    case 'resolve_item': {
      const item = find(data.items, command.itemId, 'Apontamento não encontrado.');
      if (item.status !== 'open') fail('O apontamento já está finalizado.');
      const correctedOn = validDate(command.correctedOn, 'Data da correção');
      if (correctedOn < item.observedOn) fail('A data da correção não pode ser anterior à data do apontamento.');
      if (correctedOn > today) fail('A data da correção não pode estar no futuro.');
      // A importação da planilha traz apontamentos já corrigidos sem a foto no sistema; só ela dispensa a foto.
      if (!ctx.importing && !data.photos.some(p => p.itemId === item.id && p.kind === 'correction'))
        fail('Envie a foto da correção para finalizar o apontamento.');
      if (command.resolutionNote !== undefined && command.resolutionNote !== null && typeof command.resolutionNote !== 'string')
        fail('Descrição da correção inválida.');
      const note = text(command.resolutionNote);
      if (note.length > SAFETY_LIMITS.maxResolutionNote)
        fail(`A descrição da correção passa de ${SAFETY_LIMITS.maxResolutionNote} caracteres.`);
      const resolved: SafetyItem = {
        ...item,
        status: 'resolved',
        correctedOn,
        resolvedAt: now,
        resolvedBy: actorId,
        updatedAt: now,
        ...(note ? { resolutionNote: note } : {}),
      };
      return mutation(item.workId, { update: rows({ items: [resolved] }) });
    }
    case 'reopen_item': {
      const item = find(data.items, command.itemId, 'Apontamento não encontrado.');
      if (item.status !== 'resolved') fail('O apontamento já está aberto.');
      // A data, quem finalizou e "como foi corrigido" saem com a finalização; as fotos ficam. Aqui a
      // coluna `resolution_note` nasceu com a tabela (0040), então o repositório sempre grava o nulo e
      // a chave pode sair de vez (na aba 5 ela fica vazia por causa da migração 0034, posterior).
      const reopened: SafetyItem = { ...item, status: 'open', updatedAt: now };
      delete reopened.correctedOn;
      delete reopened.resolvedAt;
      delete reopened.resolvedBy;
      delete reopened.resolutionNote;
      return mutation(item.workId, { update: rows({ items: [reopened] }) });
    }
    case 'delete_item': {
      const item = find(data.items, command.itemId, 'Apontamento não encontrado.');
      const photos = data.photos.filter(p => p.itemId === item.id);
      return mutation(item.workId, {
        // As linhas das fotos saem pelo cascade, no mesmo comando que apaga o apontamento; os arquivos, o repositório remove depois.
        delete: deletes({ items: [item.id] }),
        removeFiles: photos.flatMap(p => [p.storagePath, p.thumbPath]),
      });
    }
    default:
      return fail('Comando desconhecido.');
  }
}
