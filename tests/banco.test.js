/* Banco NCR: linhas alternadas (zebra) e separadores mais fortes, que
   continuam certos depois de filtrar, ordenar e editar uma linha; e os
   estados (passar o mouse, foco, linha presa, fechada em destaque) acima
   das duas cores. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const fundos = () => pg.$$eval('#nb2Table tbody tr', trs => trs.map(tr => getComputedStyle(tr.querySelector('td')).backgroundColor));
    const alterna = (f) => f.length > 3 && f.every((c, i) => i < 1 || (c !== f[i - 1]));
    const zebra = (f) => {
      const imp = f.filter((c, i) => i % 2 === 0), par = f.filter((c, i) => i % 2 === 1);
      return new Set(imp).size === 1 && new Set(par).size === 1 && imp[0] !== par[0];
    };

    console.log('zebra');
    let f = await fundos();
    L.ok(zebra(f) && alterna(f), 'linhas alternadas em dois tons: ' + f.slice(0, 2).join(' / '));
    const borda = await pg.$eval('#nb2Table tbody td', td => getComputedStyle(td).borderBottomColor);
    L.ok(borda !== 'rgb(236, 238, 242)', 'o separador ficou mais forte que antes (' + borda + ')');
    const alinhado = await pg.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('#nb2Table thead th'));
      const tds = Array.from(document.querySelector('#nb2Table tbody tr').children);
      return ths.every((th, i) => Math.abs(th.getBoundingClientRect().left - tds[i].getBoundingClientRect().left) < 1);
    });
    L.ok(alinhado, 'cabeçalho e colunas alinhados');

    console.log('continua certa depois de filtrar e ordenar');
    await pg.fill('#nbBusca', 'Pressure');
    await pg.waitForTimeout(500);
    f = await fundos();
    L.ok(f.length > 3 && zebra(f), 'filtrado (' + f.length + ' linhas): continua alternando');
    await pg.click('#nb2Table thead th:nth-child(1) .nb2-sort');
    await pg.waitForTimeout(200);
    f = await fundos();
    L.ok(zebra(f), 'reordenado: continua alternando');

    console.log('estados acima da zebra');
    await pg.hover('#nb2Table tbody tr:nth-child(2) td:nth-child(3)');
    const hover = await pg.$eval('#nb2Table tbody tr:nth-child(2) td', td => getComputedStyle(td).backgroundColor);
    L.ok(f.indexOf(hover) < 0, 'passar o mouse tem cor própria (' + hover + ')');
    await pg.mouse.move(0, 0);
    await pg.focus('#nb2Table tbody tr:nth-child(3) .nb2-num');
    const foco = await pg.$eval('#nb2Table tbody tr:nth-child(3) td', td => ({ bg: getComputedStyle(td).backgroundColor, barra: getComputedStyle(td).boxShadow }));
    L.ok(f.indexOf(foco.bg) < 0 && /inset/.test(foco.barra), 'a linha com o foco do teclado se destaca (fundo e barra)');
    await pg.click('.nb2-toggle--fechadas');
    const fechada = await pg.$$eval('#nb2Table tbody tr.is-fechada td:first-child', tds => tds.map(td => getComputedStyle(td).backgroundColor));
    L.ok(fechada.length && fechada.every(c => /^rgb\(2(5[0-5]|4\d), 2\d\d, 2\d\d\)$/.test(c) && f.indexOf(c) < 0), 'fechadas em destaque ficam vermelhas, em linha par ou ímpar');

    console.log('editar uma linha não desarruma a alternância');
    await pg.click('.nb2-toggle--fechadas');           /* desliga o destaque */
    await pg.fill('#nbBusca', '');
    await pg.waitForTimeout(400);
    /* filtro "Marco Atual = J08"; a linha editada para J10 sai do filtro e
       fica à vista, marcada, até o filtro mudar */
    await pg.click('#nbF-marcoAtual');
    await pg.check('.nb2-ms-pop:not([hidden]) input[value="J08"]');
    await pg.click('.nb2-ms-pop:not([hidden]) .btn--primary');
    await pg.waitForTimeout(300);
    const n = await pg.$$eval('#nb2Table tbody tr', trs => trs.length);
    L.igual(n, 10, 'filtro Marco Atual = J08: 10 NCRs');
    const dd = '#nb2Table tbody tr:nth-child(2) td:nth-child(3) .nb2-dd';
    await pg.click(dd);
    await pg.selectOption('#nb2Table tbody tr:nth-child(2) td:nth-child(3) select', 'J10');
    await pg.waitForTimeout(500);
    await pg.mouse.move(0, 0);
    const presa = await pg.$eval('#nb2Table tbody tr:nth-child(2)', tr => ({ cls: tr.className, bg: getComputedStyle(tr.querySelector('td:nth-child(2)')).backgroundColor }));
    L.ok(/is-fixada/.test(presa.cls) && presa.bg === 'rgb(255, 248, 225)', 'a linha editada (fora do filtro agora) fica marcada em amarelo, por cima da zebra');
    const resto = await pg.$$eval('#nb2Table tbody tr', trs => trs.map(tr => tr.classList.contains('is-fixada') ? 'presa'
      : getComputedStyle(tr.querySelector('td')).backgroundColor));
    const imp = resto.filter((c, i) => i % 2 === 0 && c !== 'presa');
    const par = resto.filter((c, i) => i % 2 === 1 && c !== 'presa');
    L.ok(resto.length === 10 && new Set(imp).size === 1 && new Set(par).size === 1 && imp[0] !== par[0],
      'a tabela continua com as 10 linhas, as outras nos dois tons alternados');
  } finally {
    const f = L.resultado('Banco NCR', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
