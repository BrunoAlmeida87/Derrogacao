/* Gera docs/visualizador-guia.png a partir de docs/visualizador-guia.html.
   Ferramenta de quem edita (como os tests/): usa o Playwright global.
   Uso: node tools/guia-png.js */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

function playwright() {
  try { return require('playwright'); } catch (e) { /* segue para o global */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}

(async () => {
  const raiz = path.resolve(__dirname, '..');
  const nav = await playwright().chromium.launch();
  const pg = await nav.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  await pg.goto('file://' + path.join(raiz, 'docs', 'visualizador-guia.html'));
  const folha = await pg.$('.folha');
  await folha.screenshot({ path: path.join(raiz, 'docs', 'visualizador-guia.png') });
  await nav.close();
  console.log('docs/visualizador-guia.png gerado');
})();
