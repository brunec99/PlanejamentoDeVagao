import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedEmail, validateAccessRequest } from '../src/application/access-request';
import { readIdentity, signIdentity } from '../src/infrastructure/auth/access-request-token';

/* Pedido de acesso (14/10/2026): só contas da ATR, nome obrigatório, mensagem curta; e o cookie que
 * carrega o e-mail confirmado pelo Google não pode ser forjado nem reaproveitado depois de vencer. */

test('pedido aceita só e-mail da ATR, com nome, e limpa espaços e caixa', () => {
  assert.deepEqual(
    validateAccessRequest({ email: '  Ana.Souza@ATRincorporadora.com.br ', name: ' Ana   Souza ', message: '  Blentt ' }).value,
    {
      email: 'ana.souza@atrincorporadora.com.br',
      name: 'Ana Souza',
      message: 'Blentt',
    },
  );
  assert.deepEqual(validateAccessRequest({ email: 'ana@atrincorporadora.com.br', name: 'Ana', message: '   ' }).value, {
    email: 'ana@atrincorporadora.com.br',
    name: 'Ana',
  });
  assert.match(validateAccessRequest({ email: 'ana@gmail.com', name: 'Ana' }).error!, /Só contas/);
  assert.match(validateAccessRequest({ email: 'sem-arroba', name: 'Ana' }).error!, /e-mail válido/);
  assert.match(validateAccessRequest({ email: 'ana@atrincorporadora.com.br', name: ' ' }).error!, /nome/);
  assert.match(validateAccessRequest({ email: 'ana@atrincorporadora.com.br', name: 'Ana', message: 'x'.repeat(501) }).error!, /500/);
});

test('contas da Takt também entram, pedem e são cadastradas; domínio parecido ou subdomínio não (28/10/2026)', () => {
  assert.equal(isAllowedEmail('ana@atrincorporadora.com.br'), true);
  assert.equal(isAllowedEmail(' Joao.Silva@TaktEngenharia.com.br '), true);
  assert.equal(isAllowedEmail('ana@gmail.com'), false);
  assert.equal(isAllowedEmail('ana@taktengenharia.com.br.evil.com'), false);
  assert.equal(isAllowedEmail('ana@obra.taktengenharia.com.br'), false);
  assert.equal(isAllowedEmail('ana@faketaktengenharia.com.br'), false);
  assert.equal(isAllowedEmail(null), false);
  assert.deepEqual(validateAccessRequest({ email: 'joao@taktengenharia.com.br', name: 'João' }).value, {
    email: 'joao@taktengenharia.com.br',
    name: 'João',
  });
  assert.match(
    validateAccessRequest({ email: 'ana@gmail.com', name: 'Ana' }).error!,
    /@atrincorporadora\.com\.br ou @taktengenharia\.com\.br/,
  );
});

test('identidade assinada volta igual, e assinatura trocada, chave errada ou prazo vencido são recusados', () => {
  const key = 'chave-de-teste';
  const token = signIdentity({ email: 'ana@atrincorporadora.com.br', name: 'Ana' }, 1_000, key);
  assert.deepEqual(readIdentity(token, 2_000, key), { email: 'ana@atrincorporadora.com.br', name: 'Ana' });
  assert.equal(readIdentity(token, 2_000, 'outra-chave'), null);
  assert.equal(readIdentity(token, 1_000 + 31 * 60 * 1000, key), null);
  const [payload] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'chefe@atrincorporadora.com.br', name: 'X', exp: 9e15 })).toString('base64url');
  assert.equal(readIdentity(`${forged}.${token.split('.')[1]}`, 2_000, key), null);
  assert.equal(readIdentity(`${payload}.`, 2_000, key), null);
  assert.equal(readIdentity(undefined, 2_000, key), null);
  assert.equal(readIdentity('lixo', 2_000, key), null);
});
