/* Compatibilidade: um backup antigo continua abrindo, os rótulos novos não
   mudaram as chaves internas ("ncr"/"dev", ncrs/devs) nem o formato do
   backup, e o PDF do relatório não ganhou nada da tela nova. */
'use strict';
const L = require('./lib');
const path = require('path');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await pg.goto(srv.url + 'index.html');
    await L.esperarPronto(pg);
    await pg.evaluate(() => localStorage.setItem('derrogacao:user', 'Teste'));

    console.log('backup antigo (exemplos/, gravado antes desta versão)');
    await pg.setInputFiles('#restoreInput', path.join(L.RAIZ, 'exemplos/WaiverRequest_SBR4_J06.json'));
    await pg.waitForTimeout(1200);
    const aberto = await pg.evaluate(async () => {
      const ps = await Store.list();
      const j06 = ps.find(p => p.marco === 'J06');
      return j06 ? { ncrs: j06.ncrs.length, devs: j06.devs.length, schema: j06.schema } : null;
    });
    L.ok(aberto && aberto.ncrs === 31, 'o backup antigo abre: J06 com ' + (aberto && aberto.ncrs) + ' NCRs');
    /* o editor abre no Banco NCR, onde o seletor de relatório não aparece */
    await pg.click('#tabNcr');
    await pg.selectOption('#projectSelect', { index: await pg.$eval('#projectSelect', s => Array.from(s.options).findIndex(o => /^J06 /.test(o.textContent))) });
    L.igual(await pg.textContent('#tabNcr .tab-count'), '31', 'a aba Waiver NCR mostra os 31 itens');

    console.log('chaves internas e formato');
    const chaves = await pg.evaluate(() => ({
      ncr: Store.itemsKey('ncr'), dev: Store.itemsKey('dev'),
      abas: Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.kind)
    }));
    L.igual([chaves.ncr, chaves.dev], ['ncrs', 'devs'], 'Store.itemsKey continua ncrs/devs');
    L.ok(chaves.abas.indexOf('ncr') >= 0 && chaves.abas.indexOf('dev') >= 0, 'as abas continuam data-kind="ncr" e "dev"');
    const bk = await L.baixar(pg, async () => { await pg.click('#menuBtn'); await pg.click('#backupAllBtn'); });
    await pg.keyboard.press('Escape');
    const dados = JSON.parse(bk.buffer.toString('utf8'));
    L.ok(Array.isArray(dados.projects) && dados.projects.every(p => Array.isArray(p.ncrs) && Array.isArray(p.devs)),
      'o backup novo tem o mesmo formato (projects[].ncrs/devs)');
    /* a única chave nova é a lista de comunicados (comunicados.js), que as
       versões anteriores ignoram — Store.fromBackup só lê `projects` */
    L.ok(Array.isArray(dados.comunicados) && !('kanban' in dados),
      'e só uma chave nova, a lista de comunicados, que as versões anteriores ignoram');
    const antigo = await pg.evaluate((d) => Store.fromBackup(d).length, dados);
    L.igual(antigo, dados.projects.length, 'o leitor de backup continua lendo só os relatórios');

    console.log('o PDF do relatório não mudou de cara');
    await pg.click('#pdfBtn');
    await pg.click('#pdfGoBtn');
    await pg.waitForTimeout(500);
    const folhas = await pg.evaluate(() => ({
      n: document.querySelectorAll('#printRoot .rep-page').length,
      kanban: document.querySelectorAll('#printRoot .rep-page--kanban, #printRoot .rep-page--a3').length,
      capa: (document.querySelector('#printRoot .rep-cover-title') || {}).textContent || ''
    }));
    L.ok(folhas.n > 30 && folhas.kanban === 0, 'o relatório sai com as folhas de sempre (' + folhas.n + '), nenhuma do Kanban');
    const pdf = await L.pdfDaImpressao(pg, 'relatorio-j06.pdf');
    L.ok(pdf.tamanhos.every(t => (t[0] === 210 && t[1] === 297) || (t[0] === 297 && t[1] === 210)), 'A4 retrato (e paisagem nos anexos), como antes');
  } finally {
    const f = L.resultado('compatibilidade', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
