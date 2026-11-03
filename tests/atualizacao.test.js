/* Atualização: no editor, sem relógio de 5 minutos (a conferência de 20 s
   traz o colega, confere ao voltar para a janela, e "⟳ Atualizar" lê na
   hora); no visualizador, o ciclo único com o contador no ⋯ Mais, que NÃO
   recomeça ao trocar de aba, espera enquanto a janela está escondida e roda
   ao voltar se o prazo venceu — e a falha que não apaga o que está à vista. */
'use strict';
const L = require('./lib');

/* conta os setInterval de 1 s vivos: o do contador */
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

/* "próxima em 00:07" → 7 */
function segundos(t) {
  const m = /(\d\d):(\d\d)/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  await s.contexto.addInitScript(CONTA_TIMERS);
  const pg = s.pagina;
  let vis = null;
  try {
    await L.semear(pg, srv.url);

    console.log('editor, antes da pasta');
    L.ok(await pg.evaluate(() => document.getElementById('atualizaBox').hidden), 'sem a pasta, nada a atualizar: o botão não aparece');

    console.log('editor com a pasta da equipe: sem relógio de 5 minutos');
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(300);
    const ed = await pg.evaluate(() => ({
      box: !document.getElementById('atualizaBox').hidden, btn: document.getElementById('atualizarBtn').textContent,
      menu: document.getElementById('atualizaMenu').hidden, ciclo: Atualizacao.estado().ligado, t1s: window.__timers1s()
    }));
    L.ok(ed.box && ed.btn === '⟳ Atualizar', 'com a pasta: só o botão "⟳ Atualizar", sem contador');
    L.ok(ed.menu && !ed.ciclo && ed.t1s === 0, 'nenhum relógio de 5 minutos no editor (nem contador no ⋯ Mais)');

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

    console.log('botão manual');
    await colega('TEXTO DO COLEGA 1');
    await pg.click('#atualizarBtn');
    const manual = await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 1',
      null, { timeout: 5000 }).then(() => true, () => false);
    L.ok(manual, '"⟳ Atualizar" lê a pasta na hora e traz o que o colega gravou');

    console.log('a conferência de 20 s, e o que está aqui não se perde');
    await pg.fill('#f-whyNotPossible', 'escrito aqui agora');
    await colega('TEXTO DO COLEGA 2');
    const veio = await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 2',
      null, { timeout: 30000 }).then(() => true, () => false);
    L.ok(veio, 'sem clicar em nada, a conferência de 20 s traz o que o colega gravou');
    L.igual(await pg.inputValue('#f-whyNotPossible'), 'escrito aqui agora', 'o campo escrito aqui continua, junto com o do colega');
    const naPasta = await pg.evaluate(async () => {
      const raiz = await navigator.storage.getDirectory();
      const d = JSON.parse(await (await (await (await raiz.getDirectoryHandle('Derrogacao')).getFileHandle('derrogacao-dados.json')).getFile()).text());
      const it = d.projects.find(x => x.marco === 'J09').ncrs[0];
      return [it.whyNotPossible, it.arguments];
    });
    L.igual(naPasta, ['escrito aqui agora', 'TEXTO DO COLEGA 2'], 'e os dois textos foram para a pasta');

    console.log('segundo plano');
    /* a gravação do que foi digitado acima (2,5 s depois) roda mesmo em
       segundo plano — ela leva o trabalho daqui para a pasta; espera acabar */
    await pg.waitForTimeout(6000);
    await segundoPlano(pg, true);
    await colega('TEXTO DO COLEGA 3');
    await pg.waitForTimeout(22000);
    L.ok(await pg.inputValue('#f-arguments') !== 'TEXTO DO COLEGA 3', 'com a janela escondida nada é relido');
    await segundoPlano(pg, false);
    const voltou = await pg.waitForFunction(() => document.getElementById('f-arguments').value === 'TEXTO DO COLEGA 3',
      null, { timeout: 5000 }).then(() => true, () => false);
    L.ok(voltou, 'ao voltar para a janela, confere na hora e traz o que chegou');

    console.log('visualizador');
    let pub = await L.publicacao(pg);
    srv.extras['visualizador-dados.js'] = () => pub;
    vis = await L.abrir();
    await vis.contexto.addInitScript(L.intervaloCurto(10000));
    await vis.contexto.addInitScript(CONTA_TIMERS);
    const vp = vis.pagina;
    await vp.goto(srv.url + 'index.html?modo=leitura');
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.waitForTimeout(300);
    const v0 = await vp.evaluate(() => ({ box: !document.getElementById('atualizaBox').hidden,
      btn: document.getElementById('atualizarBtn').textContent, menu: !document.getElementById('atualizaMenu').hidden,
      conta: document.getElementById('atualizarConta').textContent, dica: document.getElementById('atualizarBtn').title }));
    L.ok(v0.box && v0.btn === '⟳ Atualizar', 'na barra, só o botão "⟳ Atualizar"');
    L.ok(v0.menu && /^próxima em 00:\d\d$/.test(v0.conta), 'o contador fica no ⋯ Mais: ' + v0.conta);
    L.ok(/Próxima atualização em/.test(v0.dica), 'e a frase inteira na dica do botão');
    for (const k of ['kanban', 'banco', 'tabela', 'resumo', 'ncr', 'dev', 'fluxos', 'ncr']) {
      await vp.click('.tab[data-kind="' + k + '"]');
    }
    L.igual(await vp.evaluate(() => window.__timers1s()), 1, 'trocar de área não cria outro temporizador (um só de 1 s)');

    console.log('visualizador: trocar de aba do navegador não recomeça a contagem');
    await vp.waitForTimeout(3000);
    const antes = segundos(await vp.textContent('#atualizarConta'));
    await segundoPlano(vp, true);
    L.igual(await vp.evaluate(() => window.__timers1s()), 0, 'em segundo plano o contador para de tiquetaquear');
    await vp.waitForTimeout(2000);
    await segundoPlano(vp, false);
    await vp.waitForTimeout(200);
    const depois = segundos(await vp.textContent('#atualizarConta'));
    L.ok(antes > 0 && depois <= antes - 1 && depois >= antes - 3,
      'ao voltar, a contagem continua de onde estava (' + antes + ' s → ' + depois + ' s), sem recomeçar');

    pub = pub.replace('Argumentos do item 11', 'PUBLICADO DE NOVO');
    await vp.selectOption('#projectSelect', { label: await vp.$eval('#projectSelect', s => Array.from(s.options).find(o => /^J09 \(/.test(o.textContent)).textContent) });
    await vp.click('.ncr-item:nth-child(2)');
    await segundoPlano(vp, true);
    await vp.waitForTimeout(depois * 1000 + 1500);
    L.ok(await vp.inputValue('#f-arguments') !== 'PUBLICADO DE NOVO', 'o prazo venceu com a janela escondida: nada foi lido ainda');
    await segundoPlano(vp, false);
    const pubChegou = await vp.waitForFunction(() => document.getElementById('f-arguments').value === 'PUBLICADO DE NOVO',
      null, { timeout: 4000 }).then(() => true, () => false);
    L.ok(pubChegou, 'ao voltar, confere na hora — e a publicação nova aparece no mesmo item que estava aberto');

    /* a publicação some: os dados à vista ficam, com um aviso discreto */
    delete srv.extras['visualizador-dados.js'];
    await vp.click('#atualizarBtn');
    await vp.waitForTimeout(1500);
    const falha = await vp.evaluate(() => ({
      aviso: !document.getElementById('leituraAviso').hidden, texto: document.getElementById('leituraAvisoTexto').textContent,
      conta: document.getElementById('atualizarConta').textContent, itens: document.querySelectorAll('.ncr-item').length,
      btn: document.getElementById('atualizarBtn').classList.contains('is-aviso')
    }));
    L.ok(falha.aviso && /Não foi possível ler/.test(falha.texto), 'a falha vira um aviso discreto: ' + falha.texto.slice(0, 60) + '…');
    L.ok(falha.itens >= 16 && /falhou/.test(falha.conta) && falha.btn,
      'os dados à vista continuam; o ⋯ Mais diz que falhou (' + falha.conta + ') e o botão fica em destaque');
  } finally {
    const f = L.resultado('atualização automática', s.erros.concat(vis ? vis.erros.filter(e => !/404|Failed to load resource/.test(e)) : []));
    if (vis) await vis.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
