import type { KpiCard, PanelSummary, Segment } from './model';

/** O resumo do topo da aba 0 (regra 10 do modelo): uma frase e os cartões, só dos módulos presentes.
 * Cada quadro entrega a sua parte (`PanelSummary`); aqui só se ordena e se junta. A ordem dos cartões é a
 * do modelo aprovado (PPC, avanço físico, takt vencido, tarefas atrasadas, pendências abertas, restrições
 * vencidas); a da frase segue a leitura da obra (semana, avanço, frentes, plano do mês, terminalidade).
 *
 * 12/11/2026 (modelo "Dashboards completos e resumo semanal", regra 9): até nove cartões, em duas linhas.
 * Entram "Efetivo médio" (`efetivo`, aba 2.2), "Cards vencidos" (`cards`, aba 1.4) e "Segurança em aberto"
 * (`seguranca`, aba 3.1), depois dos seis de antes; a frase ganha só a oração do efetivo, no fim.
 * `restricoes` continua sendo o cartão das restrições dos vagões; o do Kanban é `cards`. */
export type SummaryKey = 'curto' | 'longo' | 'takt' | 'medio' | 'terminalidade' | 'restricoes' | 'efetivo' | 'cards' | 'seguranca';
const KPI_ORDER: SummaryKey[] = ['curto', 'longo', 'takt', 'medio', 'terminalidade', 'restricoes', 'efetivo', 'cards', 'seguranca'];
const SENTENCE_ORDER: SummaryKey[] = ['curto', 'longo', 'takt', 'restricoes', 'medio', 'terminalidade', 'efetivo'];
/** O máximo de cartões do topo. */
export const MAX_KPIS = KPI_ORDER.length;

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
