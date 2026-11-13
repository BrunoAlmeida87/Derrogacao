/* O histórico da NCR extraído pelo próprio Derrogação (ncrhist.js): a
   trajetória reconstruída pelas colunas datadas do export, a mudança de
   status entre duas importações, o JSON do extrator do NCR Integrada (a
   captura vale até a data dela, o export depois), o historico.json do NCR
   Control como alternativa, a janela do extrator, a pasta da rede
   (derrogacao-ncr-sistema.json), o backup, a publicação e o visualizador. */
'use strict';
const fs = require('fs');
const L = require('./lib');

const COLS = ['Número NCR', 'Título', 'Status', 'SBR', 'Data Criação',
  'Data avanço 2.1 - Especialista ICN', 'Usuário avanço 2.1 - Especialista ICN',
  'Data da rejeição 2.2 - TA Specialist', 'Motivo da rejeição 2.2 - TA Specialist',
  'CEDOC Closure Data', 'Tempo de tramitação'];
const A = 'NCR-ICN-ESC-14-0001-2025';
const B = 'NCR-ICN-ESC-14-0002-2025';
const C = 'NCR-ICN-CG-14-0003-2025';

/* `dias`: quanto tempo depois da primeira foto o export foi tirado (o tempo
   de tramitação de todas as NCRs cresce junto, como num export de verdade) */
function linhas(statusB, dias) {
  return [
    [A, 'Fechada com rejeição', 'CEDOC Closure', 'SBR 4', '01/02/2025', '10/02/2025 09:30', 'Maria',
      '20/02/2025', 'faltou evidência', '15/03/2025', 42 + dias],
    /* a criação como número de série do Excel (célula sem formato de data) */
    [B, 'Aberta', statusB, '4', 45700, '14/02/2025', 'João', '', '', '', 31 + dias],
    [C, 'Só criação', '3.2 - DA', 'SBR4', '2025-02-20', '', '', '', '', '', 23 + dias]
  ];
}

const EXTRATOR = {
  tipo: 'ncr-control/historico-sistema', versao: 1, origem: 'https://ncr.exemplo', geradoEm: '2025-03-01T12:00:00.000Z',
  ncrs: [{
    numero: 'NCR ICN ESC 14 0002 2025', sysId: 'a'.repeat(24), url: 'https://ncr.exemplo/#/ncr/' + 'a'.repeat(24) + '/editar',
    capturadoEm: '2025-03-01T12:00:00.000Z', statusAtual: '6.1 - CQ',
    eventos: [
      { tipo: 'STATUS', data: '2025-02-25T10:00:05.000Z', usuario: 'Ana', statusDe: '3.2 - DA', para: '6.1 - CQ' },
      { tipo: 'STATUS', data: '2025-02-16T08:00:00.000Z', usuario: 'João', statusDe: '2.1 - Especialista ICN', para: '3.2 - DA' },
      { tipo: 'STATUS', data: '2025-02-14T07:00:00.000Z', usuario: 'João', statusDe: 'ICN 1.1/1.2', para: '2.1 - Especialista ICN' },
      { tipo: 'CRIACAO', data: '2025-02-12T09:00:00.000Z', usuario: 'Pedro' },
      { tipo: 'ANEXO', data: '2025-02-12T09:05:00.000Z', usuario: 'Pedro' }
    ],
    acoes: [{ titulo: 'Deliberação N1', data: '2025-02-25T10:00:03.000Z', usuario: 'Ana', texto: 'Retrabalhar a solda conforme o procedimento.' }]
  }, { numero: 'NCR-ICN-ESC-14-9999-2025', capturadoEm: '2025-03-01T12:00:00.000Z', eventos: [] },
  { sysId: 'b'.repeat(24), erro: 'tempo esgotado' }]
};

function lerDaPasta(pg, nome) {
  return pg.evaluate(async (n) => {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('Derrogacao');
    try { return await (await (await dir.getFileHandle(n)).getFile()).text(); } catch (e) { return null; }
  }, nome);
}

async function planilha(pg, nome, ls) {
  const b64 = await pg.evaluate(async ({ cols, ls }) => {
    const blob = Xlsx.blob([{ nome: 'NCR', colunas: cols.map(c => ({ titulo: c })), linhas: ls }]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  }, { cols: COLS, ls: ls });
  const caminho = L.arquivo(nome);
  fs.writeFileSync(caminho, Buffer.from(b64, 'base64'));
  return caminho;
}

async function importar(pg, clicar, caminho) {
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), clicar()]);
  await fc.setFiles(caminho);
  await pg.waitForSelector('#ncrResumoDialog[open]', { timeout: 15000 });
  let txt = await pg.innerText('#ncrResumoDialog');
  if (await pg.isHidden('#ncrResumoUndoBtn')) txt += '\n[sem desfazer]';
  await pg.click('#ncrResumoCloseBtn');
  return txt;
}

const botao = (pg, texto) => pg.evaluate((t) => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t).click();
}, texto);

const trajetoria = (pg, k) => pg.evaluate((k) => NcrFluxo.sequencia(Ncrs.get(k))
  .map(s => ({ st: s.status, cls: s.cls, est: s.estimado, texto: !!s.texto, acao: s.acao, data: String(s.data).slice(0, 10) })), k);

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  const pg = s.pagina;
  const outros = [];
  try {
    await L.semear(pg, srv.url, { semBanco: true });
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForTimeout(300);

    console.log('colunas datadas do export');
    const p1 = await planilha(pg, 'hist-banco1.xlsx', linhas('6.1 - CQ', 0));
    const r1 = await importar(pg, () => botao(pg, 'Importar / Atualizar Banco NCR'), p1);
    L.ok(/Data da foto deduzida do conteúdo do export \(15\/03\/2025\)/.test(r1), 'a data da foto sai do conteúdo (criação + tempo de tramitação)');
    L.ok(/Reconstrução de histórico: 4 coluna\(s\)/.test(r1) && /Rejeição em "2\.2 - TA Specialist"/.test(r1),
      'o resumo diz quais colunas datadas foram reconhecidas');
    let a = await trajetoria(pg, A);
    L.igual(a.map(x => x.st), ['ICN 1.1/1.2', '2.1 - Especialista ICN', '2.2 - TA Specialist', '2.1 - Especialista ICN', 'CEDOC Closure'],
      'NCR fechada: criação, avanço, rejeição (volta à etapa anterior) e fechamento');
    L.ok(a[3].cls === 'RETORNO' && a[4].cls === 'FECHAMENTO' && a[2].est, 'rejeição é retorno, fechamento é fechamento, a chegada não datada é estimada');
    const b = await trajetoria(pg, B);
    L.ok(b[0].data === '2025-02-12' && b[b.length - 1].st === '6.1 - CQ' && b[b.length - 1].est,
      'data como número de série do Excel; o caminho termina no status atual, estimado');
    L.igual((await trajetoria(pg, C)).map(x => x.st), ['ICN 1.1/1.2', '3.2 - DA'], 'só com a criação: abertura e status atual');
    const campos = await pg.evaluate((k) => Ncrs.get(k).historico.every(e => /^Status · export/.test(e.campo)), A);
    L.ok(campos, 'os eventos gerados pelo export levam a marca "Status · export" no campo');

    console.log('mudança entre duas importações');
    const antes = await pg.evaluate((ks) => ks.map(k => Ncrs.get(k).historico.length), [A, B, C]);
    const p2 = await planilha(pg, 'hist-banco2.xlsx', linhas('7.1 - CQ', 5));
    const r2 = await importar(pg, () => botao(pg, 'Importar / Atualizar Banco NCR'), p2);
    const depois = await pg.evaluate((ks) => ks.map(k => Ncrs.get(k).historico.length), [A, B, C]);
    L.igual(depois, [antes[0], antes[1] + 1, antes[2]], 'só a NCR que mudou de status ganhou um evento');
    const ult = await pg.evaluate((k) => { const h = Ncrs.get(k).historico; return h[h.length - 1]; }, B);
    L.ok(ult.tipo === 'STATUS' && ult.de === '6.1 - CQ' && ult.para === '7.1 - CQ' && ult.cls === 'AVANCO' &&
      ult.data.slice(0, 10) === '2025-03-20', 'o evento: de 6.1 para 7.1, avanço, na data da nova foto');
    L.ok(/Eventos novos no histórico\s*1/.test(r2), 'o resumo conta o evento novo');
    await importar(pg, () => botao(pg, 'Importar / Atualizar Banco NCR'), p2);
    L.igual(await pg.evaluate((ks) => ks.map(k => Ncrs.get(k).historico.length), [A, B, C]), depois, 'a mesma planilha de novo não repete nada');

    console.log('o extrator do NCR Integrada');
    await botao(pg, 'Histórico do NCR Integrada…');
    await pg.waitForSelector('#extratorDialog[open]');
    L.ok(/Nenhum histórico do sistema importado ainda/.test(await pg.textContent('#extratorResumo')), 'a janela diz que ainda não há captura');
    L.ok(await pg.isHidden('#extratorRecapBtn'), 'sem captura, nada a recapturar');
    L.ok(/F12/.test(await pg.textContent('#extratorDialog .ext-passos')), 'o passo a passo está à vista, não escondido');
    const texto = await pg.evaluate(() => NcrHist.script());
    L.ok(/Extrator de histórico do NCR Integrada/.test(texto) && /ncr-control\/historico-sistema/.test(texto) && texto.length > 30000,
      'o texto do extrator está no programa (' + texto.length + ' caracteres)');
    await pg.click('#extratorCopiarBtn');
    await pg.waitForTimeout(300);
    L.ok(await pg.evaluate(() => document.getElementById('extratorTexto').hidden ||
      document.getElementById('extratorTexto').value.length > 30000), 'Copiar extrator copia (ou deixa o texto selecionado na janela)');
    const dl = await L.baixar(pg, () => pg.click('#extratorBaixarBtn'));
    L.ok(dl.nome === 'extrator_historico_ncr.js' && dl.buffer.toString('utf8') === texto, 'Baixar extrator entrega o mesmo texto');
    /* o extrator roda numa página qualquer: a sintaxe e o painel */
    const outra = await s.contexto.newPage();
    outros.push(outra);
    const errosExt = [];
    outra.on('pageerror', e => errosExt.push(e.message));
    await outra.setContent('<html><body><h1>NCR Integrada (teste)</h1></body></html>');
    await outra.evaluate(texto);
    await outra.waitForSelector('#ncrExtratorPainel');
    L.ok(!errosExt.length, 'colado numa página, o extrator abre o painel sem erro');

    const pj = L.arquivo('historico_sistema.json');
    fs.writeFileSync(pj, JSON.stringify(EXTRATOR));
    const r3 = await importar(pg, () => pg.click('#extratorImportarBtn'), pj);
    L.ok(/Capturas novas\s*2/.test(r3) && /Falharam na extração\s*1/.test(r3) && /Ainda fora do banco NCR[^\n]*\s*1/.test(r3),
      'resumo: 2 capturas novas, 1 que falhou, 1 ainda fora do banco');
    L.ok(/\[sem desfazer\]/.test(r3) && !/\[sem desfazer\]/.test(r2), 'a captura não oferece "desfazer" (o do banco continua sendo o da última importação dele)');
    const bc = await trajetoria(pg, B);
    L.igual(bc.map(x => x.st), ['ICN 1.1/1.2', '2.1 - Especialista ICN', '3.2 - DA', '6.1 - CQ', '7.1 - CQ'],
      'B: o caminho exato do sistema até a captura (inclui o 3.2 que o export não via) e o export depois dela');
    L.ok(bc[3].texto && bc[3].acao === 'Deliberação N1', 'o texto da ação ligado à mudança de estado do mesmo instante');
    L.ok(await pg.evaluate((k) => Ncrs.get(k).historico.length, B) === depois[1], 'o histórico da NCR não foi apagado nem reescrito');
    const ant = JSON.parse(JSON.stringify(EXTRATOR));
    ant.ncrs = [Object.assign({}, EXTRATOR.ncrs[0], { capturadoEm: '2025-02-01T00:00:00.000Z', eventos: [] })];
    const pa = L.arquivo('historico_antigo.json');
    fs.writeFileSync(pa, JSON.stringify(ant));
    const r4 = await importar(pg, () => botao(pg, 'Importar histórico NCR'), pa);
    L.ok(/Histórico do sistema importado/.test(r4) && /já havia captura mais recente\s*1/.test(r4),
      'o JSON do extrator pelo botão antigo também entra — e a captura mais antiga é ignorada');

    console.log('a ficha');
    await pg.evaluate((k) => NcrView.abrirFicha(k), B);
    await pg.waitForSelector('#ncrDialog[open] .nb-sec--fluxo svg');
    const ficha = await pg.innerText('#ncrDialog .nb-sec--fluxo');
    L.ok(/histórico do sistema \(NCR Integrada\) até 01\/03\/2025/.test(ficha), 'a ficha diz até quando vale a captura');
    L.ok(await pg.$eval('#ncrDialog .nb-sec--fluxo svg', svg => /✎/.test(svg.textContent)), 'o passo com texto da ação leva ✎');
    L.ok(!(await pg.$('#ncrDialog .nb-sis-diverge')), 'export mais novo que a captura: sem aviso de divergência');
    await pg.keyboard.press('Escape');

    console.log('o historico.json do NCR Control continua valendo');
    const leg = { tipo: 'historico', versao: 2, registros: [
      { ncr: C, data: '2025-02-20T00:00:00.000Z', tipo: 'INICIAL', campo: 'Status', de: null, para: 'ICN 1.1/1.2', cls: 'INICIAL' },
      { ncr: C, data: '2025-02-22T00:00:00.000Z', tipo: 'STATUS', campo: 'Status', de: 'ICN 1.1/1.2', para: '2.1 - Especialista ICN', cls: 'AVANCO' }] };
    const pl = L.arquivo('historico.json');
    fs.writeFileSync(pl, JSON.stringify(leg));
    await importar(pg, () => botao(pg, 'Importar histórico NCR'), pl);
    L.igual((await trajetoria(pg, C)).map(x => x.st), ['ICN 1.1/1.2', '2.1 - Especialista ICN', '3.2 - DA'],
      'o histórico de fora vale até o fim dele; a reconstrução não se intercala, e o caminho fecha no status do export');

    console.log('pasta da rede');
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(1500);
    const arq = JSON.parse(await lerDaPasta(pg, 'derrogacao-ncr-sistema.json') || '{}');
    L.ok(arq.format === 'derrogacao-ncr-sistema' && Object.keys(arq.capturas || {}).length === 2,
      'a pasta ganhou derrogacao-ncr-sistema.json com as 2 capturas');
    const banco = JSON.parse(await lerDaPasta(pg, 'derrogacao-ncr-banco.json') || '{}');
    L.ok(!/"capturas"/.test(JSON.stringify(banco)), 'as capturas não engordam o arquivo do banco');
    /* um colega capturou a C depois */
    await pg.evaluate(async (C) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('derrogacao-ncr-sistema.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      d.capturas[C] = { numero: C, capturadoEm: '2025-03-10T00:00:00.000Z', statusAtual: '3.2 - DA', eventos: [
        { tipo: 'CRIACAO', data: '2025-02-20T09:00:00.000Z', usuario: 'X' },
        { tipo: 'STATUS', data: '2025-03-01T09:00:00.000Z', usuario: 'Y', de: 'ICN 1.1/1.2', para: '3.2 - DA' }], acoes: [] };
      d.importacoes.push({ id: 'imp-colega', em: new Date().toISOString(), por: 'Colega', arquivo: 'colega.json' });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(d));
      await w.close();
    }, C);
    await pg.click('#atualizarBtn');
    await pg.waitForFunction(() => NcrHist.total() === 3, null, { timeout: 15000 });
    L.igual((await trajetoria(pg, C)).map(x => x.st + '@' + x.data), ['ICN 1.1/1.2@2025-02-20', '3.2 - DA@2025-03-01'],
      'a captura do colega chega pela pasta e corrige a trajetória');
    /* a minha captura que o arquivo da pasta perdeu volta para ele */
    await pg.evaluate(async (B) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('derrogacao-ncr-sistema.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      delete d.capturas[B];
      const w = await fh.createWritable();
      await w.write(JSON.stringify(d));
      await w.close();
    }, B);
    await pg.click('#atualizarBtn');
    await pg.waitForTimeout(1500);
    const volta = JSON.parse(await lerDaPasta(pg, 'derrogacao-ncr-sistema.json'));
    L.ok(Object.keys(volta.capturas).length === 3 && volta.capturas[B], 'a captura que a pasta não tinha volta para ela (nada se perde)');
    await pg.reload();
    await L.esperarPronto(pg);
    L.igual(await pg.evaluate(() => NcrHist.total()), 3, 'as capturas ficaram gravadas neste navegador');

    console.log('backup, publicação e visualizador');
    const bk = await pg.evaluate(() => { const nb = Ncrs.paraBackup(); return nb.sistema && Object.keys(nb.sistema.capturas).length; });
    L.igual(bk, 3, 'o backup de tudo leva as capturas (em ncrBase.sistema)');
    const muda = await pg.evaluate(async () => {
      const ps = await Store.list();
      const a1 = Publicacao.conteudo(ps, Ncrs.paraBackup(), []);
      NcrHist.importarExtrator({ tipo: NcrHist.TIPO_EXTRATOR, ncrs: [{ numero: 'NCR-ICN-ESC-14-0001-2025',
        capturadoEm: new Date().toISOString(), eventos: [] }] }, 'x.json', 'Teste');
      return Publicacao.conteudo(ps, Ncrs.paraBackup(), []) !== a1;
    });
    L.ok(muda, 'captura nova muda o conteúdo publicado (a publicação automática percebe)');
    await pg.reload();
    await L.esperarPronto(pg);
    const pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await s.contexto.newPage();
    outros.push(v);
    const errosV = [];
    v.on('pageerror', e => errosV.push(e.message));
    await v.goto(srv.url + 'index.html?modo=leitura');
    await v.waitForFunction(() => window.Ncrs && Ncrs.lista().length > 0, null, { timeout: 15000 });
    const vis = await v.evaluate((k) => ({ total: NcrHist.total(),
      seq: NcrFluxo.sequencia(Ncrs.get(k)).map(x => x.st || x.status),
      botao: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Histórico do NCR Integrada…' && b.offsetParent) }), B);
    L.ok(vis.total === 3 && vis.seq.length === 5, 'o visualizador recebe as capturas e mostra a trajetória corrigida');
    L.ok(!vis.botao, 'e não oferece o extrator');
    L.ok(!errosV.length, 'visualizador sem erro');
  } catch (e) {
    L.ok(false, 'exceção: ' + (e && e.stack || e));
  } finally {
    for (const o of outros) await o.close().catch(() => {});
    await s.navegador.close();
    srv.fechar();
  }
  process.exitCode = L.resultado('historico', s.erros) ? 1 : 0;
})();
