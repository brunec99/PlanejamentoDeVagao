/** Aba 9, Checklist de equipamentos (11/11/2026): a inspeção diária, semanal e mensal dos equipamentos da
 * obra. Três peças: o MODELO (a ficha: tipo de equipamento, periodicidade e os itens a conferir), lista
 * única para todas as obras, que o TST edita; o EQUIPAMENTO da obra ("Betoneira 01"), de um tipo; e a
 * INSPEÇÃO, o preenchimento de um modelo num equipamento num dia, com a resposta de cada item. A inspeção
 * guarda o texto dos itens como estava no dia: editar o modelo não reescreve o histórico. Puro, sem banco. */

export type ChecklistFrequency = 'daily' | 'weekly' | 'monthly';
export const CHECKLIST_FREQUENCIES: readonly ChecklistFrequency[] = ['daily', 'weekly', 'monthly'];
export const FREQUENCY_LABEL: Record<ChecklistFrequency, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
/** "pendente hoje", "pendente nesta semana", "pendente neste mês". */
export const FREQUENCY_PERIOD: Record<ChecklistFrequency, string> = { daily: 'hoje', weekly: 'nesta semana', monthly: 'neste mês' };

/** Conforme, não conforme e não se aplica. */
export type ChecklistAnswer = 'c' | 'nc' | 'na';
export const CHECKLIST_ANSWERS: readonly ChecklistAnswer[] = ['c', 'nc', 'na'];
export const ANSWER_LABEL: Record<ChecklistAnswer, string> = { c: 'Conforme', nc: 'Não conforme', na: 'Não se aplica' };

export interface ChecklistModelItem {
  id: string;
  text: string;
}
export interface ChecklistModel {
  id: string;
  /** Nome da ficha: "Betoneira — diário". */
  name: string;
  /** Tipo de equipamento a que se aplica: "Betoneira". Liga o modelo aos equipamentos das obras. */
  equipmentType: string;
  frequency: ChecklistFrequency;
  items: ChecklistModelItem[];
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface ChecklistEquipment {
  id: string;
  workId: string;
  /** Identificação na obra: "Betoneira 01", "Serra circular — carpintaria". */
  name: string;
  equipmentType: string;
  active: boolean;
  /** O segredo do link do operador (`/checklist/<token>`), desde 12/11/2026. Só TST e admin o recebem; vazio
   * antes da migração 0048. */
  publicToken: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
/** Foto da inspeção no bucket `checklist`. `url` é a URL assinada, preenchida só quando a tela pede. */
export interface ChecklistPhoto {
  id: string;
  path: string;
  url?: string;
}
export type ChecklistRunSource = 'app' | 'link';
export interface ChecklistRunAnswer {
  itemId: string;
  /** O texto do item no dia da inspeção. */
  text: string;
  answer: ChecklistAnswer;
  note: string;
}
export interface ChecklistRun {
  id: string;
  workId: string;
  equipmentId: string;
  modelId: string;
  /** Nome e periodicidade do modelo no dia da inspeção. */
  modelName: string;
  frequency: ChecklistFrequency;
  doneOn: string;
  answers: ChecklistRunAnswer[];
  note: string;
  /** Quem operou e respondeu (nome digitado). Obrigatório pelo link do operador; opcional na tela logada. */
  operatorName: string;
  /** Assinatura desenhada: o PNG no bucket e a hora em que foi colhida. */
  signaturePath: string | null;
  signedAt: string | null;
  photos: ChecklistPhoto[];
  /** 'link': preenchida pelo operador, sem login, pelo QR do equipamento (`createdBy` = 'qr'). */
  source: ChecklistRunSource;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** O que a aba carrega: os modelos (todos, a lista é única), os equipamentos da obra e as inspeções dela
 * desde `CHECKLIST_WINDOW_DAYS` atrás. */
export interface ChecklistData {
  models: ChecklistModel[];
  equipment: ChecklistEquipment[];
  runs: ChecklistRun[];
}
/** `canEdit`: registra e corrige inspeções (TST e admin). `canManage`: cadastra modelos e equipamentos e
 * troca o link do QR (só admin, desde 12/11/2026). */
export type ChecklistResponse =
  | { available: false }
  | ({ available: true; canEdit: boolean; canManage: boolean; today: string; work?: { code: string; name: string } } & ChecklistData);

/** Foto na gravação: só `id` mantém uma foto que a inspeção já tem; com `data` (JPEG em base64) é nova. */
export interface ChecklistPhotoInput {
  id: string;
  data?: string;
}

export type ChecklistCommand =
  | {
      type: 'save_model';
      id?: string;
      name: string;
      equipmentType: string;
      frequency: ChecklistFrequency;
      /** Item com `id` é um item existente (mantém o id); sem, é novo. A ordem é a da lista. */
      items: { id?: string; text: string }[];
    }
  | { type: 'set_model_active'; id: string; active: boolean }
  | { type: 'save_equipment'; id?: string; workId: string; name: string; equipmentType: string }
  | { type: 'set_equipment_active'; id: string; active: boolean }
  /** Troca o segredo do link: a etiqueta antiga deixa de valer. */
  | { type: 'rotate_equipment_token'; id: string }
  | {
      type: 'save_run';
      id?: string;
      workId: string;
      equipmentId: string;
      modelId: string;
      doneOn: string;
      answers: { itemId: string; answer: ChecklistAnswer; note?: string }[];
      note?: string;
      operatorName?: string;
      /** PNG em base64 de uma assinatura nova. Ausente mantém a que a inspeção já tem. */
      signature?: string;
      /** A lista final de fotos, na ordem. Ausente mantém as que a inspeção já tem. */
      photos?: ChecklistPhotoInput[];
    }
  | { type: 'delete_run'; id: string };

export const CHECKLIST_TST_ONLY_MESSAGE =
  'Só técnicos de segurança (TST) e administradores registram e corrigem inspeções pela tela; o operador usa o QR do equipamento.';
export const CHECKLIST_ADMIN_ONLY_MESSAGE = 'Só administradores cadastram modelos e equipamentos e trocam o link do QR.';
export const CHECKLIST_LIMITS = {
  name: 80,
  item: 200,
  items: 60,
  note: 300,
  operator: 80,
  photos: 4,
  /** Tamanho em base64 (caracteres): ~900 KB de JPEG por foto e ~220 KB de PNG na assinatura. */
  photoData: 1_200_000,
  signatureData: 300_000,
} as const;

export const CHECKLIST_BUCKET = 'checklist';
/** Caminhos no bucket `checklist`. A assinatura leva um id próprio: assinar de novo não reaproveita o arquivo. */
export const checklistPhotoPath = (workId: string, runId: string, photoId: string) => `${workId}/${runId}/${photoId}.jpg`;
export const checklistSignaturePath = (workId: string, runId: string, id: string) => `${workId}/${runId}/assinatura-${id}.png`;
/** O arquivo é o que diz ser? Confere a assinatura do formato no começo do base64 (JPEG `FF D8 FF`, PNG). */
export const isJpegBase64 = (data: string) => /^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(data);
export const isPngBase64 = (data: string) => /^iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(data);

/** O segredo do link do operador: 32 a 64 caracteres de URL. */
export const CHECKLIST_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
export const checklistPublicPath = (token: string) => `/checklist/${token}`;

/** O que o operador vê ao abrir o link do QR: o equipamento, os checklists dele e a situação de cada um no
 * período corrente. Nada além disso sai do sistema por este caminho. */
export interface OperatorChecklistDue {
  modelId: string;
  name: string;
  frequency: ChecklistFrequency;
  items: ChecklistModelItem[];
  status: ChecklistStatus;
  doneOn: string | null;
  doneBy: string;
}
export type OperatorChecklistView =
  | { available: false; reason: 'not_found' | 'inactive' | 'unavailable' }
  | {
      available: true;
      today: string;
      work: { code: string; name: string };
      equipment: { name: string; equipmentType: string };
      dues: OperatorChecklistDue[];
    };
export interface OperatorRunInput {
  modelId: string;
  answers: { itemId: string; answer: ChecklistAnswer; note?: string }[];
  note?: string;
  operatorName: string;
  signature: string;
  photos?: ChecklistPhotoInput[];
}
/** Janela de inspeções que a tela carrega (cobre o mês corrente e o histórico recente). */
export const CHECKLIST_WINDOW_DAYS = 120;

export const cleanChecklistText = (value: string) => value.replace(/\s+/g, ' ').trim();
/** Chave de comparação: sem acento, sem diferença de maiúsculas. "Betoneira " = "betoneira". */
export const checklistKey = (value: string) => cleanChecklistText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDay(value: string): boolean {
  if (!ISO.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export const formatChecklistDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** O período a que um dia pertence: o próprio dia, a segunda-feira da semana ou o mês ("2026-11"). */
export function periodKey(frequency: ChecklistFrequency, day: string): string {
  if (frequency === 'daily') return day;
  if (frequency === 'monthly') return day.slice(0, 7);
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return shiftDay(day, -((weekday + 6) % 7));
}

export const nonConformities = (run: Pick<ChecklistRun, 'answers'>) => run.answers.filter(a => a.answer === 'nc').length;

/** Os tipos de equipamento em uso, na grafia mais antiga de cada um, em ordem alfabética. */
export function equipmentTypes(data: Pick<ChecklistData, 'models' | 'equipment'>): string[] {
  const seen = new Map<string, string>();
  for (const source of [...data.models, ...data.equipment]) {
    const key = checklistKey(source.equipmentType);
    if (key && !seen.has(key)) seen.set(key, source.equipmentType);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Os modelos ativos que valem para um equipamento (mesmo tipo), na ordem diário, semanal, mensal. */
export function modelsFor(equipment: Pick<ChecklistEquipment, 'equipmentType'>, models: readonly ChecklistModel[]): ChecklistModel[] {
  const key = checklistKey(equipment.equipmentType);
  return models
    .filter(m => m.active && checklistKey(m.equipmentType) === key)
    .sort(
      (a, b) =>
        CHECKLIST_FREQUENCIES.indexOf(a.frequency) - CHECKLIST_FREQUENCIES.indexOf(b.frequency) || a.name.localeCompare(b.name, 'pt-BR'),
    );
}

export type ChecklistStatus = 'pending' | 'done' | 'nonconforming';
export interface ChecklistDue {
  equipment: ChecklistEquipment;
  model: ChecklistModel;
  status: ChecklistStatus;
  /** A inspeção mais recente do período corrente, quando há. */
  run: ChecklistRun | null;
  /** A última inspeção deste modelo neste equipamento, de qualquer período (dentro da janela carregada). */
  lastDoneOn: string | null;
}
export interface ChecklistBoardRow {
  equipment: ChecklistEquipment;
  dues: ChecklistDue[];
}

/** O quadro do dia: para cada equipamento ativo, cada checklist que vale para ele e a situação no período
 * corrente (o dia, a semana de segunda a domingo ou o mês). Equipamento sem modelo aparece sem checklists. */
export function checklistBoard(data: ChecklistData, today: string): ChecklistBoardRow[] {
  const byPair = new Map<string, ChecklistRun[]>();
  for (const run of data.runs) {
    const key = `${run.equipmentId}|${run.modelId}`;
    const list = byPair.get(key);
    if (list) list.push(run);
    else byPair.set(key, [run]);
  }
  return data.equipment
    .filter(e => e.active)
    .sort((a, b) => a.equipmentType.localeCompare(b.equipmentType, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
    .map(equipment => ({
      equipment,
      dues: modelsFor(equipment, data.models).map(model => {
        const runs = (byPair.get(`${equipment.id}|${model.id}`) ?? []).slice().sort((a, b) => b.doneOn.localeCompare(a.doneOn));
        const current = periodKey(model.frequency, today);
        const run = runs.find(r => periodKey(model.frequency, r.doneOn) === current) ?? null;
        const status: ChecklistStatus = !run ? 'pending' : nonConformities(run) > 0 ? 'nonconforming' : 'done';
        return { equipment, model, status, run, lastDoneOn: runs[0]?.doneOn ?? null };
      }),
    }));
}

export interface ChecklistSummary {
  equipment: number;
  /** Checklists devidos no período corrente, por periodicidade: quantos existem e quantos faltam. */
  due: Record<ChecklistFrequency, { total: number; pending: number }>;
  /** Checklists do período corrente feitos com alguma não conformidade. */
  nonconforming: number;
  /** Equipamentos ativos sem nenhum modelo do tipo deles. */
  withoutModel: number;
}
export function checklistSummary(board: readonly ChecklistBoardRow[]): ChecklistSummary {
  const summary: ChecklistSummary = {
    equipment: board.length,
    due: { daily: { total: 0, pending: 0 }, weekly: { total: 0, pending: 0 }, monthly: { total: 0, pending: 0 } },
    nonconforming: 0,
    withoutModel: 0,
  };
  for (const row of board) {
    if (!row.dues.length) summary.withoutModel += 1;
    for (const due of row.dues) {
      summary.due[due.model.frequency].total += 1;
      if (due.status === 'pending') summary.due[due.model.frequency].pending += 1;
      if (due.status === 'nonconforming') summary.nonconforming += 1;
    }
  }
  return summary;
}

/** As inspeções mais recentes primeiro (dia, depois hora de gravação). */
export const recentRuns = (runs: readonly ChecklistRun[]): ChecklistRun[] =>
  runs.slice().sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.createdAt.localeCompare(a.createdAt));

/** A visão do operador para um equipamento, a partir do quadro: sem ids internos além do modelo. */
export function operatorDues(data: ChecklistData, equipmentId: string, today: string): OperatorChecklistDue[] {
  const row = checklistBoard(data, today).find(r => r.equipment.id === equipmentId);
  return (row?.dues ?? []).map(due => ({
    modelId: due.model.id,
    name: due.model.name,
    frequency: due.model.frequency,
    items: due.model.items,
    status: due.status,
    doneOn: due.run?.doneOn ?? null,
    doneBy: due.run?.operatorName ?? '',
  }));
}
