/* Seis melhorias pedidas juntas pelo Bruno:
   1. Sistema(s) também na DEV, e sistemas separados por vírgula nos indicadores;
   2. "Marcar todos" nos filtros do Banco NCR (o status, por exemplo);
   3. a Função do item do Waiver é a Função Vital do Banco NCR;
   4. o Kanban com as DEVs incluídas;
   5. os gráficos do resumo em PDF partidos entre as barras, sem folha perdida;
   6. a planilha do Banco NCR sem o cabeçalho pintado nas colunas vazias. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);

    console.log('1. sistemas (bigramas) na DEV e nos indicadores');
    const sis = await pg.evaluate(() => ({
      virgula: Summary.sistemasDoTexto('MB, DT'),
      tres: Summary.sistemasDoTexto('BX,BQ;BD / HP'),
      espaco: Summary.sistemasDoTexto('MB DT'),
      frase: Summary.sistemasDoTexto('Sea water'),
      repetido: Summary.sistemasDoTexto('MB, mb, DT'),
      vazio: Summary.sistemasDoTexto('  ')
    }));
    L.igual(sis.virgula, ['MB', 'DT'], '"MB, DT" são dois sistemas');
    L.igual(sis.tres, ['BX', 'BQ', 'BD', 'HP'], 'vírgula, ponto e vírgula e barra separam');
    L.igual(sis.espaco, ['MB', 'DT'], 'códigos curtos separados só por espaço também');
    L.igual(sis.frase, ['Sea water'], 'uma frase continua inteira');
    L.igual(sis.repetido, ['MB', 'DT'], 'o mesmo sistema duas vezes no item conta uma só');
    L.igual(sis.vazio, [], 'vazio não conta sistema');

    await pg.click('.tab[data-kind="dev"]');
    await pg.waitForSelector('#f-systems');
    L.ok(await pg.isVisible('#f-systems'), 'a DEV tem o campo Sistema(s)');
    await pg.fill('#f-systems', 'MB, DT');
    await pg.waitForTimeout(3000);
    const dev = await pg.evaluate(async () => {
      const ps = await Store.list();
      const p = ps.filter(x => Report.marcoOf(x, 'dev') === 'J09').filter(x => x.devs.length)[0];
      const d = Summary.compute([p], null);
      return { systems: p.devs[0].systems, porSistema: d.porMarco[0].porSistema };
    });
    L.igual(dev.systems, 'MB, DT', 'o valor foi gravado na DEV');
    L.ok(dev.porSistema.MB >= 1 && dev.porSistema.DT >= 1 && !dev.porSistema['MB, DT'],
      'o indicador "por sistema" conta MB e DT, cada um (' + JSON.stringify({ MB: dev.porSistema.MB, DT: dev.porSistema.DT }) + ')');
    /* o título da DEV no PDF não mudou: o sistema não sai nele */
    await pg.evaluate(() => { const b = document.getElementById('pdfBtn'); b.click(); });
    await pg.click('#pdfGoBtn');
    await pg.waitForTimeout(400);
    const capa = await pg.evaluate(() => Array.from(document.querySelectorAll('#printRoot .rep-index-item')).map(x => x.textContent).join('\n'));
    L.ok(/DEV-SBR4-J09-1/.test(capa) && capa.indexOf('MB') < 0,
      'o índice do PDF da DEV continua sem o campo novo');
    await pg.keyboard.press('Escape');

    console.log('2. "Marcar todos" nos filtros do Banco NCR');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.click('#nbF-status');
    const total = await pg.$$eval('.nb2-ms-pop:not([hidden]) .nb2-ms-op input', c => c.length);
    await pg.click('.nb2-ms-pop:not([hidden]) .nb2-ms-todos');
    L.igual(await pg.$$eval('.nb2-ms-pop:not([hidden]) .nb2-ms-op input', c => c.filter(x => x.checked).length), total,
      'todas as ' + total + ' opções de status ficam marcadas');
    L.ok(/escolhidos/.test(await pg.textContent('#nbF-status')), 'o botão do filtro diz quantos estão escolhidos');
    await pg.uncheck('.nb2-ms-pop:not([hidden]) input[value="Closed"]');
    const linhas = await pg.$$eval('#nb2Table tbody tr', t => t.length);
    const semClosed = await pg.evaluate(() => Ncrs.lista().filter(r => r.fonte.status !== 'Closed').length);
    L.igual(linhas, semClosed, 'tirar o "Closed" deixa as outras ' + semClosed + ' NCRs (marcar todos e retirar)');
    await pg.click('.nb2-ms-pop:not([hidden]) .btn--primary');
    await pg.click('#nb2Limpar');

    console.log('3. a Função é a Função Vital do Banco NCR');
    const fv = await pg.evaluate(async () => {
      const ps = await Store.list();
      const j09 = ps.filter(p => p.marco === 'J09')[0];
      const it = j09.ncrs[0];
      const rec = Ncrs.recDoItem(it);
      return { func: it.func, fv: rec.waiver.funcaoVital, alvo: Ncrs.funcaoParaWaiver(rec.waiver.funcaoVital), num: it.ncrId };
    });
    L.igual(fv.func, fv.alvo, 'o item já abre com a Função Vital do banco: ' + fv.func);
    /* muda no banco: o Waiver acompanha */
    await pg.evaluate(async (n) => { await Ncrs.editarWaiver(Ncrs.get(n), 'funcaoVital', '09 - Coordinate damage control', 'Teste'); }, fv.num);
    await pg.reload();
    await L.esperarPronto(pg);
    await pg.waitForTimeout(800);
    const depois = await pg.evaluate(async (n) => {
      const ps = await Store.list();
      const it = ps.map(p => p.ncrs.filter(x => x.ncrId === n)).reduce((a, b) => a.concat(b), [])[0];
      return it.func;
    }, fv.num);
    L.igual(depois, 'FV09 - COORDINATE DAMAGE CONTROL', 'trocada a Função Vital no banco, o item passa a ter a nova (' + depois + ')');
    await pg.click('.tab[data-kind="ncr"]');
    await pg.click('#ncrList .ncr-item:first-child');
    await pg.waitForSelector('#f-func');
    L.ok(await pg.$eval('#f-func', f => f.readOnly), 'no editor a Função só se vê (vem do Banco NCR)');
    L.ok(/Banco NCR/.test(await pg.$eval('#f-func', f => f.parentNode.textContent)), 'e diz de onde vem');

    console.log('4. Kanban com as DEVs');
    await pg.click('.tab[data-kind="kanban"]');
    await pg.waitForSelector('.kb-card');
    const antesK = await pg.$$eval('.kb-card', c => c.length);
    L.igual(await pg.$$eval('.kb-card[data-id^="item"] .kb-st-ncr.is-dev', c => c.length), 0, 'de saída, sem DEV');
    await pg.click('#kbDevs');
    const devs = await pg.$$eval('.kb-st-ncr.is-dev', c => c.length);
    L.igual(devs, 3, 'com "Incluir as DEVs": as 3 DEVs do J09 entram com a etiqueta DEV');
    L.igual(await pg.$$eval('.kb-card', c => c.length), antesK + 3, 'o quadro ganhou só as DEVs');
    const cartaoDev = '.kb-card:has(.kb-st-ncr.is-dev)';
    L.ok(await pg.$eval(cartaoDev + ' select.kb-sel', x => !!x), 'a DEV muda de situação pelo <select>');
    const numDev = await pg.$eval(cartaoDev + ' .kb-card-num', b => b.textContent);
    await pg.selectOption(cartaoDev + ' select.kb-sel', 'solicitado');
    await pg.waitForTimeout(500);
    const st = await pg.evaluate(async (n) => {
      const ps = await Store.list();
      const d = ps.map(p => p.devs.filter(x => x.ncrId === n)).reduce((a, b) => a.concat(b), [])[0];
      return d.status;
    }, numDev);
    L.igual(st, 'solicitado', 'a situação da ' + numDev + ' foi gravada na DEV');
    L.igual(await pg.$$eval('.kb-card[data-tipo="item"] .kb-st-ncr.is-dev', c => c.length), 3, 'e as DEVs não ganham alerta nem "fora do banco"');
    await pg.click('.kb-card:has(.kb-st-ncr.is-dev) .kb-card-num');
    await pg.waitForTimeout(500);
    L.ok(await pg.evaluate(() => document.querySelector('.tab[data-kind="dev"]').getAttribute('aria-selected') === 'true'), 'clicar no número abre a aba Waiver DEV');

    console.log('5. o resumo em PDF, gráficos partidos entre as barras');
    await pg.evaluate(async () => {
      const marcos = ['J01', 'J02', 'J03', 'J04', 'J05', 'J07', 'J11', 'J12', 'RANAE', 'TRAP'];
      for (const m of marcos) {
        const p = Store.newProject(m);
        for (let i = 0; i < 4; i++) {
          const n = Store.newNcr(); n.ncrId = 'NCR-' + m + '-' + i; n.systems = 'S' + i + ', T' + (i % 2);
          Store.setStatus(n, Store.STATUS[i % 4].id); p.ncrs.push(n);
        }
        await Store.save(p);
      }
    });
    await pg.reload();
    await L.esperarPronto(pg);
    await pg.click('.tab[data-kind="resumo"]');
    await pg.click('.sm-marcos .tb-chip[data-marco=""]');
    await pg.click('.sm-bar-actions .btn:nth-child(1)');
    await pg.waitForTimeout(500);
    const pags = await pg.evaluate(() => Array.from(document.querySelectorAll('#printRoot .rep-page')).map(p => ({
      titulos: Array.from(p.querySelectorAll('.sm-grafico .sm-card-head h3')).map(h => h.textContent),
      linhas: p.querySelectorAll('.sm-chart-parte text.sm-axis-label').length,
      kpis: p.querySelectorAll('.sm-kpi').length
    })));
    L.igual(pags[0].kpis, 5, 'os 5 indicadores cabem numa linha só, na primeira folha');
    const progressos = pags.map(p => p.titulos.filter(t => t === 'Progresso').length);
    L.ok(progressos.filter(Boolean).length >= 1, 'o gráfico de progresso está no PDF');
    const marcosNoPdf = await pg.evaluate(() => {
      const r = [];
      Array.from(document.querySelectorAll('#printRoot .sm-grafico')).forEach(g => {
        if (g.querySelector('h3').textContent !== 'Progresso') return;
        g.querySelectorAll('text.sm-axis-label').forEach(t => r.push(t.textContent));
      });
      return r;
    });
    L.igual(marcosNoPdf.length, new Set(marcosNoPdf).size, 'cada barra do progresso aparece uma só vez (nada repetido nem perdido na quebra)');
    L.ok(marcosNoPdf.length >= 15, 'todas as barras do progresso estão lá (' + marcosNoPdf.length + ')');
    const pdf = await L.pdfDaImpressao(pg, 'resumo-partido.pdf');
    L.igual(pdf.paginas, pags.length, 'o PDF tem as mesmas ' + pags.length + ' folhas que a montagem (nenhuma folha em branco a mais)');
    const temCont = pags.slice(1).every(p => p.titulos.length > 0 || p.linhas === 0);
    L.ok(temCont, 'a folha de continuação repete o título do gráfico partido');
    await pg.keyboard.press('Escape');

    console.log('6. a planilha do Banco NCR: nada pintado depois da última coluna');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const xl = await L.baixar(pg, () => pg.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).filter(x => /Excel/.test(x.textContent))[0]; b.click();
    }));
    const conteudo = xl.buffer.toString('latin1');
    const folha = conteudo.slice(conteudo.indexOf('<worksheet'), conteudo.indexOf('</worksheet>'));
    const linha1 = /<row r="1"[^>]*>/.exec(folha)[0];
    L.ok(linha1 === '<row r="1">', 'a linha do cabeçalho não leva estilo de linha inteira: ' + linha1);
    L.ok(folha.indexOf('customFormat') < 0, 'nenhuma linha com formato para a folha toda');
    const cabs = (folha.match(/<c r="[A-Z]+1" t="inlineStr" s="1">/g) || []).length;
    const dim = /<dimension ref="A1:([A-Z]+)(\d+)"/.exec(folha);
    L.ok(dim && dim[2] > 1, 'a área usada está dita: ' + (dim && dim[0]));
    L.ok(cabs > 3, 'só as ' + cabs + ' células do cabeçalho com dados são pintadas');
  } finally {
    const f = L.resultado('melhorias', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
