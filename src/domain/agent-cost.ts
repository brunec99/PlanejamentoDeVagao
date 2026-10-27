/** Custo e orçamento do agente de IA (27/10/2026). O usuário tem US$ 100/mês de crédito e decidiu que o
 * agente não pode passar de US$ 20/mês com seis obras usando ao mesmo tempo. O teto é aplicado no
 * servidor, a partir do que a API devolve em `usage` de cada chamada, somado num livro-razão por mês
 * (`agent_usage`). Funções puras: a rota e os testes usam as mesmas contas. */

/** Preço em dólares por milhão de tokens (tabela da Anthropic em 10/2026). Escrita em cache custa 1,25×
 * a entrada; leitura de cache, 10% (Sonnet/Opus 5.5 publicam US$ 0,20). */
export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};
/** Sonnet 5.5 por padrão: a leitura de uma obra custa cerca de US$ 0,05 e uma pergunta com edição, cerca
 * de US$ 0,06; o Opus 5.5 dobra isso. `AGENT_MODEL` troca. */
export const DEFAULT_AGENT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_MONTHLY_BUDGET_USD = 20;
/** Cada obra pode gastar até 1,5× a parte dela do teto (teto ÷ obras ativas); o total nunca passa do teto. */
export const WORK_SHARE_TOLERANCE = 1.5;
/** Reserva conferida antes de chamar o modelo, para a última chamada do mês não passar do teto. */
export const ESTIMATED_CALL_USD = { leitura: 0.1, pergunta: 0.08 } as const;
export type AgentCallKind = keyof typeof ESTIMATED_CALL_USD;

export interface TokenUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Preço do modelo pelo prefixo do id (`claude-sonnet-5-5-…` cai em `claude-sonnet-5-5`). Modelo que a
 * tabela não conhece (um substituto escolhido pelo servidor da Anthropic, por exemplo) é cobrado como o
 * mais caro conhecido, para o teto nunca ser furado por otimismo. */
export function priceFor(model: string): ModelPrice {
  const known = Object.keys(MODEL_PRICES)
    .filter(id => model === id || model.startsWith(`${id}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (known) return MODEL_PRICES[known];
  return Object.values(MODEL_PRICES).reduce((max, price) => (price.output > max.output ? price : max));
}

/** Custo em dólares de uma chamada, com seis casas (é o que o livro-razão guarda). */
export function costOf(usage: TokenUsage, model: string): number {
  const price = priceFor(model);
  const usd =
    (usage.input * price.input + usage.output * price.output + usage.cacheWrite * price.cacheWrite + usage.cacheRead * price.cacheRead) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Chave do mês no fuso da obra (`YYYY-MM`), a partir da data civil de hoje. */
export const monthKey = (today: string) => today.slice(0, 7);

export interface BudgetState {
  budgetUsd: number;
  /** Gasto de todas as obras no mês. */
  monthUsd: number;
  /** Gasto desta obra no mês. */
  workUsd: number;
  /** Obras ativas no sistema: é por elas que o teto é dividido. */
  activeWorks: number;
  /** Gasto desta pessoa no mês, em todas as obras. */
  userUsd?: number;
  /** Limite mensal definido pelo admin para a pessoa; ausente ou nulo = só os tetos gerais valem. */
  userLimitUsd?: number | null;
  /** Acesso ao agente cortado pelo admin. */
  userBlocked?: boolean;
}
export type BudgetReason = 'mes' | 'obra' | 'usuario' | 'bloqueado';
export type BudgetDecision =
  { allowed: true; workBudgetUsd: number } | { allowed: false; reason: BudgetReason; workBudgetUsd: number; message: string };

export const workBudgetOf = (budgetUsd: number, activeWorks: number) =>
  Math.round((budgetUsd / Math.max(1, activeWorks)) * WORK_SHARE_TOLERANCE * 100) / 100;

export const formatUsd = (usd: number) => `US$ ${usd.toFixed(2).replace('.', ',')}`;

/** Pode chamar o modelo? O corte do admin vem primeiro; depois o teto do mês, que é absoluto; a parte
 * da obra evita que uma obra consuma o crédito das outras; e o limite da pessoa, quando o admin definiu
 * um. `estimate` é a reserva da chamada que está para acontecer. */
export function budgetDecision(state: BudgetState, estimate: number): BudgetDecision {
  const workBudgetUsd = workBudgetOf(state.budgetUsd, state.activeWorks);
  if (state.userBlocked)
    return {
      allowed: false,
      reason: 'bloqueado',
      workBudgetUsd,
      message: 'Seu acesso ao agente de IA foi cortado pelo administrador. O radar continua funcionando.',
    };
  if (state.monthUsd + estimate > state.budgetUsd)
    return {
      allowed: false,
      reason: 'mes',
      workBudgetUsd,
      message: `O limite mensal de IA (${formatUsd(state.budgetUsd)}) foi atingido: ${formatUsd(state.monthUsd)} usados neste mês. O radar continua funcionando; a IA volta no mês que vem.`,
    };
  if (state.workUsd + estimate > workBudgetUsd)
    return {
      allowed: false,
      reason: 'obra',
      workBudgetUsd,
      message: `Esta obra já usou a parte dela do limite mensal de IA (${formatUsd(state.workUsd)} de ${formatUsd(workBudgetUsd)}). O radar continua funcionando; a IA volta no mês que vem.`,
    };
  if (typeof state.userLimitUsd === 'number' && (state.userUsd ?? 0) + estimate > state.userLimitUsd)
    return {
      allowed: false,
      reason: 'usuario',
      workBudgetUsd,
      message: `Você já usou o seu limite mensal de IA (${formatUsd(state.userUsd ?? 0)} de ${formatUsd(state.userLimitUsd)}), definido pelo administrador. O radar continua funcionando.`,
    };
  return { allowed: true, workBudgetUsd };
}

/** Apelidos aceitos no ambiente para o modelo (`MODEL=SONNET5.5`, `AGENT_MODEL=opus-5.5`): o id
 * completo da Anthropic passa direto. Desconhecido cai no padrão. */
export function resolveModelAlias(value: string | undefined): string {
  const raw = value?.trim() ?? '';
  if (!raw) return DEFAULT_AGENT_MODEL;
  if (raw.startsWith('claude-')) return raw;
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    sonnet: 'claude-sonnet-5-5',
    sonnet55: 'claude-sonnet-5-5',
    sonnet5: 'claude-sonnet-5',
    opus: 'claude-opus-5-5',
    opus55: 'claude-opus-5-5',
    opus5: 'claude-opus-5',
    haiku: 'claude-haiku-5-5',
    haiku55: 'claude-haiku-5-5',
  };
  return aliases[key] ?? DEFAULT_AGENT_MODEL;
}

/** Lê os limites do ambiente, com os padrões acima quando faltam ou não são números. O usuário gravou
 * a chave como `API_ANTHROPIC` e o modelo como `MODEL` (27/10/2026); os nomes canônicos
 * (`ANTHROPIC_API_KEY`, `AGENT_MODEL`) têm preferência quando os dois existem. */
export function agentConfigFromEnv(env: Record<string, string | undefined>): { budgetUsd: number; model: string; apiKey?: string } {
  const parsed = Number(env.AGENT_MONTHLY_BUDGET_USD);
  const budgetUsd = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_BUDGET_USD;
  const model = resolveModelAlias(env.AGENT_MODEL || env.MODEL);
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || env.API_ANTHROPIC?.trim() || undefined;
  return { budgetUsd, model, apiKey };
}
