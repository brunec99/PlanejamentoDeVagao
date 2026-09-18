// Ativos de terceiros que o navegador busca por URL, copiados para public/ no pré-build.
//
// São dois: o WASM do web-ifc, que lê o STEP, e o worker do @thatopen/fragments, que processa a
// geometria fora da thread principal. Os dois podem vir de CDN, e é justamente o que evitamos:
// versão servida por terceiro muda sem aviso, e aqui ela tem que casar com a do package.json.
import { copyFileSync, mkdirSync } from 'node:fs';

const assets = [
  ['node_modules/web-ifc/web-ifc.wasm', 'public/wasm', 'public/wasm/web-ifc.wasm'],
  ['node_modules/@thatopen/fragments/dist/Worker/worker.mjs', 'public/fragments', 'public/fragments/worker.mjs'],
];
for (const [from, dir, to] of assets) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(from, to);
}
