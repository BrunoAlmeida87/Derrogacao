/* A coluna "Obs Ship Manager" (pedido do Bruno): observações enviadas pelo
   Ship Manager, digitadas à mão — o mesmo comportamento da Observação.

   - no Banco NCR: coluna à vista (também para quem já tinha escolhido as
     colunas), escrita na ficha, gravada no Waiver da NCR, achada na busca;
   - levada ao item quando a NCR entra no relatório, com o cartão no editor,
     e fora do PDF;
   - a planilha de correlação com uma coluna "Obs Ship Manager" preenche;
   - versão anterior que regrave o arquivo do Waiver sem o campo: este lado
     percebe e devolve;
   - no visualizador: à vista e só leitura. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  const outros = [];
  const TEXTO = 'SM pede nova inspeção antes do J09 — enviado em 25/09';
  const NUM = L.numero(41);   /* Marco Atual J09, aberta, ainda fora do relatório do J09 */
  try {
    await L.semear(pg, srv.url);
    /* quem já tinha escolhido colunas (a lista antiga, sem a coluna nova) */
    await pg.evaluate(() => {
      localStorage.setItem('derrogacao:ncrColunas2', JSON.stringify(['numero', 'w:marcoAtual', 'w:waiverHistoric', 'status']));
      localStorage.removeItem('derrogacao:ncrColunaShipManager');
    });
    await pg.reload();
    await L.esperarPronto(pg);

    console.log('Banco NCR');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const cab = await pg.$$eval('#nb2Table thead th', ths => ths.map(t => t.textContent.replace(/[▲▼]/g, '').trim()));
    L.igual(cab, ['Número', 'Marco Atual', 'Waiver Historic', 'Obs Ship Manager', 'Status'],
      'a coluna nova entra na escolha que já existia, logo depois do Waiver Historic');
    await pg.reload();
    await L.esperarPronto(pg);
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const cab2 = await pg.$$eval('#nb2Table thead th', ths => ths.length);
    L.igual(cab2, 5, 'entra uma vez só (recarregar não duplica)');

    await pg.evaluate((n) => NcrView.abrirFicha(n), NUM);
    await pg.waitForSelector('#nbFicha-obsShipManager');
    await pg.fill('#nbFicha-obsShipManager', TEXTO);
    await pg.waitForTimeout(700);
    await pg.keyboard.press('Tab');
    const gravado = await pg.evaluate((n) => ({ v: Ncrs.get(n).waiver.obsShipManager, por: Ncrs.get(n).waiver.editedBy }), NUM);
    L.ok(gravado.v === TEXTO && gravado.por === 'Teste', 'escrita na ficha: gravada no Waiver da NCR, com autoria');
    await pg.keyboard.press('Escape');
    await pg.fill('#nbBusca', 'nova inspeção');
    await pg.waitForTimeout(500);
    const achou = await pg.$$eval('#nb2Table tbody tr', trs => trs.map(t => t.textContent));
    L.ok(achou.length === 1 && achou[0].indexOf(NUM) >= 0 && achou[0].indexOf('SM pede nova') >= 0,
      'a busca acha pelo texto, e a coluna mostra o texto');
    await pg.fill('#nbBusca', '');

    console.log('levada ao relatório');
    const item = await pg.evaluate(async (n) => {
      const dados = Ncrs.paraItemWaiver(Ncrs.get(n));
      return dados.obsShipManager;
    }, NUM);
    L.igual(item, TEXTO, 'Ncrs.paraItemWaiver leva a Obs Ship Manager para o item');
    await pg.evaluate((n) => NcrView.abrirFicha(n), NUM);
    await pg.click('#ncrDialog button:has-text("Adicionar ao J09 Waiver")');
    await pg.waitForTimeout(600);
    await pg.keyboard.press('Escape');
    const noItem = await pg.evaluate(async (n) => {
      const ps = await Store.list();
      const j09 = ps.filter(p => p.marco === 'J09')[0];
      const it = j09.ncrs.filter(x => x.ncrId === n)[0];
      return it ? it.obsShipManager : null;
    }, NUM);
    L.igual(noItem, TEXTO, '"Adicionar ao J09 Waiver": o item novo chega com a Obs Ship Manager');
    await pg.click('.tab[data-kind="ncr"]');
    const opJ09 = await pg.evaluate(() => Array.from(document.querySelectorAll('#projectSelect option')).filter(o => /^J09 \(/.test(o.textContent))[0].value);
    await pg.selectOption('#projectSelect', opJ09);
    await pg.waitForTimeout(300);
    await pg.click('.ncr-item:has-text("' + NUM + '")');
    await pg.waitForSelector('#f-obsShipManager');
    const ed = await pg.evaluate(() => ({ v: document.getElementById('f-obsShipManager').value,
      livre: document.getElementById('f-obsShipManager').hasAttribute('data-livre') }));
    L.ok(ed.v === TEXTO && ed.livre, 'no editor: o cartão "Obs Ship Manager" com o texto, editável mesmo com o item travado');
    await pg.fill('#f-obsShipManager', TEXTO + ' (conferido)');
    await pg.waitForTimeout(900);
    const pdf = await pg.evaluate(async (a) => {
      const ps = await Store.list();
      const j09 = ps.filter(p => p.marco === 'J09')[0];
      const it = j09.ncrs.filter(x => x.ncrId === a.n)[0];
      const root = document.getElementById('printRoot');
      Report.build(j09, root, 'ncr');
      const html = root.innerHTML;
      root.innerHTML = '';
      return { salvo: it.obsShipManager, noPapel: html.indexOf('SM pede nova') >= 0, temItem: html.indexOf(a.n) >= 0 };
    }, { n: NUM });
    L.ok(pdf.salvo === TEXTO + ' (conferido)', 'o que se escreve no item fica gravado no item');
    L.ok(pdf.temItem && !pdf.noPapel, 'o PDF do relatório tem o item e não tem a Obs Ship Manager');

    console.log('correlação e versões anteriores');
    const cor = await pg.evaluate(async (n) => {
      const wb = { sheets: [{ name: 'Correlação NCR', rows: [
        ['Número', 'Original Jx', 'Actual Jx', 'Obs Ship Manager'],
        [n, 'J06', 'J09', 'Texto vindo da planilha']
      ] }] };
      const lido = Ncrs.lerCorrelacao(wb);
      const rec = Ncrs.get(n);
      rec.waiver.obsShipManager = '';
      const r = Ncrs.importarCorrelacao(lido, 'correl.xlsx', 'Teste', {});
      return rec.waiver.obsShipManager;
    }, L.numero(48));
    L.igual(cor, 'Texto vindo da planilha', 'a correlação com a coluna "Obs Ship Manager" preenche o campo');
    const velha = await pg.evaluate((n) => {
      const rec = Ncrs.get(n);
      /* o arquivo do Waiver regravado por uma versão sem o campo, mesma edição */
      const arq = Ncrs.arquivoWaiver('Teste');
      arq.ncrs.forEach(x => { if (x.key === rec.key) { x.waiver = Object.assign({}, x.waiver); delete x.waiver.obsShipManager; } });
      const r = Ncrs.juntarWaiver(arq);
      const desconhecido = Ncrs.juntarWaiver({ ncrs: [{ key: rec.key, waiver: Object.assign({}, rec.waiver,
        { editedAt: '2099-01-01T00:00:00.000Z', campoDoFuturo: 'x' }) }] });
      return { devolve: r.localMaisNovo, manteve: rec.waiver.obsShipManager, futuro: Ncrs.get(n).waiver.campoDoFuturo };
    }, NUM);
    L.ok(velha.devolve && velha.manteve === TEXTO, 'arquivo regravado sem o campo: o texto fica aqui e volta para a pasta');
    L.igual(velha.futuro, 'x', 'campo que esta versão não conhece passa intacto (para a próxima novidade)');

    console.log('visualizador');
    const pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await L.abrir();
    outros.push(v);
    await v.pagina.goto(srv.url + 'index.html?modo=leitura');
    await v.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v.pagina.waitForTimeout(400);
    await v.pagina.click('.tab[data-kind="banco"]');
    await v.pagina.waitForSelector('#nb2Table tbody tr');
    await v.pagina.evaluate((n) => NcrView.abrirFicha(n), NUM);
    await v.pagina.waitForSelector('#nbFicha-obsShipManager');
    const vis = await v.pagina.$eval('#nbFicha-obsShipManager', t => ({ v: t.value, ro: t.readOnly }));
    L.ok(vis.v === TEXTO && vis.ro, 'no visualizador: o texto à vista, só leitura');
  } finally {
    const errosOutros = [];
    outros.forEach(o => errosOutros.push.apply(errosOutros, o.erros.filter(e => !/404|Failed to load resource/.test(e))));
    const f = L.resultado('Obs Ship Manager', s.erros.concat(errosOutros));
    for (const o of outros) await o.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
