/* A aba Resumo de 16/10: a largura toda (trilho estreito, gráficos dois a
   dois), os dois gráficos novos — Função vital × situação e Para onde vai o
   waiver —, e cada gráfico e tabela levado embora: PNG em alta resolução,
   SVG e, para as tabelas, Excel com a aba "Recorte". E o PDF do resumo com
   os gráficos novos. */
'use strict';
const L = require('./lib');

/* largura e altura de um PNG, lidas do cabeçalho IHDR */
function tamanhoPng(buf) {
  return { larg: buf.readUInt32BE(16), alt: buf.readUInt32BE(20), png: buf.slice(1, 4).toString() === 'PNG' };
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ viewport: { width: 1600, height: 1000 } });
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('.tab[data-kind="resumo"]');
    await pg.waitForSelector('#summaryScroll .sm-card');

    console.log('mais espaço');
    const lay = await pg.evaluate(() => {
      const side = document.querySelector('.sidebar').getBoundingClientRect().width;
      const cards = [...document.querySelectorAll('#summaryScroll .sm-graficos > .sm-card')].map(c => c.getBoundingClientRect());
      const sc = document.getElementById('summaryScroll').getBoundingClientRect();
      return { side, n: cards.length, lado: cards.length > 1 && Math.abs(cards[0].top - cards[1].top) < 2,
        larg: cards[0].width, area: sc.width };
    });
    L.ok(lay.side <= 120, 'a lateral vira o trilho estreito (' + Math.round(lay.side) + ' px)');
    L.ok(lay.n === 5, 'cinco gráficos (os três de antes e os dois novos)');
    L.ok(lay.lado, 'em tela larga, os gráficos ficam dois a dois');
    L.ok(lay.larg * 2 > lay.area - 60, 'e ocupam a largura toda (sem o teto de 980 px)');

    console.log('Função vital × situação');
    const titulos = await pg.$$eval('#summaryScroll .sm-card-head h3', h => h.map(x => x.textContent));
    L.ok(titulos.indexOf('Função vital × situação') >= 0 && titulos.indexOf('Para onde vai o waiver') >= 0, 'os dois gráficos novos estão na tela');
    const esperado = await pg.evaluate(async () => {
      const ps = await Store.list();
      const j09 = ps.filter(p => p.marco === 'J09')[0];
      const st = Summary.statsDe(j09, {});
      const df = SummaryView.dadosFuncao(st);
      const dd = SummaryView.dadosDestino(st, 'J09');
      const soma = (ls) => ls.reduce((a, l) => a + l.valores.reduce((x, y) => x + y, 0), 0);
      return { total: st.total, fv: soma(df.linhas), dest: soma(dd.linhas), rotFv: df.linhas.map(l => l.rotulo),
        rotDest: dd.linhas.map(l => l.rotulo) };
    });
    L.ok(esperado.fv === esperado.total && esperado.dest === esperado.total,
      'cada item conta uma vez em cada gráfico (' + esperado.total + ' itens do J09)');
    L.ok(/^FV03 · /.test(esperado.rotFv[0]) && esperado.rotFv[esperado.rotFv.length - 1] === 'Sem função vital',
      'função vital na ordem do número, "Sem função vital" (as DEVs) no fim');
    L.ok(esperado.rotDest[esperado.rotDest.length - 1] === 'Sem destino' && esperado.rotDest.every(r => !/object/.test(r)),
      'destino pelo marco escrito ("Sem destino" no fim): ' + esperado.rotDest.join(', '));
    await pg.selectOption('#summaryScroll .sm-filtros select >> nth=0', 'dev');
    await pg.waitForTimeout(300);
    const soDev = await pg.evaluate(() => [...document.querySelectorAll('#summaryScroll .sm-card')]
      .filter(c => /Função vital/.test(c.querySelector('h3').textContent))[0].querySelectorAll('svg text.sm-axis-label').length);
    L.igual(soDev, 1, 'o filtro vale para o gráfico novo (só DEV: só "Sem função vital")');
    await pg.selectOption('#summaryScroll .sm-filtros select >> nth=0', '');
    await pg.waitForTimeout(300);

    console.log('levar embora: gráfico');
    const cardFv = '#summaryScroll .sm-card:has(h3:text-is("Função vital × situação"))';
    L.ok(await pg.isVisible(cardFv + ' .sm-card-acoes'), 'o gráfico tem os botões de exportar');
    const png = await L.baixar(pg, () => pg.click(cardFv + ' .sm-exp:text("PNG")'));
    const t = tamanhoPng(png.buffer);
    L.ok(t.png && t.larg >= 3000, 'PNG em alta resolução: ' + t.larg + '×' + t.alt + ' px');
    L.ok(/^resumo_marco-j09_funcao-vital-situacao_\d{4}-\d\d-\d\d\.png$/.test(png.nome), 'nome do arquivo diz o marco e o gráfico: ' + png.nome);
    const svg = await L.baixar(pg, () => pg.click(cardFv + ' .sm-exp:text("SVG")'));
    const txt = svg.buffer.toString('utf8');
    L.ok(/<svg[^>]+viewBox/.test(txt) && txt.indexOf('Função vital × situação') >= 0 && txt.indexOf('Waiver accepted') >= 0,
      'o SVG tem o título, o gráfico e a legenda');
    L.ok(!/class="sm-/.test(txt) && /font-family/.test(txt), 'com as fontes e as cores por extenso (não depende do programa)');
    L.ok(txt.indexOf('Marco J09') >= 0, 'e o rodapé diz de onde veio');

    console.log('levar embora: tabela');
    await pg.click('.tb-chip--card');   /* Todos os marcos: a tabela "Marcos" */
    await pg.waitForTimeout(400);
    const cardTab = '#summaryScroll .sm-card:has(h3:text-is("Marcos"))';
    const pngT = await L.baixar(pg, () => pg.click(cardTab + ' .sm-exp:text("PNG")'));
    const tt = tamanhoPng(pngT.buffer);
    L.ok(tt.png && tt.larg >= 3000, 'a tabela em PNG de alta resolução: ' + tt.larg + '×' + tt.alt + ' px');
    const xl = await L.baixar(pg, () => pg.click(cardTab + ' .sm-exp:text("Excel")'));
    const bruto = xl.buffer.toString('latin1');
    L.ok(/^PK/.test(bruto) && /\.xlsx$/.test(xl.nome), 'a tabela em .xlsx: ' + xl.nome);
    L.ok(bruto.indexOf('Recorte') >= 0 && bruto.indexOf('J09 Ind') >= 0, 'com as linhas e a aba "Recorte"');
    L.ok(/<c r="B2"><v>\d+<\/v><\/c>/.test(bruto), 'número como número (o Excel soma)');

    console.log('o resumo em PDF');
    await pg.click('.sm-bar-actions .btn--primary');
    await pg.waitForTimeout(500);
    const pdf = await L.pdfDaImpressao(pg, 'resumo-geral-graficos-novos.pdf');
    const temNovos = await pg.evaluate(() => {
      const t = document.getElementById('printRoot').textContent;
      return t.indexOf('Função vital × situação') >= 0 && t.indexOf('Para onde vai o waiver') >= 0;
    });
    L.ok(temNovos, 'o resumo em PDF tem os dois gráficos novos');
    L.ok(pdf.paginas >= 1 && pdf.tamanhos.every(c => c[0] === 210 && c[1] === 297), 'em A4 retrato (' + pdf.paginas + ' folha(s))');

    console.log('visualizador');
    const pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await s.contexto.newPage();
    await v.goto(srv.url + 'index.html?modo=leitura');
    await v.waitForFunction(() => document.querySelector('.tab[data-kind="resumo"]'), null, { timeout: 15000 });
    await v.waitForTimeout(1500);
    await v.click('.tab[data-kind="resumo"]');
    await v.waitForSelector('#summaryScroll .sm-card-acoes');
    L.ok(await v.isVisible('#summaryScroll .sm-card-acoes .sm-exp'), 'no visualizador os botões de exportar também aparecem (só baixam)');
    await v.close();
  } catch (e) {
    L.ok(false, 'exceção: ' + (e && e.stack || e));
  } finally {
    await s.navegador.close();
    srv.fechar();
  }
  process.exitCode = L.resultado('resumo-imagens', s.erros) ? 1 : 0;
})();
