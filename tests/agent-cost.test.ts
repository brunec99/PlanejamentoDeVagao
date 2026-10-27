import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentConfigFromEnv,
  budgetDecision,
  costOf,
  DEFAULT_AGENT_MODEL,
  DEFAULT_MONTHLY_BUDGET_USD,
  ESTIMATED_CALL_USD,
  formatUsd,
  MODEL_PRICES,
  monthKey,
  priceFor,
  resolveModelAlias,
  workBudgetOf,
  type BudgetState,
} from '../src/domain/agent-cost';

const usage = (over: Partial<{ input: number; output: number; cacheWrite: number; cacheRead: number }> = {}) => ({
  input: 0,
  output: 0,
  cacheWrite: 0,
  cacheRead: 0,
  ...over,
});

test('costOf segue a tabela: Sonnet 5.5 com 10 mil de entrada e mil de saída custa US$ 0,03', () => {
  assert.equal(costOf(usage({ input: 10_000, output: 1_000 }), 'claude-sonnet-5-5'), 0.03);
  // Opus 5.5: 1 mil de entrada (0,004) + 100 de saída (0,002) + 1 mil escritos em cache (0,005) + 10 mil lidos (0,002).
  assert.equal(costOf(usage({ input: 1_000, output: 100, cacheWrite: 1_000, cacheRead: 10_000 }), 'claude-opus-5-5'), 0.013);
  // Haiku 5.5 é vinte vezes mais barato que o Sonnet na entrada.
  assert.equal(costOf(usage({ input: 10_000, output: 1_000 }), 'claude-haiku-5-5'), 0.0015);
  // Sem tokens, sem custo; e o valor fica com seis casas.
  assert.equal(costOf(usage(), 'claude-sonnet-5-5'), 0);
  assert.equal(costOf(usage({ input: 1 }), 'claude-haiku-5-5'), 0); // 1e-7 arredonda para zero
  assert.equal(costOf(usage({ input: 1 }), 'claude-sonnet-5-5'), 0.000002);
});

test('priceFor: id com sufixo de data cai no prefixo; id desconhecido é cobrado como o mais caro', () => {
  assert.equal(priceFor('claude-sonnet-5-5-20261001'), MODEL_PRICES['claude-sonnet-5-5']);
  assert.equal(priceFor('claude-sonnet-5-5'), MODEL_PRICES['claude-sonnet-5-5']);
  assert.equal(priceFor('claude-haiku-5-5-latest'), MODEL_PRICES['claude-haiku-5-5']);
  assert.equal(priceFor('modelo-substituto'), MODEL_PRICES['claude-opus-5-5']);
  assert.equal(priceFor(''), MODEL_PRICES['claude-opus-5-5']);
  // "claude-sonnet-5" não é prefixo com hífen de "claude-sonnet-5-5": é desconhecido, logo Opus.
  assert.equal(priceFor('claude-sonnet-5'), MODEL_PRICES['claude-opus-5-5']);
  // Um id que só "parece" o começo de outro não casa sem o hífen.
  assert.equal(priceFor('claude-sonnet-5-55'), MODEL_PRICES['claude-opus-5-5']);
  assert.equal(costOf(usage({ input: 10_000, output: 1_000 }), 'claude-sonnet-5-5-20261001'), 0.03);
  assert.equal(costOf(usage({ input: 10_000, output: 1_000 }), 'desconhecido'), 0.06);
});

test('workBudgetOf: parte da obra é 1,5× o teto dividido pelas obras ativas, com duas casas', () => {
  assert.equal(workBudgetOf(20, 6), 5);
  assert.equal(workBudgetOf(20, 1), 30);
  assert.equal(workBudgetOf(20, 0), 30); // zero obras ativas conta como uma
  assert.equal(workBudgetOf(20, 7), 4.29);
  assert.equal(workBudgetOf(100, 3), 50);
});

const state = (over: Partial<BudgetState> = {}): BudgetState => ({
  budgetUsd: 20,
  monthUsd: 0,
  workUsd: 0,
  activeWorks: 6,
  ...over,
});
const estimate = ESTIMATED_CALL_USD.leitura; // 0,10

test('budgetDecision: bloqueio do admin vem antes de qualquer teto', () => {
  const decision = budgetDecision(state({ monthUsd: 100, workUsd: 100, userUsd: 100, userLimitUsd: 1, userBlocked: true }), estimate);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.reason, 'bloqueado');
  assert.equal(decision.workBudgetUsd, 5);
  assert.ok(!decision.allowed && decision.message.includes('cortado pelo administrador'));
});

test('budgetDecision: teto do mês é absoluto e conta a reserva da chamada', () => {
  // 19,95 + 0,10 passa de 20.
  const decision = budgetDecision(state({ monthUsd: 19.95, workUsd: 1 }), estimate);
  assert.equal(!decision.allowed && decision.reason, 'mes');
  assert.ok(!decision.allowed && decision.message.includes('US$ 20,00'));
  assert.ok(!decision.allowed && decision.message.includes('US$ 19,95 usados'));
  // 19,90 + 0,10 = 20 não passa: ainda permitido.
  assert.equal(budgetDecision(state({ monthUsd: 19.9, workUsd: 1 }), estimate).allowed, true);
});

test('budgetDecision: a obra não passa da parte dela (US$ 5 com 6 obras)', () => {
  const decision = budgetDecision(state({ monthUsd: 10, workUsd: 4.95 }), estimate);
  assert.equal(!decision.allowed && decision.reason, 'obra');
  assert.equal(decision.workBudgetUsd, 5);
  assert.ok(!decision.allowed && decision.message.includes('US$ 4,95 de US$ 5,00'));
  assert.equal(budgetDecision(state({ monthUsd: 10, workUsd: 4.9 }), estimate).allowed, true);
  // Com uma obra só, a parte dela é 30 e o teto do mês (20) é o que vale.
  const umaObra = budgetDecision(state({ activeWorks: 1, monthUsd: 19.95, workUsd: 19.95 }), estimate);
  assert.equal(!umaObra.allowed && umaObra.reason, 'mes');
  assert.equal(umaObra.workBudgetUsd, 30);
});

test('budgetDecision: limite da pessoa só vale quando o admin definiu um número', () => {
  const decision = budgetDecision(state({ monthUsd: 5, workUsd: 1, userUsd: 1.95, userLimitUsd: 2 }), estimate);
  assert.equal(!decision.allowed && decision.reason, 'usuario');
  assert.ok(!decision.allowed && decision.message.includes('US$ 1,95 de US$ 2,00'));
  // Limite nulo ou ausente: só os tetos gerais contam, por mais que a pessoa tenha gasto.
  assert.equal(budgetDecision(state({ monthUsd: 5, workUsd: 1, userUsd: 15, userLimitUsd: null }), estimate).allowed, true);
  assert.equal(budgetDecision(state({ monthUsd: 5, workUsd: 1, userUsd: 15 }), estimate).allowed, true);
  // Sem gasto registrado da pessoa, conta zero.
  assert.equal(budgetDecision(state({ monthUsd: 5, workUsd: 1, userLimitUsd: 0.05 }), estimate).allowed, false);
  assert.equal(budgetDecision(state({ monthUsd: 5, workUsd: 1, userLimitUsd: 0.5 }), estimate).allowed, true);
});

test('budgetDecision: permitido devolve a parte da obra', () => {
  assert.deepEqual(budgetDecision(state({ monthUsd: 3, workUsd: 1 }), ESTIMATED_CALL_USD.pergunta), { allowed: true, workBudgetUsd: 5 });
  assert.deepEqual(budgetDecision(state(), 0), { allowed: true, workBudgetUsd: 5 });
});

test('monthKey e formatUsd', () => {
  assert.equal(monthKey('2026-10-27'), '2026-10');
  assert.equal(monthKey('2026-01-01'), '2026-01');
  assert.equal(formatUsd(5), 'US$ 5,00');
  assert.equal(formatUsd(0.1), 'US$ 0,10');
  assert.equal(formatUsd(4.29), 'US$ 4,29');
  assert.equal(formatUsd(0), 'US$ 0,00');
});

test('resolveModelAlias: apelidos em qualquer grafia, id completo passa, vazio e desconhecido caem no padrão', () => {
  assert.equal(resolveModelAlias('SONNET5.5'), 'claude-sonnet-5-5');
  assert.equal(resolveModelAlias('sonnet-5.5'), 'claude-sonnet-5-5');
  assert.equal(resolveModelAlias('sonnet'), 'claude-sonnet-5-5');
  assert.equal(resolveModelAlias('opus'), 'claude-opus-5-5');
  assert.equal(resolveModelAlias('Opus 5.5'), 'claude-opus-5-5');
  assert.equal(resolveModelAlias('opus5'), 'claude-opus-5');
  assert.equal(resolveModelAlias('sonnet5'), 'claude-sonnet-5');
  assert.equal(resolveModelAlias(' haiku '), 'claude-haiku-5-5');
  assert.equal(resolveModelAlias('claude-opus-5-5-20261001'), 'claude-opus-5-5-20261001');
  assert.equal(resolveModelAlias(''), DEFAULT_AGENT_MODEL);
  assert.equal(resolveModelAlias('   '), DEFAULT_AGENT_MODEL);
  assert.equal(resolveModelAlias(undefined), DEFAULT_AGENT_MODEL);
  assert.equal(resolveModelAlias('gpt-5'), DEFAULT_AGENT_MODEL);
  assert.equal(DEFAULT_AGENT_MODEL, 'claude-sonnet-5-5');
});

test('agentConfigFromEnv: lê API_ANTHROPIC/MODEL e prefere ANTHROPIC_API_KEY/AGENT_MODEL', () => {
  assert.deepEqual(agentConfigFromEnv({}), { budgetUsd: DEFAULT_MONTHLY_BUDGET_USD, model: DEFAULT_AGENT_MODEL, apiKey: undefined });
  assert.deepEqual(agentConfigFromEnv({ API_ANTHROPIC: 'chave-antiga', MODEL: 'opus' }), {
    budgetUsd: 20,
    model: 'claude-opus-5-5',
    apiKey: 'chave-antiga',
  });
  assert.deepEqual(
    agentConfigFromEnv({
      API_ANTHROPIC: 'chave-antiga',
      MODEL: 'opus',
      ANTHROPIC_API_KEY: ' chave-canonica ',
      AGENT_MODEL: 'haiku',
      AGENT_MONTHLY_BUDGET_USD: '15',
    }),
    { budgetUsd: 15, model: 'claude-haiku-5-5', apiKey: 'chave-canonica' },
  );
  // Canônica em branco cai na antiga; orçamento inválido ou não positivo cai no padrão.
  assert.equal(agentConfigFromEnv({ ANTHROPIC_API_KEY: '   ', API_ANTHROPIC: 'chave-antiga' }).apiKey, 'chave-antiga');
  assert.equal(agentConfigFromEnv({ AGENT_MODEL: '', MODEL: 'opus' }).model, 'claude-opus-5-5');
  assert.equal(agentConfigFromEnv({ AGENT_MONTHLY_BUDGET_USD: 'abc' }).budgetUsd, 20);
  assert.equal(agentConfigFromEnv({ AGENT_MONTHLY_BUDGET_USD: '-3' }).budgetUsd, 20);
  assert.equal(agentConfigFromEnv({ AGENT_MONTHLY_BUDGET_USD: '0' }).budgetUsd, 20);
  assert.equal(agentConfigFromEnv({ AGENT_MONTHLY_BUDGET_USD: '12.5' }).budgetUsd, 12.5);
});
