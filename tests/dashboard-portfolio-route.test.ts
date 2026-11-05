import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalityData } from '../src/domain/terminality';
import { emptyPlanDocument } from '../src/domain/long-term-plan';
import {
  assemblePortfolioSources,
  longTermErrorMessage,
  mapLimited,
  TERMINALITY_ERROR,
  type TerminalityRead,
} from '../src/app/api/dashboard/obras/route';

/** `GET /api/dashboard/obras` (Dashboard geral, regra 15): a montagem da resposta a partir das leituras do
 * longo prazo (uma consulta para todas as obras) e da terminalidade (por obra), e o limite de leituras ao
 * mesmo tempo. A parte com Supabase e sessão fica fora: aqui só o que é puro. */

const stamp = { createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z' };
const terminalityOf = (workId: string): TerminalityData => ({
  floors: [{ id: `${workId}-p1`, workId, name: 'Térreo', orderIndex: 0, ...stamp }],
  units: [],
  types: [],
  people: [],
  items: [
    {
      id: `${workId}-i1`,
      workId,
      floorId: `${workId}-p1`,
      description: 'Rejunte falhado',
      observedOn: '2026-10-05',
      status: 'open',
      createdBy: 'user-1',
      ...stamp,
    },
  ],
  photos: [
    {
      id: `${workId}-f1`,
      itemId: `${workId}-i1`,
      workId,
      kind: 'issue',
      storagePath: `${workId}/f1.jpg`,
      thumbPath: `${workId}/f1-thumb.jpg`,
      createdBy: 'user-1',
      createdAt: stamp.createdAt,
    },
  ],
});
const ready = (workId: string): TerminalityRead => ({ kind: 'ready', data: terminalityOf(workId) });

test('longo prazo: uma linha por obra; obra sem linha sai com null; a ordem é a das obras liberadas', () => {
  const document = emptyPlanDocument();
  const response = assemblePortfolioSources(
    ['obra-2', 'obra-1', 'obra-3'],
    {
      kind: 'rows',
      rows: [
        { work_id: 'obra-1', document },
        { work_id: 'obra-3', document: null },
      ],
    },
    new Map([
      ['obra-1', ready('obra-1')],
      ['obra-2', ready('obra-2')],
      ['obra-3', ready('obra-3')],
    ]),
  );
  assert.equal(response.longTermAccess, true);
  assert.equal(response.terminalityAvailable, true);
  assert.deepEqual(
    response.works.map(w => w.workId),
    ['obra-2', 'obra-1', 'obra-3'],
  );
  assert.equal(response.works[0].longTerm, null);
  assert.deepEqual(response.works[1].longTerm, document);
  assert.equal(response.works[2].longTerm, null);
  assert.ok(response.works.every(w => !('longTermError' in w)));
});

test('sem acesso ao longo prazo: nenhuma obra traz a chave longTerm, nem erro', () => {
  const response = assemblePortfolioSources(['obra-1'], { kind: 'denied' }, new Map([['obra-1', ready('obra-1')]]));
  assert.equal(response.longTermAccess, false);
  assert.ok(!('longTerm' in response.works[0]));
  assert.ok(!('longTermError' in response.works[0]));
});

test('falha na consulta do longo prazo vai para todas as obras, com a mensagem curta', () => {
  const missing = assemblePortfolioSources(['obra-1', 'obra-2'], { kind: 'error', code: 'PGRST205' }, new Map());
  assert.equal(missing.longTermAccess, true);
  assert.deepEqual(
    missing.works.map(w => [w.longTermError, 'longTerm' in w]),
    [
      ['Plano de longo prazo indisponível: migração 0024 não aplicada.', false],
      ['Plano de longo prazo indisponível: migração 0024 não aplicada.', false],
    ],
  );
  assert.equal(longTermErrorMessage('42P01'), 'Plano de longo prazo indisponível: migração 0024 não aplicada.');
  assert.equal(longTermErrorMessage('57014'), 'Não foi possível ler o plano de longo prazo.');
  assert.equal(longTermErrorMessage(), 'Não foi possível ler o plano de longo prazo.');
});

test('terminalidade: dados sem fotos; falha de uma obra fica só nela', () => {
  const response = assemblePortfolioSources(
    ['obra-1', 'obra-2'],
    { kind: 'denied' },
    new Map<string, TerminalityRead>([
      ['obra-1', ready('obra-1')],
      ['obra-2', { kind: 'error' }],
    ]),
  );
  assert.equal(response.terminalityAvailable, true);
  const [first, second] = response.works;
  assert.deepEqual(first.terminality, { ...terminalityOf('obra-1'), photos: [] });
  assert.equal(first.terminality?.items.length, 1);
  assert.ok(!('terminalityError' in first));
  assert.ok(!('terminality' in second));
  assert.equal(second.terminalityError, TERMINALITY_ERROR);
});

test('terminalidade sem a migração em qualquer obra: indisponível e nenhuma obra com dado ou erro', () => {
  const response = assemblePortfolioSources(
    ['obra-1', 'obra-2', 'obra-3'],
    { kind: 'denied' },
    new Map<string, TerminalityRead>([
      ['obra-1', ready('obra-1')],
      ['obra-2', { kind: 'unavailable' }],
      ['obra-3', { kind: 'error' }],
    ]),
  );
  assert.equal(response.terminalityAvailable, false);
  assert.ok(response.works.every(w => !('terminality' in w) && !('terminalityError' in w)));
});

test('sem obra liberada: resposta vazia', () => {
  assert.deepEqual(assemblePortfolioSources([], { kind: 'rows', rows: [] }, new Map()), {
    longTermAccess: true,
    terminalityAvailable: true,
    works: [],
  });
});

test('mapLimited: no máximo `limit` ao mesmo tempo, resultados na ordem dos itens', async () => {
  let running = 0;
  let peak = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  const out = await mapLimited(items, 4, async item => {
    running += 1;
    peak = Math.max(peak, running);
    // Os primeiros demoram mais, para a ordem de término não ser a dos itens.
    await new Promise(resolve => setTimeout(resolve, (10 - item) * 2));
    running -= 1;
    return item * 10;
  });
  assert.deepEqual(
    out,
    items.map(i => i * 10),
  );
  assert.equal(peak, 4);
  assert.deepEqual(await mapLimited([], 4, async () => 1), []);
  assert.deepEqual(await mapLimited([1, 2], 4, async item => item + 1), [2, 3]);
});
