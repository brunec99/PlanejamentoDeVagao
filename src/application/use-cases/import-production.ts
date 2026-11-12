import { cleanHeadcountName, headcountKey } from '../../domain/headcount';
import { normalizeUnit, type ProductionEntry } from '../../domain/production';
import { matchHeadcountWork, parseSheetDate, type HeadcountWorkRef } from './import-headcount';

/**
 * Importação da planilha "ATR - Controle da produção" (aba "Controle de produção") para a aba 8
 * (11/11/2026). Recebe as linhas do CSV (OBRA | SERVIÇO | EMPREITEIRO | DATA | QTD PROFISSIONAIS | QTD
 * AJUDANTES | PRODUÇÃO | UNID. | OBS.) e devolve, por obra, as linhas a gravar. Puro; o script
 * (`scripts/import-produtividade.ts`) lê e grava.
 *
 * O que a importação arruma:
 * - produção vazia e "0,00" querem dizer a mesma coisa na planilha — não medido — e viram "a medir";
 * - as 34 grafias de unidade viram sete (m², m³, m, kg, un, vb, t); produção com unidade que não dá para
 *   reconhecer entra como "a medir", com o número guardado na observação, e é contada no relatório;
 * - grafias do mesmo serviço ou empreiteiro viram uma, a mais usada na planilha;
 * - linha sem obra, sem data válida, no futuro, sem serviço ou sem ninguém na equipe fica de fora.
 *
 * Idempotência: o id é a linha da planilha (`planilha:<obra>:<linha>`), porque aqui duas linhas iguais
 * são legítimas (duas frentes do mesmo serviço). Rodar de novo não duplica e não sobrescreve o que já foi
 * gravado. Vale enquanto ninguém inserir ou reordenar linhas no meio da planilha entre duas importações.
 */

export interface ProductionImportReport {
  rows: number;
  noWork: number;
  unknownWorks: Record<string, number>;
  badDate: number;
  futureDate: number;
  noService: number;
  noCrew: number;
  /** Linhas que entram sem produção ("a medir"). */
  pending: number;
  /** Produção com unidade irreconhecível: entrou como "a medir", com o número na observação. */
  unknownUnit: number;
}

export interface ProductionImportPlan {
  byWork: Map<string, ProductionEntry[]>;
  report: ProductionImportReport;
}

/** "1.234,56" → 1234.56; "10,00" → 10; vazio, "-" ou texto → null. */
export function parseSheetNumber(text: string | undefined): number | null {
  const clean = (text ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(clean)) return null;
  const value = Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
  return Number.isFinite(value) ? value : null;
}
/** Contagem de gente: "2*" → 2; vazio ou "-" → 0. */
const parseCrew = (text: string | undefined) => Math.max(0, Math.round(parseSheetNumber(text) ?? 0));

export const importedProductionId = (workId: string, line: number) => `planilha:${workId}:${line}`;

export function planProductionImport(
  rows: readonly (readonly string[])[],
  works: readonly HeadcountWorkRef[],
  ctx: { actorId: string; now: string; today: string; aliases?: Readonly<Record<string, string>> },
): ProductionImportPlan {
  const report: ProductionImportReport = {
    rows: 0,
    noWork: 0,
    unknownWorks: {},
    badDate: 0,
    futureDate: 0,
    noService: 0,
    noCrew: 0,
    pending: 0,
    unknownUnit: 0,
  };
  // O cabeçalho pode vir depois de um título: acha a linha que tem OBRA e SERVIÇO.
  const headerAt = rows.findIndex(row => {
    const cells = (row ?? []).map(headcountKey);
    return cells.includes('obra') && cells.some(cell => cell.startsWith('servico'));
  });
  if (headerAt < 0) return { byWork: new Map(), report };
  const header = rows[headerAt].map(headcountKey);
  const column = (test: (cell: string) => boolean) => header.findIndex(test);
  const at = {
    work: column(c => c === 'obra'),
    service: column(c => c.startsWith('servico')),
    contractor: column(c => c.startsWith('empreiteiro')),
    day: column(c => c === 'data'),
    professionals: column(c => c.includes('profissionais')),
    helpers: column(c => c.includes('ajudante')),
    quantity: column(c => c.startsWith('producao') && !c.includes('homem')),
    unit: column(c => c.startsWith('unid') || c === 'un'),
    note: column(c => c.startsWith('obs')),
  };
  const cell = (row: readonly string[], index: number) => (index >= 0 ? row[index] : undefined);

  const entries: ProductionEntry[] = [];
  const workByName = new Map<string, HeadcountWorkRef | undefined>();
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some(value => (value ?? '').trim() !== '')) continue;
    report.rows++;
    const sheetWork = cleanHeadcountName(cell(row, at.work) ?? '');
    if (!sheetWork) {
      report.noWork++;
      continue;
    }
    if (!workByName.has(sheetWork)) workByName.set(sheetWork, matchHeadcountWork(sheetWork, works, ctx.aliases));
    const work = workByName.get(sheetWork);
    if (!work) {
      report.unknownWorks[sheetWork] = (report.unknownWorks[sheetWork] ?? 0) + 1;
      continue;
    }
    const day = parseSheetDate(cell(row, at.day));
    if (!day) {
      report.badDate++;
      continue;
    }
    if (day > ctx.today) {
      report.futureDate++;
      continue;
    }
    const service = cleanHeadcountName(cell(row, at.service) ?? '');
    if (!service) {
      report.noService++;
      continue;
    }
    const professionals = Math.min(200, parseCrew(cell(row, at.professionals)));
    const helpers = Math.min(200, parseCrew(cell(row, at.helpers)));
    if (professionals + helpers === 0) {
      report.noCrew++;
      continue;
    }
    const measured = parseSheetNumber(cell(row, at.quantity));
    let quantity = measured !== null && measured > 0 ? Math.round(measured * 1000) / 1000 : null;
    const unit = normalizeUnit(cell(row, at.unit));
    let note = cleanHeadcountName(cell(row, at.note) ?? '');
    if (quantity !== null && !unit) {
      report.unknownUnit++;
      note = `${note ? `${note} · ` : ''}Planilha: produção ${String(quantity).replace('.', ',')} sem unidade reconhecida`;
      quantity = null;
    }
    if (quantity === null) report.pending++;
    entries.push({
      id: importedProductionId(work.id, r + 1),
      workId: work.id,
      workedOn: day,
      service,
      contractor: cleanHeadcountName(cell(row, at.contractor) ?? '') || '(não informado)',
      professionals,
      helpers,
      quantity,
      unit,
      note: note.slice(0, 300),
      origin: 'planilha',
      createdBy: ctx.actorId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  // Uma grafia por serviço e por empreiteiro: a mais usada na planilha vence (empate: ordem alfabética).
  for (const field of ['service', 'contractor'] as const) {
    const spellings = new Map<string, Map<string, number>>();
    for (const entry of entries) {
      const uses = spellings.get(headcountKey(entry[field])) ?? new Map<string, number>();
      uses.set(entry[field], (uses.get(entry[field]) ?? 0) + 1);
      spellings.set(headcountKey(entry[field]), uses);
    }
    const elected = new Map(
      [...spellings].map(([key, uses]) => [key, [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]),
    );
    for (const entry of entries) entry[field] = elected.get(headcountKey(entry[field]))!;
  }

  const byWork = new Map<string, ProductionEntry[]>();
  for (const entry of entries) byWork.set(entry.workId, [...(byWork.get(entry.workId) ?? []), entry]);
  return { byWork, report };
}

/** O que falta gravar: as linhas do plano cujo id a obra ainda não tem. */
export function pendingProductionImport(planned: readonly ProductionEntry[], existing: readonly ProductionEntry[]): ProductionEntry[] {
  const ids = new Set(existing.map(e => e.id));
  return planned.filter(e => !ids.has(e.id));
}
