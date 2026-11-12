import {
  CHECKLIST_ANSWERS,
  CHECKLIST_FREQUENCIES,
  CHECKLIST_LIMITS,
  checklistKey,
  checklistPhotoPath,
  checklistSignaturePath,
  cleanChecklistText,
  isIsoDay,
  isJpegBase64,
  isPngBase64,
  periodKey,
  type ChecklistAnswer,
  type ChecklistCommand,
  type ChecklistData,
  type ChecklistEquipment,
  type ChecklistFrequency,
  type ChecklistModel,
  type ChecklistPhotoInput,
  type ChecklistRun,
  type OperatorRunInput,
} from '../../domain/equipment-checklist';

/** Regras da aba 9, Checklist de equipamentos (11/11/2026). Mesmo desenho da segurança
 * (`safety-commands.ts`): `parseChecklistCommand` confere a forma, `planChecklistCommand` aplica as regras
 * sobre os modelos (todos) e os equipamentos e inspeções de UMA obra, e devolve só o que gravar. Puro, sem
 * banco. Toda recusa de regra sai como erro com mensagem pronta para o usuário. */

export interface ChecklistMutation {
  /** A obra do que é gravado; ausente nos comandos de modelo (lista única, sem obra). */
  workId?: string;
  insert: { models: ChecklistModel[]; equipment: ChecklistEquipment[]; runs: ChecklistRun[] };
  update: { models: ChecklistModel[]; equipment: ChecklistEquipment[]; runs: ChecklistRun[] };
  deleteRuns: string[];
  /** Arquivos do bucket `checklist` (12/11/2026): os que sobem antes de gravar as linhas (base64) e os que
   * saem depois (foto removida, assinatura trocada, inspeção excluída). */
  uploads: { path: string; contentType: 'image/jpeg' | 'image/png'; data: string }[];
  removeFiles: string[];
}

export interface ChecklistContext {
  actorId: string;
  now: string;
  /** Data civil de hoje no fuso da obra. */
  today?: string;
  newId: () => string;
  /** Segredo novo para o link do operador. Sem ele (testes), sai dois ids colados. */
  newToken?: () => string;
  /** O comando veio do link do operador (sem login): só inspeção nova, de hoje, do que está pendente no
   * período, com nome e assinatura. */
  viaLink?: boolean;
}

/** Onde o comando atua: na lista única de modelos, direto numa obra, ou num registro cuja obra a rota descobre. */
export type ChecklistTarget = { global: true } | { workId: string } | { table: 'equipment' | 'runs'; id: string };

/** Editam os checklists (modelos, equipamentos e inspeções) o tipo TST e os administradores, como na
 * aba 6 — pedido do usuário em 11/11/2026: "checklist permita que o tst edite". Os demais só consultam. */
export const canWriteChecklist = (profile: { tst?: boolean; role?: string } | null | undefined): boolean =>
  profile?.tst === true || profile?.role === 'admin';

/** Cadastro (modelos, equipamentos e o link do QR) só com administradores, desde 12/11/2026 — pedido da
 * equipe de SST, "para não gerar conflito nas informações". O TST segue registrando e corrigindo inspeções. */
export const canManageChecklist = (profile: { role?: string } | null | undefined): boolean => profile?.role === 'admin';
export const checklistCommandNeedsAdmin = (command: ChecklistCommand): boolean =>
  command.type !== 'save_run' && command.type !== 'delete_run';

const fail = (message: string): never => {
  throw new Error(message);
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string): string => (typeof value === 'string' ? value : fail(`Campo inválido: ${field}.`));
const bool = (value: unknown, field: string): boolean => (typeof value === 'boolean' ? value : fail(`Campo inválido: ${field}.`));
const optionalText = (value: unknown, field: string): string | undefined =>
  value === undefined ? undefined : typeof value === 'string' ? value : fail(`Campo inválido: ${field}.`);

export function parseChecklistCommand(body: unknown): ChecklistCommand {
  if (!isRecord(body)) return fail('Comando inválido.');
  switch (body.type) {
    case 'save_model': {
      const id = optionalText(body.id, 'id');
      const frequency = text(body.frequency, 'frequency') as ChecklistFrequency;
      if (!CHECKLIST_FREQUENCIES.includes(frequency)) return fail('Periodicidade inválida.');
      if (!Array.isArray(body.items)) return fail('Campo inválido: items.');
      const items = body.items.map(item => {
        if (!isRecord(item)) return fail('Campo inválido: items.');
        const itemId = optionalText(item.id, 'items.id');
        return { ...(itemId ? { id: itemId } : {}), text: text(item.text, 'items.text') };
      });
      return {
        type: 'save_model',
        ...(id ? { id } : {}),
        name: text(body.name, 'name'),
        equipmentType: text(body.equipmentType, 'equipmentType'),
        frequency,
        items,
      };
    }
    case 'set_model_active':
      return { type: 'set_model_active', id: text(body.id, 'id'), active: bool(body.active, 'active') };
    case 'save_equipment': {
      const id = optionalText(body.id, 'id');
      return {
        type: 'save_equipment',
        ...(id ? { id } : {}),
        workId: text(body.workId, 'workId'),
        name: text(body.name, 'name'),
        equipmentType: text(body.equipmentType, 'equipmentType'),
      };
    }
    case 'set_equipment_active':
      return { type: 'set_equipment_active', id: text(body.id, 'id'), active: bool(body.active, 'active') };
    case 'save_run': {
      const id = optionalText(body.id, 'id');
      const note = optionalText(body.note, 'note');
      if (!Array.isArray(body.answers)) return fail('Campo inválido: answers.');
      const answers = body.answers.map(answer => {
        if (!isRecord(answer)) return fail('Campo inválido: answers.');
        const value = text(answer.answer, 'answers.answer') as ChecklistAnswer;
        if (!CHECKLIST_ANSWERS.includes(value)) return fail('Resposta inválida.');
        const answerNote = optionalText(answer.note, 'answers.note');
        return { itemId: text(answer.itemId, 'answers.itemId'), answer: value, ...(answerNote !== undefined ? { note: answerNote } : {}) };
      });
      const operatorName = optionalText(body.operatorName, 'operatorName');
      const signature = optionalText(body.signature, 'signature');
      const photos = parsePhotos(body.photos);
      return {
        type: 'save_run',
        ...(id ? { id } : {}),
        workId: text(body.workId, 'workId'),
        equipmentId: text(body.equipmentId, 'equipmentId'),
        modelId: text(body.modelId, 'modelId'),
        doneOn: text(body.doneOn, 'doneOn'),
        answers,
        ...(note !== undefined ? { note } : {}),
        ...(operatorName !== undefined ? { operatorName } : {}),
        ...(signature ? { signature } : {}),
        ...(photos ? { photos } : {}),
      };
    }
    case 'rotate_equipment_token':
      return { type: 'rotate_equipment_token', id: text(body.id, 'id') };
    case 'delete_run':
      return { type: 'delete_run', id: text(body.id, 'id') };
    default:
      return fail('Comando desconhecido.');
  }
}

function parsePhotos(value: unknown): ChecklistPhotoInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return fail('Campo inválido: photos.');
  return value.map(photo => {
    if (!isRecord(photo)) return fail('Campo inválido: photos.');
    const data = optionalText(photo.data, 'photos.data');
    return { id: text(photo.id, 'photos.id'), ...(data ? { data } : {}) };
  });
}

/** O corpo que o link do operador manda: sem obra, equipamento, data nem id — quem define é o servidor. */
export function parseOperatorRun(body: unknown): OperatorRunInput {
  if (!isRecord(body)) return fail('Envio inválido.');
  const parsed = parseChecklistCommand({ ...body, type: 'save_run', id: undefined, workId: '', equipmentId: '', doneOn: '' });
  if (parsed.type !== 'save_run') return fail('Envio inválido.');
  return {
    modelId: parsed.modelId,
    answers: parsed.answers,
    ...(parsed.note !== undefined ? { note: parsed.note } : {}),
    operatorName: text(body.operatorName, 'operatorName'),
    signature: text(body.signature, 'signature'),
    ...(parsed.photos ? { photos: parsed.photos } : {}),
  };
}

export function checklistCommandTarget(command: ChecklistCommand): ChecklistTarget {
  switch (command.type) {
    case 'save_model':
    case 'set_model_active':
      return { global: true };
    case 'save_equipment':
      return command.id ? { table: 'equipment', id: command.id } : { workId: command.workId };
    case 'set_equipment_active':
    case 'rotate_equipment_token':
      return { table: 'equipment', id: command.id };
    case 'save_run':
      return command.id ? { table: 'runs', id: command.id } : { workId: command.workId };
    case 'delete_run':
      return { table: 'runs', id: command.id };
  }
}

const emptyMutation = (workId?: string): ChecklistMutation => ({
  ...(workId ? { workId } : {}),
  insert: { models: [], equipment: [], runs: [] },
  update: { models: [], equipment: [], runs: [] },
  deleteRuns: [],
  uploads: [],
  removeFiles: [],
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const newToken = (ctx: ChecklistContext) => (ctx.newToken ? ctx.newToken() : `${ctx.newId()}${ctx.newId()}`.replace(/[^A-Za-z0-9_-]/g, ''));

function cleanName(value: string, label: string): string {
  const clean = cleanChecklistText(value);
  if (!clean) fail(`Informe ${label}.`);
  if (clean.length > CHECKLIST_LIMITS.name) fail(`${label[0].toUpperCase()}${label.slice(1)}: até ${CHECKLIST_LIMITS.name} caracteres.`);
  return clean;
}

/** A grafia do tipo que já existe vence ("betoneira" vira "Betoneira"), para modelo e equipamento casarem. */
function knownType(value: string, data: ChecklistData): string {
  const key = checklistKey(value);
  const known = [...data.models, ...data.equipment].find(source => checklistKey(source.equipmentType) === key);
  return known?.equipmentType ?? value;
}

/** Aplica as regras de um comando. `data` traz todos os modelos e só os equipamentos e inspeções da obra
 * `workId` (a obra aberta na tela). */
export function planChecklistCommand(
  data: ChecklistData,
  command: ChecklistCommand,
  ctx: ChecklistContext,
  workId: string,
): ChecklistMutation {
  const today = ctx.today ?? ctx.now.slice(0, 10);

  switch (command.type) {
    case 'save_model': {
      const mutation = emptyMutation();
      const name = cleanName(command.name, 'o nome do checklist');
      const equipmentType = knownType(cleanName(command.equipmentType, 'o tipo de equipamento'), data);
      const current = command.id ? data.models.find(m => m.id === command.id) : undefined;
      if (command.id && !current) fail('Checklist não encontrado. Recarregue a página.');
      if (data.models.some(m => m.id !== command.id && checklistKey(m.name) === checklistKey(name)))
        fail(`Já existe um checklist chamado "${name}".`);
      if (!command.items.length) fail('Inclua pelo menos um item no checklist.');
      if (command.items.length > CHECKLIST_LIMITS.items) fail(`Um checklist tem até ${CHECKLIST_LIMITS.items} itens.`);
      const knownIds = new Set((current?.items ?? []).map(item => item.id));
      const usedIds = new Set<string>();
      const usedTexts = new Set<string>();
      const items = command.items.map(item => {
        const itemText = cleanChecklistText(item.text);
        if (!itemText) fail('Há um item em branco: escreva o texto ou remova a linha.');
        if (itemText.length > CHECKLIST_LIMITS.item) fail(`Cada item tem até ${CHECKLIST_LIMITS.item} caracteres.`);
        if (usedTexts.has(checklistKey(itemText))) fail(`O item "${itemText}" está repetido.`);
        usedTexts.add(checklistKey(itemText));
        // Só mantém o id de um item que já era deste modelo; o resto nasce com id novo.
        const id = item.id && knownIds.has(item.id) && !usedIds.has(item.id) ? item.id : ctx.newId();
        usedIds.add(id);
        return { id, text: itemText };
      });
      if (current)
        mutation.update.models.push({ ...current, name, equipmentType, frequency: command.frequency, items, updatedAt: ctx.now });
      else
        mutation.insert.models.push({
          id: ctx.newId(),
          name,
          equipmentType,
          frequency: command.frequency,
          items,
          active: true,
          createdBy: ctx.actorId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        });
      return mutation;
    }

    case 'set_model_active': {
      const mutation = emptyMutation();
      const current = data.models.find(m => m.id === command.id);
      if (!current) return fail('Checklist não encontrado. Recarregue a página.');
      if (current.active !== command.active) mutation.update.models.push({ ...current, active: command.active, updatedAt: ctx.now });
      return mutation;
    }

    case 'save_equipment': {
      const mutation = emptyMutation(workId);
      const name = cleanName(command.name, 'a identificação do equipamento');
      const equipmentType = knownType(cleanName(command.equipmentType, 'o tipo de equipamento'), data);
      const current = command.id ? data.equipment.find(e => e.id === command.id) : undefined;
      if (command.id && !current) fail('Equipamento não encontrado. Recarregue a página.');
      if (data.equipment.some(e => e.id !== command.id && checklistKey(e.name) === checklistKey(name)))
        fail(`Já existe um equipamento chamado "${name}" nesta obra.`);
      if (current) mutation.update.equipment.push({ ...current, name, equipmentType, updatedAt: ctx.now });
      else
        mutation.insert.equipment.push({
          id: ctx.newId(),
          workId,
          name,
          equipmentType,
          active: true,
          publicToken: newToken(ctx),
          createdBy: ctx.actorId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        });
      return mutation;
    }

    case 'rotate_equipment_token': {
      const mutation = emptyMutation(workId);
      const current = data.equipment.find(e => e.id === command.id);
      if (!current) return fail('Equipamento não encontrado. Recarregue a página.');
      mutation.update.equipment.push({ ...current, publicToken: newToken(ctx), updatedAt: ctx.now });
      return mutation;
    }

    case 'set_equipment_active': {
      const mutation = emptyMutation(workId);
      const current = data.equipment.find(e => e.id === command.id);
      if (!current) return fail('Equipamento não encontrado. Recarregue a página.');
      if (current.active !== command.active) mutation.update.equipment.push({ ...current, active: command.active, updatedAt: ctx.now });
      return mutation;
    }

    case 'delete_run': {
      const mutation = emptyMutation(workId);
      const run = data.runs.find(r => r.id === command.id);
      if (!run) return fail('Inspeção não encontrada. Recarregue a página.');
      mutation.deleteRuns.push(command.id);
      mutation.removeFiles.push(...run.photos.map(p => p.path), ...(run.signaturePath ? [run.signaturePath] : []));
      return mutation;
    }

    case 'save_run': {
      const mutation = emptyMutation(workId);
      const current = command.id ? data.runs.find(r => r.id === command.id) : undefined;
      if (command.id && !current) fail('Inspeção não encontrada. Recarregue a página.');
      const equipment = data.equipment.find(e => e.id === command.equipmentId);
      if (!equipment) return fail('Equipamento não encontrado. Recarregue a página.');
      const model = data.models.find(m => m.id === command.modelId);
      if (!model) return fail('Checklist não encontrado. Recarregue a página.');
      if (current && (current.equipmentId !== equipment.id || current.modelId !== model.id))
        fail('A inspeção é de outro equipamento ou checklist. Recarregue a página.');
      if (!current) {
        if (!equipment.active) fail('Este equipamento está desativado.');
        if (!model.active) fail('Este checklist está desativado.');
        if (checklistKey(model.equipmentType) !== checklistKey(equipment.equipmentType))
          fail(`O checklist "${model.name}" é de ${model.equipmentType}, e o equipamento é ${equipment.equipmentType}.`);
      }
      if (!isIsoDay(command.doneOn)) fail('Data inválida.');
      if (command.doneOn > today) fail('Data no futuro: a inspeção é registrada no dia ou depois dele.');
      if (command.doneOn < '2020-01-01') fail('Data anterior a 2020: confira o ano.');
      if (ctx.viaLink) {
        // Pelo link do operador: só inspeção nova, de hoje, e só o que ainda está pendente no período.
        if (current) fail('Pelo link não se edita uma inspeção. Procure o técnico de segurança.');
        if (command.doneOn !== today) fail('Pelo link só se registra a inspeção de hoje.');
        const period = periodKey(model.frequency, today);
        const done = data.runs.find(
          r => r.equipmentId === equipment.id && r.modelId === model.id && periodKey(model.frequency, r.doneOn) === period,
        );
        if (done) fail(`"${model.name}" já foi preenchido neste período. Atualize a página.`);
      }
      if (
        data.runs.some(r => r.id !== command.id && r.equipmentId === equipment.id && r.modelId === model.id && r.doneOn === command.doneOn)
      )
        fail(`"${model.name}" já foi preenchido para ${equipment.name} neste dia. Abra a inspeção para editar.`);

      // Na edição valem os itens que a inspeção guardou; na nova, os do modelo de hoje.
      const expected = current ? current.answers.map(a => ({ id: a.itemId, text: a.text })) : model.items;
      const given = new Map(command.answers.map(a => [a.itemId, a]));
      if (given.size !== command.answers.length) fail('Há item respondido duas vezes.');
      if (command.answers.some(a => !expected.some(item => item.id === a.itemId)))
        fail('O checklist mudou enquanto você preenchia. Recarregue a página.');
      const answers = expected.map(item => {
        const answer = given.get(item.id);
        if (!answer) return fail(`Responda o item "${item.text}".`);
        const note = cleanChecklistText(answer.note ?? '');
        if (note.length > CHECKLIST_LIMITS.note) fail(`Observação do item: até ${CHECKLIST_LIMITS.note} caracteres.`);
        if (answer.answer === 'nc' && !note) fail(`Descreva a não conformidade do item "${item.text}".`);
        return { itemId: item.id, text: item.text, answer: answer.answer, note };
      });
      const note = cleanChecklistText(command.note ?? '');
      if (note.length > CHECKLIST_LIMITS.note) fail(`Observação: até ${CHECKLIST_LIMITS.note} caracteres.`);

      const runId = current?.id ?? ctx.newId();
      const operatorName = command.operatorName === undefined ? (current?.operatorName ?? '') : cleanChecklistText(command.operatorName);
      if (operatorName.length > CHECKLIST_LIMITS.operator) fail(`Nome do operador: até ${CHECKLIST_LIMITS.operator} caracteres.`);
      if (ctx.viaLink && operatorName.split(' ').length < 2) fail('Escreva seu nome completo (nome e sobrenome).');

      // Assinatura: uma nova substitui a guardada (o arquivo antigo sai); sem nova, fica a que existe.
      let signaturePath = current?.signaturePath ?? null;
      let signedAt = current?.signedAt ?? null;
      if (command.signature) {
        if (command.signature.length > CHECKLIST_LIMITS.signatureData || !isPngBase64(command.signature))
          fail('Assinatura inválida. Limpe o quadro e assine de novo.');
        if (!operatorName) fail('Informe o nome de quem assina.');
        if (signaturePath) mutation.removeFiles.push(signaturePath);
        signaturePath = checklistSignaturePath(workId, runId, ctx.newId());
        signedAt = ctx.now;
        mutation.uploads.push({ path: signaturePath, contentType: 'image/png', data: command.signature });
      }
      if (ctx.viaLink && !signaturePath) fail('Assine no quadro antes de enviar.');

      // Fotos: a lista do comando é a final. Id que a inspeção já tem fica; o resto precisa trazer o JPEG.
      let photos = current?.photos ?? [];
      if (command.photos) {
        if (command.photos.length > CHECKLIST_LIMITS.photos) fail(`Uma inspeção tem até ${CHECKLIST_LIMITS.photos} fotos.`);
        const kept = new Map(photos.map(p => [p.id, p]));
        const seen = new Set<string>();
        const next = command.photos.map(photo => {
          if (!SAFE_ID.test(photo.id) || seen.has(photo.id)) return fail('Foto inválida. Remova e escolha de novo.');
          seen.add(photo.id);
          const existing = kept.get(photo.id);
          if (existing) return { id: existing.id, path: existing.path };
          if (!photo.data) return fail('Foto não encontrada. Recarregue a página.');
          if (photo.data.length > CHECKLIST_LIMITS.photoData || !isJpegBase64(photo.data))
            return fail('Foto inválida ou grande demais. Tire a foto de novo.');
          const path = checklistPhotoPath(workId, runId, photo.id);
          mutation.uploads.push({ path, contentType: 'image/jpeg', data: photo.data });
          return { id: photo.id, path };
        });
        mutation.removeFiles.push(...photos.filter(p => !seen.has(p.id)).map(p => p.path));
        photos = next;
      }

      if (current)
        mutation.update.runs.push({
          ...current,
          doneOn: command.doneOn,
          answers,
          note,
          operatorName,
          signaturePath,
          signedAt,
          photos,
          updatedAt: ctx.now,
        });
      else
        mutation.insert.runs.push({
          id: runId,
          workId,
          equipmentId: equipment.id,
          modelId: model.id,
          modelName: model.name,
          frequency: model.frequency,
          doneOn: command.doneOn,
          answers,
          note,
          operatorName,
          signaturePath,
          signedAt,
          photos,
          source: ctx.viaLink ? 'link' : 'app',
          createdBy: ctx.actorId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        });
      return mutation;
    }
  }
}

/** A inspeção que chega pelo link do operador vira um `save_run` de hoje, com as regras do link. */
export function planOperatorRun(
  data: ChecklistData,
  input: OperatorRunInput,
  ctx: ChecklistContext,
  equipment: Pick<ChecklistEquipment, 'id' | 'workId'>,
): ChecklistMutation {
  const today = ctx.today ?? ctx.now.slice(0, 10);
  return planChecklistCommand(
    data,
    { type: 'save_run', workId: equipment.workId, equipmentId: equipment.id, doneOn: today, ...input },
    { ...ctx, viaLink: true },
    equipment.workId,
  );
}
