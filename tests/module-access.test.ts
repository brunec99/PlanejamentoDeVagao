import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  developerEmails,
  isCommandAllowedForNonDeveloper,
  isDeveloperEmail,
  isRestrictedApi,
  restrictedPageRedirect,
  RESTRICTED_SECTIONS,
} from '../src/application/module-access';

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

test('Fora do desenvolvimento, só comandos do curto prazo, das equipes e da administração', () => {
  for (const type of [
    'create_commitment',
    'update_commitment',
    'delete_commitment',
    'record_fulfillment',
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
