import { formatIdp, idpTone, IDP_TONE_LABEL } from '@/domain/lob-performance';
import { dayMonth, isWeekly, pct, plural, type DashboardReference, type PanelSummary, type Tone } from '../model';
import type { PortfolioSafety } from '../portfolio/types';
import type { HeadcountBlock, LegalizationBlock, LobBlock, RestrictionsBlock, WorkdayCoverage } from './types';

/** Quadros novos da aba 0 (12/11/2026, modelo "Dashboards completos e resumo semanal"): os textos e as faixas
 * que a tela, o PDF e o resumo do topo compartilham, e os três cartões que entram no resumo (regra 9): "Efetivo
 * médio" (2.2), "Cards vencidos" (1.4) e "Segurança em aberto" (3.1). Só o efetivo ganha oração na frase.
 * Tudo puro, sem React. */

/** O quadro "Linha de Balanço e legalização" está pronto quando um dos dois tem dado. */
export interface BalancePanelData {
  lob?: LobBlock;
  legalization?: LegalizationBlock;
}

/** "no mês", "na semana", "no período" a partir de "do mês" (`period.of`). */
export const periodIn = (ref: Pick<DashboardReference, 'period'>) => ref.period.of.replace(/^d/, 'n');

/** Um número com até uma casa decimal, no padrão brasileiro ("8,4", "12"). */
export const oneDecimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
/** Efetivo médio: inteiro a partir de 10 pessoas, uma casa abaixo disso. */
export const crewLabel = (value: number) => (value >= 10 ? String(Math.round(value)) : oneDecimal(value));
/** Parcela 0–1 como "71%". */
export const shareLabel = (share: number) => pct(share * 100);

// ─── Dias lançados (histograma e produtividade) ─────────────────────────────────────────────────────
/** Faixas do modelo aprovado: 90% ou mais dos dias úteis em verde, de 70% a 89% em âmbar, abaixo em vermelho.
 * Sem dia útil esperado (período que ainda não teve dia útil encerrado), neutro. */
export function coverageTone(coverage: WorkdayCoverage): Tone {
  if (coverage.expected <= 0) return 'neutral';
  const ratio = coverage.launched / coverage.expected;
  return ratio >= 0.9 ? 'good' : ratio >= 0.7 ? 'warn' : 'bad';
}
const COVERAGE_TEXT: Record<Tone, string> = {
  good: 'em dia',
  warn: 'atenção',
  bad: 'lançamento falho',
  neutral: 'sem dia útil encerrado',
  here: '',
};
export const coverageLabel = (coverage: WorkdayCoverage) => COVERAGE_TEXT[coverageTone(coverage)];
export const coverageValue = (coverage: WorkdayCoverage) => `${coverage.launched}/${coverage.expected}`;
/** "faltou 21/10 e 28/10", "faltaram 21/10, 22/10, 23/10 e mais 4"; vazio quando nada faltou. */
export function missingText(coverage: WorkdayCoverage, show = 4): string {
  const total = coverage.missingCount;
  if (!total) return '';
  const days = coverage.missing.slice(0, show).map(dayMonth);
  const rest = total - days.length;
  const list =
    rest > 0 ? `${days.join(', ')} e mais ${rest}` : days.length > 1 ? `${days.slice(0, -1).join(', ')} e ${days.at(-1)}` : days[0];
  return `${total === 1 ? 'faltou' : 'faltaram'} ${list}`;
}

// ─── Linha de Balanço ───────────────────────────────────────────────────────────────────────────────
export const weightingText = (lob: Pick<LobBlock, 'weighting'>) => (lob.weighting === 'cost' ? 'peso por custo' : 'peso por duração');
/** O que dizer no lugar do IDP quando ele não existe. */
export function lobStatusText(lob: LobBlock): string {
  switch (lob.status) {
    case 'no-blocks':
      return 'Linha de Balanço sem blocos lançados.';
    case 'no-measurement':
      return 'Nenhuma medição fechada até a data: sem IDP.';
    case 'nothing-planned':
      return 'Nada estava planejado até a data da medição: sem IDP.';
    default:
      return '';
  }
}
export const idpView = (lob: LobBlock) =>
  lob.idp === undefined
    ? undefined
    : { value: formatIdp(lob.idp), tone: idpTone(lob.idp) as Tone, label: IDP_TONE_LABEL[idpTone(lob.idp)] };

// ─── Cartões e frase do resumo ──────────────────────────────────────────────────────────────────────
/** "Efetivo médio" (aba 2.2), somado no período, e a oração do efetivo na frase do topo. */
export function headcountSummary(data: HeadcountBlock, ref: DashboardReference): PanelSummary {
  const where = periodIn(ref);
  const value = crewLabel(data.dailyAverage);
  const tone = coverageTone(data.coverage);
  const none = data.manDays === 0;
  return {
    kpi: {
      module: 'histograma',
      label: `Efetivo médio ${ref.period.of}`,
      value: none ? '—' : value,
      tag: { text: `${coverageValue(data.coverage)} dias lançados`, tone },
      hint: none
        ? `Nenhum lançamento ${where}${data.lastDay ? `; último em ${dayMonth(data.lastDay)}` : ''}`
        : `por dia útil lançado ${where} · pico de ${data.peak}${data.peakDay ? ` em ${dayMonth(data.peakDay)}` : ''} · ${shareLabel(data.contractorShare)} de empreiteiros`,
      ...(tone === 'bad' || tone === 'warn' ? { tone } : {}),
    },
    sentence: none
      ? [{ text: `O histograma não teve lançamento ${where}.` }]
      : [
          { text: `O efetivo médio ${where} foi de ` },
          { text: `${value} ${value === '1' ? 'pessoa' : 'pessoas'}`, strong: true },
          {
            text: ` por dia útil, com o histograma lançado em ${data.coverage.launched} de ${plural(data.coverage.expected, 'dia útil', 'dias úteis')}.`,
          },
        ],
  };
}

/** "Cards vencidos" (aba 1.4), retrato em `asOf`. Sem oração na frase (regra 9). */
export function restrictionsSummary(data: RestrictionsBlock): PanelSummary {
  return {
    kpi: {
      module: 'restricoes',
      label: 'Cards vencidos',
      value: String(data.overdue),
      tag: {
        text: data.open === 0 ? 'nenhum aberto' : `de ${plural(data.open, 'aberto', 'abertos')}`,
        tone: data.overdue > 0 ? 'bad' : 'good',
      },
      hint: `passaram da entrega em ${dayMonth(data.asOf)}${data.startOverdue ? ` · ${plural(data.startOverdue, 'começo atrasado', 'começos atrasados')}` : ''}`,
      ...(data.overdue > 0 ? { tone: 'bad' as const } : {}),
    },
    sentence: [],
  };
}

/** "Segurança em aberto" (aba 3.1), retrato no sábado final. Sem oração na frase (regra 9). */
export function safetySummary(data: PortfolioSafety, ref: DashboardReference): PanelSummary {
  return {
    kpi: {
      module: 'seguranca',
      label: 'Segurança em aberto',
      value: String(data.open),
      tag:
        data.open === 0
          ? { text: 'nada em aberto', tone: 'good' }
          : { text: `${data.openOver7} há mais de 7 dias`, tone: data.openOver7 > 0 ? 'bad' : 'neutral' },
      hint: `apontamentos em ${dayMonth(ref.weekEnd)} · ${data.opened} feitos e ${data.resolved} finalizados ${isWeekly(ref) ? 'na semana' : periodIn(ref)}`,
      ...(data.openOver7 > 0 ? { tone: 'warn' as const } : {}),
    },
    sentence: [],
  };
}
