import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  developerEmails,
  hasDeveloperAccess,
  hasApiAccess,
  hasSectionAccess,
  isCommandAllowed,
  isCommandAllowedForNonDeveloper,
  isDeveloperEmail,
  isRestrictedApi,
  MODULES,
  normalizeModules,
  restrictedPageRedirect,
  restrictedSectionOf,
  RESTRICTED_SECTIONS,
  sectionsForApi,
} from '../src/application/module-access';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { planningDataToPayload, rowsToPlanningData, type Rows } from '../src/infrastructure/repositories/supabase/mappers';
import { workPath } from '../src/shared/format';

test('Sem DEVELOPER_EMAILS, o desenvolvedor é o admin inicial', () => {
  assert.deepEqual(developerEmails(undefined), [BOOTSTRAP_ADMIN_EMAIL]);
  assert.deepEqual(developerEmails(''), [BOOTSTRAP_ADMIN_EMAIL]);
  assert.deepEqual(developerEmails(' , '), [BOOTSTRAP_ADMIN_EMAIL]);
  assert.equal(isDeveloperEmail('Bruno.Engenharia@AtrIncorporadora.com.br', undefined), true);
  assert.equal(isDeveloperEmail('outra.pessoa@atrincorporadora.com.br', undefined), false);
});

test('DEVELOPER_EMAILS aceita lista com espaços e sem diferença de maiúsculas', () => {
  const env = ' Ana@atrincorporadora.com.br , joao@atrincorporadora.com.br ';
  assert.equal(isDeveloperEmail('ana@atrincorporadora.com.br', env), true);
  assert.equal(isDeveloperEmail('JOAO@atrincorporadora.com.br', env), true);
  // A lista substitui o padrão: o admin inicial só entra se estiver nela.
  assert.equal(isDeveloperEmail(BOOTSTRAP_ADMIN_EMAIL, env), false);
  assert.equal(isDeveloperEmail(undefined, env), false);
  assert.equal(isDeveloperEmail('', env), false);
});

test('Admins também acessam os módulos em desenvolvimento, sem estar na lista', () => {
  const env = 'ana@atrincorporadora.com.br';
  assert.equal(hasDeveloperAccess({ email: 'carlos@atrincorporadora.com.br', role: 'admin' }, env), true);
  assert.equal(hasDeveloperAccess({ email: 'carlos@atrincorporadora.com.br', role: 'manager' }, env), false);
  assert.equal(hasDeveloperAccess({ email: 'carlos@atrincorporadora.com.br', role: null }, env), false);
  assert.equal(hasDeveloperAccess({ email: 'ana@atrincorporadora.com.br', role: 'viewer' }, env), true);
  assert.equal(hasDeveloperAccess({ email: undefined, role: undefined }, env), false);
});

test('Fora do desenvolvimento, só comandos do curto prazo, das equipes e da administração', () => {
  for (const type of [
    'create_commitment',
    'update_commitment',
    'delete_commitment',
    'record_fulfillment',
    'clear_fulfillment',
    'create_team',
    'update_team',
    'delete_team',
    'set_role',
    'grant_access',
    'revoke_access',
    'create_work',
  ])
    assert.equal(isCommandAllowedForNonDeveloper(type), true, type);
  for (const type of [
    'create_restriction',
    'create_wagon',
    'create_plan_task',
    'save_plan_revision',
    'set_takt',
    'sync_long_term_plan',
    'create_ifc_model',
    'assign_team',
    undefined,
    42,
  ])
    assert.equal(isCommandAllowedForNonDeveloper(type), false, String(type));
});

test('Páginas restritas da obra desviam para o curto prazo da mesma obra', () => {
  for (const section of RESTRICTED_SECTIONS)
    assert.equal(restrictedPageRedirect(`/obras/obra-1/${section}`), '/obras/obra-1/curto-prazo', section);
  assert.equal(restrictedPageRedirect('/obras/obra%201/vagoes/vagao-9'), '/obras/obra%201/curto-prazo');
  for (const open of ['/obras', '/obras/obra-1/curto-prazo', '/obras/obra-1/configuracoes', '/configuracoes', '/obras/obra-1/vagoes-extra'])
    assert.equal(restrictedPageRedirect(open), null, open);
});

test('O desvio das páginas restritas (servidor) coincide com o do proxy, mesmo com id a codificar', () => {
  // As páginas montam o destino a partir do `obraId` já decodificado; o proxy, a partir do caminho
  // bruto. Os dois precisam cair no mesmo endereço, senão o proxy e a página divergiriam.
  for (const workId of ['obra-1', 'obra 2', 'ç/ã'])
    for (const section of RESTRICTED_SECTIONS)
      assert.equal(restrictedPageRedirect(workPath(workId, section)), workPath(workId, 'curto-prazo'), `${workId}/${section}`);
});

test('APIs dos módulos restritos são reconhecidas pelo prefixo', () => {
  for (const path of [
    '/api/long-term-plan',
    '/api/long-term-plan/sync',
    '/api/prevision',
    '/api/prevision/schedule',
    '/api/ifc/status',
    '/api/history',
  ])
    assert.equal(isRestrictedApi(path), true, path);
  for (const path of ['/api/planning', '/api/planning/commands', '/api/work-settings', '/api/admin/users', '/api/health', '/api/ifcx'])
    assert.equal(isRestrictedApi(path), false, path);
});

test('Módulos liberados abrem a seção, as APIs e os comandos dela, e nada além', () => {
  const medio = { developer: false, modules: ['medio-prazo'] };
  const nobody = { developer: false, modules: [] };
  const dev = { developer: true, modules: [] };
  assert.equal(hasSectionAccess('medio-prazo', medio), true);
  assert.equal(hasSectionAccess('longo-prazo', medio), false);
  assert.equal(hasSectionAccess('curto-prazo', nobody), true);
  assert.equal(hasSectionAccess('terminalidade', nobody), true);
  assert.equal(hasSectionAccess('medio-prazo', nobody), false);
  assert.equal(hasSectionAccess('ifc', dev), true);
  assert.equal(restrictedSectionOf('/obras/obra-1/medio-prazo'), 'medio-prazo');
  assert.equal(restrictedSectionOf('/obras/obra-1/vagoes/v-1'), 'vagoes');
  assert.equal(restrictedSectionOf('/obras/obra-1/curto-prazo'), null);
  assert.equal(hasApiAccess('/api/history', medio), true);
  assert.equal(hasApiAccess('/api/ifc/upload-url', medio), false);
  assert.equal(hasApiAccess('/api/ifc/upload-url', { developer: false, modules: ['federacao'] }), true);
  assert.equal(hasApiAccess('/api/prevision', { developer: false, modules: ['importar'] }), true);
  assert.deepEqual(sectionsForApi('/api/long-term-plan/sync'), ['longo-prazo']);
  assert.equal(isCommandAllowed('save_plan_revision', medio), true);
  assert.equal(isCommandAllowed('record_fulfillment', nobody), true);
  assert.equal(isCommandAllowed('set_module_access', nobody), true);
  assert.equal(isCommandAllowed('release', medio), false);
  assert.equal(isCommandAllowed('release', { developer: false, modules: ['vagoes'] }), true);
  assert.equal(isCommandAllowed('create_ifc_model', { developer: false, modules: ['ifc'] }), true);
  assert.equal(isCommandAllowed('save_plan_revision', nobody), false);
  assert.equal(isCommandAllowed('sync_long_term_plan', { developer: false, modules: ['longo-prazo'] }), false);
});

test('Catálogo: os abertos não são liberáveis, e a lista gravada é limpa e ordenada', () => {
  assert.ok(MODULES.some(m => m.section === 'curto-prazo' && m.open));
  assert.deepEqual(
    MODULES.filter(m => !m.open)
      .map(m => m.section)
      .sort(),
    [...RESTRICTED_SECTIONS].sort(),
  );
  assert.deepEqual(normalizeModules(['ifc', 'curto-prazo', 'xyz', 'medio-prazo', 'ifc', 3]), ['medio-prazo', 'ifc']);
  assert.deepEqual(normalizeModules('medio-prazo'), []);
});

test('admin libera e bloqueia módulos; demais papéis e módulos abertos são recusados', () => {
  const data = createMockData();
  const admin = data.users.find(u => u.id === 'user-1')!;
  admin.role = 'admin';
  const other = data.users.find(u => u.id === 'user-2')!;
  const run = (actorId: string, command: Command) =>
    applyCommand(data, command, { actorId, today: '2026-10-14', now: '2026-10-14T12:00:00Z', newId: () => 'id' });
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'ifc', enabled: true });
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'medio-prazo', enabled: true });
  assert.deepEqual(other.modules, ['medio-prazo', 'ifc']);
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'ifc', enabled: false });
  assert.deepEqual(other.modules, ['medio-prazo']);
  assert.throws(() => run(other.id, { type: 'set_module_access', userId: admin.id, section: 'ifc', enabled: true }), /administradores/);
  assert.throws(
    () => run(admin.id, { type: 'set_module_access', userId: other.id, section: 'curto-prazo', enabled: false }),
    /não é liberado/,
  );
  assert.throws(() => run(admin.id, { type: 'set_module_access', userId: 'x', section: 'ifc', enabled: true }), /não encontrado/);
  const payload = planningDataToPayload(data) as unknown as Rows;
  const row = payload.profiles.find(r => r.id === other.id)!;
  assert.deepEqual(row.module_access, ['medio-prazo']);
  assert.deepEqual(rowsToPlanningData(payload).users.find(u => u.id === other.id)!.modules, ['medio-prazo']);
  delete row.module_access;
  assert.deepEqual(rowsToPlanningData(payload).users.find(u => u.id === other.id)!.modules, []);
});
