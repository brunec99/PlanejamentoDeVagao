import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetDecision, ESTIMATED_GLOBAL_QUESTION_USD, globalUsageWorkOf } from '../src/domain/agent-cost';
import { globalContextBlock, globalSystemText, MAX_GLOBAL_TOOL_ITERATIONS } from '../src/infrastructure/agent/chat';

/** Claudia geral (08/11/2026): onde o custo é gravado, o teto que vale e o que vai no prompt. */

test('globalUsageWorkOf: uma obra lida fica com o custo; nenhuma lida vai para a obra da tela; várias vão sem obra', () => {
  assert.equal(globalUsageWorkOf(['mzn'], undefined), 'mzn');
  assert.equal(globalUsageWorkOf(['mzn', 'mzn'], 'atm'), 'mzn');
  assert.equal(globalUsageWorkOf([], 'atm'), 'atm');
  assert.equal(globalUsageWorkOf([], undefined), null);
  assert.equal(globalUsageWorkOf(['mzn', 'atm'], 'mzn'), null);
});

test('teto da pergunta geral: vale o do mês e o da pessoa, não a parte da obra (regra 10)', () => {
  // A rota monta o estado com workUsd 0 e uma obra só: a parte da obra (US$ 30) nunca corta.
  const base = { budgetUsd: 20, workUsd: 0, activeWorks: 1, userLimitUsd: null, userBlocked: false };
  assert.equal(budgetDecision({ ...base, monthUsd: 6.4, userUsd: 2 }, ESTIMATED_GLOBAL_QUESTION_USD).allowed, true);
  const month = budgetDecision({ ...base, monthUsd: 19.95, userUsd: 2 }, ESTIMATED_GLOBAL_QUESTION_USD);
  assert.equal(month.allowed, false);
  assert.equal(!month.allowed && month.reason, 'mes');
  const user = budgetDecision({ ...base, monthUsd: 3, userUsd: 4.95, userLimitUsd: 5 }, ESTIMATED_GLOBAL_QUESTION_USD);
  assert.equal(!user.allowed && user.reason, 'usuario');
  assert.equal(budgetDecision({ ...base, monthUsd: 0, userBlocked: true }, ESTIMATED_GLOBAL_QUESTION_USD).allowed, false);
});

test('globalContextBlock: com obra, pergunta sem obra vale para ela; fora de obra, vale para todas', () => {
  const inside = globalContextBlock({ screen: 'terminalidade', work: { name: 'Mozine', code: 'MZN' }, today: '2026-11-08' });
  assert.match(inside.text, /Hoje é 08\/11\/2026/);
  assert.match(inside.text, /Aba 2\.1 · Terminalidade/);
  assert.match(inside.text, /obra Mozine \(MZN\)/);
  assert.match(inside.text, /vale para a obra Mozine/);
  assert.equal('cache_control' in inside, false);
  const outside = globalContextBlock({ screen: 'dashboard-geral', today: '2026-11-08' });
  assert.match(outside.text, /Dashboard geral/);
  assert.match(outside.text, /vale para todas as obras/);
  const unknown = globalContextBlock({ screen: 'nada', today: '2026-11-08' });
  assert.match(unknown.text, /uma tela fora das obras/);
});

test('globalSystemText: leva a lista de obras, as regras de escolha da obra e o índice do manual', () => {
  const text = globalSystemText('MZN | Mozine | ativa\nATM | Atmos | ativa');
  assert.match(text, /MZN \| Mozine \| ativa/);
  assert.match(text, /panorama_obras/);
  assert.match(text, /\[Tela: …\]/);
  assert.match(text, /Índice do manual/);
  assert.match(text, /Nunca diga que algo foi gravado/);
  assert.ok(MAX_GLOBAL_TOOL_ITERATIONS >= 6);
});
