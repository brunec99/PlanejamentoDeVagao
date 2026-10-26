import {
  TERMINALITY_LIMITS,
  terminalityPhotoPaths,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityPhotoKind,
} from '../../domain/terminality';
import {
  normalizeTerminalityName,
  planTerminalityCommand,
  TERMINALITY_TABLES,
  type TerminalityContext,
  type TerminalityMutation,
  type TerminalityRowSet,
} from './terminality-commands';

/**
 * Importação da "Lista de pendências" do Sheets para a aba 5 (21/10/2026). Recebe o que
 * `scripts/terminalidade/extrair-planilha.py` tirou da planilha e devolve o que gravar, passando cada
 * linha pelos mesmos comandos da tela (`planTerminalityCommand`): o que a aba recusaria, a importação
 * também recusa. Puro, sem banco nem arquivos; o script grava e envia as fotos.
 *
 * Idempotência: o id da pendência sai do conteúdo da linha (local, apto, descrição, data e a primeira
 * foto) e o da foto, da pendência e do arquivo. Rodar de novo não duplica, só acrescenta o que é novo:
 * pendência nova, foto nova e resolução nova. Pendência já gravada nunca tem os campos sobrescritos,
 * porque a equipe pode ter corrigido na tela o que a planilha mantém errado.
 */

export interface SheetPhoto {
  sha1: string;
  arquivo: string;
}
export interface SheetRow {
  linha: number;
  local: string;
  apto?: string;
  descricao: string;
  tipo?: string;
  observado: string;
  corrigido?: string;
  responsavelAtr?: string;
  responsavelTerceiro?: string;
  resolvido?: string;
  observacao?: string;
  fotos: SheetPhoto[];
  fotosCorrecao: SheetPhoto[];
}
/** Listas suspensas da aba de apoio, na ordem da planilha. */
export interface SheetCatalog {
  locais: string[];
  aptos: string[];
  tipos: string[];
  responsaveisAtr: string[];
  terceiros: string[];
}
export interface SheetExport {
  linhas: SheetRow[];
  cadastro: SheetCatalog;
}
/** Correção de uma linha que a planilha digitou errado, por número de linha (arquivo de ajustes). */
export type RowAdjustment = Partial<Omit<SheetRow, 'linha' | 'fotos' | 'fotosCorrecao'>> & { ignorar?: boolean };

export interface ImportContext extends TerminalityContext {
  /** Id estável (UUID) a partir de um texto: o mesmo texto dá sempre o mesmo id. */
  idFor: (seed: string) => string;
}

/** Arquivo a enviar ao bucket antes de gravar as linhas: a foto só pode existir com o arquivo. */
export interface PhotoUpload {
  photoId: string;
  itemId: string;
  kind: TerminalityPhotoKind;
  arquivo: string;
  storagePath: string;
  thumbPath: string;
  line: number;
}
export interface ImportIssue {
  line?: number;
  message: string;
}
export interface TerminalityImportPlan {
  /** Tudo numa gravação: cadastro, pendências, fotos e resoluções (as das pendências novas já dobradas na inserção). */
  mutation: TerminalityMutation;
  uploads: PhotoUpload[];
  report: {
    rows: number;
    created: number;
    existing: number;
    issuePhotos: number;
    correctionPhotos: number;
    resolved: number;
    floorsCreated: string[];
    unitsCreated: number;
    typesCreated: string[];
    peopleCreated: string[];
    warnings: ImportIssue[];
    errors: ImportIssue[];
  };
}

const emptyRows = (): TerminalityRowSet => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });

/** Junta a gravação de um comando à acumulada. Atualização de registro que a própria importação
 * insere vira a nova versão da inserção: no banco, a linha já nasce resolvida. */
function merge(total: TerminalityMutation, part: TerminalityMutation) {
  for (const table of TERMINALITY_TABLES) {
    const inserted = total.insert[table] as { id: string }[];
    const updated = total.update[table] as { id: string }[];
    inserted.push(...(part.insert[table] as { id: string }[]));
    for (const record of part.update[table] as { id: string }[]) {
      const i = inserted.findIndex(r => r.id === record.id);
      if (i >= 0) inserted[i] = record;
      else {
        const j = updated.findIndex(r => r.id === record.id);
        if (j >= 0) updated[j] = record;
        else updated.push(record);
      }
    }
    total.delete[table].push(...part.delete[table]);
  }
  total.removeFiles.push(...part.removeFiles);
}

function applyToData(data: TerminalityData, part: TerminalityMutation): TerminalityData {
  const next = { ...data } as TerminalityData;
  for (const table of TERMINALITY_TABLES) {
    const removed = new Set(part.delete[table]);
    const updated = new Map((part.update[table] as { id: string }[]).map(r => [r.id, r]));
    (next as unknown as Record<string, unknown>)[table] = (data[table] as { id: string }[])
      .filter(r => !removed.has(r.id))
      .map(r => updated.get(r.id) ?? r)
      .concat(part.insert[table] as { id: string }[]);
  }
  return next;
}

const key = normalizeTerminalityName;
/** "ATR - Obra" e "ATR Obra" são a mesma empresa: compara só letras e números. */
const looseKey = (name: string) => key(name).replace(/[^a-z0-9]/g, '');
const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** "N.A", "NA", "-": a pendência é do pavimento, sem unidade. */
const NO_UNIT = /^(n\.?\s?a\.?|-+|—)$/i;

/** Número do pavimento no nome ("4° pavto", "4º Pavimento", "Pavimento 4"); sem número, null. */
export function floorNumber(name: string): number | null {
  const match = /^(\d{1,3})\s*[°ºo]?\s*(pav|andar)/i.exec(name.trim()) ?? /^(?:pav\w*|andar)\s*(\d{1,3})$/i.exec(name.trim());
  return match ? Number(match[1]) : null;
}

const SUBSOLO = /^(ss|subsolo|sub)\s*-?\s*(\d*)$|^-(\d+)$/i;
const TOP = ['atico', 'barrilete', 'cobertura', 'casa de maquinas', 'reservatorio'];

/** Ordem vertical, de baixo para cima: subsolos (o mais fundo primeiro), térreo, pavimentos-tipo e
 * topo; o resto (Fachada, Geral…) no fim, na ordem da planilha. */
export function orderFloors(names: string[]): string[] {
  const rank = (name: string, index: number): [number, number] => {
    const sub = SUBSOLO.exec(name.trim());
    if (sub) return [0, -Number(sub[2] || sub[3] || 1)];
    if (key(name) === 'terreo') return [1, 0];
    const n = floorNumber(name);
    if (n !== null) return [2, n];
    const top = TOP.indexOf(key(name));
    if (top >= 0) return [3, top];
    return [4, index];
  };
  return names
    .map((name, index) => ({ name, rank: rank(name, index) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1])
    .map(f => f.name);
}

/** Datas da planilha: célula de data já vem AAAA-MM-DD; texto digitado vem como DD/MM/AAAA, às vezes
 * sem a segunda barra ("08/102026"). */
export function parseSheetDate(value: string | undefined): { date?: string; fixed?: boolean } {
  const text = clean(value);
  if (!text) return {};
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return { date: text };
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const typo = match ? null : /^(\d{2})\/(\d{2})(\d{4})$/.exec(text);
  const parts = match ?? typo;
  if (!parts) return {};
  const date = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return {};
  return { date, fixed: Boolean(typo) };
}

const DAY = 24 * 60 * 60 * 1000;

export function planTerminalityImport(
  initial: TerminalityData,
  workId: string,
  sheet: SheetExport,
  ctx: ImportContext,
  adjustments: Record<string, RowAdjustment> = {},
): TerminalityImportPlan {
  let data = initial;
  const mutation: TerminalityMutation = {
    workId,
    insert: emptyRows(),
    update: emptyRows(),
    delete: { floors: [], units: [], types: [], people: [], items: [], photos: [] },
    removeFiles: [],
  };
  const report: TerminalityImportPlan['report'] = {
    rows: 0,
    created: 0,
    existing: 0,
    issuePhotos: 0,
    correctionPhotos: 0,
    resolved: 0,
    floorsCreated: [],
    unitsCreated: 0,
    typesCreated: [],
    peopleCreated: [],
    warnings: [],
    errors: [],
  };
  const uploads: PhotoUpload[] = [];
  const baseTime = Date.parse(ctx.now);
  let sequence = 0;
  // Cada comando com seu instante: a lista lê por created_at e mantém a ordem da planilha.
  const run = (command: TerminalityCommand) => {
    const part = planTerminalityCommand(data, command, { ...ctx, now: new Date(baseTime + sequence++).toISOString() });
    data = applyToData(data, part);
    merge(mutation, part);
    return part;
  };
  const warn = (message: string, line?: number) => report.warnings.push({ line, message });
  const error = (message: string, line?: number) => report.errors.push({ line, message });

  // 1. Linhas: ajustes, limpeza e datas.
  const rows = sheet.linhas
    .map(row => ({ ...row, ...adjustments[String(row.linha)] }))
    .filter(row => {
      if (!row.ignorar) return true;
      warn('Linha ignorada pelo arquivo de ajustes.', row.linha);
      return false;
    })
    .map(row => {
      const observed = parseSheetDate(row.observado);
      const corrected = parseSheetDate(row.corrigido);
      if (observed.fixed) warn(`Data da observação "${row.observado}" lida como ${observed.date}.`, row.linha);
      if (corrected.fixed) warn(`Data da correção "${row.corrigido}" lida como ${corrected.date}.`, row.linha);
      if (clean(row.corrigido) && !corrected.date) warn(`Data da correção "${row.corrigido}" ilegível; ignorada.`, row.linha);
      const apto = clean(row.apto);
      return {
        line: row.linha,
        local: clean(row.local),
        apto: NO_UNIT.test(apto) ? '' : apto,
        description: clean(row.descricao),
        note: clean(row.observacao),
        type: clean(row.tipo),
        observedOn: observed.date,
        rawObserved: row.observado,
        correctedOn: corrected.date,
        atrPerson: clean(row.responsavelAtr),
        contractor: clean(row.responsavelTerceiro),
        resolved: key(clean(row.resolvido)) === 'sim',
        photos: row.fotos ?? [],
        correctionPhotos: row.fotosCorrecao ?? [],
      };
    });
  report.rows = rows.length;

  const observedDates = rows
    .map(r => r.observedOn)
    .filter((d): d is string => Boolean(d))
    .sort();
  const median = observedDates[Math.floor(observedDates.length / 2)];
  for (const row of rows) {
    if (!row.observedOn) error(`Data da observação "${row.rawObserved}" ilegível.`, row.line);
    else if (median && Date.parse(median) - Date.parse(row.observedOn) > 180 * DAY)
      warn(`Data da observação ${row.observedOn} bem anterior às demais (mediana ${median}); confira o ano.`, row.line);
  }

  // 2. Cadastro: o que a aba de apoio lista mais o que as linhas usam e a lista esqueceu.
  const sameName = (a: string, b: string) => key(a) === key(b);
  const floorsWanted = orderFloors(
    [...sheet.cadastro.locais.map(clean), ...rows.map(r => r.local)]
      .filter(Boolean)
      .filter((name, i, all) => all.findIndex(n => sameName(n, name)) === i),
  );
  const missingFloors = floorsWanted.filter(name => !data.floors.some(f => sameName(f.name, name)));
  if (missingFloors.length) {
    run({ type: 'create_floors', workId, names: missingFloors });
    report.floorsCreated = missingFloors;
  }
  const floorOf = (name: string) => data.floors.find(f => sameName(f.name, name));

  // Unidade da lista vai para o pavimento do número ("401" e "401 ATC" no 4°); a das linhas, para o
  // pavimento em que a linha a usa (o "801 ATC" também aparece no Ático).
  const unitsWanted = new Map<string, string[]>();
  const want = (floorName: string, unit: string) => {
    const floor = floorOf(floorName);
    if (!floor || !unit) return;
    const list = unitsWanted.get(floor.id) ?? [];
    if (!list.some(u => sameName(u, unit))) list.push(unit);
    unitsWanted.set(floor.id, list);
  };
  for (const apto of sheet.cadastro.aptos.map(clean)) {
    const number = /^(\d{3,4})\b/.exec(apto);
    if (!number || NO_UNIT.test(apto)) continue;
    const floorNo = Math.floor(Number(number[1]) / 100);
    const floor = data.floors.find(f => floorNumber(f.name) === floorNo);
    if (floor) want(floor.name, apto);
  }
  for (const row of rows) want(row.local, row.apto);
  for (const [floorId, names] of unitsWanted) {
    const missing = names.filter(name => !data.units.some(u => u.floorId === floorId && sameName(u.name, name))).sort(natural.compare);
    if (!missing.length) continue;
    run({ type: 'create_units', floorId, names: missing });
    report.unitsCreated += missing.length;
  }

  const ensureNamed = (kind: 'types' | 'people', names: string[], created: string[]) => {
    for (const name of names.filter(Boolean)) {
      if ((data[kind] as { name: string }[]).some(r => sameName(r.name, name))) continue;
      run(kind === 'types' ? { type: 'create_type', workId, name } : { type: 'create_person', workId, name });
      created.push(name);
    }
  };
  ensureNamed('types', [...sheet.cadastro.tipos.map(clean), ...rows.map(r => r.type)], report.typesCreated);
  ensureNamed('people', [...sheet.cadastro.responsaveisAtr.map(clean), ...rows.map(r => r.atrPerson)], report.peopleCreated);

  const contractors = sheet.cadastro.terceiros.map(clean).filter(Boolean);
  const contractorName = (name: string) => contractors.find(c => looseKey(c) === looseKey(name)) ?? name;

  // 3. Pendências, fotos e resoluções.
  const occurrences = new Map<string, number>();
  for (const row of rows) {
    if (!row.observedOn) continue;
    const floor = floorOf(row.local);
    if (!floor) {
      error(`Pavimento "${row.local}" não cadastrado.`, row.line);
      continue;
    }
    const unit = row.apto ? data.units.find(u => u.floorId === floor.id && sameName(u.name, row.apto)) : undefined;
    const identity = [workId, floor.name, row.apto, row.description, row.observedOn, row.photos[0]?.sha1 ?? ''].map(key).join('|');
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    const itemId = ctx.idFor(`item|${identity}|${occurrence}`);

    let item = data.items.find(i => i.id === itemId);
    if (item) report.existing++;
    else {
      const description = row.note ? `${row.description} — Obs.: ${row.note}` : row.description;
      if (row.note) warn('A coluna Observação foi para o fim da descrição.', row.line);
      if (description.length > TERMINALITY_LIMITS.maxDescription) warn('Descrição longa demais; cortada no limite.', row.line);
      const contractor = row.contractor ? contractorName(row.contractor) : undefined;
      if (contractor && contractor !== row.contractor)
        warn(`Responsável terceiro "${row.contractor}" gravado como "${contractor}".`, row.line);
      try {
        run({
          type: 'create_item',
          workId,
          itemId,
          floorId: floor.id,
          unitId: unit?.id,
          description: description.slice(0, TERMINALITY_LIMITS.maxDescription),
          typeId: row.type ? data.types.find(t => sameName(t.name, row.type))?.id : undefined,
          observedOn: row.observedOn,
          atrPersonId: row.atrPerson ? data.people.find(p => sameName(p.name, row.atrPerson))?.id : undefined,
          contractor: contractor?.slice(0, TERMINALITY_LIMITS.maxName),
        });
      } catch (cause) {
        error((cause as Error).message, row.line);
        continue;
      }
      report.created++;
      item = data.items.find(i => i.id === itemId)!;
    }
    if (!row.photos.length) warn('Linha sem foto do problema.', row.line);

    const photoSeen = new Map<string, number>();
    const photos: [TerminalityPhotoKind, SheetPhoto][] = [
      ...row.photos.map(p => ['issue', p] as [TerminalityPhotoKind, SheetPhoto]),
      ...row.correctionPhotos.map(p => ['correction', p] as [TerminalityPhotoKind, SheetPhoto]),
    ];
    for (const [kind, photo] of photos) {
      const seed = `${kind}|${photo.sha1}`;
      const n = (photoSeen.get(seed) ?? 0) + 1;
      photoSeen.set(seed, n);
      const photoId = ctx.idFor(`photo|${itemId}|${seed}|${n}`);
      if (data.photos.some(p => p.id === photoId)) continue;
      const paths = terminalityPhotoPaths(workId, itemId, photoId);
      try {
        run({ type: 'add_photo', itemId, photoId, kind, ...paths });
      } catch (cause) {
        error((cause as Error).message, row.line);
        continue;
      }
      uploads.push({ photoId, itemId, kind, arquivo: photo.arquivo, ...paths, line: row.line });
      if (kind === 'issue') report.issuePhotos++;
      else report.correctionPhotos++;
    }

    item = data.items.find(i => i.id === itemId)!;
    if (row.resolved && item.status === 'open') {
      if (!row.correctedOn) warn('Marcada como resolvida sem data da correção; ficou aberta.', row.line);
      else
        try {
          run({ type: 'resolve_item', itemId, correctedOn: row.correctedOn });
          report.resolved++;
        } catch (cause) {
          warn(`Marcada como resolvida, mas ficou aberta: ${(cause as Error).message}`, row.line);
        }
    } else if (!row.resolved && item.status === 'resolved') warn('Aberta na planilha e resolvida no sistema; mantida resolvida.', row.line);
  }

  return { mutation, uploads, report };
}
