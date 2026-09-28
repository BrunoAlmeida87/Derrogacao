/* Abertura no marco da vez (Config.MARCO_INICIAL, hoje J09): a comparação
   tolerante, a preferência sobre o "mais recente", a regra de antes quando
   ele não existe — sem criar relatório nenhum —, e o mesmo no visualizador.
   E a aba: o editor e o visualizador abrem no Banco NCR (Config.ABA_INICIAL). */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  let vis = null;
  try {
    await L.semear(pg, srv.url, { naAbertura: true });

    console.log('a aba em que o editor abre');
    L.igual(await pg.$eval('.tab[aria-selected="true"]', t => t.dataset.kind), 'banco', 'o editor abre no Banco NCR');
    L.ok(await pg.$$eval('#nb2Table tbody tr', r => r.length) > 0, 'e a tabela do banco já está montada');

    console.log('comparação do marco');
    const casos = await pg.evaluate(() => {
      const t = ['J09', 'j09', ' J 09 ', 'J9', 'j 9', 'RANAE J09', 'ranae j9',
        'J09 Ind', 'J09Cer', 'J19', 'J090', 'J10', 'J0', 'RANAE J06', 'J09 (J10Cer)', ''];
      const o = {};
      t.forEach(x => { o[x] = Config.ehMarco(x, 'J09'); });
      return { o: o, marco: Config.MARCO_INICIAL };
    });
    L.igual(casos.marco, 'J09', 'o marco da vez está num lugar só (Config.MARCO_INICIAL)');
    ['J09', 'j09', ' J 09 ', 'J9', 'j 9'].forEach(x => L.igual(casos.o[x], 2, '"' + x + '" é o J09'));
    ['RANAE J09', 'ranae j9'].forEach(x => L.igual(casos.o[x], 1, '"' + x + '" é o J09 (o prefixo da equipe), com prioridade menor'));
    ['J09 Ind', 'J09Cer', 'J19', 'J090', 'J10', 'J0', 'RANAE J06', 'J09 (J10Cer)', ''].forEach(x =>
      L.igual(casos.o[x], 0, '"' + x + '" não é o J09'));

    console.log('editor');
    const aberto = await pg.evaluate(() => document.getElementById('projectSelect').selectedOptions[0].textContent);
    L.ok(/^J09 \(/.test(aberto), 'abre no J09 mesmo com o J10 gravado depois: ' + aberto);
    const maisRecente = await pg.evaluate(async () => (await Store.list())[0].marco);
    L.igual(maisRecente, 'J10', '(o mais recente deste navegador é o J10)');

    /* o Kanban e o Resumo nascem no mesmo marco */
    await pg.click('.tab[data-kind="kanban"]');
    L.igual(await pg.textContent('.kb-marco'), 'J09', 'o Kanban abre no J09');
    await pg.click('.tab[data-kind="resumo"]');
    L.igual(await pg.getAttribute('.sm-marcos .tb-chip[aria-pressed="true"] .tb-chip-nome', 'class'), 'tb-chip-nome', 'o Resumo tem um marco escolhido');
    L.ok(/^J09/.test(await pg.textContent('.sm-marcos .tb-chip[aria-pressed="true"] .tb-chip-nome')), 'o Resumo abre no J09');

    console.log('sem o J09: a regra de antes, sem criar nada');
    await L.semear(pg, srv.url, { semJ09: true });
    const semJ09 = await pg.evaluate(async () => ({
      aberto: document.getElementById('projectSelect').selectedOptions[0].textContent,
      marcos: (await Store.list()).map(p => p.marco).sort()
    }));
    L.ok(/^J10 \(/.test(semJ09.aberto), 'sem J09, abre o mais recente (J10): ' + semJ09.aberto);
    L.igual(semJ09.marcos, ['J06', 'J08', 'J09 Ind', 'J10'], 'nenhum relatório criado para cumprir a regra — e o "J09 Ind" não foi escolhido');
    await pg.click('.tab[data-kind="resumo"]');
    L.igual(await pg.getAttribute('.sm-marcos .tb-chip[data-marco=""]', 'aria-pressed'), 'true', 'sem J09, o Resumo abre em "Todos os marcos"');

    console.log('visualizador');
    await L.semear(pg, srv.url);
    const pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    vis = await L.abrir();
    await vis.pagina.goto(srv.url + 'index.html?modo=leitura');
    await vis.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    const v = await vis.pagina.evaluate(() => document.getElementById('projectSelect').selectedOptions[0].textContent);
    L.ok(/^J09 \(/.test(v), 'o visualizador abre no J09: ' + v);
    L.igual(await vis.pagina.$eval('.tab[aria-selected="true"]', t => t.dataset.kind), 'banco',
      'e o visualizador também abre no Banco NCR');
    L.ok(await vis.pagina.$$eval('#nb2Table tbody tr', r => r.length) > 0, 'com a tabela do banco publicado já montada');
    L.ok(await vis.pagina.$$eval('#nb2Table .nb2-dd, #nb2Table .nb2-txt, #nb2Table select', x => x.length) === 0,
      'e sem nada que edite');
  } finally {
    const f = L.resultado('abertura no marco da vez', s.erros.concat(vis ? vis.erros : []));
    if (vis) await vis.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
