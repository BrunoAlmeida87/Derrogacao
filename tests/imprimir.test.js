/* Exportar para PDF: escolher quais NCRs/DEVs de um relatório entram, ou só o
   item aberto. O caminho de sempre (relatório inteiro) não muda.

   - sem mexer em nada: o relatório inteiro, a capa sem aviso de recorte;
   - "Escolher itens": só os marcados saem no índice e nas páginas, e a capa
     diz que é uma lista parcial;
   - "Só o item aberto": só aquele item;
   - a escolha não sobrevive ao fechar a janela. */
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
    await pg.setInputFiles('#restoreInput', path.join(L.RAIZ, 'exemplos/WaiverRequest_SBR4_J06.json'));
    await pg.waitForTimeout(1200);
    await pg.selectOption('#projectSelect', { index: await pg.$eval('#projectSelect', s => Array.from(s.options).findIndex(o => /^J06 /.test(o.textContent))) });
    await pg.click('#tabNcr');

    const resumo = () => pg.evaluate(() => ({
      indice: document.querySelectorAll('#printRoot .rep-index-item').length,
      recorte: (document.querySelector('#printRoot .rep-cover-recorte') || {}).textContent || '',
      paginas: document.querySelectorAll('#printRoot .rep-page').length
    }));
    const gerar = async () => {
      await pg.click('#pdfGoBtn');
      await pg.waitForTimeout(500);
    };

    console.log('o relatório inteiro continua como sempre');
    await pg.click('#pdfBtn');
    const inteiro = await pg.evaluate(() => document.querySelector('#pdfPick .pick-row-sub').textContent);
    L.ok(/31 itens/.test(inteiro), 'a linha do relatório diz "31 itens": ' + inteiro);
    await gerar();
    const todo = await resumo();
    L.ok(todo.indice === 31 && !todo.recorte, 'índice com os 31 itens e sem aviso de recorte na capa');

    console.log('escolher alguns itens');
    await pg.click('#pdfBtn');
    await pg.click('.pick-cb:checked >> xpath=.. >> .pick-itens-btn');
    L.ok(await pg.isVisible('.pick-itens'), 'a lista de itens abre');
    L.igual(await pg.$$eval('.pick-item-cb', c => c.filter(x => x.checked).length), 31, 'abre com todos marcados');
    await pg.click('.pick-itens-acoes >> text=Nenhum');
    L.ok(await pg.isDisabled('#pdfGoBtn'), 'sem nenhum item marcado, não dá para gerar');
    const cbs = await pg.$$('.pick-item-cb');
    await cbs[2].check();
    await cbs[5].check();
    L.ok(await pg.isEnabled('#pdfGoBtn'), 'marcando dois, volta a poder gerar');
    const nomes = await pg.$$eval('.pick-item-cb:checked', c => c.map(x => x.parentNode.querySelector('.pick-item-nome').textContent.split(' | ')[0]));
    L.ok(/2 item\(ns\)/.test(await pg.textContent('#pdfSummary')), 'o resumo diz 2 itens: ' + await pg.textContent('#pdfSummary'));
    await gerar();
    const dois = await resumo();
    L.ok(dois.indice === 2, 'só 2 itens no índice (' + dois.indice + ')');
    L.ok(/Partial list/.test(dois.recorte) && /2 of 31/.test(dois.recorte), 'a capa avisa a lista parcial: ' + dois.recorte);
    const indice = await pg.$$eval('#printRoot .rep-index-item a', a => a.map(x => x.textContent));
    L.igual(indice, nomes, 'são exatamente os itens marcados');

    console.log('só o item aberto');
    await pg.click('#ncrList .ncr-item:nth-child(4)');
    await pg.waitForTimeout(300);
    const idAberto = await pg.textContent('#ncrList .ncr-item:nth-child(4) .ncr-item-id');
    await pg.click('#pdfBtn');
    L.ok(await pg.isEnabled('#pdfSoEsteBtn'), 'o botão "Só o item aberto" está ativo');
    await pg.click('#pdfSoEsteBtn');
    await gerar();
    const um = await resumo();
    L.ok(um.indice === 1, 'um item só no índice (' + um.indice + ')');
    L.ok(/1 of 31/.test(um.recorte), 'a capa avisa: ' + um.recorte);
    L.igual(await pg.$$eval('#printRoot .rep-index-item a', a => a.map(x => x.textContent)), [idAberto], 'é o item que estava aberto');

    console.log('a escolha não sobrevive à janela');
    await pg.click('#pdfBtn');
    await pg.click('.pick-cb:checked >> xpath=.. >> .pick-itens-btn');
    L.igual(await pg.$$eval('.pick-item-cb', c => c.filter(x => x.checked).length), 31, 'reabrir traz todos marcados de novo');
    await pg.keyboard.press('Escape');

  } finally {
    const f = L.resultado('imprimir itens', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
