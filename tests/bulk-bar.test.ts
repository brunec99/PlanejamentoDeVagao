import test from 'node:test';
import assert from 'node:assert/strict';
import type { NonFulfillmentCause, WeeklyCommitment } from '../src/domain/entities';
import { bulkChoiceChanges, bulkFulfillmentItems, type BulkChoice } from '../src/modules/curto-prazo/bulk-bar';

/* Apontamento em lote do Curto prazo (26/10/2026): o que vai ser gravado em cada linha marcada a
 * partir de uma escolha de Status/Causa/Justificativa, respeitando a regra "Não exige causa; Sim
 * não tem causa" linha a linha. */

const KEEP: BulkChoice = { status: '', cause: '', justification: { mode: 'keep' } };
const choice = (over: Partial<BulkChoice>): BulkChoice => ({ ...KEEP, ...over });

let n = 0;
function row(over: Partial<WeeklyCommitment> = {}): WeeklyCommitment {
  n += 1;
  return {
    id: `c${n}`,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    workId: 'w1',
    name: `Linha ${n}`,
    supplier: 'Empreiteira',
    weekStart: '2026-10-19',
    weekEnd: '2026-10-25',
    responsibleId: 'u1',
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    ...over,
  };
}

const sim = (over: Partial<WeeklyCommitment> = {}) => row({ fulfilled: true, ...over });
const nao = (cause: NonFulfillmentCause = 'Retrabalho', over: Partial<WeeklyCommitment> = {}) => row({ fulfilled: false, cause, ...over });
const semStatus = (over: Partial<WeeklyCommitment> = {}) => row(over);

test('Sim: fulfilled true e sem causa, mesmo na linha que era Não com causa', () => {
  const a = nao('Retrabalho', { justification: 'faltou gente' });
  const b = semStatus();
  const { items, skipped } = bulkFulfillmentItems([a, b], choice({ status: 'Sim' }));
  assert.equal(skipped, 0);
  assert.deepEqual(items, [
    { commitmentId: a.id, fulfilled: true, justification: 'faltou gente' },
    { commitmentId: b.id, fulfilled: true },
  ]);
});

test('Sim ignora a causa escolhida', () => {
  const a = semStatus();
  const { items } = bulkFulfillmentItems([a], choice({ status: 'Sim', cause: 'Intempéries' }));
  assert.deepEqual(items, [{ commitmentId: a.id, fulfilled: true }]);
});

test('Sim com justificativa nova: texto aparado substitui a da linha; em branco apaga', () => {
  const a = sim({ justification: 'antiga' });
  const nova = bulkFulfillmentItems([a], choice({ status: 'Sim', justification: { mode: 'set', text: '  chuva forte  ' } }));
  assert.deepEqual(nova.items, [{ commitmentId: a.id, fulfilled: true, justification: 'chuva forte' }]);
  const apagada = bulkFulfillmentItems([a], choice({ status: 'Sim', justification: { mode: 'set', text: '   ' } }));
  assert.deepEqual(apagada.items, [{ commitmentId: a.id, fulfilled: true }]);
});

test('Não com causa escolhida: vale para todas, por cima da causa que a linha tinha', () => {
  const a = nao('Retrabalho');
  const b = sim({ justification: 'ok' });
  const c = semStatus();
  const { items, skipped } = bulkFulfillmentItems([a, b, c], choice({ status: 'Não', cause: 'Falta de Material' }));
  assert.equal(skipped, 0);
  assert.deepEqual(items, [
    { commitmentId: a.id, fulfilled: false, cause: 'Falta de Material' },
    { commitmentId: b.id, fulfilled: false, cause: 'Falta de Material', justification: 'ok' },
    { commitmentId: c.id, fulfilled: false, cause: 'Falta de Material' },
  ]);
});

test('Não sem causa escolhida: usa a da linha; quem não tem nenhuma fica de fora', () => {
  const a = nao('Intempéries', { justification: 'x' });
  const b = sim();
  const c = semStatus();
  const { items, skipped } = bulkFulfillmentItems([a, b, c], choice({ status: 'Não', justification: { mode: 'set', text: 'novo' } }));
  assert.equal(skipped, 2);
  assert.deepEqual(items, [{ commitmentId: a.id, fulfilled: false, cause: 'Intempéries', justification: 'novo' }]);
});

test('Manter: linha sem Status é pulada; as outras mantêm o Status', () => {
  const a = semStatus();
  const b = sim();
  const c = nao('Retrabalho');
  const { items, skipped } = bulkFulfillmentItems([a, b, c], choice({ justification: { mode: 'set', text: 'conferido' } }));
  assert.equal(skipped, 1);
  assert.deepEqual(items, [
    { commitmentId: b.id, fulfilled: true, justification: 'conferido' },
    { commitmentId: c.id, fulfilled: false, cause: 'Retrabalho', justification: 'conferido' },
  ]);
});

test('Manter com causa escolhida: entra só na linha com Não; na linha Sim é ignorada', () => {
  const a = sim();
  const b = nao('Retrabalho', { justification: 'j' });
  const { items, skipped } = bulkFulfillmentItems([a, b], choice({ cause: 'Baixa Produtividade' }));
  assert.equal(skipped, 0);
  assert.deepEqual(items, [{ commitmentId: b.id, fulfilled: false, cause: 'Baixa Produtividade', justification: 'j' }]);
});

test('Manter numa linha Não que ficou sem causa (dado antigo) também fica de fora', () => {
  const a = row({ fulfilled: false });
  const { items, skipped } = bulkFulfillmentItems([a], choice({ justification: { mode: 'set', text: 'z' } }));
  assert.equal(skipped, 1);
  assert.deepEqual(items, []);
});

test('Linha cujo resultado é igual ao que já tem não entra nem conta como pulada', () => {
  const a = sim({ justification: 'ok' });
  const b = nao('Retrabalho');
  const c = nao('Intempéries', { justification: ' com espaço ' });
  assert.deepEqual(bulkFulfillmentItems([a], choice({ status: 'Sim' })), { items: [], skipped: 0 });
  assert.deepEqual(bulkFulfillmentItems([b], choice({ status: 'Não', cause: 'Retrabalho' })), { items: [], skipped: 0 });
  assert.deepEqual(bulkFulfillmentItems([b], choice({ cause: 'Retrabalho' })), { items: [], skipped: 0 });
  assert.deepEqual(bulkFulfillmentItems([a], choice({ justification: { mode: 'set', text: ' ok ' } })), { items: [], skipped: 0 });
  // Em "manter" a justificativa da linha vai como está: espaço sobrando não é motivo para regravar.
  assert.deepEqual(bulkFulfillmentItems([c], choice({ cause: 'Intempéries' })), { items: [], skipped: 0 });
  // Já uma linha Sim que ficou com causa (dado antigo) é regravada ao escolher Sim: a causa cai.
  const d = sim({ cause: 'Retrabalho' });
  assert.deepEqual(bulkFulfillmentItems([d], choice({ status: 'Sim' })).items, [{ commitmentId: d.id, fulfilled: true }]);
});

test('Nada escolhido não muda nada; qualquer escolha, inclusive "Trocar por…" em branco, muda', () => {
  assert.equal(bulkChoiceChanges(KEEP), false);
  assert.equal(bulkChoiceChanges(choice({ status: 'Sim' })), true);
  assert.equal(bulkChoiceChanges(choice({ status: 'Não' })), true);
  assert.equal(bulkChoiceChanges(choice({ cause: 'Retrabalho' })), true);
  assert.equal(bulkChoiceChanges(choice({ justification: { mode: 'set', text: '' } })), true);
});
