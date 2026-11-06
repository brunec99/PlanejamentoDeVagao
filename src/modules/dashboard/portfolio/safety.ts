import type { LocalDate } from '@/domain/entities';
import { SAFETY_CONSEQUENCES, type SafetyType } from '@/domain/safety';
import { addDays } from '@/domain/validation';
import { compareText } from '@/modules/curto-prazo/sheet-view';
import { NONE, NO_TYPE_LABEL, OPEN_OVER_DAYS } from '@/modules/seguranca/safety-view';
import type { PortfolioSafety, PortfolioSafetyItem } from './types';

/** Segurança do trabalho (aba 6) no Dashboard geral (modelo aprovado em 06/11/2026). De uma obra, os
 * apontamentos e a lista única de tipos para o bloco da linha do comparativo. Tudo puro.
 *
 * Regra 3: fluxo no período e retrato no sábado final. Feitos contam pela data do apontamento e finalizados
 * pela data de correção, os dois da segunda-feira inicial (`start`) ao sábado final (`end`). Em aberto = apontado
 * até o dia e não corrigido até ele; a véspera é o domingo antes da segunda inicial, então em aberto na véspera
 * + feitos − finalizados = em aberto no fim. Regra 4: `start`/`end` são os do período do geral (semanas
 * inteiras). Regra 5: o histórico importado da planilha conta igual. Regra 10: sem recorte de empreiteiro,
 * porque a vistoria não registra empresa. */

const DAY_MS = 86_400_000;
const daysBetween = (from: LocalDate, to: LocalDate) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));
/** Corrigido até o fim do dia (o status manda: finalizado sem data não conta como corrigido). */
const correctedBy = (item: PortfolioSafetyItem, date: LocalDate) =>
  item.status === 'resolved' && !!item.correctedOn && item.correctedOn <= date;
/** Em aberto ao fim do dia: apontado até ele e não corrigido até ele. */
const openAt = (item: PortfolioSafetyItem, date: LocalDate) => item.observedOn <= date && !correctedBy(item, date);
const inRange = (date: string | undefined, from: LocalDate, to: LocalDate) => !!date && date >= from && date <= to;

export interface SafetyPeriod {
  /** Segunda-feira da primeira semana do período. */
  start: LocalDate;
  /** Sábado da última semana do período: nada depois dele entra. */
  end: LocalDate;
}

/** O bloco da obra no período, ou `undefined` quando nenhum apontamento foi feito até o sábado final (a obra
 * fica sem dado de segurança e aparece em "Sem apontamentos de segurança"). `today` limita a contagem dos
 * "abertos há mais de 7 dias" no período em andamento: os dias contam até o sábado final ou até hoje, o que
 * vier antes, para não contar dias que ainda não passaram. */
export function buildSafetyBlock(
  items: readonly PortfolioSafetyItem[],
  types: readonly SafetyType[],
  period: SafetyPeriod,
  today: LocalDate,
): PortfolioSafety | undefined {
  const { start, end } = period;
  if (!items.some(item => item.observedOn <= end)) return undefined;
  const eve = addDays(start, -1);
  const countUntil = end < today ? end : today;
  const typeById = new Map(types.map(type => [type.id, type]));

  const openItems = items.filter(item => openAt(item, end));
  const made = items.filter(item => inRange(item.observedOn, start, end));
  const finished = items.filter(item => item.status === 'resolved' && inRange(item.correctedOn, start, end));
  const resolveDays = finished.map(item => daysBetween(item.observedOn, item.correctedOn!));

  const byConsequence = SAFETY_CONSEQUENCES.map(() => 0);
  const byType = new Map<string, { key: string; label: string; count: number; order: number }>();
  for (const item of made) {
    const at = (SAFETY_CONSEQUENCES as readonly string[]).indexOf(item.consequence);
    if (at >= 0) byConsequence[at]++;
    const type = item.typeId ? typeById.get(item.typeId) : undefined;
    const key = type ? type.id : NONE;
    const entry = byType.get(key) ?? {
      key,
      label: type ? type.name : NO_TYPE_LABEL,
      count: 0,
      order: type ? type.orderIndex : Number.MAX_SAFE_INTEGER,
    };
    entry.count++;
    byType.set(key, entry);
  }

  return {
    open: openItems.length,
    openAtStart: items.filter(item => openAt(item, eve)).length,
    openOver7: openItems.filter(item => daysBetween(item.observedOn, countUntil) > OPEN_OVER_DAYS).length,
    opened: made.length,
    resolved: finished.length,
    // Sem arredondar: o consolidado pondera a média de cada obra pelos finalizados; a tela arredonda.
    ...(resolveDays.length ? { averageDaysToResolve: resolveDays.reduce((sum, days) => sum + days, 0) / resolveDays.length } : {}),
    byConsequence,
    // Do tipo com mais feitos ao com menos; no empate, a ordem do cadastro e o nome, com "Sem tipo" por último.
    byType: [...byType.values()]
      .sort((a, b) => b.count - a.count || a.order - b.order || compareText(a.label, b.label))
      .map(({ key, label, count }) => ({ key, label, count })),
  };
}
