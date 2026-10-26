import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  stripTrustedHeaders,
  trustedHeaderSecret,
  trustedUserFrom,
  trustedUserHeaders,
  TRUSTED_USER_EMAIL_HEADER,
  TRUSTED_USER_ID_HEADER,
  TRUSTED_USER_SIGNATURE_HEADER,
} from '../src/infrastructure/auth/trusted-user';
import { serverTimingHeader } from '../src/infrastructure/log';

const SECRET = 'segredo-de-teste';
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const EMAIL = 'ana@atrincorporadora.com.br';

test('o proxy assina id e e-mail e a rota os lê de volta sem ir ao Supabase Auth', () => {
  const signed = trustedUserHeaders({ id: ID, email: EMAIL }, SECRET);
  assert.ok(signed);
  assert.equal(signed[TRUSTED_USER_ID_HEADER], ID);
  assert.equal(signed[TRUSTED_USER_EMAIL_HEADER], EMAIL);
  assert.match(signed[TRUSTED_USER_SIGNATURE_HEADER], /^[0-9a-f]{64}$/, 'HMAC-SHA256 em hexadecimal');
  assert.deepEqual(trustedUserFrom(new Headers(signed), SECRET), { id: ID, email: EMAIL });
});

test('sem e-mail na conta, a identidade vale só com o id', () => {
  const signed = trustedUserHeaders({ id: ID }, SECRET);
  assert.ok(signed);
  assert.equal(TRUSTED_USER_EMAIL_HEADER in signed, false, 'não escreve cabeçalho vazio');
  assert.deepEqual(trustedUserFrom(new Headers(signed), SECRET), { id: ID, email: undefined });
  assert.deepEqual(trustedUserFrom(new Headers(trustedUserHeaders({ id: ID, email: null }, SECRET)!), SECRET), {
    id: ID,
    email: undefined,
  });
});

test('aceita qualquer leitor com get(nome), como o headers() do Next', () => {
  const signed = trustedUserHeaders({ id: ID, email: EMAIL }, SECRET)!;
  const reader = { get: (name: string) => signed[name.toLowerCase()] ?? null };
  assert.deepEqual(trustedUserFrom(reader, SECRET), { id: ID, email: EMAIL });
});

test('cabeçalho forjado ou adulterado é ignorado: a rota volta ao Supabase Auth', () => {
  const signed = trustedUserHeaders({ id: ID, email: EMAIL }, SECRET)!;
  const outroId = '11111111-2222-4333-8444-555555555555';
  // Sem assinatura (o que um navegador conseguiria mandar).
  assert.equal(trustedUserFrom(new Headers({ [TRUSTED_USER_ID_HEADER]: ID, [TRUSTED_USER_EMAIL_HEADER]: EMAIL }), SECRET), null);
  // Id trocado mantendo a assinatura de outra pessoa.
  assert.equal(trustedUserFrom(new Headers({ ...signed, [TRUSTED_USER_ID_HEADER]: outroId }), SECRET), null);
  // E-mail trocado (é ele que dá acesso de desenvolvedor por DEVELOPER_EMAILS).
  assert.equal(trustedUserFrom(new Headers({ ...signed, [TRUSTED_USER_EMAIL_HEADER]: 'dev@atrincorporadora.com.br' }), SECRET), null);
  // E-mail apagado depois de assinado.
  const semEmail = new Headers(signed);
  semEmail.delete(TRUSTED_USER_EMAIL_HEADER);
  assert.equal(trustedUserFrom(semEmail, SECRET), null);
  // Assinatura de outro segredo, ou com tamanho diferente.
  assert.equal(trustedUserFrom(new Headers(signed), 'outro-segredo'), null);
  assert.equal(trustedUserFrom(new Headers({ ...signed, [TRUSTED_USER_SIGNATURE_HEADER]: 'abc' }), SECRET), null);
});

test('sem segredo no servidor nada é confiado, nem na escrita nem na leitura', () => {
  assert.equal(trustedUserHeaders({ id: ID, email: EMAIL }, undefined), null);
  assert.equal(trustedUserHeaders({ id: ID, email: EMAIL }, ''), null);
  const signed = trustedUserHeaders({ id: ID, email: EMAIL }, SECRET)!;
  assert.equal(trustedUserFrom(new Headers(signed), undefined), null);
  assert.equal(trustedUserFrom(new Headers(signed), ''), null);
});

test('o id precisa ser UUID, mesmo com assinatura válida', () => {
  assert.equal(trustedUserHeaders({ id: 'user-1', email: EMAIL }, SECRET), null, 'o proxy nem escreve');
  const forjado = createHmac('sha256', SECRET).update(`user-1\n${EMAIL}`).digest('hex');
  const headers = new Headers({
    [TRUSTED_USER_ID_HEADER]: 'user-1',
    [TRUSTED_USER_EMAIL_HEADER]: EMAIL,
    [TRUSTED_USER_SIGNATURE_HEADER]: forjado,
  });
  assert.equal(trustedUserFrom(headers, SECRET), null, 'a rota rejeita');
  assert.equal(trustedUserFrom(new Headers({ [TRUSTED_USER_SIGNATURE_HEADER]: forjado }), SECRET), null, 'sem id não há identidade');
});

test('e-mail que não cabe num cabeçalho HTTP faz o proxy desistir de repassar (a rota lê a sessão)', () => {
  assert.equal(trustedUserHeaders({ id: ID, email: 'joão@exemplo.com' }, SECRET), null);
  assert.equal(trustedUserHeaders({ id: ID, email: 'a b@exemplo.com' }, SECRET), null);
  assert.equal(trustedUserHeaders({ id: ID, email: 'x@y\r\nz' }, SECRET), null);
});

test('stripTrustedHeaders apaga todo x-obra360-* vindo do navegador e preserva o resto', () => {
  const headers = new Headers({
    cookie: 'sb-token=abc',
    'content-type': 'application/json',
    'X-Obra360-User-Id': ID,
    'x-obra360-user-email': EMAIL,
    'x-obra360-user-sig': 'qualquer',
    'x-obra360-futuro': '1',
  });
  const same = stripTrustedHeaders(headers);
  assert.equal(same, headers, 'altera o próprio objeto');
  assert.deepEqual([...headers.keys()].sort(), ['content-type', 'cookie']);
  assert.equal(headers.get('cookie'), 'sb-token=abc');
});

test('trustedHeaderSecret prefere o segredo dedicado e cai na chave de serviço, que já é só do servidor', () => {
  assert.equal(trustedHeaderSecret({ OBRA360_TRUSTED_HEADER_SECRET: 'dedicado', SUPABASE_SERVICE_ROLE_KEY: 'servico' }), 'dedicado');
  assert.equal(trustedHeaderSecret({ SUPABASE_SERVICE_ROLE_KEY: 'servico' }), 'servico');
  assert.equal(trustedHeaderSecret({ OBRA360_TRUSTED_HEADER_SECRET: '', SUPABASE_SERVICE_ROLE_KEY: '' }), undefined);
  assert.equal(trustedHeaderSecret({}), undefined);
});

test('serverTimingHeader escreve uma fase por entrada, com uma casa decimal', () => {
  assert.equal(serverTimingHeader({ auth: 12.345, commit: 401, total: 420.06 }), 'auth;dur=12.3, commit;dur=401.0, total;dur=420.1');
  assert.equal(serverTimingHeader({}), '');
});
