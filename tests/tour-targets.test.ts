import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { resolveTourKey, tours, type TourKey } from '../src/modules/tour/tours';

/** O tour pula em silêncio o passo cujo alvo não está na tela (papel sem permissão, celular, seção
 * fechada). Isso esconde também o alvo que deixou de existir porque alguém renomeou ou tirou a marcação:
 * este teste pega esse caso, conferindo que cada alvo aparece em algum `data-tour` (ou `tourId`) do código. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
const source = files('src')
  .map(path => readFileSync(path, 'utf8'))
  .join('\n');
const declared = new Set([...source.matchAll(/(?:data-tour|tourId)=["']([^"']+)["']/g)].map(m => m[1]));

test('todo alvo de tour existe em alguma marcação data-tour', () => {
  const missing = (Object.entries(tours) as [TourKey, (typeof tours)[TourKey]][]).flatMap(([key, steps]) =>
    steps.filter(step => step.target && !declared.has(step.target)).map(step => `${key}: ${step.target}`),
  );
  assert.deepEqual(missing, []);
});

test('todo passo tem título e explicação', () => {
  for (const [key, steps] of Object.entries(tours)) {
    assert.ok(steps.length > 0, `tour vazio: ${key}`);
    for (const step of steps) assert.ok(step.title.trim() && step.body.trim(), `passo sem texto em ${key}`);
  }
});

test('toda página do sistema tem um tour', () => {
  const pages = files(join('src', 'app', '(app)'))
    .filter(path => path.endsWith(`${sep}page.tsx`))
    .map(
      path =>
        '/' +
        relative(join('src', 'app', '(app)'), path)
          .split(sep)
          .slice(0, -1)
          .join('/'),
    )
    // A raiz só redireciona para /obras.
    .filter(route => route !== '/')
    .map(route => route.replace(/\[[^\]]+\]/g, 'x'));
  const without = [...pages, '/campo/terminalidade'].filter(route => !resolveTourKey(route));
  assert.deepEqual(without, []);
});
