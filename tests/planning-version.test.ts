import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, shouldReload } from '../src/application/planning-version';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';

test('shouldReload: só baixa o planejamento inteiro quando a versão mudou', () => {
  assert.equal(shouldReload(7, 7), false, 'versão igual: os dados na tela continuam valendo');
  assert.equal(shouldReload(7, 8), true, 'alguém gravou depois da última carga');
  assert.equal(shouldReload(8, 7), true, 'versão diferente em qualquer direção (banco restaurado) recarrega');
  assert.equal(shouldReload(0, 0), false, 'o banco recém-criado tem versão 0, que é um valor válido');
});

test('shouldReload: sem versão conhecida ou sem versão atual, recarrega', () => {
  assert.equal(shouldReload(undefined, 7), true, 'nunca carregou, ou a leitura antes da carga falhou');
  assert.equal(shouldReload(7, undefined), true, 'a conferência falhou: a carga completa é quem marca desatualizado');
  assert.equal(shouldReload(undefined, undefined), true);
});

test('parseVersion aceita só a resposta {version: número}', () => {
  assert.equal(parseVersion({ version: 42 }), 42);
  assert.equal(parseVersion({ version: 0 }), 0);
  assert.equal(parseVersion({ version: '42' }), undefined, 'texto não vale: melhor recarregar que confiar');
  assert.equal(parseVersion({ version: Number.NaN }), undefined);
  assert.equal(parseVersion({ error: 'Perfil não provisionado.' }), undefined);
  assert.equal(parseVersion(null), undefined);
  assert.equal(parseVersion(undefined), undefined);
  assert.equal(parseVersion('42'), undefined);
});

test('o repositório em memória sobe a versão a cada gravação, como commit_planning', async () => {
  const repo = new MockPlanningRepository();
  assert.equal(await repo.getVersion(), 0);
  await repo.getSnapshot();
  assert.equal(await repo.getVersion(), 0, 'ler não muda a versão');
  await repo.transaction(draft => {
    draft.works[0].name = 'Obra renomeada';
  });
  assert.equal(await repo.getVersion(), 1);
  await repo.transaction(() => undefined);
  assert.equal(await repo.getVersion(), 2, 'uma gravação sem mudança também sobe, como no banco');
});
