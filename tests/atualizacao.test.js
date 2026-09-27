/* Atualização automática: um ciclo só (sem temporizador a mais ao trocar de
   aba), o contador, o botão que atualiza e recomeça a contagem, a espera
   quando alguém digita, a pausa em segundo plano, a falha que não apaga o
   que está à vista — no editor com a pasta e no visualizador. */
'use strict';
const L = require('./lib');

/* conta os setInterval de 1 s vivos: o do contador é um só */
const CONTA_TIMERS = `(() => {
  const vivos = new Set();
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (fn, ms) { const id = si.apply(window, arguments); if (ms === 1000) vivos.add(id); return id; };
  window.clearInterval = function (id) { vivos.delete(id); return ci.apply(window, arguments); };
  window.__timers1s = () => vivos.size;
})();`;

/* finge a janela em segundo plano (ou de volta) */
function segundoPlano(pg, oculto) {
  return pg.evaluate((o) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => o });
    document.dispatchEvent(new Event('visibilitychange'));
  }, oculto);
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  await s.contexto.addInitScript(L.intervaloCurto(4000));
  await s.contexto.addInitScript(CONTA_TIMERS);
  const pg = s.pagina;
  let vis = null;
  try {
    await L.semear(pg, srv.url);

    console.log('editor, antes da pasta');
    L.ok(await pg.evaluate(() => document.getElementById('atualizaBox').hidden), 'sem a pasta, nada a atualizar: o botão e o contador não aparecem');

    console.log('editor com a pasta da equipe');
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(300);
    L.ok(await pg.evaluate(() => !document.getElementById('atualizaBox').hidden), 'com a pasta: "⟳ Atualizar" à vista');
    L.ok(/^próxima em 00:0\d$/.test(await pg.textContent('#atualizarConta')), 'o contador regressivo: ' + await pg.textContent('#atualizarConta'));
    L.ok(/Próxima atualização em/.test(await pg.getAttribute('#atualizarBtn', 'title')), 'a frase inteira na dica do botão');

    for (const k of ['kanban', 'banco', 'tabela', 'resumo', 'ncr', 'dev', 'fluxos', 'ncr']) {
      await pg.click('.tab[data-kind="' + k + '"]');
    }
    L.igual(await pg.evaluate(() => window.__timers1s()), 1, 'trocar de aba não cria outro temporizador (um só de 1 s)');

    /* um colega grava na pasta */
    const colega = (texto) => pg.evaluate(async (t) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('derrogacao-dados.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      const it = d.projects.find(x => x.marco === 'J09').ncrs[0];
      it.arguments = t; it.editedAt = new Date(Date.now() + 1000).toISOString(); it.editedBy = 'Colega';
      const w = await fh.createWritable(); await w.write(JSON.stringify(d)); await w.close();
    }, texto);

    await colega('TEXTO DO COLEGA 1');
    const chegou = await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 1',
      null, { timeout: 12000 }).then(() => true, () => false);
    L.ok(chegou, 'no fim da contagem, o que o colega gravou aparece sozinho, sem recarregar a página');

    console.log('o que está aqui não se perde');
    await pg.fill('#f-whyNotPossible', 'escrito aqui agora');
    await colega('TEXTO DO COLEGA 2');
    await pg.waitForTimeout(1500);
    L.ok(/em espera/.test(await pg.textContent('#atualizarConta')) || /próxima/.test(await pg.textContent('#atualizarConta')),
      'digitando, a atualização espera: ' + await pg.textContent('#atualizarConta'));
    await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 2', null, { timeout: 20000 });
    L.igual(await pg.inputValue('#f-whyNotPossible'), 'escrito aqui agora', 'o campo escrito aqui continua, junto com o do colega');
    const naPasta = await pg.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const d = JSON.parse(await (await (await (await raiz.getDirectoryHandle('Derrogacao')).getFileHandle('derrogacao-dados.json')).getFile()).text());
      const it = d.projects.find(x => x.marco === 'J09').ncrs[0];
      return [it.whyNotPossible, it.arguments];
    });
    L.igual(naPasta, ['escrito aqui agora', 'TEXTO DO COLEGA 2'], 'e os dois textos foram para a pasta');

    console.log('botão manual');
    await pg.waitForTimeout(2500);
    const antes = await pg.textContent('#atualizarConta');
    await pg.click('#atualizarBtn');
    await pg.waitForTimeout(700);
    const depois = await pg.textContent('#atualizarConta');
    L.ok(/próxima em 00:0[34]/.test(depois), 'depois do clique a contagem recomeça (' + antes + ' → ' + depois + ')');

    console.log('segundo plano');
    await segundoPlano(pg, true);
    L.igual(await pg.evaluate(() => window.__timers1s()), 0, 'em segundo plano o contador para');
    await colega('TEXTO DO COLEGA 3');
    await pg.waitForTimeout(6000);
    L.ok(await pg.inputValue('#f-arguments') !== 'TEXTO DO COLEGA 3', 'e nada é relido enquanto a janela está escondida');
    await segundoPlano(pg, false);
    const voltou = await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 3',
      null, { timeout: 8000 }).then(() => true, () => false);
    L.ok(voltou, 'ao voltar, confere e traz o que chegou');
    L.igual(await pg.evaluate(() => window.__timers1s()), 1, 'e volta a um temporizador só');

    console.log('visualizador');
    let pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    vis = await L.abrir();
    await vis.contexto.addInitScript(L.intervaloCurto(3000));
    const vp = vis.pagina;
    await vp.goto(srv.url + 'index.html?modo=leitura');
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.waitForTimeout(300);
    L.ok(!(await vp.evaluate(() => document.getElementById('atualizaBox').hidden)) && /próxima em/.test(await vp.textContent('#atualizarConta')),
      'o visualizador mostra o botão e o contador');
    pub = pub.replace('Argumentos do item 11', 'PUBLICADO DE NOVO');
    await vp.selectOption('#projectSelect', { label: await vp.$eval('#projectSelect', s => Array.from(s.options).find(o => /^J09 \(/.test(o.textContent)).textContent) });
    await vp.click('.ncr-item:nth-child(2)');
    const pubChegou = await vp.waitForFunction(() => document.getElementById('f-arguments').value === 'PUBLICADO DE NOVO',
      null, { timeout: 10000 }).then(() => true, () => false);
    L.ok(pubChegou, 'no fim da contagem, a publicação nova aparece — no mesmo item que estava aberto');
    /* a publicação some: os dados à vista ficam, com um aviso discreto */
    srv.extras['visualizador-dados.js'] = null;
    delete srv.extras['visualizador-dados.js'];
    await vp.click('#atualizarBtn');
    await vp.waitForTimeout(1500);
    const falha = await vp.evaluate(() => ({
      aviso: !document.getElementById('leituraAviso').hidden, texto: document.getElementById('leituraAvisoTexto').textContent,
      conta: document.getElementById('atualizarConta').textContent, itens: document.querySelectorAll('.ncr-item').length
    }));
    L.ok(falha.aviso && /Não foi possível ler/.test(falha.texto), 'a falha vira um aviso discreto: ' + falha.texto.slice(0, 60) + '…');
    L.ok(falha.itens >= 16 && /falhou/.test(falha.conta), 'os dados à vista continuam, e o contador diz que falhou (' + falha.conta + ')');
  } finally {
    const f = L.resultado('atualização automática', s.erros.concat(vis ? vis.erros.filter(e => !/404|Failed to load resource/.test(e)) : []));
    if (vis) await vis.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
