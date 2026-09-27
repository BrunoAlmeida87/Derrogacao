/* Navegação: a ordem e os nomes das áreas, as cores, o teclado, e o seletor
   global de relatório só onde ele manda no que está na tela. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);

    console.log('ordem e nomes');
    const abas = await pg.$$eval('.tab', ts => ts.filter(t => !t.hidden).map(t => ({
      kind: t.dataset.kind, nome: t.childNodes[0].textContent.trim()
    })));
    L.igual(abas.map(a => a.nome), ['Banco NCR', 'Kanban', 'Tabela', 'Waiver NCR', 'Waiver DEV', 'Resumo', 'Fluxos'],
      'as áreas na ordem pedida, com "Waiver NCR" e "Waiver DEV"');
    L.igual(abas.map(a => a.kind), ['banco', 'kanban', 'tabela', 'ncr', 'dev', 'resumo', 'fluxos'],
      'as chaves internas continuam "ncr" e "dev"');
    L.igual(await pg.getAttribute('.tabs', 'aria-label'), 'Áreas do programa', 'a faixa de abas diz o que é');

    console.log('cores (sutis, e não só cor)');
    const cores = await pg.$$eval('.tab', ts => ts.filter(t => !t.hidden).map(t => getComputedStyle(t, '::before').backgroundColor));
    L.ok(new Set(cores).size === cores.length, 'cada área tem um ponto de cor diferente: ' + cores.join(' '));
    const ativa = await pg.$eval('.tab[aria-selected="true"]', t => ({
      kind: t.dataset.kind, barra: getComputedStyle(t).borderBottomWidth, fundo: getComputedStyle(t).backgroundColor
    }));
    L.igual(ativa.kind, 'ncr', 'abre na aba Waiver NCR, como antes');
    L.ok(ativa.barra === '3px' && ativa.fundo !== 'rgba(0, 0, 0, 0)', 'a aba aberta tem barra e fundo, além da cor');

    console.log('teclado');
    await pg.focus('#tabNcr');
    await pg.keyboard.press('ArrowRight');
    L.igual(await pg.evaluate(() => document.activeElement.dataset.kind), 'dev', 'seta para a direita: Waiver DEV');
    await pg.keyboard.press('End');
    L.igual(await pg.evaluate(() => document.activeElement.dataset.kind), 'fluxos', 'End: a última aba à vista (a Conversa escondida não entra)');
    await pg.keyboard.press('ArrowRight');
    L.igual(await pg.evaluate(() => document.activeElement.dataset.kind), 'banco', 'da última, a seta volta à primeira');
    await pg.keyboard.press('Home');
    L.igual(await pg.evaluate(() => document.body.dataset.kind), 'banco', 'Home: Banco NCR, e a área aberta segue o foco');
    L.igual(await pg.$$eval('.tab[tabindex="0"]', ts => ts.length), 1, 'um ponto só da faixa na ordem do Tab');

    console.log('seletor global de relatório');
    const visivel = async () => pg.evaluate(() => {
      const c = document.getElementById('relatorioCampo'); const m = document.getElementById('marcoCampo');
      return { rel: !c.hidden && c.offsetParent !== null, marco: !m.hidden && m.offsetParent !== null,
        desab: document.getElementById('projectSelect').disabled };
    });
    for (const k of ['banco', 'kanban', 'tabela', 'resumo']) {
      await pg.click('.tab[data-kind="' + k + '"]');
      const v = await visivel();
      L.ok(!v.rel && !v.marco, k + ': sem o seletor de relatório nem o campo Marco (não mudam nada ali)');
    }
    for (const k of ['ncr', 'dev']) {
      await pg.click('.tab[data-kind="' + k + '"]');
      const v = await visivel();
      L.ok(v.rel && v.marco && !v.desab, k + ': seletor e Marco à vista e funcionando');
    }
    await pg.click('.tab[data-kind="fluxos"]');
    let v = await visivel();
    L.ok(v.rel && !v.desab && !v.marco, 'Fluxos, "este relatório": o seletor vale e funciona');
    await pg.click('.fx-vistas--escopo .fx-vista:nth-of-type(2)');
    v = await visivel();
    const nota = await pg.textContent('#relatorioNota');
    L.ok(v.rel && v.desab && /não se aplica/.test(nota), 'Fluxos, "todos os marcos": desabilitado e dizendo por quê');
    await pg.click('.tab[data-kind="kanban"]');
    L.igual(await pg.textContent('#pdfBtn'), 'PDF dos relatórios…', 'o botão de cima diz de quem é o PDF nas abas com exportação própria');
  } finally {
    const f = L.resultado('navegação', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
