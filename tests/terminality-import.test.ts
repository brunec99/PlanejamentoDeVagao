import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderFloors,
  parseSheetDate,
  planTerminalityImport,
  type ImportContext,
  type SheetExport,
  type SheetRow,
} from '../src/application/use-cases/import-terminality';
import type { TerminalityData } from '../src/domain/terminality';
import { applyMutationToData } from '../src/modules/terminalidade/offline-model';

/* Importação da lista de pendências do Sheets (21/10/2026): cada linha passa pelos comandos da aba 5,
 * e rodar de novo só acrescenta o que é novo. */

const W = '11111111-1111-4111-8111-111111111111';
const empty = (): TerminalityData => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });

function context(): ImportContext {
  let n = 0;
  // Id estável de teste: o mesmo texto dá o mesmo UUID, como o sha1 do script.
  const stable = new Map<string, string>();
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  return {
    actorId: 'admin',
    now: '2026-10-21T15:00:00.000Z',
    today: '2026-10-21',
    newId: () => uuid(900000 + n++),
    idFor: seed => {
      if (!stable.has(seed)) stable.set(seed, uuid(stable.size + 1));
      return stable.get(seed)!;
    },
  };
}

const row = (over: Partial<SheetRow> & { linha: number }): SheetRow => ({
  local: '2° pavto',
  apto: '201',
  descricao: 'Falta de requadro na porta',
  tipo: 'REQUADRO',
  observado: '2026-10-08',
  responsavelAtr: 'Ana',
  responsavelTerceiro: 'ATR Obra',
  resolvido: 'NÃO',
  fotos: [{ sha1: `sha-${over.linha}`, arquivo: `sha-${over.linha}.jpg` }],
  fotosCorrecao: [],
  ...over,
});

const sheet = (linhas: SheetRow[]): SheetExport => ({
  linhas,
  cadastro: {
    locais: ['GERAL', 'FACHADA', 'SS1', 'Térreo', '2° pavto', '3° pavto', 'Ático'],
    aptos: ['N.A', '201', '202', '301', '801 ATC'],
    tipos: ['REQUADRO', 'PINTURA', 'PINTURA '],
    responsaveisAtr: ['Ana', 'Yulli'],
    terceiros: ['ATR Obra', 'MATRIX PINTURAS'],
  },
});

test('pavimentos de baixo para cima; o que não é pavimento vai para o fim, na ordem da planilha', () => {
  assert.deepEqual(orderFloors(['GERAL', 'FACHADA', 'SS2', 'SS1', 'Térreo', '3° pavto', '2° pavto', 'Ático', 'Barrilete']), [
    'SS2',
    'SS1',
    'Térreo',
    '2° pavto',
    '3° pavto',
    'Ático',
    'Barrilete',
    'GERAL',
    'FACHADA',
  ]);
});

test('datas: célula de data, texto DD/MM/AAAA e o texto sem a segunda barra', () => {
  assert.deepEqual(parseSheetDate('2026-10-08'), { date: '2026-10-08' });
  assert.deepEqual(parseSheetDate('8/10/2026'), { date: '2026-10-08', fixed: false });
  assert.deepEqual(parseSheetDate('08/102026'), { date: '2026-10-08', fixed: true });
  assert.deepEqual(parseSheetDate('31/02/2026'), {});
  assert.deepEqual(parseSheetDate(''), {});
});

test('monta o cadastro da aba de apoio e grava pendência, fotos e resolução numa gravação', () => {
  const plan = planTerminalityImport(
    empty(),
    W,
    sheet([
      row({ linha: 3 }),
      row({
        linha: 4,
        apto: '202',
        tipo: 'PINTURA',
        responsavelTerceiro: 'MATRIX - PINTURAS',
        resolvido: 'SIM',
        corrigido: '2026-10-10',
        fotosCorrecao: [{ sha1: 'corr-4', arquivo: 'corr-4.jpg' }],
        observacao: 'Lixar antes',
      }),
      row({ linha: 5, local: 'Ático', apto: '801 ATC', responsavelAtr: 'Bia' }),
    ]),
    context(),
  );
  const { insert, update } = plan.mutation;
  assert.deepEqual(plan.report.errors, []);
  assert.deepEqual(
    insert.floors.map(f => f.name),
    ['SS1', 'Térreo', '2° pavto', '3° pavto', 'Ático', 'GERAL', 'FACHADA'],
  );
  // Apto da lista vai para o pavimento do número; o da linha, para onde a linha o usa.
  const unitsOf = (floor: string) => insert.units.filter(u => u.floorId === insert.floors.find(f => f.name === floor)!.id).map(u => u.name);
  assert.deepEqual(unitsOf('2° pavto'), ['201', '202']);
  assert.deepEqual(unitsOf('3° pavto'), ['301']);
  assert.deepEqual(unitsOf('Ático'), ['801 ATC']);
  // "PINTURA " repetido na lista não vira dois tipos; "Bia" só aparece nas linhas e entra também.
  assert.deepEqual(
    insert.types.map(t => t.name),
    ['REQUADRO', 'PINTURA'],
  );
  assert.deepEqual(plan.report.peopleCreated, ['Ana', 'Yulli', 'Bia']);

  assert.equal(insert.items.length, 3);
  const resolved = insert.items[1];
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.correctedOn, '2026-10-10');
  assert.equal(resolved.contractor, 'MATRIX PINTURAS');
  assert.equal(resolved.description, 'Falta de requadro na porta — Obs.: Lixar antes');
  assert.equal(update.items.length, 0, 'a resolução de pendência nova vai na própria inserção');
  // A ordem da planilha fica no created_at.
  assert.ok(insert.items[0].createdAt < insert.items[1].createdAt && insert.items[1].createdAt < insert.items[2].createdAt);

  assert.deepEqual(
    insert.photos.map(p => p.kind),
    ['issue', 'issue', 'correction', 'issue'],
  );
  assert.deepEqual(
    plan.uploads.map(u => u.arquivo),
    ['sha-3.jpg', 'sha-4.jpg', 'corr-4.jpg', 'sha-5.jpg'],
  );
  assert.ok(plan.uploads.every(u => u.storagePath === `${W}/${u.itemId}/${u.photoId}.jpg`));
});

test('resolvida sem foto da correção fica aberta, com aviso: a regra da tela vale na importação', () => {
  const plan = planTerminalityImport(empty(), W, sheet([row({ linha: 7, resolvido: 'SIM', corrigido: '2026-10-16' })]), context());
  assert.equal(plan.mutation.insert.items[0].status, 'open');
  assert.equal(plan.report.resolved, 0);
  assert.match(plan.report.warnings.map(w => w.message).join('\n'), /ficou aberta: Envie a foto da correção/);
});

test('rodar de novo não duplica; só acrescenta foto da correção e resolução novas', () => {
  const ctx = context();
  const first = planTerminalityImport(empty(), W, sheet([row({ linha: 3 }), row({ linha: 4 })]), ctx);
  const saved = applyMutationToData(empty(), first.mutation);

  const again = planTerminalityImport(saved, W, sheet([row({ linha: 3 }), row({ linha: 4 })]), ctx);
  assert.equal(again.report.created, 0);
  assert.equal(again.report.existing, 2);
  assert.equal(again.uploads.length, 0);
  assert.ok(Object.values(again.mutation.insert).every(list => list.length === 0));

  const later = planTerminalityImport(
    saved,
    W,
    sheet([
      row({ linha: 3, resolvido: 'SIM', corrigido: '2026-10-20', fotosCorrecao: [{ sha1: 'corr', arquivo: 'corr.jpg' }] }),
      row({ linha: 4, descricao: 'Pendência nova na planilha' }),
    ]),
    ctx,
  );
  assert.equal(later.report.created, 1);
  assert.equal(later.report.resolved, 1);
  assert.deepEqual(
    later.uploads.map(u => u.arquivo),
    ['corr.jpg', 'sha-4.jpg'],
  );
  assert.equal(later.mutation.update.items.length, 1);
  assert.equal(later.mutation.update.items[0].status, 'resolved');
});

test('linhas iguais (dois buracos no mesmo drywall) viram duas pendências, e o ajuste corrige a data', () => {
  const twin = { descricao: 'Buraco no drywall', fotos: [{ sha1: 'same', arquivo: 'same.jpg' }] };
  const plan = planTerminalityImport(
    empty(),
    W,
    sheet([row({ linha: 10, ...twin }), row({ linha: 11, ...twin }), row({ linha: 12, observado: '2025-10-08' })]),
    context(),
    { '12': { observado: '2026-10-08' } },
  );
  assert.equal(plan.report.created, 3);
  assert.notEqual(plan.mutation.insert.items[0].id, plan.mutation.insert.items[1].id);
  assert.equal(plan.mutation.insert.items[2].observedOn, '2026-10-08');
});

test('data ilegível é erro da linha; ano fora do período, aviso', () => {
  const plan = planTerminalityImport(
    empty(),
    W,
    sheet([row({ linha: 3 }), row({ linha: 4 }), row({ linha: 5, observado: 'ontem' }), row({ linha: 6, observado: '2025-10-08' })]),
    context(),
  );
  assert.deepEqual(
    plan.report.errors.map(e => e.line),
    [5],
  );
  assert.ok(plan.report.warnings.some(w => w.line === 6 && /confira o ano/.test(w.message)));
});
