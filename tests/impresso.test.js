/* "Impresso e enviado aos responsáveis": a marca que a pessoa põe no item
   quando imprimiu o Waiver Request e o mandou (pedido do Bruno). Aparece no
   editor, na lista (🖨) e na Tabela/planilha; NÃO sai no PDF nem na
   publicação do visualizador; vale com o item travado; a cópia de um item
   não a herda; desmarcar limpa. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  let vis = null;
  try {
    await L.semear(pg, srv.url);
    await pg.click('#tabNcr');
    const ids = await pg.evaluate(async () => {
      const p = (await Store.list()).filter((x) => x.marco === 'J09')[0];
      return {
        aberto: p.ncrs.filter((n) => n.status !== 'aceito')[0].id,
        aceito: p.ncrs.filter((n) => n.status === 'aceito')[0].id
      };
    });
    const item = (id) => pg.evaluate(async (i) => {
      for (const p of await Store.list()) {
        const n = (p.ncrs || []).filter((x) => x.id === i)[0];
        if (n) return n;
      }
      return null;
    }, id);

    console.log('marcar no editor');
    await pg.click('#ncrList li[data-id="' + ids.aberto + '"]');
    await pg.waitForSelector('#impressoCheck');
    L.ok(!(await pg.isChecked('#impressoCheck')), 'o item novo começa desmarcado');
    L.ok(/ainda não/.test(await pg.textContent('#impressoQuando')), 'e diz que ainda não foi');
    await pg.check('#impressoCheck');
    await pg.waitForTimeout(900);
    let n = await item(ids.aberto);
    L.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · Teste$/.test(n.impresso), 'gravado com data, hora e quem marcou: ' + n.impresso);
    L.ok(/^em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Teste$/.test(await pg.textContent('#impressoQuando')),
      'a barra mostra quando e por quem: ' + await pg.textContent('#impressoQuando'));
    L.ok(await pg.isVisible('#ncrList li[data-id="' + ids.aberto + '"] .impresso-dot'), 'a lista ganha o 🖨 nesse item');
    L.igual(await pg.$$eval('#ncrList .impresso-dot', (x) => x.length), 1, 'e só nele');
    L.ok(!!n.editedAt && n.editedBy === 'Teste', 'conta como edição (vai para a pasta e para o diário)');

    console.log('vale com o item travado (waiver aceito)');
    await pg.click('#ncrList li[data-id="' + ids.aceito + '"]');
    await pg.waitForSelector('.trava');
    L.ok(await pg.isEnabled('#impressoCheck'), 'com os campos travados, a marca continua clicável');
    await pg.check('#impressoCheck');
    await pg.waitForTimeout(900);
    L.ok(!!(await item(ids.aceito)).impresso, 'e grava');

    console.log('fora do PDF');
    await pg.click('#pdfBtn');
    await pg.click('#pdfGoBtn');
    await pg.waitForTimeout(600);
    const folha = await pg.evaluate(() => ({
      paginas: document.querySelectorAll('#printRoot .rep-page').length,
      texto: document.getElementById('printRoot').textContent
    }));
    L.ok(folha.paginas > 1, 'o PDF foi montado (' + folha.paginas + ' folhas)');
    L.ok(!/Impresso|🖨|· Teste/.test(folha.texto), 'e não tem a marca em lugar nenhum: nem o rótulo, nem a data, nem o nome');
    await pg.keyboard.press('Escape');

    console.log('na Tabela e na planilha');
    await pg.click('#tabTabela');
    await pg.waitForSelector('#tabelaScroll table');
    const cab = await pg.$$eval('#tabelaScroll thead th', (t) => t.map((x) => x.textContent));
    L.ok(cab.some((t) => /Impresso e enviado/.test(t)), 'a coluna "Impresso e enviado" já vem à vista');
    const celulas = await pg.$$eval('#tabelaScroll tbody td', (t) => t.map((x) => x.textContent));
    L.ok(celulas.filter((t) => /^sim — \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Teste$/.test(t)).length === 2 &&
      celulas.filter((t) => t === 'não').length > 10, 'duas linhas com "sim — data por Teste", as outras com "não"');
    const xl = await L.baixar(pg, () => pg.evaluate(() => {
      Array.from(document.querySelectorAll('#tabelaScroll button')).filter((b) => /Exportar Excel/.test(b.textContent))[0].click();
    }));
    const planilha = xl.buffer.toString('utf8');
    L.ok(/Impresso e enviado/.test(planilha) && /sim — \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} por Teste/.test(planilha),
      'a planilha leva a coluna e a marca');
    /* filtro: só os que faltam */
    await pg.evaluate(() => {
      const sel = Array.from(document.querySelectorAll('#tabelaScroll select'))
        .filter((s) => Array.from(s.options).some((o) => /só os que faltam/.test(o.textContent)))[0];
      sel.value = 'nao';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pg.waitForTimeout(300);
    const faltam = await pg.$$eval('#tabelaScroll tbody td', (t) => t.map((x) => x.textContent));
    L.ok(!faltam.some((t) => /^sim — /.test(t)) && faltam.some((t) => t === 'não'),
      'o filtro "só os que faltam" esconde os já enviados');
    const xl2 = await L.baixar(pg, () => pg.evaluate(() => {
      Array.from(document.querySelectorAll('#tabelaScroll button')).filter((b) => /Exportar Excel/.test(b.textContent))[0].click();
    }));
    L.ok(/ainda não impressos/.test(xl2.buffer.toString('utf8')), 'e a aba "Recorte" da planilha diz que é esse o recorte');

    console.log('a cópia não herda; desmarcar limpa');
    L.igual(await pg.evaluate(async (i) => {
      for (const p of await Store.list()) {
        const x = (p.ncrs || []).filter((y) => y.id === i)[0];
        if (x) return Store.duplicar(x).impresso;
      }
    }, ids.aberto), '', 'a cópia de um item impresso nasce desmarcada');
    await pg.click('#tabNcr');
    await pg.click('#ncrList li[data-id="' + ids.aberto + '"]');
    await pg.uncheck('#impressoCheck');
    await pg.waitForTimeout(900);
    L.igual((await item(ids.aberto)).impresso, '', 'desmarcar apaga a marca');
    L.igual(await pg.$$eval('#ncrList .impresso-dot', (x) => x.length), 1, 'e o 🖨 sai da lista (fica só o do aceito)');

    console.log('não vai para o visualizador');
    const pub = await L.publicacao(pg);
    L.ok(pub.indexOf('"impresso"') < 0 && pub.indexOf('· Teste') < 0, 'a publicação não leva a marca');
    srv.extras['visualizador-dados.js'] = () => pub;
    vis = await L.abrir();
    const vp = vis.pagina;
    await vp.goto(srv.url + 'index.html?modo=leitura');
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.click('#tabNcr');
    await vp.click('#ncrList li[data-id="' + ids.aceito + '"]');
    await vp.waitForTimeout(400);
    L.igual(await vp.$$eval('#impressoCheck', (x) => x.length), 0, 'no visualizador a marca não aparece');
    L.igual(await vp.$$eval('#ncrList .impresso-dot', (x) => x.length), 0, 'nem o 🖨 na lista');
  } finally {
    const f = L.resultado('impresso e enviado', s.erros.concat(vis ? vis.erros.filter((e) => !/404|Failed to load resource/.test(e)) : []));
    if (vis) await vis.navegador.close();
    await s.navegador.close();
    srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch((e) => { console.error(e); process.exit(1); });
