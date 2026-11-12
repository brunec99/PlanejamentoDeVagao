import {
  CHECKLIST_BUCKET,
  type ChecklistData,
  type ChecklistEquipment,
  type ChecklistModel,
  type ChecklistPhoto,
  type ChecklistRun,
} from '../../../domain/equipment-checklist';
import type { ChecklistMutation } from '../../../application/use-cases/checklist-commands';
import { getServiceClient } from './client';

/** Leitura e gravação da aba 9, Checklist de equipamentos (migração 0047). Mesmo desenho da segurança
 * (`safety-repository.ts`): fora do snapshot do planejamento, cada comando grava só as linhas que mudou. */

const MODELS = 'checklist_models';
const EQUIPMENT = 'checklist_equipment';
const RUNS = 'checklist_runs';
const PAGE = 1000;

/** Migração 0047 não aplicada: a aba responde "indisponível" em vez de erro. Com `operator`, falta a 0048
 * (colunas do operador, da assinatura e das fotos, e o bucket): a leitura segue, a gravação avisa. */
export class ChecklistUnavailableError extends Error {
  constructor(readonly operator = false) {
    super(
      operator
        ? 'Aplique a migração 0048_checklist_operator.sql no Supabase para gravar inspeções com operador, assinatura e fotos.'
        : 'Aplique a migração 0047_equipment_checklist.sql no Supabase para usar o checklist de equipamentos.',
    );
    this.name = 'ChecklistUnavailableError';
  }
}
/** Outra gravação chegou antes (o mesmo checklist já preenchido no dia, registro apagado no meio tempo). */
export class ChecklistConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'ChecklistConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new ChecklistUnavailableError();
  // Coluna da 0048 ausente (42703 no Postgres, PGRST204 no cache do PostgREST).
  if (error.code === '42703' || error.code === 'PGRST204') throw new ChecklistUnavailableError(true);
  // 23505: a unicidade (equipamento, modelo, dia); 23503: a obra ou o equipamento foi excluído.
  if (error.code === '23505' || error.code === '23503') throw new ChecklistConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}

type ModelRow = {
  id: string;
  name: string;
  equipment_type: string;
  frequency: ChecklistModel['frequency'];
  items: ChecklistModel['items'];
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type EquipmentRow = {
  id: string;
  work_id: string;
  name: string;
  equipment_type: string;
  active: boolean;
  public_token?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type RunRow = {
  id: string;
  work_id: string;
  equipment_id: string;
  model_id: string;
  model_name: string;
  frequency: ChecklistRun['frequency'];
  done_on: string;
  answers: ChecklistRun['answers'];
  note: string;
  operator_name?: string;
  signature_path?: string | null;
  signed_at?: string | null;
  photos?: ChecklistPhoto[];
  source?: ChecklistRun['source'];
  created_by: string;
  created_at: string;
  updated_at: string;
};

const modelFromRow = (r: ModelRow): ChecklistModel => ({
  id: r.id,
  name: r.name,
  equipmentType: r.equipment_type,
  frequency: r.frequency,
  items: Array.isArray(r.items) ? r.items : [],
  active: r.active,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const modelToRow = (m: ChecklistModel): ModelRow => ({
  id: m.id,
  name: m.name,
  equipment_type: m.equipmentType,
  frequency: m.frequency,
  items: m.items,
  active: m.active,
  created_by: m.createdBy,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
});
const equipmentFromRow = (r: EquipmentRow): ChecklistEquipment => ({
  id: r.id,
  workId: r.work_id,
  name: r.name,
  equipmentType: r.equipment_type,
  active: r.active,
  publicToken: r.public_token ?? '',
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const equipmentToRow = (e: ChecklistEquipment): EquipmentRow => ({
  id: e.id,
  work_id: e.workId,
  name: e.name,
  equipment_type: e.equipmentType,
  active: e.active,
  public_token: e.publicToken,
  created_by: e.createdBy,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});
const runFromRow = (r: RunRow): ChecklistRun => ({
  id: r.id,
  workId: r.work_id,
  equipmentId: r.equipment_id,
  modelId: r.model_id,
  modelName: r.model_name,
  frequency: r.frequency,
  doneOn: r.done_on,
  answers: Array.isArray(r.answers) ? r.answers : [],
  note: r.note,
  operatorName: r.operator_name ?? '',
  signaturePath: r.signature_path ?? null,
  signedAt: r.signed_at ?? null,
  photos: Array.isArray(r.photos) ? r.photos.map(p => ({ id: p.id, path: p.path })) : [],
  source: r.source === 'link' ? 'link' : 'app',
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const runToRow = (r: ChecklistRun): RunRow => ({
  id: r.id,
  work_id: r.workId,
  equipment_id: r.equipmentId,
  model_id: r.modelId,
  model_name: r.modelName,
  frequency: r.frequency,
  done_on: r.doneOn,
  answers: r.answers,
  note: r.note,
  operator_name: r.operatorName,
  signature_path: r.signaturePath,
  signed_at: r.signedAt,
  photos: r.photos.map(p => ({ id: p.id, path: p.path })),
  source: r.source,
  created_by: r.createdBy,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
});

/** Os modelos (todos), os equipamentos da obra e as inspeções dela a partir de `since` (dia ISO). */
export async function loadChecklist(workId: string, since: string): Promise<ChecklistData> {
  const db = getServiceClient();
  const [models, equipment] = await Promise.all([
    db.from(MODELS).select('*').order('name'),
    db.from(EQUIPMENT).select('*').eq('work_id', workId).order('name'),
  ]);
  check(models.error, 'ler os checklists');
  check(equipment.error, 'ler os equipamentos');
  const runs: RunRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(RUNS)
      .select('*')
      .eq('work_id', workId)
      .gte('done_on', since)
      .order('done_on')
      .order('id')
      .range(from, from + PAGE - 1);
    check(error, 'ler as inspeções');
    runs.push(...((data ?? []) as RunRow[]));
    if ((data ?? []).length < PAGE) break;
  }
  return {
    models: ((models.data ?? []) as ModelRow[]).map(modelFromRow),
    equipment: ((equipment.data ?? []) as EquipmentRow[]).map(equipmentFromRow),
    runs: runs.map(runFromRow),
  };
}

/** Uma inspeção pelo id, mesmo fora da janela carregada (edição ou exclusão de inspeção antiga). */
export async function findChecklistRun(id: string): Promise<ChecklistRun | null> {
  const { data, error } = await getServiceClient().from(RUNS).select('*').eq('id', id).maybeSingle();
  check(error, 'localizar a inspeção');
  return data ? runFromRow(data as RunRow) : null;
}

/** A obra de um equipamento ou inspeção, ou null se não existe: a rota confere o acesso antes de gravar. */
export async function findChecklistWorkId(table: 'equipment' | 'runs', id: string): Promise<string | null> {
  const { data, error } = await getServiceClient()
    .from(table === 'runs' ? RUNS : EQUIPMENT)
    .select('work_id')
    .eq('id', id)
    .maybeSingle();
  check(error, 'localizar o registro');
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** O equipamento dono de um link de operador, ou null. Antes da 0048 a coluna não existe: "indisponível". */
export async function findEquipmentByToken(token: string): Promise<ChecklistEquipment | null> {
  const { data, error } = await getServiceClient().from(EQUIPMENT).select('*').eq('public_token', token).maybeSingle();
  check(error, 'localizar o equipamento');
  return data ? equipmentFromRow(data as EquipmentRow) : null;
}

/** Código e nome da obra, para o cabeçalho da tela do operador. */
export async function findWorkLabel(workId: string): Promise<{ code: string; name: string } | null> {
  const { data, error } = await getServiceClient().from('works').select('code, name').eq('id', workId).maybeSingle();
  if (error) throw new Error(`Falha ao ler a obra: ${error.message}`);
  return (data as { code: string; name: string } | null) ?? null;
}

const SIGNED_URL_SECONDS = 60 * 60;
/** URLs assinadas (uma hora; o bucket é privado) da assinatura e das fotos de uma inspeção. */
export async function signRunFiles(run: ChecklistRun): Promise<{ signatureUrl: string | null; photos: ChecklistPhoto[] }> {
  const paths = [...(run.signaturePath ? [run.signaturePath] : []), ...run.photos.map(p => p.path)];
  if (!paths.length) return { signatureUrl: null, photos: [] };
  const { data, error } = await getServiceClient().storage.from(CHECKLIST_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw new Error(`Falha ao assinar os arquivos: ${error.message}`);
  const signed = new Map<string, string>();
  for (const entry of data ?? []) if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  return {
    signatureUrl: (run.signaturePath && signed.get(run.signaturePath)) || null,
    photos: run.photos.map(p => ({ ...p, url: signed.get(p.path) })),
  };
}

/** Apaga arquivos do bucket sem derrubar a gravação: o que não sair fica órfão no bucket privado. */
async function removeFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  await getServiceClient()
    .storage.from(CHECKLIST_BUCKET)
    .remove(paths)
    .catch(() => undefined);
}

/** Aplica a mutação. Nunca upsert: um registro apagado por outra pessoa não renasce pela edição. Os arquivos
 * (assinatura e fotos) sobem antes das linhas; se a gravação das linhas falhar, os que subiram saem. */
export async function applyChecklistMutation(mutation: ChecklistMutation): Promise<void> {
  const db = getServiceClient();
  const uploaded: string[] = [];
  try {
    for (const file of mutation.uploads) {
      const { error } = await db.storage
        .from(CHECKLIST_BUCKET)
        .upload(file.path, Buffer.from(file.data, 'base64'), { contentType: file.contentType, upsert: false });
      if (error) {
        // Bucket ausente: a 0048 não foi aplicada.
        if (/bucket not found/i.test(error.message)) throw new ChecklistUnavailableError(true);
        throw new Error(`Falha ao enviar o arquivo: ${error.message}`);
      }
      uploaded.push(file.path);
    }
    await applyRows(mutation);
  } catch (error) {
    await removeFiles(uploaded);
    throw error;
  }
  await removeFiles(mutation.removeFiles);
}

async function applyRows(mutation: ChecklistMutation): Promise<void> {
  const db = getServiceClient();
  if (mutation.deleteRuns.length) {
    const { error } = await db
      .from(RUNS)
      .delete()
      .eq('work_id', mutation.workId ?? '')
      .in('id', mutation.deleteRuns);
    check(error, 'excluir a inspeção');
  }
  if (mutation.insert.models.length)
    check((await db.from(MODELS).insert(mutation.insert.models.map(modelToRow))).error, 'gravar o checklist');
  if (mutation.insert.equipment.length)
    check((await db.from(EQUIPMENT).insert(mutation.insert.equipment.map(equipmentToRow))).error, 'gravar o equipamento');
  if (mutation.insert.runs.length) check((await db.from(RUNS).insert(mutation.insert.runs.map(runToRow))).error, 'gravar a inspeção');

  for (const model of mutation.update.models) {
    const { id, created_by, created_at, ...changes } = modelToRow(model);
    void created_by;
    void created_at;
    const { data, error } = await db.from(MODELS).update(changes).eq('id', id).select('id');
    check(error, 'atualizar o checklist');
    if (!data?.length) throw new ChecklistConflictError();
  }
  for (const equipment of mutation.update.equipment) {
    const { id, work_id, created_by, created_at, ...changes } = equipmentToRow(equipment);
    void created_by;
    void created_at;
    const { data, error } = await db.from(EQUIPMENT).update(changes).eq('id', id).eq('work_id', work_id).select('id');
    check(error, 'atualizar o equipamento');
    if (!data?.length) throw new ChecklistConflictError();
  }
  for (const run of mutation.update.runs) {
    const { id, work_id, created_by, created_at, ...changes } = runToRow(run);
    void created_by;
    void created_at;
    const { data, error } = await db.from(RUNS).update(changes).eq('id', id).eq('work_id', work_id).select('id');
    check(error, 'atualizar a inspeção');
    if (!data?.length) throw new ChecklistConflictError();
  }
}
