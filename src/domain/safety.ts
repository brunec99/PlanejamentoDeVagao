/** Aba 6, Segurança do trabalho (05/11/2026): a vistoria dos técnicos de segurança (TST), no formato da
 * planilha "SST - Controle geral" usada até então, com as mesmas colunas — Obra, Tipo de apontamento,
 * Risco: consequência, Risco: probabilidade, Descrição, Local, Data do apontamento, Foto do apontamento,
 * Data de correção, Foto da correção e Dias para resolver. O processo é o da terminalidade (aba 5):
 * o apontamento nasce com foto e só se finaliza com a foto da correção e a data. A diferença é quem grava:
 * só quem está marcado como TST (`profiles.tst`) lança, edita, finaliza, reabre e exclui; os demais com a
 * obra liberada só consultam. Vive fora do snapshot do planejamento (migração 0040), com API própria em
 * /api/seguranca. */

export type SafetyId = string;
type Stamped = { id: SafetyId; createdAt: string; updatedAt: string };

/** "Tipo de apontamento" (Proteções periféricas, SPIQ – Linha de Vida…). Lista ÚNICA para todas as obras,
 * porque a equipe de TSTs é a mesma e a planilha compara os tipos entre obras mês a mês. Desativado sai da
 * lista de escolha, não do histórico. */
export interface SafetyType extends Stamped {
  name: string;
  orderIndex: number;
  active: boolean;
}

/** "Risco: consequência", na ordem da mais grave para a mais leve; "Autuação/Multa" é a consequência legal. */
export const SAFETY_CONSEQUENCES = ['Morte', 'Severa', 'Significativa', 'Leve', 'Nenhuma', 'Autuação/Multa'] as const;
export type SafetyConsequence = (typeof SAFETY_CONSEQUENCES)[number];

/** "Risco: probabilidade", da mais para a menos provável. */
export const SAFETY_PROBABILITIES = ['Provável', 'Possível', 'Remota', 'Rara'] as const;
export type SafetyProbability = (typeof SAFETY_PROBABILITIES)[number];

export const isSafetyConsequence = (value: unknown): value is SafetyConsequence =>
  typeof value === 'string' && (SAFETY_CONSEQUENCES as readonly string[]).includes(value);
export const isSafetyProbability = (value: unknown): value is SafetyProbability =>
  typeof value === 'string' && (SAFETY_PROBABILITIES as readonly string[]).includes(value);

export type SafetyStatus = 'open' | 'resolved';
/** `app` = lançado no sistema; `planilha` = importado da "SST - Controle geral" (histórico anterior ao sistema). */
export type SafetyOrigin = 'app' | 'planilha';

export interface SafetyItem extends Stamped {
  workId: SafetyId;
  typeId?: SafetyId;
  consequence: SafetyConsequence;
  probability: SafetyProbability;
  description: string;
  /** "Local": texto livre ("Térreo", "2° Pavimento", "Área de vivência", "Canteiro"); a tela sugere os já usados. */
  location: string;
  /** "Data do apontamento" (AAAA-MM-DD). */
  observedOn: string;
  status: SafetyStatus;
  /** "Data de correção" (AAAA-MM-DD); existe se, e só se, o apontamento está finalizado. */
  correctedOn?: string;
  resolvedAt?: string;
  resolvedBy?: SafetyId;
  /** "Como foi corrigido": texto opcional de quem finalizou. Some ao reabrir. */
  resolutionNote?: string;
  origin: SafetyOrigin;
  createdBy: SafetyId;
}

/** `issue` = foto do apontamento; `correction` = foto da correção (obrigatória para finalizar no sistema).
 * Mesmo formato de `TerminalityPhoto`, para reaproveitar o visualizador e a grade de fotos da aba 5. */
export type SafetyPhotoKind = 'issue' | 'correction';
export interface SafetyPhoto {
  id: SafetyId;
  itemId: SafetyId;
  workId: SafetyId;
  kind: SafetyPhotoKind;
  storagePath: string;
  thumbPath: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdBy: SafetyId;
  createdAt: string;
  /** URLs assinadas (válidas por pouco tempo), preenchidas só na resposta do GET da API. */
  url?: string;
  thumbUrl?: string;
}

/** Um TST: perfil com `profiles.tst = true`. A tela mostra os nomes e só eles veem os botões de gravar. */
export interface SafetyInspector {
  id: SafetyId;
  name: string;
}

export interface SafetyData {
  /** Todos os tipos (ativos e desativados), na ordem cadastrada. */
  types: SafetyType[];
  /** Apontamentos de UMA obra. */
  items: SafetyItem[];
  photos: SafetyPhoto[];
}

/** Resposta de GET /api/seguranca e de POST /api/seguranca/commands. `available: false` = migração 0040
 * ainda não aplicada. `canEdit` = quem pediu é TST (só o servidor decide; a tela apenas esconde os botões).
 * `inspectors` = os TSTs com acesso à obra, para a tela dizer quem pode lançar. */
export type SafetyResponse = ({ available: true; canEdit: boolean; inspectors: SafetyInspector[] } & SafetyData) | { available: false };

/** Limites conferidos no servidor; o navegador comprime as fotos antes de enviar (mesma escada da aba 5). */
export const SAFETY_LIMITS = {
  maxPhotoBytes: 2 * 1024 * 1024,
  maxThumbBytes: 300 * 1024,
  maxPhotosPerItem: 10,
  maxDescription: 1000,
  maxResolutionNote: 1000,
  maxLocation: 120,
  maxName: 80,
  maxBulkItems: 500,
} as const;

/** Mensagem única de recusa para quem não é TST, no servidor e na tela. */
export const SAFETY_TST_ONLY_MESSAGE = 'Só técnicos de segurança (TST) lançam e finalizam apontamentos.';

/** Comandos de POST /api/seguranca/commands. Ids de apontamento e de foto vêm do navegador (UUID), para a
 * foto subir logo depois de o apontamento nascer, sem ida e volta extra. */
export type SafetyCommand =
  | { type: 'create_type'; name: string }
  | { type: 'update_type'; typeId: SafetyId; name?: string; active?: boolean }
  | { type: 'reorder_types'; typeIds: SafetyId[] }
  | {
      type: 'create_item';
      workId: SafetyId;
      itemId: SafetyId;
      typeId?: SafetyId;
      consequence: SafetyConsequence;
      probability: SafetyProbability;
      description: string;
      location: string;
      observedOn: string;
    }
  | {
      type: 'update_item';
      itemId: SafetyId;
      typeId?: SafetyId;
      consequence: SafetyConsequence;
      probability: SafetyProbability;
      description: string;
      location: string;
      observedOn: string;
    }
  /** Edição em lote: o mesmo valor em vários apontamentos da obra. Campo ausente = manter; `typeId: null` = limpar o tipo. */
  | {
      type: 'update_items';
      workId: SafetyId;
      itemIds: SafetyId[];
      typeId?: SafetyId | null;
      consequence?: SafetyConsequence;
      probability?: SafetyProbability;
      location?: string;
    }
  | {
      type: 'add_photo';
      itemId: SafetyId;
      photoId: SafetyId;
      kind: SafetyPhotoKind;
      storagePath: string;
      thumbPath: string;
      width?: number;
      height?: number;
      bytes?: number;
    }
  | { type: 'delete_photo'; photoId: SafetyId }
  | { type: 'resolve_item'; itemId: SafetyId; correctedOn: string; resolutionNote?: string }
  | { type: 'reopen_item'; itemId: SafetyId }
  | { type: 'delete_item'; itemId: SafetyId };

export const SAFETY_BUCKET = 'seguranca';

/** Caminhos no bucket `seguranca`. O servidor só aceita fotos que sigam este formato. */
export const safetyPhotoPaths = (workId: string, itemId: string, photoId: string) => ({
  storagePath: `${workId}/${itemId}/${photoId}.jpg`,
  thumbPath: `${workId}/${itemId}/${photoId}-thumb.jpg`,
});

/** "Dias para resolver" da planilha: finalizado = dias entre o apontamento e a correção; aberto = dias desde
 * o apontamento até `today` (AAAA-MM-DD). */
export function safetyDays(item: Pick<SafetyItem, 'observedOn' | 'correctedOn'>, today: string): number {
  const end = item.correctedOn ?? today;
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${item.observedOn}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
