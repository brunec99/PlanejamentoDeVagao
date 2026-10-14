import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  developerEmails,
  hasDeveloperAccess,
  hasSectionAccess,
  isCommandAllowed,
  isCommandAllowedForNonDeveloper,
  isDeveloperEmail,
  isRestrictedApi,
  isTesterApi,
  restrictedPageRedirect,
  restrictedSectionOf,
  RESTRICTED_SECTIONS,
} from '../src/application/module-access';
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

test('Permissão de teste abre só o médio prazo, o histórico e os comandos do plano do mês', () => {
  const tester = { developer: false, tester: true };
  const nobody = { developer: false, tester: false };
  assert.equal(hasSectionAccess('medio-prazo', tester), true);
  assert.equal(hasSectionAccess('longo-prazo', tester), false);
  assert.equal(hasSectionAccess('medio-prazo', nobody), false);
  assert.equal(hasSectionAccess('ifc', { developer: true, tester: false }), true);
  assert.equal(restrictedSectionOf('/obras/obra-1/medio-prazo'), 'medio-prazo');
  assert.equal(restrictedSectionOf('/obras/obra-1/vagoes/v-1'), 'vagoes');
  assert.equal(restrictedSectionOf('/obras/obra-1/curto-prazo'), null);
  assert.equal(isTesterApi('/api/history'), true);
  assert.equal(isTesterApi('/api/history?x=1'), false);
  assert.equal(isTesterApi('/api/ifc/upload-url'), false);
  assert.equal(isCommandAllowed('save_plan_revision', tester), true);
  assert.equal(isCommandAllowed('create_plan', tester), true);
  assert.equal(isCommandAllowed('record_fulfillment', tester), true);
  assert.equal(isCommandAllowed('set_test_access', tester), true);
  assert.equal(isCommandAllowed('create_baseline', tester), false);
  assert.equal(isCommandAllowed('save_plan_revision', nobody), false);
  assert.equal(isCommandAllowed('create_baseline', { developer: true, tester: false }), true);
  assert.equal(isCommandAllowedForNonDeveloper('set_test_access'), true);
});
