import test from 'node:test';
import assert from 'node:assert/strict';
import { publicOrigin } from '../src/infrastructure/public-origin';

// O que o Next informa em `request.nextUrl.origin` no servidor da ATR (`next start -H 0.0.0.0 -p 3000`).
const INTERNAL = 'https://0.0.0.0:3000';

test('atrás do túnel, vale o endereço que o navegador usou, não o endereço em que o servidor escuta', () => {
  const headers = new Headers({ host: 'obra360-teste.example.com', 'x-forwarded-proto': 'https' });
  assert.equal(publicOrigin(headers, INTERNAL), 'https://obra360-teste.example.com');
});

test('na Vercel o resultado é o mesmo de antes', () => {
  const headers = new Headers({ host: 'obra360-atr.vercel.app', 'x-forwarded-proto': 'https' });
  assert.equal(publicOrigin(headers, 'https://obra360-atr.vercel.app'), 'https://obra360-atr.vercel.app');
});

test('no computador de quem desenvolve, sem proxy, o protocolo é o da própria requisição', () => {
  assert.equal(publicOrigin(new Headers({ host: '127.0.0.1:3000' }), 'http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  const local = new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' });
  assert.equal(publicOrigin(local, 'http://localhost:3000'), 'http://localhost:3000');
});

test('com vários proxies, vale o primeiro protocolo da lista', () => {
  const headers = new Headers({ host: 'obra360-teste.example.com', 'x-forwarded-proto': 'https, http' });
  assert.equal(publicOrigin(headers, INTERNAL), 'https://obra360-teste.example.com');
});

test('x-forwarded-host não é lido: quem chama pode forjá-lo', () => {
  const headers = new Headers({
    host: 'obra360-teste.example.com',
    'x-forwarded-host': 'outro.example',
    'x-forwarded-proto': 'https',
  });
  assert.equal(publicOrigin(headers, INTERNAL), 'https://obra360-teste.example.com');
});

test('Host ausente ou que não é um endereço cai na origem informada pelo Next', () => {
  assert.equal(publicOrigin(new Headers(), INTERNAL), INTERNAL);
  for (const host of ['outro.example/caminho', 'usuario@outro.example', 'outro.example?x=1', 'a b', '-x.example', 'outro.example:porta'])
    assert.equal(publicOrigin({ get: name => (name === 'host' ? host : null) }, INTERNAL), INTERNAL, host);
});

test('protocolo que não é http nem https é ignorado', () => {
  const headers = new Headers({ host: 'obra360-teste.example.com', 'x-forwarded-proto': 'javascript' });
  assert.equal(publicOrigin(headers, INTERNAL), 'https://obra360-teste.example.com');
});

test('com o endereço oficial configurado, nenhum cabeçalho é lido', () => {
  const headers = new Headers({ host: 'outro.example', 'x-forwarded-proto': 'http' });
  assert.equal(publicOrigin(headers, INTERNAL, 'https://obra360-teste.example.com'), 'https://obra360-teste.example.com');
  assert.equal(publicOrigin(new Headers(), INTERNAL, ' https://obra360-teste.example.com/obras?x=1 '), 'https://obra360-teste.example.com');
});

test('endereço oficial vazio ou inválido é ignorado e vale o Host', () => {
  const headers = new Headers({ host: 'obra360-teste.example.com', 'x-forwarded-proto': 'https' });
  for (const configured of [undefined, '', '   ', 'obra360-teste.example.com', 'javascript:alert(1)', 'ftp://outro.example'])
    assert.equal(publicOrigin(headers, INTERNAL, configured), 'https://obra360-teste.example.com', String(configured));
});
