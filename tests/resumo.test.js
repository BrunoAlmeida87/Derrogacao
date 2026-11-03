/* Resumo: os mini cards de marco no lugar do dropdown — "Todos os marcos" e
   um por marco, na fila dos marcos; a troca entre o geral e um marco (clique
   e teclado) recalculando números e gráficos; os outros filtros juntos; o
   CSV e o PDF do escopo; e o backup do marco inteiro, sem recorte. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('.tab[data-kind="resumo"]');
    await pg.waitForSelector('.sm-marcos');
    const kpis = () => pg.$$eval('.sm-kpi-value', v => v.map(x => Number(x.textContent)));
    const escolhido = () => pg.$eval('.sm-marcos .tb-chip[aria-pressed="true"] .tb-chip-nome', e => e.textContent.replace(/^✓\s*/, ''));

    console.log('os mini cards');
    L.igual(await pg.$$eval('#summaryScroll select', ss => ss.filter(x => /marco/i.test(x.closest('.sm-bar-field') ? x.closest('.sm-bar-field').textContent : '')).length), 0,
      'o dropdown de marco não existe mais');
    const nomes = await pg.$$eval('.sm-marcos .tb-chip .tb-chip-nome', ns => ns.map(n => n.textContent));
    L.igual(nomes, ['Todos os marcos', 'J06', 'J08', 'J09', 'J09 Ind', 'J10'], '"Todos os marcos" e um por marco, na fila dos marcos');
    const j09 = await pg.$eval('.sm-marcos .tb-chip[aria-pressed="true"]', b => ({
      l1: b.querySelector('.tb-chip-l1').textContent, sub: b.querySelector('.tb-chip-sub').textContent,
      aria: b.getAttribute('aria-label'), classe: b.className
    }));
    L.ok(/J09\s*19/.test(j09.l1) && /aceitos/.test(j09.sub) && /16 NCR · 3 DEV/.test(j09.sub),
      'cada card: nome, total, aceitos (e NCR/DEV): ' + j09.l1 + ' | ' + j09.sub);
    L.ok(/tb-chip/.test(j09.classe), 'é a mesma pastilha (tb-chip) do Kanban e da Tabela');
    L.igual(await escolhido(), 'J09', 'abre no J09 (a regra da abertura)');
    L.ok(await pg.$eval('.sm-marcos .tb-chip[aria-pressed="true"] .tb-chip-nome', e => getComputedStyle(e, '::before').content.indexOf('✓') >= 0),
      'o escolhido tem ✓, não só cor');
    L.ok(/Marco J09/.test(await pg.textContent('.sm-escopo')), 'a barra diz o escopo: Marco J09');

    console.log('geral × um marco');
    const kJ09 = await kpis();
    L.igual(kJ09[0], 19, 'J09: 19 itens');
    await pg.click('.sm-marcos .tb-chip[data-marco=""]');
    const kTodos = await kpis();
    L.igual(kTodos[0], 64, 'Todos os marcos: 64 itens');
    L.igual(await escolhido(), 'Todos os marcos', '"Todos os marcos" escolhido');
    L.ok(/Todos os marcos/.test(await pg.textContent('.sm-escopo')), 'a barra diz: Todos os marcos');
    L.igual(await pg.$$eval('.sm-card .sm-svg', s => s.length) >= 3, true, 'os gráficos do consolidado estão lá');
    const barras = await pg.$$eval('.sm-card:first-of-type .sm-axis-label', ts => ts.map(t => t.textContent));
    L.ok(barras.length >= 5, 'o gráfico de progresso tem uma barra por marco: ' + barras.join(', '));
    L.igual(await pg.evaluate(() => document.activeElement.textContent.indexOf('Todos os marcos') >= 0), true, 'o foco fica no card escolhido');

    console.log('teclado');
    await pg.focus('.sm-marcos .tb-chip[data-marco]:not([data-marco=""]) ');
    await pg.keyboard.press('Tab');     /* do J06 para o J08 */
    await pg.keyboard.press('Enter');
    L.igual(await escolhido(), 'J08', 'Tab + Enter escolhe o J08');
    L.igual((await kpis())[0], 10, 'J08: 10 itens');
    await pg.keyboard.press('Shift+Tab');
    await pg.keyboard.press('Space');
    L.igual(await escolhido(), 'J06', 'Shift+Tab + Espaço escolhe o J06');
    L.ok(await pg.$$eval('.sm-marcos .tb-chip', bs => bs.filter(b => b.getAttribute('aria-pressed') === 'true').length === 1), 'um só marcado (aria-pressed)');

    console.log('com os outros filtros');
    await pg.click('.sm-marcos .tb-chip[data-marco=""]');
    await pg.selectOption('.sm-filtros .sm-bar-field:nth-child(2) select', 'Waiver accepted');
    const kAceitos = await kpis();
    L.igual(kAceitos[0], kTodos[1], 'Todos + situação "Waiver accepted": só os aceitos (' + kAceitos[0] + ')');
    const cardJ09 = await pg.$eval('.sm-marcos .tb-chip[data-marco]:nth-of-type(4) .tb-chip-n', n => n.textContent);
    await pg.click('.sm-marcos .tb-chip:nth-of-type(4)');
    L.igual(await escolhido(), 'J09', 'troca para o J09 sem perder o filtro');
    L.igual(await pg.$eval('.sm-filtros .sm-bar-field:nth-child(2) select', x => x.value), 'Waiver accepted', 'o filtro de situação continua');
    L.igual(String((await kpis())[0]), cardJ09, 'J09 + aceitos: o número do card é o dos indicadores (' + cardJ09 + ')');

    console.log('CSV e PDF do escopo');
    let csv = await L.baixar(pg, () => pg.click('.sm-bar-actions .btn:nth-child(2)'));
    let linhas = csv.buffer.toString('utf8').trim().split('\n');
    L.ok(/J09/.test(csv.nome) && linhas.length === 1 + Number(cardJ09) && linhas.slice(1).every(l => l.indexOf('"J09"') === 0),
      'CSV do J09 com o filtro: ' + (linhas.length - 1) + ' linha(s), todas do J09');
    await pg.click('.sm-marcos .tb-chip[data-marco=""]');
    csv = await L.baixar(pg, () => pg.click('.sm-bar-actions .btn:nth-child(2)'));
    linhas = csv.buffer.toString('utf8').trim().split('\n');
    L.ok(/todos_os_marcos/.test(csv.nome) && linhas.length === 1 + kAceitos[0], 'CSV de todos os marcos com o filtro: ' + (linhas.length - 1) + ' linha(s)');
    L.ok(csv.buffer.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'CSV com BOM (acentos no Excel)');
    await pg.click('.sm-bar-actions .btn:nth-child(1)');
    let titulo = await pg.textContent('#printRoot .rep-cover-title');
    L.ok(/todos os marcos/.test(titulo) && /Recorte:/.test(await pg.textContent('#printRoot')), 'PDF geral, dizendo o recorte: ' + titulo);
    await pg.click('.sm-marcos .tb-chip:nth-of-type(4)');
    await pg.click('.sm-bar-actions .btn:nth-child(1)');
    titulo = await pg.textContent('#printRoot .rep-cover-title');
    L.ok(/J09/.test(titulo), 'PDF do J09: ' + titulo);
    const pdf = await L.pdfDaImpressao(pg, 'resumo-j09.pdf');
    L.ok(pdf.paginas >= 1 && pdf.tamanhos[0][0] === 210, 'o resumo em PDF continua A4 (' + pdf.paginas + ' folha(s))');

    console.log('backup do marco: sempre inteiro');
    const bk = await L.baixar(pg, () => pg.click('.sm-bar-actions .btn:nth-child(3)'));
    const dados = JSON.parse(bk.buffer.toString('utf8'));
    const p = (dados.projects || [dados.project])[0];
    L.ok(p && p.marco === 'J09' && p.ncrs.length === 16 && p.devs.length === 3, 'o backup do J09 leva os 19 itens, apesar do filtro');
  } finally {
    const f = L.resultado('Resumo', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
