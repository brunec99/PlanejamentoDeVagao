/** Aba 5, Terminalidade: a "Lista de pendências" da obra (planilha usada até 08/10/2026), com as
 * mesmas colunas — Local (pavimento), Apto, Descrição, Tipo, Data observação, Data correção,
 * Responsável ATR, Responsável Terceiro, Foto, Resolvido? e Foto da correção. Vive fora do snapshot
 * do planejamento (migração 0028), com API própria em /api/terminalidade. */

export type TerminalityId = string;
type Stamped = { id: TerminalityId; createdAt: string; updatedAt: string };

/** Pavimento da obra ("4° pavto", "Térreo", "Cobertura"). `orderIndex` dá a ordem de baixo para cima. */
export interface TerminalityFloor extends Stamped {
  workId: TerminalityId;
  name: string;
  orderIndex: number;
}
/** Unidade de um pavimento: apartamento ("401") ou área comum ("Hall", "Escada"). */
export interface TerminalityUnit extends Stamped {
  workId: TerminalityId;
  floorId: TerminalityId;
  name: string;
  orderIndex: number;
}
/** Tipo de pendência (A/C, RI, PINTURA…). Lista editável por obra; desativado sai da lista, não do histórico. */
export interface TerminalityType extends Stamped {
  workId: TerminalityId;
  name: string;
  orderIndex: number;
  active: boolean;
}
/** Nome do "Responsável ATR". Lista por obra, de pessoas que podem nem usar o sistema. */
export interface TerminalityPerson extends Stamped {
  workId: TerminalityId;
  name: string;
  active: boolean;
}

export type TerminalityStatus = 'open' | 'resolved';
export interface TerminalityItem extends Stamped {
  workId: TerminalityId;
  floorId: TerminalityId;
  /** Vazio quando a pendência é do pavimento, fora de uma unidade. */
  unitId?: TerminalityId;
  description: string;
  typeId?: TerminalityId;
  /** "Data observação" (AAAA-MM-DD). */
  observedOn: string;
  atrPersonId?: TerminalityId;
  /** "Responsável Terceiro": nome da empresa do cadastro de equipes (`Team.company`). */
  contractor?: string;
  status: TerminalityStatus;
  /** "Data correção" (AAAA-MM-DD); existe se, e só se, a pendência está resolvida. */
  correctedOn?: string;
  resolvedAt?: string;
  resolvedBy?: TerminalityId;
  createdBy: TerminalityId;
}

/** `issue` = foto do problema; `correction` = foto do serviço corrigido (obrigatória para resolver). */
export type TerminalityPhotoKind = 'issue' | 'correction';
export interface TerminalityPhoto {
  id: TerminalityId;
  itemId: TerminalityId;
  workId: TerminalityId;
  kind: TerminalityPhotoKind;
  storagePath: string;
  thumbPath: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdBy: TerminalityId;
  createdAt: string;
  /** URLs assinadas (válidas por pouco tempo), preenchidas só na resposta do GET da API. */
  url?: string;
  thumbUrl?: string;
}

export interface TerminalityData {
  floors: TerminalityFloor[];
  units: TerminalityUnit[];
  types: TerminalityType[];
  people: TerminalityPerson[];
  items: TerminalityItem[];
  photos: TerminalityPhoto[];
}

/** Resposta de GET /api/terminalidade. `available: false` = migração 0028 ainda não aplicada. */
export type TerminalityResponse = ({ available: true } & TerminalityData) | { available: false };

/** Limites conferidos no servidor; o navegador comprime antes de enviar e fica bem abaixo deles. */
export const TERMINALITY_LIMITS = {
  /** Imagem principal, já comprimida (JPEG ~1600 px). */
  maxPhotoBytes: 2 * 1024 * 1024,
  /** Miniatura (JPEG ~320 px). */
  maxThumbBytes: 300 * 1024,
  maxPhotosPerItem: 10,
  maxDescription: 1000,
  maxName: 80,
} as const;

/** Comandos de POST /api/terminalidade/commands. Ids de pendência e de foto vêm do navegador
 * (UUID), para a foto subir logo depois de a pendência nascer sem ida e volta extra. */
export type TerminalityCommand =
  | { type: 'create_floors'; workId: TerminalityId; names: string[] }
  | { type: 'rename_floor'; floorId: TerminalityId; name: string }
  | { type: 'reorder_floors'; workId: TerminalityId; floorIds: TerminalityId[] }
  | { type: 'delete_floor'; floorId: TerminalityId }
  | { type: 'create_units'; floorId: TerminalityId; names: string[] }
  | { type: 'rename_unit'; unitId: TerminalityId; name: string }
  | { type: 'delete_unit'; unitId: TerminalityId }
  | { type: 'create_type'; workId: TerminalityId; name: string }
  | { type: 'update_type'; typeId: TerminalityId; name?: string; active?: boolean }
  | { type: 'create_person'; workId: TerminalityId; name: string }
  | { type: 'update_person'; personId: TerminalityId; name?: string; active?: boolean }
  | {
      type: 'create_item';
      workId: TerminalityId;
      itemId: TerminalityId;
      floorId: TerminalityId;
      unitId?: TerminalityId;
      description: string;
      typeId?: TerminalityId;
      observedOn: string;
      atrPersonId?: TerminalityId;
      contractor?: string;
    }
  | {
      type: 'update_item';
      itemId: TerminalityId;
      floorId: TerminalityId;
      unitId?: TerminalityId;
      description: string;
      typeId?: TerminalityId;
      observedOn: string;
      atrPersonId?: TerminalityId;
      contractor?: string;
    }
  | {
      type: 'add_photo';
      itemId: TerminalityId;
      photoId: TerminalityId;
      kind: TerminalityPhotoKind;
      storagePath: string;
      thumbPath: string;
      width?: number;
      height?: number;
      bytes?: number;
    }
  | { type: 'delete_photo'; photoId: TerminalityId }
  | { type: 'resolve_item'; itemId: TerminalityId; correctedOn: string }
  | { type: 'reopen_item'; itemId: TerminalityId }
  | { type: 'delete_item'; itemId: TerminalityId };

/** Caminhos no bucket `terminalidade`. O servidor só aceita fotos que sigam este formato. */
export const terminalityPhotoPaths = (workId: string, itemId: string, photoId: string) => ({
  storagePath: `${workId}/${itemId}/${photoId}.jpg`,
  thumbPath: `${workId}/${itemId}/${photoId}-thumb.jpg`,
});
