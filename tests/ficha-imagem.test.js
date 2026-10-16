/* A ficha da NCR em imagem A4, escolhendo o que entra (pedido do Bruno, 16/10:
   "se eu quisesse o fluxo, por exemplo, não consigo adicionar na imagem").
   A janela lista as seções da ficha (as vazias apagadas), o fluxo em
   trajetória ou mapa, e o tamanho: uma folha (a letra diminui e o fim das
   listas é cortado, dito na prévia) ou quantas folhas forem precisas (uma
   imagem por folha). As escolhas ficam no navegador. Também no visualizador. */
'use strict';
const L = require('./lib');

function png(buf) {
  return { ok: buf.slice(1, 4).toString() === 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ viewport: { width: 1500, height: 1000 } });
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    const N = L.numero(2);
    await pg.evaluate((n) => NcrView.abrirFicha(n), N);
    await pg.waitForSelector('#ncrDialog[open]');

    console.log('a janela');
    await pg.click('#ncrDialog .nb-ficha-cab .btn:has-text("Imagem")');
    await pg.waitForSelector('#ncrImgDialog[open]');
    await pg.waitForFunction(() => /folha/.test(document.getElementById('nbImgPrevia').textContent));
    const jan = await pg.evaluate(() => {
      const cb = n => document.querySelector('input[name="nbImg-' + n + '"]');
      return { waiver: cb('waiver').checked, banco: cb('banco').checked, fluxo: cb('fluxo').checked, fluxoOn: !cb('fluxo').disabled,
        aud: cb('auditoria').disabled, previa: document.getElementById('nbImgPrevia').textContent };
    });
    L.ok(jan.waiver && jan.banco && !jan.fluxo, 'de saída, a imagem de antes: Waiver e banco NCR marcados, o fluxo não');
    L.ok(jan.fluxoOn, 'o fluxo pode ser escolhido');
    L.ok(jan.aud, 'seção sem nada nesta NCR (auditoria) vem apagada');
    L.ok(/Cabe numa folha/.test(jan.previa), 'a prévia diz se cabe: ' + jan.previa);

    console.log('com o fluxo');
    await pg.check('input[name="nbImg-fluxo"]');
    await pg.check('input[name="nbImgFluxo"][value="mapa"]');
    await pg.waitForTimeout(400);
    const blocos = await pg.evaluate((n) => {
      const rec = Ncrs.get(n);
      const b = NcrView.blocosDaImagem(rec, { secoes: { fluxo: true }, fluxo: 'mapa' }, { img: new Image(), w: 800, h: 300 },
        { campos: Infinity, prod: Infinity, det: Infinity, hist: Infinity, aud: Infinity }).blocos;
      return b.map(x => x.t + (x.titulo ? ':' + x.titulo : ''));
    }, N);
    L.ok(blocos.indexOf('sec:Fluxo da NCR') >= 0 && blocos.indexOf('img') >= 0 && blocos.indexOf('legenda') >= 0,
      'com o fluxo marcado, a imagem leva o desenho e a legenda');
    L.ok(blocos.indexOf('sec:Dados do Waiver') < 0, 'e só o que foi marcado: ' + blocos.join(', '));
    const um = await L.baixar(pg, () => pg.click('#nbImgBaixar'));
    const d1 = png(um.buffer);
    L.ok(d1.ok && d1.w === 2480 && d1.h === 3508 && um.nome === 'NCR_' + N + '.png', 'uma folha A4 a 300 dpi: ' + um.nome);
    L.ok(!(await pg.evaluate(() => document.getElementById('ncrImgDialog').open)), 'a janela fecha ao baixar');

    console.log('as escolhas ficam');
    await pg.click('#ncrDialog .nb-ficha-cab .btn:has-text("Imagem")');
    await pg.waitForSelector('#ncrImgDialog[open]');
    L.ok(await pg.isChecked('input[name="nbImg-fluxo"]') && await pg.isChecked('input[name="nbImgFluxo"][value="mapa"]'),
      'reaberta, a janela lembra o fluxo e o mapa');

    console.log('quantas folhas forem precisas');
    await pg.evaluate((n) => {
      const r = Ncrs.get(n);
      for (let i = 0; i < 60; i++) r.historico.push({ id: 'teste' + i, data: new Date(2025, 0, 10 + i).toISOString(), tipo: 'STATUS',
        campo: 'Status', de: 'A' + i, para: 'B' + i, obs: 'observação do passo ' + i + ', comprida o bastante para quebrar a linha', responsavel: 'Fulano', cls: 'AVANCO' });
    }, N);
    await pg.click('button:has-text("Marcar tudo")');
    await pg.waitForFunction(() => /Não cabe tudo/.test(document.getElementById('nbImgPrevia').textContent));
    L.ok(/evento\(s\) do histórico/.test(await pg.textContent('#nbImgPrevia')), 'numa folha só, a prévia diz o que fica de fora');
    await pg.check('input[name="nbImgTam"][value="folhas"]');
    await pg.waitForFunction(() => /Vai sair em \d+ folhas/.test(document.getElementById('nbImgPrevia').textContent));
    const n = Number(/(\d+) folhas/.exec(await pg.textContent('#nbImgPrevia'))[1]);
    L.ok(n >= 2, 'em várias folhas: ' + n);
    const baixados = [];
    pg.on('download', d => baixados.push(d));
    await pg.click('#nbImgBaixar');
    for (let t = 0; t < 40 && baixados.length < n; t++) await pg.waitForTimeout(250);
    L.igual(baixados.length, n, 'uma imagem por folha');
    const nomes = baixados.map(d => d.suggestedFilename());
    L.ok(nomes.every((x, i) => x === 'NCR_' + N + '_folha' + (i + 1) + 'de' + n + '.png'), 'numeradas: ' + nomes[0] + ' …');
    const ult = png(require('fs').readFileSync(await baixados[n - 1].path()));
    L.ok(ult.ok && ult.w === 2480 && ult.h === 3508, 'cada uma, uma folha A4');
    await pg.evaluate(() => document.getElementById('ncrDialog').close());

    console.log('visualizador');
    const pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await s.contexto.newPage();
    await v.goto(srv.url + 'index.html?modo=leitura');
    await v.waitForFunction(() => window.Ncrs && Ncrs.get && Ncrs.lista().length > 0, null, { timeout: 15000 });
    await v.evaluate((k) => { document.querySelector('.tab[data-kind="banco"]').click(); NcrView.abrirFicha(k); }, N);
    await v.waitForSelector('#ncrDialog[open]');
    await v.click('#ncrDialog .nb-ficha-cab .btn:has-text("Imagem")');
    await v.waitForSelector('#ncrImgDialog[open]');
    const vb = await L.baixar(v, () => v.click('#nbImgBaixar'));
    L.ok(png(vb.buffer).ok, 'no visualizador a janela abre e baixa (só baixa)');
    await v.close();
  } catch (e) {
    L.ok(false, 'exceção: ' + (e && e.stack || e));
  } finally {
    await s.navegador.close();
    srv.fechar();
  }
  process.exitCode = L.resultado('ficha-imagem', s.erros) ? 1 : 0;
})();
