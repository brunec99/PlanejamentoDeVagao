import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFederation } from '../src/domain/ifc-federation';

const models = [{ id: 'estrutura', workId: 'obra-a' }, { id: 'instalacoes', workId: 'obra-a' }, { id: 'outra', workId: 'obra-b' }];
const versions = [{ id: 'estrutura-v1', modelId: 'estrutura' }, { id: 'estrutura-v2', modelId: 'estrutura' }, { id: 'instalacoes-v1', modelId: 'instalacoes' }, { id: 'outra-v1', modelId: 'outra' }];
const validate = (versionIds: unknown, name: unknown = 'Coordenação') => validateFederation({ versionIds, name }, 'obra-a', models, versions);

test('a composição mantém a revisão escolhida mesmo havendo revisão mais recente', () => {
  const source = ['estrutura-v1', 'instalacoes-v1'];
  const saved = validate(source, '  Coordenação  ');
  source[0] = 'estrutura-v2';
  assert.deepEqual(saved, { name: 'Coordenação', versionIds: ['estrutura-v1', 'instalacoes-v1'] });
});

test('uma composição não mistura versões de outras obras nem versões inexistentes', () => {
  assert.throws(() => validate(['estrutura-v1', 'outra-v1']), /não pertence/);
  assert.throws(() => validate(['removida']), /não pertence/);
});

test('uma composição não duplica um modelo nem sobrepõe suas revisões', () => {
  assert.throws(() => validate(['estrutura-v1', 'estrutura-v1']), /apenas uma versão/);
  assert.throws(() => validate(['estrutura-v1', 'estrutura-v2']), /apenas uma versão/);
});

test('uma composição requer nome e conjunto válidos', () => {
  for (const value of [undefined, null, 'estrutura-v1', [], [null], [1], [''], Array(201).fill('estrutura-v1')]) {
    assert.throws(() => validate(value), /Escolha de 1 a 200/);
  }
  for (const name of ['', '   ', null, 1, 'a'.repeat(121)]) assert.throws(() => validate(['estrutura-v1'], name), /nome/);
  assert.throws(() => validateFederation(null, 'obra-a', models, versions), /inválida/);
});
