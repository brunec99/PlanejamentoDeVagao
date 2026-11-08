import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from '../src/modules/curto-prazo/justifications-view';

/** O markdown simples das respostas de IA (Claudia e "Analisar com IA"); tabela desde 08/11/2026. */
const html = (markdown: string) => renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(markdown)));

test('renderMarkdown: tabela com cabeçalho, sem a linha de traços, negrito nas células', () => {
  const out = html('Comparação:\n\n| Obra | PPC |\n| --- | :---: |\n| **Aurora** | 57% |\n| Horizonte | 76% |\n\nFim.');
  assert.match(out, /<p[^>]*>Comparação:<\/p>/);
  assert.match(out, /<table/);
  assert.match(out, /<th[^>]*>Obra<\/th><th[^>]*>PPC<\/th>/);
  assert.match(out, /<td[^>]*><strong>Aurora<\/strong><\/td><td[^>]*>57%<\/td>/);
  assert.doesNotMatch(out, /---/);
  assert.match(out, /<p[^>]*>Fim\.<\/p>$/);
});

test('renderMarkdown: linha com barra no meio do texto continua parágrafo; lista e título seguem iguais', () => {
  const out = html('# Título\n- item **um**\n- item dois\nTexto a | b');
  assert.match(out, /<h4[^>]*>Título<\/h4>/);
  assert.match(out, /<ul[^>]*><li>item <strong>um<\/strong><\/li><li>item dois<\/li><\/ul>/);
  assert.match(out, /<p[^>]*>Texto a \| b<\/p>/);
  assert.doesNotMatch(out, /<table/);
});

test('renderMarkdown: linha curta da tabela ganha células vazias até a largura do cabeçalho', () => {
  const out = html('| A | B | C |\n|---|---|---|\n| 1 |');
  assert.equal((out.match(/<td/g) ?? []).length, 3);
});
