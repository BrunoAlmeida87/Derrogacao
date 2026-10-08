/* Os dois arquivos únicos (derrogacao.html e derrogacao-visualizador.html),
   gerados na hora e abertos de file:// sem flag nenhuma — como o Bruno abre
   do G:. Nenhum erro no console, as abas novas, o J09, o Kanban e a
   atualização do visualizador lendo o visualizador-dados.js ao lado. */
'use strict';
const L = require('./lib');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

(async () => {
  const pasta = fs.mkdtempSync(path.join(L.SAIDA, 'unico-'));
  execFileSync('python3', [path.join(L.RAIZ, 'tools/build-standalone.py'), 'teste', path.join(pasta, 'derrogacao.html'), 'editor']);
  execFileSync('python3', [path.join(L.RAIZ, 'tools/build-standalone.py'), 'teste', path.join(pasta, 'derrogacao-visualizador.html'), 'visualizador']);
  const url = 'file://' + pasta + '/';
  const s = await L.abrir();
  const pg = s.pagina;
  let vis = null;
  try {
    console.log('editor (derrogacao.html, file://)');
    await L.semear(pg, url, { pagina: 'derrogacao.html' });
    L.ok(/^J09 \(/.test(await pg.evaluate(() => document.getElementById('projectSelect').selectedOptions[0].textContent)), 'abre no J09');
    L.igual(await pg.$$eval('.tab', ts => ts.filter(t => !t.hidden).map(t => t.childNodes[0].textContent.trim())),
      ['Banco NCR', 'Kanban', 'Tabela', 'Waiver NCR', 'Waiver DEV', 'Resumo', 'Fluxos', 'Produtos'], 'as abas na ordem nova');
    L.ok(await pg.evaluate(() => document.getElementById('atualizaBox').hidden), 'sem pasta, sem contador');
    await pg.click('.tab[data-kind="kanban"]');
    L.ok(await pg.$$eval('.kb-card', cs => cs.length) > 20, 'o Kanban abre, com os cartões compactos');
    await pg.click('.kb-exporta .btn:first-child');
    L.ok(/folha/.test(await pg.textContent('#kbImpPrevia')), 'a exportação visual mede as folhas no arquivo único');
    await pg.click('#kbExportDialog .btn--primary');
    const pdf = await L.pdfDaImpressao(pg, 'unico-kanban.pdf');
    L.ok(pdf.paginas >= 1, 'e sai o PDF (' + pdf.paginas + ' folha(s))');
    await pg.click('.tab[data-kind="resumo"]');
    L.ok(await pg.$$eval('.sm-marcos .tb-chip', b => b.length) === 6, 'o Resumo com os mini cards');

    console.log('visualizador (derrogacao-visualizador.html, file://)');
    fs.writeFileSync(path.join(pasta, 'visualizador-dados.js'), await L.publicacao(pg));
    vis = await L.abrir();
    await vis.pagina.goto(url + 'derrogacao-visualizador.html');
    await vis.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0, null, { timeout: 10000 });
    L.ok(/^J09 \(/.test(await vis.pagina.evaluate(() => document.getElementById('projectSelect').selectedOptions[0].textContent)), 'lê o arquivo ao lado e abre no J09');
    L.ok(/próxima em 0[45]:\d\d/.test(await vis.pagina.textContent('#atualizarConta')), 'o contador da atualização automática: ' + await vis.pagina.textContent('#atualizarConta'));
    await vis.pagina.click('.tab[data-kind="kanban"]');
    L.ok(await vis.pagina.$$eval('.kb-card select, .kb-card[draggable="true"]', x => x.length) === 0, 'o Kanban do visualizador não arrasta nem troca situação');
    L.ok(await vis.pagina.$$eval('.kb-exporta .btn', x => x.length) === 2, 'mas exporta (visual e Excel)');
  } finally {
    /* o visualizador procura primeiro a pasta combinada (X:\…, que não existe
       nesta máquina) — o "arquivo não encontrado" dessa tentativa é esperado */
    const f = L.resultado('arquivos únicos de file://', s.erros.concat(vis ? vis.erros.filter(e => !/ERR_FILE_NOT_FOUND/.test(e)) : []));
    if (vis) await vis.navegador.close();
    await s.navegador.close();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
