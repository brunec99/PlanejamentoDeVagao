import { cleanHeadcountName, headcountKey, type HeadcountEntry } from '../../domain/headcount';

/**
 * Importação da planilha "ATR Histograma - Todas as obras" (aba Geral) para a aba 7 (11/11/2026). Recebe as
 * linhas do CSV (Obra | Data | Empresa | Função | Número de funcionários | Observação) e devolve, por obra,
 * as linhas a gravar. Puro, sem banco nem arquivos; o script (`scripts/import-histograma.ts`) lê e grava.
 *
 * O que a importação arruma, porque a aba não aceitaria:
 * - grafias da mesma empresa ou função ("ATR " e "ATR", "Mestre De Obra " e "Mestre de obra") viram uma,
 *   a mais usada na planilha;
 * - linhas repetidas (mesma obra, dia, empresa e função) entram SOMADAS, como na tabela dinâmica da
 *   planilha, e são contadas no relatório;
 * - linha sem obra, com data impossível ("22/0/2026"), no futuro, sem quantidade ou com zero fica de fora.
 *
 * Idempotência: o id sai do conteúdo (obra, dia, empresa e função). Rodar de novo não duplica e nunca
 * sobrescreve linha já gravada, porque a equipe pode ter corrigido na tela o que a planilha mantém errado.
 */

export interface HeadcountWorkRef {
  id: string;
  name: string;
  code: string;
}

export interface HeadcountImportReport {
  rows: number;
  noWork: number;
  /** Obras da planilha sem correspondente no sistema, com quantas linhas cada. */
  unknownWorks: Record<string, number>;
  badDate: { line: number; work: string; value: string }[];
  badDateTotal: number;
  futureDate: number;
  badQuantity: number;
  zero: number;
  /** Linhas somadas a outra idêntica. */
  merged: number;
}

export interface HeadcountImportPlan {
  /** Por id de obra, as linhas prontas (ainda sem descontar o que já está no banco). */
  byWork: Map<string, HeadcountEntry[]>;
  report: HeadcountImportReport;
}

const SAMPLE = 25;

/** "DD/MM/AAAA" → "AAAA-MM-DD"; data que não existe → null. */
export function parseSheetDate(text: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((text ?? '').trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2020 || year > 2100 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Acha a obra pelo código ("BLT") ou pelo nome, sem diferença de caixa e acento. */
export function matchHeadcountWork(sheetName: string, works: readonly HeadcountWorkRef[], aliases: Readonly<Record<string, string>> = {}) {
  const key = headcountKey(sheetName);
  const alias = Object.entries(aliases).find(([name]) => headcountKey(name) === key)?.[1];
  const wanted = alias ? headcountKey(alias) : key;
  return works.find(w => w.id === alias || headcountKey(w.code) === wanted || headcountKey(w.name) === wanted);
}

const slug = (text: string) =>
  headcountKey(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
/** Id estável da linha importada: o mesmo conteúdo dá o mesmo id em qualquer execução. */
export const importedHeadcountId = (workId: string, day: string, company: string, role: string) =>
  `planilha:${workId}:${day}:${slug(company)}:${slug(role)}`;

export function planHeadcountImport(
  rows: readonly (readonly string[])[],
  works: readonly HeadcountWorkRef[],
  ctx: { actorId: string; now: string; today: string; aliases?: Readonly<Record<string, string>> },
): HeadcountImportPlan {
  const report: HeadcountImportReport = {
    rows: 0,
    noWork: 0,
    unknownWorks: {},
    badDate: [],
    badDateTotal: 0,
    futureDate: 0,
    badQuantity: 0,
    zero: 0,
    merged: 0,
  };
  type Draft = { workId: string; day: string; company: string; role: string; quantity: number; notes: string[] };
  const drafts: Draft[] = [];
  const workByName = new Map<string, HeadcountWorkRef | undefined>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some(cell => (cell ?? '').trim() !== '')) continue;
    report.rows++;
    const sheetWork = cleanHeadcountName(row[0] ?? '');
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
    const day = parseSheetDate(row[1]);
    if (!day) {
      report.badDateTotal++;
      if (report.badDate.length < SAMPLE) report.badDate.push({ line: r + 1, work: sheetWork, value: (row[1] ?? '').trim() || '(vazia)' });
      continue;
    }
    if (day > ctx.today) {
      report.futureDate++;
      continue;
    }
    // "´1" e " 2 " acontecem: vale o que sobra depois de tirar o que não é dígito.
    const raw = (row[4] ?? '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits || /[.,]\d/.test(raw) || Number(digits) > 500) {
      report.badQuantity++;
      continue;
    }
    if (Number(digits) === 0) {
      report.zero++;
      continue;
    }
    const note = cleanHeadcountName(row[5] ?? '');
    drafts.push({
      workId: work.id,
      day,
      company: cleanHeadcountName(row[2] ?? '') || '(sem empresa)',
      role: cleanHeadcountName(row[3] ?? '') || '(sem função)',
      quantity: Number(digits),
      notes: note ? [note] : [],
    });
  }

  // Uma grafia por empresa e por função: a mais usada na planilha vence (empate: ordem alfabética).
  const elect = (pick: (d: Draft) => string) => {
    const spellings = new Map<string, Map<string, number>>();
    for (const draft of drafts) {
      const key = headcountKey(pick(draft));
      const uses = spellings.get(key) ?? new Map<string, number>();
      uses.set(pick(draft), (uses.get(pick(draft)) ?? 0) + 1);
      spellings.set(key, uses);
    }
    return new Map([...spellings].map(([key, uses]) => [key, [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
  };
  const companies = elect(d => d.company);
  const roles = elect(d => d.role);

  const merged = new Map<string, HeadcountEntry>();
  for (const draft of drafts) {
    const company = companies.get(headcountKey(draft.company))!;
    const role = roles.get(headcountKey(draft.role))!;
    const id = importedHeadcountId(draft.workId, draft.day, company, role);
    const current = merged.get(id);
    if (current) {
      report.merged++;
      current.quantity = Math.min(500, current.quantity + draft.quantity);
      for (const note of draft.notes)
        if (!current.note.includes(note)) current.note = (current.note ? `${current.note}; ${note}` : note).slice(0, 300);
      continue;
    }
    merged.set(id, {
      id,
      workId: draft.workId,
      workedOn: draft.day,
      company,
      role,
      quantity: draft.quantity,
      note: draft.notes.join('; ').slice(0, 300),
      origin: 'planilha',
      createdBy: ctx.actorId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    });
  }

  const byWork = new Map<string, HeadcountEntry[]>();
  for (const entry of merged.values()) byWork.set(entry.workId, [...(byWork.get(entry.workId) ?? []), entry]);
  return { byWork, report };
}

/** O que falta gravar: as linhas do plano que a obra ainda não tem — nem pelo id, nem pelo dia, empresa e
 * função (lançadas na tela depois da última importação). */
export function pendingHeadcountImport(planned: readonly HeadcountEntry[], existing: readonly HeadcountEntry[]): HeadcountEntry[] {
  const ids = new Set(existing.map(e => e.id));
  const slots = new Set(existing.map(e => `${e.workedOn}|${headcountKey(e.company)}|${headcountKey(e.role)}`));
  return planned.filter(e => !ids.has(e.id) && !slots.has(`${e.workedOn}|${headcountKey(e.company)}|${headcountKey(e.role)}`));
}
