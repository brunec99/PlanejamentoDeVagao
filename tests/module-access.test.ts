import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessBatchChange,
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

test('Sem módulo liberado, só comandos das equipes e da administração', () => {
  for (const type of [
    'create_team',
    'update_team',
    'delete_team',
    'set_role',
    'grant_access',
    'revoke_access',
    'set_access_batch',
    'create_work',
  ])
    assert.equal(isCommandAllowedForNonDeveloper(type), true, type);
  // 08/11/2026: os comandos da planilha semanal passaram a exigir o curto prazo liberado.
  for (const type of [
    'create_commitment',
    'update_commitment',
    'delete_commitment',
    'reorder_commitments',
    'record_fulfillment',
    'record_fulfillments',
    'clear_fulfillment',
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

test('Páginas restritas da obra desviam para o dashboard da mesma obra', () => {
  for (const section of RESTRICTED_SECTIONS)
    assert.equal(restrictedPageRedirect(`/obras/obra-1/${section}`), '/obras/obra-1/dashboard', section);
  assert.equal(restrictedPageRedirect('/obras/obra%201/vagoes/vagao-9'), '/obras/obra%201/dashboard');
  for (const open of [
    '/obras',
    '/obras/obra-1/dashboard',
    '/obras/obra-1/seguranca',
    '/obras/obra-1/configuracoes',
    '/configuracoes',
    '/obras/obra-1/vagoes-extra',
    '/imprimir/dashboard/obra-1',
    '/imprimir/seguranca/obra-1',
    '/imprimir/dashboard-geral',
  ])
    assert.equal(restrictedPageRedirect(open), null, open);
});

test('Curto prazo e terminalidade (08/11/2026): aba, folha de impressão e modo de campo seguem o módulo', () => {
  assert.ok(RESTRICTED_SECTIONS.includes('curto-prazo'));
  assert.ok(RESTRICTED_SECTIONS.includes('terminalidade'));
  assert.equal(restrictedPageRedirect('/obras/obra-1/curto-prazo'), '/obras/obra-1/dashboard');
  assert.equal(restrictedPageRedirect('/imprimir/curto-prazo/obra%201'), '/obras/obra%201/dashboard');
  assert.equal(restrictedSectionOf('/imprimir/terminalidade/obra-1'), 'terminalidade');
  assert.equal(restrictedSectionOf('/imprimir/curto-prazo/obra-1'), 'curto-prazo');
  assert.equal(restrictedSectionOf('/imprimir/curto-prazo'), null);
  const nobody = { developer: false, modules: [] };
  const curto = { developer: false, modules: ['curto-prazo'] };
  const terminal = { developer: false, modules: ['terminalidade'] };
  for (const section of ['curto-prazo', 'terminalidade']) assert.equal(hasSectionAccess(section, nobody), false, section);
  for (const section of ['dashboard', 'seguranca', 'configuracoes']) assert.equal(hasSectionAccess(section, nobody), true, section);
  assert.equal(hasSectionAccess('curto-prazo', curto), true);
  assert.equal(hasSectionAccess('terminalidade', curto), false);
  assert.equal(hasSectionAccess('terminalidade', terminal), true);
  // O modo de campo (`/campo/terminalidade`) fica fora do proxy, mas lê os dados desta API.
  assert.equal(isRestrictedApi('/api/terminalidade/campo'), true);
  assert.equal(hasApiAccess('/api/terminalidade/campo', terminal), true);
  assert.equal(hasApiAccess('/api/terminalidade/commands', curto), false);
  assert.equal(hasApiAccess('/api/curto-prazo/ranking', curto), true);
  assert.equal(hasApiAccess('/api/curto-prazo/analise', nobody), false);
  for (const type of ['create_commitment', 'record_fulfillments', 'reorder_commitments', 'clear_fulfillment']) {
    assert.equal(isCommandAllowed(type, curto), true, type);
    assert.equal(isCommandAllowed(type, terminal), false, type);
  }
  assert.equal(isCommandAllowed('create_team', nobody), true);
});

test('O desvio das páginas restritas (servidor) coincide com o do proxy, mesmo com id a codificar', () => {
  // As páginas montam o destino a partir do `obraId` já decodificado; o proxy, a partir do caminho
  // bruto. Os dois precisam cair no mesmo endereço, senão o proxy e a página divergiriam.
  for (const workId of ['obra-1', 'obra 2', 'ç/ã'])
    for (const section of RESTRICTED_SECTIONS)
      assert.equal(restrictedPageRedirect(workPath(workId, section)), workPath(workId, 'dashboard'), `${workId}/${section}`);
});

test('APIs dos módulos restritos são reconhecidas pelo prefixo', () => {
  for (const path of [
    '/api/long-term-plan',
    '/api/long-term-plan/sync',
    '/api/prevision',
    '/api/prevision/schedule',
    '/api/ifc/status',
    '/api/history',
    '/api/pendencias',
    '/api/pendencias/commands',
    '/api/curto-prazo/ranking',
    '/api/curto-prazo/locais',
    '/api/terminalidade',
    '/api/terminalidade/upload-url',
  ])
    assert.equal(isRestrictedApi(path), true, path);
  for (const path of [
    '/api/planning',
    '/api/planning/commands',
    '/api/work-settings',
    '/api/work-locals',
    '/api/seguranca',
    '/api/dashboard/obras',
    '/api/admin/users',
    '/api/health',
    '/api/ifcx',
    '/api/terminalidadex',
    '/api/pendenciasx',
  ])
    assert.equal(isRestrictedApi(path), false, path);
});

test('Lista de pendência (10/11/2026): a API é de quem abre a aba 2, e de mais ninguém', () => {
  const vagoes = { developer: false, modules: ['vagoes'] };
  for (const path of ['/api/pendencias', '/api/pendencias/commands']) {
    assert.deepEqual(sectionsForApi(path), ['vagoes'], path);
    assert.equal(hasApiAccess(path, vagoes), true, path);
    assert.equal(hasApiAccess(path, { developer: true, modules: [] }), true, path);
    assert.equal(hasApiAccess(path, { developer: false, modules: [] }), false, path);
    // Os outros módulos, juntos, não abrem a lista de pendência.
    const others = RESTRICTED_SECTIONS.filter(section => section !== 'vagoes');
    assert.equal(hasApiAccess(path, { developer: false, modules: others }), false, path);
  }
});

test('Módulos liberados abrem a seção, as APIs e os comandos dela, e nada além', () => {
  const medio = { developer: false, modules: ['medio-prazo'] };
  const nobody = { developer: false, modules: [] };
  const dev = { developer: true, modules: [] };
  assert.equal(hasSectionAccess('medio-prazo', medio), true);
  assert.equal(hasSectionAccess('longo-prazo', medio), false);
  assert.equal(hasSectionAccess('curto-prazo', nobody), false);
  assert.equal(hasSectionAccess('terminalidade', nobody), false);
  assert.equal(hasSectionAccess('seguranca', nobody), true);
  assert.equal(hasSectionAccess('medio-prazo', nobody), false);
  assert.equal(hasSectionAccess('ifc', dev), true);
  assert.equal(restrictedSectionOf('/obras/obra-1/medio-prazo'), 'medio-prazo');
  assert.equal(restrictedSectionOf('/obras/obra-1/vagoes/v-1'), 'vagoes');
  assert.equal(restrictedSectionOf('/obras/obra-1/curto-prazo'), 'curto-prazo');
  assert.equal(restrictedSectionOf('/obras/obra-1/dashboard'), null);
  assert.equal(hasApiAccess('/api/history', medio), true);
  assert.equal(hasApiAccess('/api/ifc/upload-url', medio), false);
  assert.equal(hasApiAccess('/api/ifc/upload-url', { developer: false, modules: ['federacao'] }), true);
  assert.equal(hasApiAccess('/api/prevision', { developer: false, modules: ['importar'] }), true);
  assert.deepEqual(sectionsForApi('/api/long-term-plan/sync'), ['longo-prazo']);
  assert.equal(isCommandAllowed('save_plan_revision', medio), true);
  assert.equal(isCommandAllowed('record_fulfillment', nobody), false);
  assert.equal(isCommandAllowed('record_fulfillment', { developer: false, modules: ['curto-prazo'] }), true);
  assert.equal(isCommandAllowed('set_module_access', nobody), true);
  assert.equal(isCommandAllowed('release', medio), false);
  assert.equal(isCommandAllowed('release', { developer: false, modules: ['vagoes'] }), true);
  assert.equal(isCommandAllowed('create_ifc_model', { developer: false, modules: ['ifc'] }), true);
  assert.equal(isCommandAllowed('save_plan_revision', nobody), false);
  assert.equal(isCommandAllowed('sync_long_term_plan', { developer: false, modules: ['longo-prazo'] }), false);
});

test('Catálogo: os abertos não são liberáveis, e a lista gravada é limpa e ordenada', () => {
  assert.ok(MODULES.some(m => m.section === 'seguranca' && m.open));
  assert.ok(!MODULES.some(m => (m.section === 'curto-prazo' || m.section === 'terminalidade') && m.open));
  assert.deepEqual(
    MODULES.filter(m => !m.open)
      .map(m => m.section)
      .sort(),
    [...RESTRICTED_SECTIONS].sort(),
  );
  assert.deepEqual(normalizeModules(['ifc', 'configuracoes', 'xyz', 'medio-prazo', 'ifc', 3]), ['medio-prazo', 'ifc']);
  assert.deepEqual(normalizeModules(['terminalidade', 'seguranca', 'curto-prazo']), ['curto-prazo', 'terminalidade']);
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
    () => run(admin.id, { type: 'set_module_access', userId: other.id, section: 'seguranca', enabled: false }),
    /não é liberado/,
  );
  // 08/11/2026: curto prazo e terminalidade passaram a ser liberados por pessoa.
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'terminalidade', enabled: true });
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'curto-prazo', enabled: true });
  assert.deepEqual(other.modules, ['medio-prazo', 'curto-prazo', 'terminalidade']);
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'curto-prazo', enabled: false });
  run(admin.id, { type: 'set_module_access', userId: other.id, section: 'terminalidade', enabled: false });
  assert.deepEqual(other.modules, ['medio-prazo']);
  assert.throws(() => run(admin.id, { type: 'set_module_access', userId: 'x', section: 'ifc', enabled: true }), /não encontrado/);
  const payload = planningDataToPayload(data) as unknown as Rows;
  const row = payload.profiles.find(r => r.id === other.id)!;
  assert.deepEqual(row.module_access, ['medio-prazo']);
  assert.deepEqual(rowsToPlanningData(payload).users.find(u => u.id === other.id)!.modules, ['medio-prazo']);
  delete row.module_access;
  assert.deepEqual(rowsToPlanningData(payload).users.find(u => u.id === other.id)!.modules, []);
});

test('acessos em lote (08/11/2026): só muda quem precisa, e admin não ganha nem perde módulo', () => {
  const ana = { role: 'viewer', workIds: ['obra-1'], modules: ['ifc'] };
  assert.deepEqual(accessBatchChange(ana, { workIds: ['obra-2', 'obra-1', 'obra-2'], enabled: true }), { workIds: ['obra-1', 'obra-2'] });
  assert.equal(accessBatchChange(ana, { workIds: ['obra-1'], enabled: true }), null);
  assert.deepEqual(accessBatchChange(ana, { workIds: ['obra-1', 'obra-3'], enabled: false }), { workIds: [] });
  assert.equal(accessBatchChange(ana, { workIds: ['obra-3'], enabled: false }), null);
  // Na ordem do catálogo, como `normalizeModules` grava.
  assert.deepEqual(accessBatchChange(ana, { sections: ['medio-prazo'], enabled: true }), { modules: ['medio-prazo', 'ifc'] });
  assert.deepEqual(accessBatchChange(ana, { sections: ['ifc', 'vagoes'], enabled: false }), { modules: [] });
  assert.equal(accessBatchChange(ana, { sections: ['ifc'], enabled: true }), null);
  assert.equal(accessBatchChange({ role: 'admin', workIds: [] }, { sections: ['ifc'], enabled: true }), null);
  assert.deepEqual(accessBatchChange({ role: 'admin', workIds: [] }, { workIds: ['obra-1'], enabled: true }), { workIds: ['obra-1'] });
  // 12/11/2026: a barra manda obras e módulos no mesmo lote. Para o admin, só as obras mudam.
  assert.deepEqual(accessBatchChange(ana, { workIds: ['obra-2'], sections: ['medio-prazo'], enabled: true }), {
    workIds: ['obra-1', 'obra-2'],
    modules: ['medio-prazo', 'ifc'],
  });
  assert.deepEqual(accessBatchChange(ana, { workIds: ['obra-1'], sections: ['medio-prazo'], enabled: true }), {
    modules: ['medio-prazo', 'ifc'],
  });
  assert.deepEqual(accessBatchChange(ana, { workIds: ['obra-1'], sections: ['ifc'], enabled: false }), { workIds: [], modules: [] });
  assert.equal(accessBatchChange(ana, { workIds: ['obra-1'], sections: ['ifc'], enabled: true }), null);
  assert.deepEqual(accessBatchChange({ role: 'admin', workIds: [] }, { workIds: ['obra-1'], sections: ['ifc'], enabled: true }), {
    workIds: ['obra-1'],
  });
  assert.deepEqual(ana, { role: 'viewer', workIds: ['obra-1'], modules: ['ifc'] });
});

test('set_access_batch: admin libera e revoga obras e módulos de várias pessoas numa gravação, tudo ou nada', () => {
  const data = createMockData();
  const admin = data.users.find(u => u.id === 'user-1')!;
  admin.role = 'admin';
  const ana = data.users.find(u => u.id === 'user-3')!;
  const rafael = data.users.find(u => u.id === 'user-2')!;
  const run = (actorId: string, command: Command) =>
    applyCommand(data, command, { actorId, today: '2026-11-08', now: '2026-11-08T12:00:00Z', newId: () => 'id' });
  const before = ana.updatedAt;

  run(admin.id, { type: 'set_access_batch', userIds: [ana.id, rafael.id], workIds: ['obra-2'], enabled: true });
  assert.deepEqual(rafael.workIds, ['obra-1', 'obra-2']);
  // Ana já tinha a obra: não é regravada.
  assert.deepEqual(ana.workIds, ['obra-1', 'obra-2']);
  assert.equal(ana.updatedAt, before);
  assert.equal(rafael.updatedAt, '2026-11-08T12:00:00Z');

  run(admin.id, { type: 'set_access_batch', userIds: [ana.id, rafael.id, admin.id], sections: ['ifc', 'medio-prazo'], enabled: true });
  assert.deepEqual(ana.modules, ['medio-prazo', 'ifc']);
  assert.deepEqual(rafael.modules, ['medio-prazo', 'ifc']);
  assert.equal(admin.modules, undefined);

  run(admin.id, {
    type: 'set_access_batch',
    userIds: [ana.id, rafael.id],
    workIds: ['obra-1', 'obra-2'],
    sections: ['ifc'],
    enabled: false,
  });
  assert.deepEqual([ana.workIds, rafael.workIds], [[], []]);
  assert.deepEqual([ana.modules, rafael.modules], [['medio-prazo'], ['medio-prazo']]);
  const history = data.history.filter(h => h.action === 'set_access_batch');
  assert.equal(history.length, 3);

  // Recusas: nada muda quando uma parte do lote é inválida (o repositório descarta o rascunho com o erro).
  const batch = (change: Partial<Extract<Command, { type: 'set_access_batch' }>>, actorId = admin.id) =>
    run(actorId, { type: 'set_access_batch', userIds: [ana.id], workIds: ['obra-1'], enabled: true, ...change } as Command);
  assert.throws(() => batch({}, rafael.id), /administradores/);
  assert.throws(() => batch({ userIds: [] }), /ao menos um usuário/);
  assert.throws(() => batch({ workIds: [], sections: [] }), /ao menos uma obra ou um módulo/);
  assert.throws(() => batch({ userIds: [ana.id, 'ninguem'] }), /Usuário não encontrado/);
  assert.throws(() => batch({ workIds: ['obra-x'] }), /Obra não encontrada/);
  assert.throws(() => batch({ workIds: undefined, sections: ['seguranca'] }), /não é liberado/);
  assert.throws(() => batch({ enabled: 'sim' as never }), /liberado ou revogado/);
  assert.throws(() => batch({ userIds: 'user-3' as never }), /Lista de usuários inválida/);

  const payload = planningDataToPayload(data) as unknown as Rows;
  assert.deepEqual(payload.profiles.find(r => r.id === rafael.id)!.module_access, ['medio-prazo']);
});
