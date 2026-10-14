// Service worker do modo de campo (terminalidade no celular, sem sinal).
//
// Mesmo desenho da vistoria da Obra do Mês no App-ATR, escrito à mão, sem biblioteca: o que precisa
// abrir sem sinal são as telas de /campo/, e uma lista de precache com nomes de chunk do Next
// envelheceria a cada build. A casca e os estáticos entram no cache conforme são usados, e a primeira
// visita com sinal ("Baixar para usar sem sinal") é o que aquece tudo.
//
// Regras (o escopo é /campo/; o resto do sistema não passa por aqui):
//   navegação em /campo/ → rede primeiro, cópia da própria página como reserva
//   /_next/static        → cache primeiro (o nome do arquivo já carrega o hash)
//   /api/                → só rede; resposta de API nunca é servida de cache
//
// Os dados (pacote da obra, fila e fotos) NÃO passam por aqui: ficam no IndexedDB, que é o dono do
// rascunho. O service worker só garante que a tela abra.

const VERSAO = 'obra360-campo-v1';
const CASCAS = ['/campo/terminalidade'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(VERSAO)
      .then(cache => cache.addAll([...CASCAS, '/icon.svg', '/logo-atr.png']))
      .catch(() => {}) // sem rede na instalação: a casca entra no primeiro acesso
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(chaves => Promise.all(chaves.filter(c => c.startsWith('obra360-campo') && c !== VERSAO).map(c => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

const estatico = url =>
  url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg' || url.pathname === '/logo-atr.png' || url.pathname.startsWith('/apple-icon');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: tenta a rede para pegar a versão nova; sem rede, devolve a cópia da mesma tela (sem a
  // busca da URL, para ?obra= abrir a casca guardada). Só guarda as telas de campo e respostas 200:
  // um desvio para o login não pode virar a casca.
  if (req.mode === 'navigate') {
    const chave = url.pathname.replace(/\/$/, '');
    event.respondWith(
      fetch(req)
        .then(resposta => {
          if (resposta.ok && !resposta.redirected && CASCAS.includes(chave)) {
            const copia = resposta.clone();
            caches.open(VERSAO).then(cache => cache.put(chave, copia)).catch(() => {});
          }
          return resposta;
        })
        .catch(() => caches.match(chave).then(c => c ?? caches.match(CASCAS[0])).then(c => c ?? Response.error())),
    );
    return;
  }

  if (!estatico(url)) return;
  event.respondWith(
    caches.match(req).then(
      cacheado =>
        cacheado ??
        fetch(req).then(resposta => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(VERSAO).then(cache => cache.put(req, copia)).catch(() => {});
          }
          return resposta;
        }),
    ),
  );
});
