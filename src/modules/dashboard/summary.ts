import type { KpiCard, PanelSummary, Segment } from './model';

/** O resumo do topo da aba 0 (regra 10 do modelo): uma frase e até seis cartões, só dos módulos presentes.
 * Cada quadro entrega a sua parte (`PanelSummary`); aqui só se ordena e se junta. A ordem dos cartões é a
 * do modelo aprovado (PPC, avanço físico, takt vencido, tarefas atrasadas, pendências abertas, restrições
 * vencidas); a da frase segue a leitura da obra (semana, avanço, frentes, plano do mês, terminalidade). */
export type SummaryKey = 'curto' | 'longo' | 'takt' | 'medio' | 'terminalidade' | 'restricoes';
const KPI_ORDER: SummaryKey[] = ['curto', 'longo', 'takt', 'medio', 'terminalidade', 'restricoes'];
const SENTENCE_ORDER: SummaryKey[] = ['curto', 'longo', 'takt', 'restricoes', 'medio', 'terminalidade'];

export const EMPTY_SUMMARY = 'Nenhum módulo com dados nesta obra até a semana analisada.';

/** Junta os trechos de cada quadro numa frase só, com um espaço entre eles e ponto final garantido. */
export function joinSentences(parts: Segment[][]): Segment[] {
  const out: Segment[] = [];
  for (const part of parts) {
    const segments = part.filter(segment => segment.text.length > 0);
    if (!segments.length) continue;
    if (out.length) out.push({ text: ' ' });
    const last = segments[segments.length - 1];
    const trimmed = segments.map((segment, index) =>
      index === segments.length - 1 ? { ...segment, text: segment.text.trimEnd() } : segment,
    );
    out.push(...trimmed);
    if (!/[.!?]$/.test(last.text.trimEnd())) out.push({ text: '.' });
  }
  return out;
}

export function composeSummary(parts: Partial<Record<SummaryKey, PanelSummary>>): { kpis: KpiCard[]; sentence: Segment[] } {
  const kpis = KPI_ORDER.flatMap(key => (parts[key] ? [parts[key]!.kpi] : []));
  // O cartão em destaque é o do PPC; sem curto prazo, o primeiro que houver.
  if (kpis.length && !kpis.some(kpi => kpi.main)) kpis[0] = { ...kpis[0], main: true };
  const sentence = joinSentences(SENTENCE_ORDER.flatMap(key => (parts[key] ? [parts[key]!.sentence] : [])));
  return { kpis, sentence: sentence.length ? sentence : [{ text: EMPTY_SUMMARY }] };
}
