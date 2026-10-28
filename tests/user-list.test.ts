import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../src/domain/entities';
import {
  DEFAULT_USER_SORT,
  EMPTY_USER_FILTER,
  NO_WORK,
  isFiltered,
  listUsers,
  matchesUser,
  nextUserSort,
  worksByName,
} from '../src/modules/configuracoes/user-list';

const base = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const users: User[] = [
  { ...base, id: 'u1', name: 'Pedro Álvares', role: 'planner', workIds: ['blt'] },
  { ...base, id: 'u2', name: 'ana Beatriz', role: 'admin', workIds: ['blt', 'atm'] },
  { ...base, id: 'u3', name: 'Daniel', role: 'planner', workIds: [] },
  { ...base, id: 'u4', name: 'Bruno', role: 'viewer', workIds: ['atm'] },
  { ...base, id: 'u5', name: 'Álvaro', role: 'manager', workIds: ['blt'] },
];
const emails = { u1: 'pedro@blentt.com.br', u2: 'ana@atrincorporadora.com.br', u3: 'daniel@blentt.com.br' };
const names = (list: User[]) => list.map(u => u.name);

test('padrão: nome de A a Z, sem diferença de acento nem de caixa', () => {
  assert.deepEqual(names(listUsers(users, emails, EMPTY_USER_FILTER, DEFAULT_USER_SORT)), [
    'Álvaro',
    'ana Beatriz',
    'Bruno',
    'Daniel',
    'Pedro Álvares',
  ]);
  assert.deepEqual(names(listUsers(users, emails, EMPTY_USER_FILTER, { key: 'name', dir: 'desc' })).slice(0, 2), [
    'Pedro Álvares',
    'Daniel',
  ]);
});

test('papel: de consulta a admin (ou o contrário), e o nome desempata sempre de A a Z', () => {
  assert.deepEqual(names(listUsers(users, emails, EMPTY_USER_FILTER, { key: 'role', dir: 'asc' })), [
    'Bruno',
    'Daniel',
    'Pedro Álvares',
    'Álvaro',
    'ana Beatriz',
  ]);
  assert.deepEqual(names(listUsers(users, emails, EMPTY_USER_FILTER, { key: 'role', dir: 'desc' })), [
    'ana Beatriz',
    'Álvaro',
    'Daniel',
    'Pedro Álvares',
    'Bruno',
  ]);
});

test('pesquisa no nome e no e-mail; cada palavra precisa aparecer', () => {
  assert.equal(matchesUser(users[0], emails.u1, 'alvares'), true);
  assert.equal(matchesUser(users[0], emails.u1, 'BLENTT pedro'), true);
  assert.equal(matchesUser(users[0], emails.u1, 'pedro ana'), false);
  assert.deepEqual(names(listUsers(users, emails, { ...EMPTY_USER_FILTER, query: 'blentt' }, DEFAULT_USER_SORT)), [
    'Daniel',
    'Pedro Álvares',
  ]);
  // Sem e-mail carregado ainda, pesquisa só no nome.
  assert.deepEqual(names(listUsers(users, {}, { ...EMPTY_USER_FILTER, query: 'blentt' }, DEFAULT_USER_SORT)), []);
});

test('filtros de papel e de obra, inclusive quem está sem obra', () => {
  assert.deepEqual(names(listUsers(users, emails, { ...EMPTY_USER_FILTER, role: 'planner' }, DEFAULT_USER_SORT)), [
    'Daniel',
    'Pedro Álvares',
  ]);
  assert.deepEqual(names(listUsers(users, emails, { ...EMPTY_USER_FILTER, workId: 'atm' }, DEFAULT_USER_SORT)), ['ana Beatriz', 'Bruno']);
  assert.deepEqual(names(listUsers(users, emails, { ...EMPTY_USER_FILTER, workId: NO_WORK }, DEFAULT_USER_SORT)), ['Daniel']);
  assert.deepEqual(names(listUsers(users, emails, { query: '', role: 'planner', workId: 'blt' }, DEFAULT_USER_SORT)), ['Pedro Álvares']);
  assert.equal(isFiltered(EMPTY_USER_FILTER), false);
  assert.equal(isFiltered({ ...EMPTY_USER_FILTER, query: '  ' }), false);
  assert.equal(isFiltered({ ...EMPTY_USER_FILTER, workId: NO_WORK }), true);
});

test('cabeçalho: a mesma coluna inverte o sentido, outra começa crescente', () => {
  assert.deepEqual(nextUserSort(DEFAULT_USER_SORT, 'name'), { key: 'name', dir: 'desc' });
  assert.deepEqual(nextUserSort({ key: 'name', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' });
  assert.deepEqual(nextUserSort({ key: 'name', dir: 'desc' }, 'role'), { key: 'role', dir: 'asc' });
});

test('colunas de obra em ordem alfabética, sem mexer na lista recebida', () => {
  const works = [
    { ...base, id: 'w1', name: 'Tauá', code: 'TAU', description: '', active: true },
    { ...base, id: 'w2', name: 'Atmos', code: 'ATM', description: '', active: true },
    { ...base, id: 'w3', name: 'Blentt', code: 'BLT', description: '', active: true },
  ];
  assert.deepEqual(
    worksByName(works).map(w => w.code),
    ['ATM', 'BLT', 'TAU'],
  );
  assert.deepEqual(
    works.map(w => w.code),
    ['TAU', 'ATM', 'BLT'],
  );
});
