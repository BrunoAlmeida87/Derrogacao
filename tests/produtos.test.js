/* Banco de produtos: a planilha de produtos (Product Mark, Functional Mark,
   Designation, Safety Milestones, Vital Functions #) importada pela aba
   Produtos, a aba (busca, filtros, mapa, ficha do produto), o bloco de
   produtos na ficha da NCR — com o casamento aproximado (BH00004M5 na NCR,
   BH00004M no banco) —, o N/A para o produto sem marco e sem função vital, a
   pasta, o backup, a publicação e o visualizador. */
'use strict';
const L = require('./lib');
const fs = require('fs');

/* a planilha, como o Bruno a descreveu: cinco colunas, vários valores por ";" */
const CABECALHO = ['Product Mark', 'Functional Mark', 'Designation', 'Safety Milestones', 'Vital Functions #'];
const LINHAS = [
  ['P0100001', 'BC22714F', 'BATTERY CHARGING EXTERNAL SUPPLY CABLE EB+', 'J05;J07', 20],
  ['P0100002', 'BH20700', 'SEA WATER VENTING HOSE', 'J06', 1],
  ['P0100003', 'BH00080', 'MUFFLER', '', ''],
  ['P0100004', 'BH00004M', 'VALVE WITH SUFFIX M', 'J06;J09', '2;10'],
  ['P0100005', 'BH00004', 'VALVE BASE', 'J06', 2],
  ['P0100006', 'BH00037A', 'PLUG ON VALVE BH00037', 'J01;J03', 24],
  ['P0100007', 'BH10001P', 'AIR MAST PRESSURE GAUGE', 'J01;J03', 24],
  ['P0100008', 'DA12524N', 'CENTRAL DRAINING TANK LEVEL SENSOR', '', ''],
  ['P0100009', '', 'PRODUTO SEM MARCA FUNCIONAL', 'J09', 28],
  ['P0100010', 'BH00011', 'HULL VALVE AIR SUPPLY SOLENOID VALVE', 'J09', 28]
];

/** Escreve a planilha em disco, pelo mesmo escritor de .xlsx que o programa usa. */
async function escreverPlanilha(pg, nome, linhas) {
  const b64 = await pg.evaluate(async (a) => {
    const blob = Xlsx.blob([{ nome: 'VF_product_list', colunas: a.cab.map(t => ({ titulo: t, larg: 18 })), linhas: a.linhas }]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  }, { cab: CABECALHO, linhas: linhas });
  const caminho = L.arquivo(nome);
  fs.writeFileSync(caminho, Buffer.from(b64, 'base64'));
  return caminho;
}

function lerDaPasta(pg, nome) {
  return pg.evaluate(async (n) => {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('Derrogacao');
    try { return await (await (await dir.getFileHandle(n)).getFile()).text(); } catch (e) { return null; }
  }, nome);
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  const pg = s.pagina;
  const outros = [];
  const N = (i) => L.numero(i);
  try {
    await L.semear(pg, srv.url);

    console.log('a aba, sem banco de produtos');
    await pg.click('.tab[data-kind="produtos"]');
    await pg.waitForSelector('#produtosScroll .nb2-vazio');
    L.ok(/Nenhum produto no banco ainda/.test(await pg.textContent('#produtosScroll .nb2-vazio')), 'banco vazio: diz que não há produto e como importar');
    L.ok(await pg.isVisible('#pr2Painel .nb2-acoes .btn--primary'), 'o botão de importar está à mão, no painel');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.evaluate(() => NcrView.abrirFicha('NCR-ICN-ESC-14-1003-2025'));
    await pg.waitForSelector('#ncrDialog[open]');
    L.igual(await pg.$$eval('#ncrDialog .nb-sec--produtos', n => n.length), 0, 'a ficha da NCR não mostra seção de produtos enquanto o banco está vazio');
    await pg.keyboard.press('Escape');
    await pg.click('.tab[data-kind="produtos"]');
    await pg.waitForSelector('#produtosScroll .nb2-vazio');

    console.log('importar a planilha pela tela');
    const arq1 = await escreverPlanilha(pg, 'produtos1.xlsx', LINHAS);
    await pg.setInputFiles('#prodFileInput', arq1);
    await pg.waitForSelector('#ncrResumoDialog[open]');
    const nums = await pg.$$eval('#ncrResumoBody .nb-res-nums dt', dts => {
      const o = {};
      dts.forEach(dt => { o[dt.textContent] = dt.nextSibling.textContent; });
      return o;
    });
    L.ok(/Banco de produtos importado/.test(await pg.textContent('#ncrResumoTitulo')), 'o resumo da importação abre');
    L.ok(nums['Novos no banco'] === '10' && nums['Atualizados'] === '0' && nums['Produtos no banco agora'] === '10',
      'dez produtos novos, nenhum atualizado: ' + JSON.stringify(nums));
    L.ok(nums['Com marco de segurança'] === '8' && nums['Com função vital'] === '8' && /N\/A/.test(Object.keys(nums).join('|')) &&
      nums['N/A — sem marco e sem função vital'] === '2', 'dois produtos sem marco e sem função vital entram como N/A');
    L.ok(await pg.$eval('#ncrResumoUndoBtn', b => b.hidden) && await pg.$eval('#ncrResumoCopyBtn', b => b.hidden),
      'sem "desfazer" nem "baixar cópia": são do banco NCR, e esta importação só acrescenta e atualiza');
    await pg.click('#ncrResumoCloseBtn');
    await pg.waitForSelector('#pr2Table tbody tr');
    L.igual(await pg.$$eval('#pr2Table tbody tr', r => r.length), 10, 'a tabela mostra os dez produtos');
    const p4 = await pg.$$eval('#pr2Table tbody tr', rs => {
      const r = rs.filter(x => x.textContent.indexOf('P0100004') >= 0)[0];
      return { marcos: Array.from(r.cells[4].querySelectorAll('.pr-chip')).map(c => c.textContent),
        fvs: Array.from(r.cells[5].querySelectorAll('.pr-chip')).map(c => c.textContent), sis: r.cells[3].textContent };
    });
    L.igual(p4, { marcos: ['J06', 'J09'], fvs: ['FV 2', 'FV 10'], sis: 'BH' }, 'o produto com vários valores na mesma célula (J06;J09, 2;10) vira chips separados');
    const na = await pg.$$eval('#pr2Table tbody tr', rs => rs.filter(r => r.classList.contains('is-na')).map(r => ({
      p: r.cells[0].textContent, marcos: r.cells[4].textContent, fvs: r.cells[5].textContent })));
    L.igual(na, [{ p: 'P0100003', marcos: 'N/A', fvs: 'N/A' }, { p: 'P0100008', marcos: 'N/A', fvs: 'N/A' }],
      'sem marco e sem função vital: N/A nos dois campos');
    const semMarca = await pg.$$eval('#pr2Table tbody tr', rs => rs.filter(r => r.textContent.indexOf('P0100009') >= 0)[0].cells[1].textContent);
    L.igual(semMarca, 'N/A', 'produto sem Functional Mark: N/A nessa coluna, e o produto entra mesmo assim');

    console.log('o casamento aproximado com a marca da NCR');
    const casos = await pg.evaluate(() => {
      const c = (t) => Produtos.casarMarca(Produtos.nrm(t)).map(a => a.item.marca + ':' + a.nivel);
      return {
        variacao: c('BH00004M5'), exata: c('BH00004M'), base: c('BH00004'),
        semSufixo: c('BH00004X'), outraLetra: c('BH00037'), nada: c('BH00005M5')
      };
    });
    L.igual(casos.variacao, ['BH00004M:variacao'], 'BH00004M5 (NCR) → BH00004M (banco): variação');
    L.igual(casos.exata, ['BH00004M:exato'], 'BH00004M: exato, sem puxar a vizinha BH00004');
    L.igual(casos.base, ['BH00004:exato'], 'BH00004: exato (não vira a BH00004M)');
    L.igual(casos.semSufixo, ['BH00004:variacao'], 'BH00004X: a do banco com um caractere a mais — variação da BH00004');
    L.igual(casos.outraLetra, ['BH00037A:parecido'], 'BH00037 → BH00037A: só "parecido" — é para conferir, nunca "é esse"');
    L.igual(casos.nada, [], 'uma base que o banco não tem não vira resultado');

    const achar = (texto, onde) => pg.evaluate((a) => {
      const rec = { key: 'X', numero: 'X', fonte: { campos: a.onde ? (function () { const o = {}; o[a.onde] = a.texto; return o; })() : {},
        titulo: a.onde ? '' : a.texto, descricao: '', detalhes: [] }, waiver: {}, historico: [] };
      return Produtos.deNcr(rec).map(x => x.item.produto + ':' + x.nivel + ':' + x.vias.join('+'));
    }, { texto: texto, onde: onde });
    L.igual(await achar('bh-00004-m5 danificada', 'Industrial Mark'), ['P0100004:variacao:marca'], 'hífens e minúsculas: BH-00004-M5 também acha');
    L.igual(await achar('BH 20700', 'Industrial Mark'), ['P0100002:exato:marca'], 'espaço entre as letras e os números');
    L.igual(await achar('Produto P0100001 e P100002', 'Produto'), ['P0100001:exato:produto', 'P0100002:variacao:produto'],
      'pelo Product Mark; sem os zeros à esquerda é variação');
    L.igual(await achar('P0100002 de marca BH20700', 'Produto'), ['P0100002:exato:produto+marca'], 'pelos dois: Product Mark e Functional Mark');
    L.igual(await achar('conforme NCR 12345 e EN 10204, sem produto', 'Descrição'), [], 'número solto e norma não viram produto');
    L.igual(await achar('BH00004M512 e BH000045', 'Industrial Mark'), ['P0100005:variacao:marca'],
      'marca comprida demais (3 caracteres a mais) não é cortada no meio; BH000045 é a BH00004 com um dígito a mais');

    console.log('a ficha da NCR');
    await pg.evaluate(async (n) => {
      const g = (i) => Ncrs.get(n[i]);
      const a = g(0); a.fonte.campos['Industrial Mark'] = 'BH00004M5';
      const b = g(1); b.fonte.campos['Produto'] = 'P0100001 | P0100002'; b.fonte.descricao = 'vazamento na mangueira bh-20700';
      const c = g(2); c.fonte.campos['Industrial Mark'] = 'BH00037';
      const d = g(3); d.fonte.detalhes = [{ titulo: 'Produtos e deliberações', origem: 'teste', colunas: ['Produto', 'Deliberação'],
        linhas: [['BC 22714F', 'Use as is']] }];
      /* como se tivessem vindo de uma importação nova: é o carimbo dela que o programa confere */
      [a, b, c, d].forEach(r => { r.fonte.importadoEm = new Date().toISOString(); });
      await Ncrs.salvar([a, b, c, d]);
    }, [3, 4, 5, 6, 7].map(N));
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const ficha = async (i) => {
      await pg.evaluate((n) => NcrView.abrirFicha(n), N(i));
      await pg.waitForSelector('#ncrDialog[open] .nb-sec--produtos');
      return pg.evaluate(() => {
        const sec = document.querySelector('#ncrDialog .nb-sec--produtos');
        const linhas = (root) => Array.from(root.querySelectorAll('tbody tr')).map(tr => ({
          produto: tr.cells[0].textContent, marca: tr.cells[1].textContent,
          marcos: Array.from(tr.cells[3].querySelectorAll('.pr-chip,.pr-na')).map(c => c.textContent),
          fvs: Array.from(tr.cells[4].querySelectorAll('.pr-chip,.pr-na')).map(c => c.textContent),
          nivel: tr.cells[5].querySelector('.pr-nivel').textContent, como: tr.cells[5].textContent }));
        const det = sec.querySelector('details');
        const certos = sec.querySelector(':scope > .nb-det-caixa');
        return { sub: sec.querySelector('.nb-sec-sub').textContent, certos: certos ? linhas(certos) : [],
          parecidos: det ? linhas(det) : [],
          resumo: sec.querySelector('.pr-resumo') ? Array.from(sec.querySelectorAll('.pr-resumo .nb-rot, .pr-resumo .pr-chip, .pr-resumo .pr-na')).map(x => x.textContent).join(' ') : '',
          resumoSummary: det ? det.querySelector('summary').textContent : '' };
      });
    };
    const fa = await ficha(3);
    L.ok(fa.certos.length === 1 && fa.certos[0].marca === 'BH00004M' && fa.certos[0].nivel.indexOf('variação') === 0 &&
      /NCR: BH00004M5/.test(fa.certos[0].como), 'NCR com BH00004M5: o produto BH00004M, como "variação", mostrando o que a NCR escreveu');
    L.igual([fa.certos[0].marcos, fa.certos[0].fvs], [['J06', 'J09'], ['FV 2', 'FV 10']], 'com os marcos de segurança e as funções vitais no pop-up');
    L.ok(fa.resumo === 'Marcos J06 J09 Funções vitais FV 2 FV 10', 'e o resumo de cima junta os marcos e as funções dos produtos');
    const fb = await ficha(4);
    L.igual(fb.certos.map(x => x.produto + ':' + x.nivel.split(' ')[0]), ['P0100001:exato', 'P0100002:exato'],
      'NCR com dois produtos (um em coluna, um no texto): os dois, exatos');
    L.ok(/Product Mark/.test(fb.certos[1].como) && /Functional Mark/.test(fb.certos[1].como), 'o segundo foi achado pelas duas portas, Product Mark e Functional Mark');
    L.igual(fb.resumo, 'Marcos J05 J06 J07 Funções vitais FV 1 FV 20', 'o resumo soma os marcos e as funções de todos');
    const fc = await ficha(5);
    L.ok(fc.certos.length === 0 && /Nenhum produto/.test(fc.sub) && fc.parecidos.length === 1 && fc.parecidos[0].marca === 'BH00037A' &&
      /parecido/.test(fc.parecidos[0].nivel), 'NCR com BH00037: nenhum certo; o BH00037A fica em "parecidos, a conferir"');
    L.ok(/Parecidos, a conferir \(1\)/.test(fc.resumoSummary), 'o grupo diz quantos são');
    const fd = await ficha(6);
    L.ok(fd.certos.length === 1 && fd.certos[0].produto === 'P0100001' && /exato/.test(fd.certos[0].nivel), 'a marca dentro da tabela de produtos e deliberações da NCR (BC 22714F, com espaço) também é achada');
    const fe = await ficha(7);
    L.ok(fe.certos.length === 0 && fe.parecidos.length === 0 && /Nenhum produto/.test(fe.sub), 'NCR que não cita nenhum produto: diz isso, sem inventar');

    console.log('da ficha da NCR para a ficha do produto');
    await ficha(3);
    await pg.click('#ncrDialog .nb-sec--produtos .pr-num');
    await pg.waitForSelector('#prodDialog[open]');
    L.ok(await pg.evaluate(() => document.body.dataset.kind === 'produtos' && !document.getElementById('ncrDialog').open),
      'o número do produto fecha a ficha da NCR e abre a do produto, na aba Produtos');
    const fp = await pg.evaluate(() => ({
      titulo: document.querySelector('#prodDialog h3').textContent,
      marcos: Array.from(document.querySelectorAll('#prodDialog .pr-bloco')[0].querySelectorAll('.pr-chip')).map(c => c.textContent),
      fvs: document.querySelector('#prodDialog .pr-fv-nomes').textContent,
      ncrs: Array.from(document.querySelectorAll('#prodDialog .nb-sec')).filter(x => /NCRs que citam/.test(x.textContent))[0].textContent,
      familia: Array.from(document.querySelectorAll('#prodDialog .nb-sec')).filter(x => /Mesma família/.test(x.textContent))[0].textContent
    }));
    L.ok(fp.titulo === 'P0100004' && fp.marcos.join() === 'J06,J09', 'a ficha do produto: o número e os marcos');
    L.ok(/FV 2 — Detect a flooding/.test(fp.fvs) && /FV 10 — Control ship weight/.test(fp.fvs), 'as funções vitais com o nome que o banco NCR dá a cada número');
    L.ok(fp.ncrs.indexOf(N(3)) >= 0 && /variação/.test(fp.ncrs), 'as NCRs que citam o produto, com o nível do casamento');
    L.ok(/P0100005/.test(fp.familia) && /BH00004\b/.test(fp.familia), 'e a família da marca (BH00004): o produto vizinho, com os próprios marcos');
    await pg.click('#prodDialog .nb-sec .nb2-num >> nth=0');
    await pg.waitForSelector('#ncrDialog[open]');
    L.ok(await pg.evaluate((n) => /NCR-ICN/.test(document.querySelector('#ncrDialog h3').textContent), N(3)),
      'do produto de volta à ficha da NCR (pelo número dela)');
    await pg.keyboard.press('Escape');

    console.log('busca, filtros e ordem');
    await pg.click('.tab[data-kind="produtos"]');
    await pg.waitForSelector('#pr2Table tbody tr');
    const linhasVis = () => pg.$$eval('#pr2Table tbody tr', r => r.map(x => x.cells[0].textContent));
    await pg.click('#produtosScroll .nb2-painel-btn');
    L.ok(await pg.isVisible('#pr2Painel .nb2-filtros'), 'o painel (importar, números e filtros) abre pelo botão e fica recolhido de saída');
    await pg.fill('#pr2Busca', 'valve');
    await pg.waitForTimeout(450);
    L.igual(await linhasVis(), ['P0100004', 'P0100005', 'P0100006', 'P0100010'], 'a busca acha pela descrição');
    L.ok(/4 de 10 produtos à vista/.test(await pg.textContent('#pr2Conta')), 'e a contagem diz quantos de quantos');
    await pg.fill('#pr2Busca', N(3));
    await pg.waitForTimeout(450);
    L.igual(await linhasVis(), ['P0100004'], 'a busca acha pelo número da NCR que cita o produto');
    await pg.fill('#pr2Busca', 'fv 28');
    await pg.waitForTimeout(450);
    L.igual(await linhasVis(), ['P0100009', 'P0100010'], 'a busca "fv 28" acha pela função vital');
    await pg.fill('#pr2Busca', 'n/a');
    await pg.waitForTimeout(450);
    L.igual(await linhasVis(), ['P0100003', 'P0100008', 'P0100009'], 'e "n/a" acha os que a tabela mostra como N/A (aqui, também o sem Functional Mark)');
    await pg.fill('#pr2Busca', 'bh-00004');
    await pg.waitForTimeout(450);
    L.igual(await linhasVis(), ['P0100004', 'P0100005'], 'a busca com hífen (BH-00004) acha a marca sem separador');
    await pg.click('#pr2Limpar');
    await pg.waitForSelector('#pr2Table tbody tr');
    L.igual((await linhasVis()).length, 10, 'Limpar filtros traz tudo de volta');

    await pg.click('#prF-marco');
    const opcoesMarco = await pg.$$eval('#prF-marco ~ .nb2-ms-pop .nb2-ms-op', o => o.map(x => x.querySelector('.nb2-ms-nome').textContent + ':' + x.querySelector('.nb2-ms-n').textContent));
    L.igual(opcoesMarco, ['J01:2', 'J03:2', 'J05:1', 'J06:3', 'J07:1', 'J09:3', 'N/A:2'], 'o filtro de marco: na ordem da fila, com quantos produtos em cada, e o N/A');
    await pg.click('#prF-marco ~ .nb2-ms-pop .nb2-ms-todos');
    L.igual((await linhasVis()).length, 10, '"Marcar todos" marca os marcos (e o N/A) — dá para tirar só os que não se quer');
    await pg.click('#prF-marco ~ .nb2-ms-pop label:has-text("N/A") input');
    L.igual((await linhasVis()).length, 8, 'tirando o N/A, ficam os oito com marco');
    await pg.click('#prF-marco ~ .nb2-ms-pop .nb2-ms-pe .btn:has-text("Limpar")');
    await pg.click('#prF-marco ~ .nb2-ms-pop .nb2-ms-pe .btn--primary');
    await pg.click('#prF-funcao');
    await pg.click('#prF-funcao ~ .nb2-ms-pop label:has-text("FV 24") input');
    L.igual(await linhasVis(), ['P0100006', 'P0100007'], 'filtro de função vital (com o nome quando o número tem um só)');
    L.ok(/Função vital: FV 24/.test(await pg.textContent('#pr2Recorte')), 'o recorte diz qual filtro está valendo');
    await pg.click('#prF-funcao ~ .nb2-ms-pop .nb2-ms-pe .btn--primary');
    await pg.click('#pr2Limpar');
    await pg.click('#pr2Painel .sm-kpi:has-text("N/A")');
    L.igual(await linhasVis(), ['P0100003', 'P0100008'], 'o número "N/A" é um atalho: filtra os produtos sem marco e sem função vital');
    await pg.click('#pr2Painel .sm-kpi:has-text("Citados em NCR")');
    L.igual(await linhasVis(), ['P0100001', 'P0100002', 'P0100004'], 'e "Citados em NCR" mostra os que alguma NCR cita (os parecidos não contam)');
    await pg.click('#pr2Limpar');
    await pg.click('#pr2Table th:nth-child(2) .nb2-sort');
    L.igual((await linhasVis()).slice(0, 3), ['P0100001', 'P0100005', 'P0100004'], 'ordenar pela Functional Mark (BC22714F, BH00004, BH00004M…)');
    await pg.click('#pr2Table th:nth-child(2) .nb2-sort');
    L.ok((await linhasVis())[0] === 'P0100009' || (await linhasVis())[0] === 'P0100008', 'e de novo inverte (o sem marca vai para o lado certo)');

    console.log('o mapa');
    await pg.click('#pr2Limpar');
    await pg.click('.pr2-vistas [data-vista="mapa"]');
    await pg.waitForSelector('#pr2Matriz');
    const mz = await pg.evaluate(() => {
      const t = document.getElementById('pr2Matriz');
      const cab = Array.from(t.tHead.rows[0].cells).map(c => c.textContent);
      const cel = (m, f) => {
        const i = cab.indexOf(f);
        const r = Array.from(t.tBodies[0].rows).filter(x => x.cells[0].textContent === m)[0];
        return r ? r.cells[i].textContent : null;
      };
      return { cab: cab, j06fv2: cel('J06', 'FV 2'), j09fv28: cel('J09', 'FV 28'), naNa: cel('N/A', 'N/A'), naFv28: cel('N/A', 'FV 28'),
        total: t.tBodies[0].rows[t.tBodies[0].rows.length - 1].cells.length };
    });
    L.igual(mz.cab, ['Marco \\ Função', 'FV 1', 'FV 2', 'FV 10', 'FV 20', 'FV 24', 'FV 28', 'N/A', 'Total'], 'a matriz: as funções vitais em ordem numérica, e o N/A no fim');
    L.ok(mz.j06fv2 === '2' && mz.j09fv28 === '2' && mz.naNa === '2' && mz.naFv28 === '·', 'e as contagens por cruzamento (J06 × FV 2 = 2; J09 × FV 28 = 2; N/A × N/A = 2)');
    await pg.click('#pr2Matriz td.pr-mz-cel:not(.is-zero) .pr-mz-n >> nth=0');
    await pg.waitForSelector('#pr2Table');
    L.ok(await pg.evaluate(() => /Marco de segurança: .*\bFunção vital:/.test(document.getElementById('pr2Recorte').textContent)),
      'clicar numa célula leva à tabela, já filtrada pelo marco e pela função');
    await pg.click('#pr2Limpar');
    await pg.click('.pr2-vistas [data-vista="mapa"]');
    await pg.waitForSelector('.pr-sist-lista');
    const sist = await pg.$$eval('.pr-sist-linha', l => l.map(x => x.querySelector('.pr-sist-nome').textContent + ':' + x.querySelector('.pr-sist-n').textContent));
    L.igual(sist, ['BH:7', 'BC:1', 'DA:1', 'sem sistema:1'], 'por sistema (as duas primeiras letras da Functional Mark), do maior para o menor');
    await pg.click('.pr2-vistas [data-vista="tabela"]');

    console.log('importar de novo: acrescenta e atualiza, nunca apaga');
    const linhas2 = LINHAS.filter(l => l[0] !== 'P0100010').map(l => l.slice());
    linhas2.find(l => l[0] === 'P0100002')[3] = 'J06;J09';
    linhas2.push(['P0100011', 'BX30000', 'PRODUTO NOVO', 'J10', 36]);
    const arq2 = await escreverPlanilha(pg, 'produtos2.xlsx', linhas2);
    await pg.setInputFiles('#prodFileInput', arq2);
    await pg.waitForSelector('#ncrResumoDialog[open]');
    const nums2 = await pg.$$eval('#ncrResumoBody .nb-res-nums dt', dts => {
      const o = {};
      dts.forEach(dt => { o[dt.textContent] = dt.nextSibling.textContent; });
      return o;
    });
    L.ok(nums2['Novos no banco'] === '1' && nums2['Atualizados'] === '1' && nums2['Sem alteração'] === '8' &&
      nums2['No banco, fora da planilha (mantidos)'] === '1' && nums2['Produtos no banco agora'] === '11', 'um novo, um atualizado, oito iguais, um mantido: ' + JSON.stringify(nums2));
    const grupos = await pg.$$eval('#ncrResumoBody details', d => d.map(x => x.textContent));
    L.ok(grupos.some(g => /P0100002/.test(g) && /marcos: J06 → J06;J09/.test(g)), 'o resumo diz o que mudou no atualizado (marcos: J06 → J06;J09)');
    await pg.click('#ncrResumoCloseBtn');
    L.ok(await pg.evaluate(() => Produtos.get('P100010') !== null && Produtos.total() === 11), 'o produto que ficou fora da planilha continua no banco');
    const antes = await pg.evaluate(() => Produtos.get('P100002').marcos.join(';'));
    L.igual(antes, 'J06;J09', 'e o que mudou foi atualizado');
    const erro = await pg.evaluate(() => {
      try { Produtos.importar({ sheets: [{ name: 'x', rows: [['a', 'b'], ['c', 'd']] }] }, 'x.xlsx', 'T'); return 'sem erro'; } catch (e) { return e.message; }
    });
    L.ok(/Product Mark e Functional Mark/.test(erro), 'planilha que não é a de produtos: recusa dizendo as colunas esperadas');
    L.igual(await pg.evaluate(() => Produtos.total()), 11, 'e a recusa não mexe no banco');

    console.log('guardado neste navegador');
    await pg.reload();
    await L.esperarPronto(pg);
    L.igual(await pg.evaluate(() => Produtos.total()), 11, 'depois de recarregar o banco de produtos continua aqui');

    console.log('exportar');
    await pg.click('.tab[data-kind="produtos"]');
    await pg.waitForSelector('#pr2Table tbody tr');
    await pg.fill('#pr2Busca', 'BH');
    await pg.waitForTimeout(450);
    const vis = await linhasVis();
    const xl = await L.baixar(pg, () => pg.click('.nb2-exporta .btn:nth-child(1)'));
    const bruto = xl.buffer.toString('utf8');
    L.ok(/^Produtos_\d{8}\.xlsx$/.test(xl.nome) && xl.buffer.slice(0, 2).toString() === 'PK', 'um .xlsx de verdade: ' + xl.nome);
    L.ok(vis.every(p => bruto.indexOf(p) >= 0) && bruto.indexOf('P0100001') < 0, 'só os produtos à vista (' + vis.length + ')');
    ['Product Mark', 'Functional Mark', 'Designation', 'Safety Milestones', 'Vital Functions #', 'Recorte', 'busca: “BH”', 'N/A'].forEach(t =>
      L.ok(bruto.indexOf(t) >= 0, 'a planilha tem "' + t + '"'));
    L.ok(bruto.indexOf('J06; J09') >= 0 && bruto.indexOf('2; 10') >= 0, 'vários valores na mesma célula, separados por ";"');
    await pg.fill('#pr2Busca', '');

    console.log('pasta da rede');
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(1500);
    const arqP = await lerDaPasta(pg, 'derrogacao-produtos.json');
    const dP = arqP ? JSON.parse(arqP) : {};
    L.ok(dP.format === 'derrogacao-produtos' && dP.itens && dP.itens.length === 11, 'a pasta ganhou derrogacao-produtos.json com os 11 produtos');
    L.ok(dP.importacoes && dP.importacoes.length === 2, 'e o registro das duas importações');
    /* um colega importou uma planilha nova: um produto novo e um atualizado, com carimbo mais novo */
    await pg.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('derrogacao-produtos.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      const futuro = new Date(Date.now() + 60000).toISOString();
      d.itens.filter(i => i.produto === 'P0100003').forEach(i => { i.marcos = ['J09']; i.funcoes = ['28']; i.em = futuro; });
      d.itens.push({ id: 'P100012', produto: 'P0100012', marca: 'RM40000', descricao: 'DO COLEGA', marcos: ['J06'], funcoes: ['1'], em: futuro });
      d.importadoEm = futuro; d.importadoPor = 'Colega';
      d.importacoes.push({ id: 'imp-colega', em: futuro, por: 'Colega', arquivo: 'colega.xlsx', novos: 1, atualizados: 1, iguais: 9, total: 12 });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(d));
      await w.close();
    });
    await pg.click('#atualizarBtn');
    await pg.waitForFunction(() => Produtos.total() === 12, null, { timeout: 15000 });
    const colega = await pg.evaluate(() => ({ m: Produtos.get('P100003').marcos.join(), nome: Produtos.get('P100012').descricao,
      por: Produtos.meta().importadoPor }));
    L.ok(colega.m === 'J09' && colega.nome === 'DO COLEGA' && colega.por === 'Colega', 'o que o colega importou chega: o produto novo, o atualizado e o autor');
    /* o meu produto que a pasta não tem volta para lá */
    await pg.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('derrogacao-produtos.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      d.itens = d.itens.filter(i => i.produto !== 'P0100011');
      const w = await fh.createWritable();
      await w.write(JSON.stringify(d));
      await w.close();
    });
    await pg.click('#atualizarBtn');
    await pg.waitForTimeout(1500);
    const volta = JSON.parse(await lerDaPasta(pg, 'derrogacao-produtos.json'));
    L.ok(volta.itens.some(i => i.produto === 'P0100011') && volta.itens.length === 12, 'o produto que o arquivo da pasta não tinha volta para ele (nada se perde)');

    console.log('backup e publicação');
    const bk = await pg.evaluate(() => {
      const nb = Ncrs.paraBackup();
      return { n: nb.produtos && nb.produtos.itens.length, fmt: nb.produtos && nb.produtos.format };
    });
    L.ok(bk.n === 12 && bk.fmt === 'derrogacao-produtos', 'o backup de tudo leva o banco de produtos (em ncrBase.produtos)');
    const mudou = await pg.evaluate(async () => {
      const ps = await Store.list();
      const a = Publicacao.conteudo(ps, Ncrs.paraBackup(), []);
      Produtos.get('P100002').marcos = ['J09'];
      Produtos.get('P100002').em = new Date().toISOString();
      const igual = Publicacao.conteudo(ps, Ncrs.paraBackup(), []) === a;
      const b4 = Produtos.lista().length;
      Produtos.adotar({ itens: Produtos.lista().concat([{ produto: 'P0199999', marca: 'ZZ99999', descricao: 'X', marcos: [], funcoes: [] }]), importadoEm: new Date().toISOString() });
      const novo = Publicacao.conteudo(ps, Ncrs.paraBackup(), []) !== a;
      return { igual: igual, novo: novo, b4: b4 };
    });
    L.ok(mudou.novo, 'produto novo muda o conteúdo publicado (a publicação automática percebe)');
    await pg.reload();
    await L.esperarPronto(pg);
    /* o `adotar` do teste acima só mexeu na memória: o banco gravado é o de antes */
    L.igual(await pg.evaluate(() => Produtos.total()), 12, 'o que se mexeu só na memória não ficou gravado');

    console.log('visualizador');
    const pub = await L.publicacao(pg);
    L.ok(pub.indexOf('"derrogacao-produtos"') >= 0 && pub.indexOf('DO COLEGA') >= 0, 'a publicação leva o banco de produtos');
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await L.abrir();
    outros.push(v);
    await v.pagina.goto(srv.url + 'index.html?modo=leitura');
    await v.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v.pagina.waitForTimeout(500);
    await v.pagina.click('.tab[data-kind="produtos"]');
    await v.pagina.waitForSelector('#pr2Table tbody tr');
    const vv = await v.pagina.evaluate(() => ({
      linhas: document.querySelectorAll('#pr2Table tbody tr').length,
      importar: Array.from(document.querySelectorAll('#produtosScroll button')).some(b => /Importar|Atualizar com/.test(b.textContent)),
      ultima: (document.querySelector('.nb2-ultima') || {}).textContent || ''
    }));
    L.ok(vv.linhas === 12 && !vv.importar, 'no visualizador: os 12 produtos, sem botão de importar');
    L.ok(/atualizado em/.test(vv.ultima) && !/\.xlsx/.test(vv.ultima), 'só a data do banco, sem o nome do arquivo');
    await v.pagina.click('.tab[data-kind="banco"]');
    await v.pagina.waitForSelector('#nb2Table tbody tr');
    await v.pagina.evaluate((n) => NcrView.abrirFicha(n), N(3));
    await v.pagina.waitForSelector('#ncrDialog[open] .nb-sec--produtos');
    L.ok(await v.pagina.evaluate(() => /BH00004M/.test(document.querySelector('#ncrDialog .nb-sec--produtos').textContent)),
      'na ficha do visualizador: o produto da NCR, com marcos e funções vitais');
    const gravou = await v.pagina.evaluate(async () => {
      const a = Produtos.total();
      await Produtos.salvar();
      const r = await Store.ncrMetaGet('produtos');
      return { a: a, guardado: !!r };
    });
    L.ok(gravou.a === 12 && !gravou.guardado, 'o visualizador não grava o banco de produtos no navegador');

    console.log('abertas × fechadas, mapa por marca e imagens A4');
    await pg.click('.tab[data-kind="produtos"]');
    await pg.waitForSelector('#pr2Table tbody tr');
    const ind = await pg.evaluate(() => {
      const r = Array.from(document.querySelectorAll('#pr2Table tbody tr')).filter(x => x.cells[0].textContent === 'P0100004')[0];
      return { ab: r.querySelectorAll('.pr-pil--aberta').length, fe: r.querySelectorAll('.pr-pil--fechada').length, txt: r.cells[6].textContent };
    });
    L.ok(ind.ab + ind.fe > 0 && /\d/.test(ind.txt), 'a coluna NCR mostra pastilhas de abertas (●) e fechadas (✓) com a conta de cada uma: ' + ind.txt);
    await pg.click('.pr2-vistas [data-vista="mapa"]');
    await pg.waitForSelector('#pr2MapaMarcasTab');
    const mm = await pg.evaluate(() => {
      const t = document.getElementById('pr2MapaMarcasTab');
      const cab = Array.from(t.tHead.rows[0].cells).map(c => c.textContent);
      const lin = Array.from(t.tBodies[0].rows).filter(r => r.cells[0].textContent === 'BH')[0];
      const cel = (f) => lin.cells[cab.indexOf(f)].textContent;
      return { linhas: Array.from(t.tBodies[0].rows).map(r => r.cells[0].textContent), fv2: cel('FV 2'), fv10: cel('FV 10'), total: lin.cells[lin.cells.length - 1].textContent };
    });
    L.ok(mm.linhas.every(x => /^[A-Z]{2}$|^sem sistema$/.test(x)), 'o mapa por função vital tem uma linha por bigrama (duas letras), não por marca inteira: ' + mm.linhas.join(','));
    L.ok(mm.fv2 === '2' && mm.fv10 === '1', 'BH: dois produtos em FV 2 (BH00004M e BH00004) e um em FV 10');
    await pg.click('#pr2MapaMarcas .pr2-vistas .btn:nth-child(2)');
    const mm2 = await pg.evaluate(() => {
      const t = document.getElementById('pr2MapaMarcasTab');
      const cab = Array.from(t.tHead.rows[0].cells).map(c => c.textContent);
      const lin = Array.from(t.tBodies[0].rows).filter(r => r.cells[0].textContent === 'BH')[0];
      return cab.filter((c, i) => /^J\d/.test(c) && lin.cells[i].textContent !== '·').join();
    });
    L.ok(/J06/.test(mm2) && /J09/.test(mm2), 'e por marco: o BH aparece em J06 e J09 (' + mm2 + ')');
    await pg.click('.pr2-vistas [data-vista="tabela"]');
    const png = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ok: buf.slice(1, 4).toString() === 'PNG' });
    await pg.click('#pr2Table tbody tr:has-text("P0100004") .pr-num');
    await pg.waitForSelector('#prodDialog[open]');
    const ip = await L.baixar(pg, () => pg.click('#prodDialog .nb-ficha-cab .btn:has-text("Imagem")'));
    const dp = png(ip.buffer);
    L.ok(dp.ok && dp.w === 2480 && dp.h === 3508 && /^Produto_P0100004\.png$/.test(ip.nome), 'a ficha do produto baixa como PNG de uma folha A4 a 300 dpi (2480×3508): ' + ip.nome);
    await pg.keyboard.press('Escape');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.evaluate((n) => NcrView.abrirFicha(n), N(3));
    await pg.waitForSelector('#ncrDialog[open] .nb-sec--produtos');
    const inr = await L.baixar(pg, () => pg.click('#ncrDialog .nb-ficha-cab .btn:has-text("Imagem")'));
    const dn = png(inr.buffer);
    L.ok(dn.ok && dn.w === 2480 && dn.h === 3508 && /^NCR_.*\.png$/.test(inr.nome), 'a ficha da NCR também: ' + inr.nome);
    await pg.keyboard.press('Escape');
  } finally {
    const errosOutros = [];
    outros.forEach(o => errosOutros.push.apply(errosOutros, o.erros.filter(e => !/404|Failed to load resource/.test(e))));
    const f = L.resultado('produtos', s.erros.concat(errosOutros));
    for (const o of outros) await o.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
