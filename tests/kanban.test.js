/* Kanban: cartões compactos (descrição longa não estica o recolhido; abrir
   e fechar não grava nada), a área das encerradas em CEDOC Closure, as ações
   de sempre, e as duas exportações — a visual (A4/A3, retrato/paisagem) e a
   planilha, as duas respeitando o marco e os filtros. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir();
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('.tab[data-kind="kanban"]');
    await pg.waitForSelector('.kb-card');

    console.log('cartões compactos');
    const alturas = await pg.$$eval('.kb-quadro .kb-card', cs => cs.map(c => ({
      h: c.getBoundingClientRect().height,
      longa: /inspection of the compartment/.test(c.querySelector('.kb-desc') ? c.querySelector('.kb-desc').textContent : '')
    })));
    const maior = Math.max.apply(null, alturas.map(a => a.h));
    L.ok(alturas.length >= 30, 'muitos cartões no quadro: ' + alturas.length);
    L.ok(maior < 110, 'recolhido, nenhum cartão passa de 110 px (o maior: ' + Math.round(maior) + ' px)');
    const hLonga = alturas.filter(a => a.longa).map(a => a.h), hCurta = alturas.filter(a => !a.longa).map(a => a.h);
    L.ok(hLonga.length && Math.max.apply(null, hLonga) <= Math.max.apply(null, hCurta) + 1,
      'descrição longa não aumenta o cartão recolhido');
    L.ok(await pg.$$eval('.kb-quadro .kb-card-det', ds => ds.every(d => d.hidden)), 'a descrição nasce escondida');

    const alvo = '.kb-col[data-coluna="solicitado"] .kb-card:first-child';
    const antes = await pg.evaluate(async () => (await Store.list()).map(p => Store.signature ? p.ncrs.map(Store.signature).join('|') : '').join('#'));
    const colAntes = await pg.$eval(alvo, c => c.closest('.kb-col').dataset.coluna);
    await pg.click(alvo + ' .kb-card-mais');
    const aberto = await pg.$eval(alvo, c => ({
      exp: c.querySelector('.kb-card-mais').getAttribute('aria-expanded'),
      det: !c.querySelector('.kb-card-det').hidden,
      desc: c.querySelector('.kb-desc').textContent.length,
      rotulo: c.querySelector('.kb-card-mais').textContent
    }));
    L.ok(aberto.exp === 'true' && aberto.det && aberto.desc > 10 && aberto.rotulo === '−', 'o "+" abre a descrição (e vira "−", aria-expanded)');
    await pg.click(alvo + ' .kb-card-mais');
    L.igual(await pg.$eval(alvo + ' .kb-card-mais', b => b.getAttribute('aria-expanded')), 'false', 'o mesmo controle recolhe');
    const depois = await pg.evaluate(async () => (await Store.list()).map(p => p.ncrs.map(Store.signature).join('|')).join('#'));
    L.ok(antes === depois, 'abrir e fechar o cartão não muda dado nenhum');
    L.igual(await pg.$eval(alvo, c => c.closest('.kb-col').dataset.coluna), colAntes, 'nem a coluna do cartão');

    await pg.click('.kb-acoes .btn:first-child');
    L.ok(await pg.$$eval('.kb-quadro .kb-card-det', ds => ds.every(d => !d.hidden)), '"Abrir todos os cartões" abre todos');
    await pg.click('.kb-acoes .btn:first-child');
    L.ok(await pg.$$eval('.kb-quadro .kb-card-det', ds => ds.every(d => d.hidden)), 'e recolhe todos');

    console.log('ações de sempre');
    L.ok(await pg.$$eval('.kb-col:not(.kb-col--fora) .kb-card select.kb-sel', ss => ss.length) >= 16, 'a situação muda sem arrastar (o <select> de cada item)');
    L.ok(await pg.$$eval('.kb-card[data-tipo="banco"] .kb-card-acoes .btn', bs => bs.some(b => /\+ J09 Waiver/.test(b.textContent))), '"+ J09 Waiver" nas NCRs do banco');
    L.ok(await pg.$$eval('.kb-card[data-tipo="caminho"] .kb-card-acoes .btn', bs => bs.some(b => /Abrir no J08/.test(b.textContent))), '"Abrir no J08" nas que vêm de outro marco');
    L.ok(await pg.$$eval('.kb-card .kb-card-acoes .btn', bs => bs.filter(b => b.textContent === 'Ficha').length) >= 30, 'a Ficha em todas as que estão no banco');
    L.ok(await pg.$$eval('.kb-card[draggable="true"]', cs => cs.length) >= 16, 'e continuam arrastáveis');
    const sel = '.kb-col[data-coluna="preenchendo"] .kb-card:first-child select.kb-sel';
    const num = await pg.$eval('.kb-col[data-coluna="preenchendo"] .kb-card:first-child .kb-card-num', b => b.textContent);
    await pg.selectOption(sel, 'solicitado');
    await pg.waitForTimeout(400);
    const mudou = await pg.evaluate(async (n) => {
      const ps = await Store.list();
      for (const p of ps) for (const it of p.ncrs) if (it.ncrId === n && p.marco === 'J09') return it.status;
    }, num);
    L.igual(mudou, 'solicitado', 'mudar a situação pelo cartão grava no relatório (' + num + ')');

    console.log('encerradas em CEDOC Closure');
    const enc = await pg.evaluate(() => {
      const naColuna = Array.from(document.querySelectorAll('.kb-col--fora .kb-card')).map(c => c.querySelector('.kb-st-ncr') ? c.querySelector('.kb-st-ncr').title : '');
      return {
        naColuna: naColuna.filter(t => /cedoc closure/i.test(t)).length,
        cont: document.querySelector('#kbEncBtn .kb-col-n').textContent,
        aberta: document.getElementById('kbEncBtn').getAttribute('aria-expanded'),
        corpoEscondido: document.getElementById('kbEncCorpo').hidden,
        esperado: Kanban.cartoes('J09', []).length >= 0
      };
    });
    const esperado = await pg.evaluate(async () => {
      const ps = await Store.list();
      return Kanban.cartoes('J09', ps).filter(c => c.coluna === Kanban.ENCERRADA).length;
    });
    L.igual(enc.naColuna, 0, 'nenhuma NCR em CEDOC Closure na coluna "NCR to be closed"');
    L.ok(esperado > 0 && enc.cont === String(esperado), 'a área própria mostra a quantidade, mesmo recolhida: ' + enc.cont);
    L.ok(enc.aberta === 'false' && enc.corpoEscondido, 'nasce recolhida');
    await pg.click('#kbEncBtn');
    L.igual(await pg.$$eval('#kbEncCorpo .kb-card', cs => cs.length), esperado, 'aberta, mostra as ' + esperado + ' encerradas');
    L.ok(await pg.$$eval('#kbEncCorpo .kb-st-ncr', cs => cs.every(c => /CEDOC Closure/.test(c.textContent) && c.classList.contains('is-ok'))), 'todas marcadas como encerradas (✓, verde)');
    L.ok(/encerrada/.test(await pg.textContent('.kb-col--fora .kb-col-enc')), 'a coluna "to be closed" avisa que as encerradas estão abaixo');

    console.log('filtros valem para tudo, inclusive a área de baixo');
    await pg.fill('#kbBusca', 'Pressure');
    await pg.waitForTimeout(500);
    const filtrado = await pg.evaluate(() => ({
      cartoes: document.querySelectorAll('.kb-card').length,
      enc: document.querySelector('#kbEncBtn .kb-col-n').textContent
    }));
    L.ok(filtrado.cartoes > 0 && filtrado.cartoes < 30, 'a busca recorta o quadro: ' + filtrado.cartoes + ' cartões');
    L.ok(/\//.test(filtrado.enc) || filtrado.enc === '0', 'a área das encerradas diz quantas passam no filtro: ' + filtrado.enc);

    console.log('planilha (.xlsx)');
    const visiveis = await pg.$$eval('.kb-card .kb-card-num', bs => bs.map(b => b.textContent));
    const xl = await L.baixar(pg, () => pg.click('.kb-exporta .btn:nth-child(2)'));
    const bruto = xl.buffer.toString('utf8');
    L.ok(xl.nome.endsWith('.xlsx') && xl.buffer.slice(0, 2).toString() === 'PK', 'um .xlsx de verdade: ' + xl.nome);
    L.ok(visiveis.every(n => bruto.indexOf(n) >= 0), 'uma linha por NCR à vista (' + visiveis.length + ')');
    const fora = await pg.evaluate(async () => {
      const ps = await Store.list();
      return Kanban.cartoes('J09', ps).map(c => c.item ? c.item.ncrId : c.rec.numero);
    });
    const naoVisiveis = fora.filter(n => visiveis.indexOf(n) < 0);
    L.ok(naoVisiveis.length > 0 && naoVisiveis.every(n => bruto.indexOf(n) < 0), 'e só elas: o filtro vale na planilha');
    ['Número da NCR', 'Marco', 'Sistema', 'Função / função vital', 'Coluna do Kanban', 'Descrição',
     'Última alteração por', 'Última alteração em', 'Recorte', 'busca: “Pressure”', 'Coluna do Kanban'].forEach(t =>
      L.ok(bruto.indexOf(t) >= 0, 'a planilha traz "' + t + '"'));
    L.ok(bruto.indexOf('Situação do waiver') >= 0 && bruto.indexOf('ã') >= 0, 'acentos preservados (UTF-8)');
    await pg.fill('#kbBusca', '');
    await pg.waitForTimeout(400);

    console.log('exportação visual');
    const variantes = [['A4', 'paisagem', 297, 210], ['A4', 'retrato', 210, 297], ['A3', 'paisagem', 420, 297], ['A3', 'retrato', 297, 420]];
    for (const v of variantes) {
      await pg.click('.kb-exporta .btn:first-child');
      await pg.check('input[name="kbPapel"][value="' + v[0] + '"]');
      await pg.check('input[name="kbOrient"][value="' + v[1] + '"]');
      const previa = await pg.textContent('#kbImpPrevia');
      await pg.click('#kbExportDialog .btn--primary');
      await pg.waitForTimeout(300);
      const folha = await pg.evaluate(() => {
        const f = document.querySelector('#printRoot .rep-page--kanban');
        return f ? { cab: f.querySelector('.kbp-cab').textContent, cols: f.querySelectorAll('.kbp-col').length,
          n: document.querySelectorAll('#printRoot .rep-page').length } : null;
      });
      const pdf = await L.pdfDaImpressao(pg, 'kanban-' + v[0] + '-' + v[1] + '.pdf');
      const nPrevia = Number((/(\d+) folha/.exec(previa) || [])[1]);
      L.ok(folha && folha.cols === 5, v[0] + ' ' + v[1] + ': as cinco colunas na folha');
      L.ok(pdf.tamanhos.every(t => t[0] === v[2] && t[1] === v[3]), v[0] + ' ' + v[1] + ': papel ' + v[2] + '×' + v[3] + ' mm (' + JSON.stringify(pdf.tamanhos[0]) + ')');
      L.igual(pdf.paginas, nPrevia, v[0] + ' ' + v[1] + ': a prévia acerta o número de folhas (' + pdf.paginas + ')');
      L.ok(/J09/.test(folha.cab) && /Filtros:/.test(folha.cab) && /Gerado em \d{2}\/\d{2}\/\d{4}/.test(folha.cab),
        v[0] + ' ' + v[1] + ': a folha diz o marco, os filtros e a data e hora');
    }
    /* filtro na folha */
    await pg.click('.kb-toggle--alerta');
    await pg.click('.kb-exporta .btn:first-child');
    await pg.click('#kbExportDialog .btn--primary');
    await pg.waitForTimeout(300);
    const soAlerta = await pg.evaluate(() => ({
      cab: document.querySelector('#printRoot .kbp-cab').textContent,
      cards: document.querySelectorAll('#printRoot .kbp-card').length,
      alerta: document.querySelectorAll('#printRoot .kbp-card.is-alerta').length
    }));
    L.ok(/só com alerta/.test(soAlerta.cab) && soAlerta.cards > 0 && soAlerta.cards === soAlerta.alerta,
      'com "Só com alerta" ligado, a folha só traz as NCRs com alerta — e diz isso');
    /* caber numa folha só */
    await pg.click('.kb-toggle--alerta');
    await pg.click('.kb-exporta .btn:first-child');
    await pg.check('input[name="kbPapel"][value="A3"]');
    await pg.check('input[name="kbOrient"][value="paisagem"]');
    await pg.check('input[name="kbEscala"][value="uma"]');
    const uma = await pg.textContent('#kbImpPrevia');
    await pg.click('#kbExportDialog .btn--primary');
    const pdfUma = await L.pdfDaImpressao(pg, 'kanban-uma-folha.pdf');
    L.ok(pdfUma.paginas === 1 && /1 folha /.test(uma), '"Caber numa folha só": uma folha A3 (' + uma + ')');
    /* a janela de impressão abre 60 ms depois de montar as folhas */
    const abriu = await pg.waitForFunction(() => window.__impressoes >= 6, null, { timeout: 5000 }).then(() => true, () => false);
    L.ok(abriu, 'cada "Gerar PDF" abriu a janela de impressão');
  } finally {
    const f = L.resultado('Kanban', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
