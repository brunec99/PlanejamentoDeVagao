import test from 'node:test';
import assert from 'node:assert/strict';
import type { SafetyType } from '../src/domain/safety';
import {
  allowedExtras,
  EXTRAS_ERRORS,
  parseExtrasQuery,
  readCell,
  safetyCells,
} from '../src/infrastructure/repositories/supabase/dashboard-extras';
import type { ExtrasRange } from '../src/modules/dashboard/extras/types';

/** `GET /api/dashboard/extras` (12/11/2026): o que é puro na leitura dos quadros novos. A consulta da URL, quais
 * células cada acesso recebe, como uma leitura vira célula e a segurança por obra. A parte com Supabase e sessão
 * fica fora. */

const query = (text: string) => parseExtrasQuery(new URLSearchParams(text));

test('consulta: período obrigatório e válido, obra e segurança opcionais', () => {
  assert.deepEqual(query('de=2026-11-09&ate=2026-11-14'), { ok: true, start: '2026-11-09', end: '2026-11-14', includeSafety: false });
  assert.deepEqual(query('de=2026-11-09&ate=2026-11-14&obra=obra-1&seguranca=1'), {
    ok: true,
    start: '2026-11-09',
    end: '2026-11-14',
    workId: 'obra-1',
    includeSafety: true,
  });
  for (const bad of ['', 'de=2026-11-09', 'de=09/11/2026&ate=2026-11-14', 'de=2026-02-30&ate=2026-03-07', 'de=2026-11-14&ate=2026-11-09'])
    assert.equal(query(bad).ok, false, bad);
  assert.equal(query('de=2000-01-03&ate=2026-11-14').ok, false);
  // `seguranca` só vale com "1"; obra em branco é como sem obra.
  assert.deepEqual(query('de=2026-11-09&ate=2026-11-14&obra=+&seguranca=sim'), {
    ok: true,
    start: '2026-11-09',
    end: '2026-11-14',
    includeSafety: false,
  });
});

test('acesso: cada célula segue o módulo dela; a Linha de Balanço segue o longo prazo; a segurança só quando pedida', () => {
  const some = { developer: false, modules: ['histograma', 'longo-prazo', 'seguranca'] };
  assert.deepEqual([...allowedExtras(some, false)], ['headcount', 'lob']);
  assert.deepEqual([...allowedExtras(some, true)], ['headcount', 'lob', 'safety']);
  assert.deepEqual([...allowedExtras({ developer: false, modules: [] }, true)], []);
  assert.equal(allowedExtras({ developer: true, modules: [] }, true).size, 6);
  assert.equal(allowedExtras('all', false).size, 5);
  assert.equal(allowedExtras('all', true).size, 6);
});

class Missing extends Error {}

test('célula: pronta, sem dado, migração ausente e erro (que vai para o registro, sem lançar)', async () => {
  const logged: unknown[] = [];
  const log = (cause: unknown) => logged.push(cause);
  assert.deepEqual(await readCell('headcount', async () => ({ n: 1 }), Missing, log), { kind: 'ready', data: { n: 1 } });
  assert.deepEqual(await readCell('headcount', async () => undefined, Missing, log), { kind: 'absent' });
  assert.deepEqual(
    await readCell(
      'production',
      async () => {
        throw new Missing();
      },
      Missing,
      log,
    ),
    { kind: 'unavailable' },
  );
  assert.equal(logged.length, 0);
  const boom = new Error('falha de rede com detalhe interno');
  assert.deepEqual(
    await readCell(
      'checklist',
      async () => {
        throw boom;
      },
      Missing,
      log,
    ),
    { kind: 'error', message: EXTRAS_ERRORS.checklist },
  );
  assert.deepEqual(logged, [boom]);
});

const RANGE: ExtrasRange = { start: '2026-11-09', end: '2026-11-14', today: '2026-11-14' };
const TYPES: SafetyType[] = [
  {
    id: 't1',
    name: 'EPI',
    orderIndex: 0,
    active: true,
    createdAt: '2026-11-01T12:00:00Z',
    updatedAt: '2026-11-01T12:00:00Z',
  } as SafetyType,
];

test('segurança: uma leitura para todas as obras vira uma célula por obra', () => {
  const cells = safetyCells(
    ['obra-1', 'obra-2'],
    {
      kind: 'ready',
      types: TYPES,
      items: [
        { workId: 'obra-1', typeId: 't1', consequence: 'Leve', observedOn: '2026-11-10', status: 'open' },
        { workId: 'obra-1', consequence: 'Severa', observedOn: '2026-11-02', status: 'resolved', correctedOn: '2026-11-11' },
        { workId: 'obra-3', consequence: 'Leve', observedOn: '2026-11-10', status: 'open' },
      ],
    },
    RANGE,
  );
  const first = cells.get('obra-1')!;
  assert.equal(first.kind, 'ready');
  if (first.kind === 'ready') {
    assert.equal(first.data.open, 1);
    assert.equal(first.data.opened, 1);
    assert.equal(first.data.resolved, 1);
    assert.equal(first.data.openAtStart, 1);
  }
  assert.deepEqual(cells.get('obra-2'), { kind: 'absent' });
  assert.equal(cells.has('obra-3'), false);
});

test('segurança: migração ausente ou falha valem para todas as obras', () => {
  assert.deepEqual(
    [...safetyCells(['a', 'b'], { kind: 'unavailable' }, RANGE).values()],
    [{ kind: 'unavailable' }, { kind: 'unavailable' }],
  );
  assert.deepEqual([...safetyCells(['a'], { kind: 'error' }, RANGE).values()], [{ kind: 'error', message: EXTRAS_ERRORS.safety }]);
});
