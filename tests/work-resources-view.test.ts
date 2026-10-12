import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTeamsByCompany, parseCapacity, searchCompanies } from '../src/modules/configuracoes/work-resources-view';

const team = (id: string, company: string, name: string, weeklyCapacity = 1) => ({ id, company, name, weeklyCapacity });
const teams = [
  team('t1', 'SM MARTINS', 'Revestimentos', 2),
  team('t2', 'ATR ENG', 'Elétrica', 3),
  team('t3', 'Hidrotec ', 'Hidráulica · equipe 02', 1),
  team('t4', 'HIDROTEC', 'Hidráulica · equipe 01', 4),
  team('t5', '', 'Sem empresa', 2),
  team('t6', 'Álfa Pinturas', 'Pintura', 1),
  team('t7', 'Hidrotec', 'Hidráulica · equipe 03', 2),
];
const usage = new Map([
  ['t1', 3],
  ['t4', 2],
]);

test('agrupa por empreiteiro sem acento nem caixa, em ordem alfabética, com a empresa vazia por último', () => {
  const groups = groupTeamsByCompany(teams, id => usage.get(id) ?? 0);
  assert.deepEqual(
    groups.map(g => g.company),
    ['Álfa Pinturas', 'ATR ENG', 'Hidrotec', 'SM MARTINS', ''],
  );
  const hidrotec = groups.find(g => g.key === 'hidrotec')!;
  // A grafia mais usada vence (2 × "Hidrotec" contra 1 × "HIDROTEC"); as grafias saem na ordem das equipes.
  assert.deepEqual(hidrotec.spellings, ['HIDROTEC', 'Hidrotec']);
  assert.deepEqual(
    hidrotec.teams.map(t => t.id),
    ['t4', 't3', 't7'],
  );
  assert.equal(hidrotec.capacity, 7);
  assert.equal(hidrotec.usage, 2);
  // Empate entre grafias: fica a da primeira equipe em ordem alfabética (equipe 01), não a do espaço a mais.
  assert.equal(groupTeamsByCompany([teams[2], teams[3]])[0].company, 'HIDROTEC');
  assert.deepEqual(
    groups.map(g => g.usage),
    [0, 0, 2, 3, 0],
  );
  assert.equal(groups.at(-1)!.key, '');
  assert.deepEqual(groupTeamsByCompany([]), []);
});

test('busca bate no empreiteiro (todas as equipes) ou no nome da equipe (só as que batem), sem acento', () => {
  const groups = groupTeamsByCompany(teams);
  assert.equal(searchCompanies(groups, '  ').length, 5);
  assert.deepEqual(searchCompanies(groups, 'hidro'), [{ group: groups[2], teams: groups[2].teams, byTeam: false }]);
  assert.deepEqual(
    searchCompanies(groups, 'sem').map(h => [h.group.key, h.teams.map(t => t.id), h.byTeam]),
    [['', ['t5'], true]],
  );
  const byTeam = searchCompanies(groups, 'EQUIPE 01');
  assert.deepEqual(
    byTeam.map(h => [h.group.key, h.teams.map(t => t.id), h.byTeam]),
    [['hidrotec', ['t4'], true]],
  );
  assert.deepEqual(
    searchCompanies(groups, 'alfa').map(h => h.group.company),
    ['Álfa Pinturas'],
  );
  assert.deepEqual(searchCompanies(groups, 'inexistente'), []);
});

test('capacidade digitada só vale como inteiro positivo', () => {
  assert.equal(parseCapacity('3'), 3);
  assert.equal(parseCapacity(' 12 '), 12);
  for (const raw of ['', '  ', '0', '-1', '1.5', 'abc', 'Infinity']) assert.equal(parseCapacity(raw), undefined, raw);
});
