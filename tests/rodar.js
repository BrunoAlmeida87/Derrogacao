/* Roda todas as suítes, uma de cada vez, e diz no fim quais passaram.
   Uso: node tests/rodar.js            (todas)
        node tests/rodar.js kanban     (só as que têm "kanban" no nome) */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filtro = process.argv[2] || '';
const suites = fs.readdirSync(__dirname)
  .filter(f => /\.test\.js$/.test(f) && f.indexOf(filtro) >= 0)
  .sort();
const resultado = [];
for (const s of suites) {
  console.log('\n=== ' + s);
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit' });
  resultado.push([s, r.status === 0]);
}
console.log('\n=== resumo');
resultado.forEach(r => console.log((r[1] ? '  ✓ ' : '  ✗ ') + r[0]));
process.exitCode = resultado.every(r => r[1]) ? 0 : 1;
