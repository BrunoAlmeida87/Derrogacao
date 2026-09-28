/* Comunicados do editor para o visualizador: qualquer marco pode ser
   comunicado pelo botão, e só o J09 ganha a oferta automática depois de uma
   mudança (J08 e J09 Ind não); nada nasce sem o clique, a prévia com todos os
   campos, o arquivo na pasta da equipe, o aviso de "já comunicado", a
   retenção, a publicação, o backup (com e sem a coleção) — e, no
   visualizador, o pop-up consolidado, "Abrir waiver", "Marcar como lido"
   que sobrevive ao recarregar, "Depois" e o prazo de 4 dias (sempre). */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

/* lê um arquivo da pasta falsa (OPFS) do editor */
function lerDaPasta(pg, nome) {
  return pg.evaluate(async (n) => {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('Derrogacao');
    try { return await (await (await dir.getFileHandle(n)).getFile()).text(); } catch (e) { return null; }
  }, nome);
}

/* o texto do aviso do pé da tela, e os botões dele */
function aviso(pg) {
  return pg.evaluate(() => {
    const t = document.getElementById('toast');
    return { visivel: !t.hidden, texto: t.textContent, botoes: Array.from(t.querySelectorAll('button')).map(b => b.textContent) };
  });
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  const pg = s.pagina;
  const outros = [];
  const SEGREDO = 'MENSAGEM-MARCADA-QUE-NAO-PODE-IR-AO-DIARIO';
  try {
    await L.semear(pg, srv.url);
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(500);

    console.log('quais marcos têm a oferta automática — e todos têm o botão');
    const marcos = await pg.evaluate(() => ['J09', ' j 9 ', 'RANAE J09', 'J09 Ind', 'J09Cer', 'J08', 'J19', 'J090', 'J10']
      .map(t => [t, Comunicados.monitorado(t)]));
    L.igual(marcos.filter(m => m[1]).map(m => m[0]), ['J09', ' j 9 ', 'RANAE J09'],
      'J09 (com variação de caixa, espaço e o prefixo RANAE) sim; J09 Ind, J09Cer, J08, J19, J090, J10 não');
    L.igual(await pg.evaluate(() => Config.MARCOS_COMUNICADOS), ['J09'], 'a lista vem de um lugar só: Config.MARCOS_COMUNICADOS');
    const tipos2 = await pg.evaluate(() => {
      return Store.list().then(lista => {
        const por = m => lista.find(p => p.marco === m);
        const r = {};
        ['J08', 'J09 Ind', 'J09'].forEach(m => {
          const p = por(m);
          r[m] = [Comunicados.tiposDoItem(p, 'ncr', p.ncrs.find(n => n.status !== 'aceito')),
            Comunicados.tiposDoItem(p, 'ncr', p.ncrs.find(n => n.status === 'aceito'))];
        });
        return r;
      });
    });
    L.igual(tipos2['J08'], [['novo-waiver'], ['novo-waiver', 'waiver-aceito']], 'item do J08: também pode ser comunicado');
    L.igual(tipos2['J09 Ind'], [['novo-waiver'], ['novo-waiver', 'waiver-aceito']], 'item do J09 Ind: também pode ser comunicado');
    L.igual(await pg.evaluate(() => Store.list().then(l => ['J08', 'J09 Ind', 'J09'].map(m => Comunicados.sugere(l.find(p => p.marco === m), 'ncr')))),
      [false, false, true], 'mas a oferta automática depois de uma mudança é só do J09');
    L.igual(await pg.evaluate(() => [Comunicados.marcoPara('RANAE J09'), Comunicados.marcoPara(' J10 '), Comunicados.marcoPara('J09  Ind'), Comunicados.marcoPara('')]),
      ['J09', 'J10', 'J09 Ind', ''], 'o marco do comunicado: o nome da lista para o J09, o texto escrito para os outros, nada sem marco');
    L.igual(tipos2['J09'], [['novo-waiver'], ['novo-waiver', 'waiver-aceito']],
      'item do J09: "novo waiver"; aceito (pelo valor interno "aceito"): também "waiver accepted"');

    console.log('editor: nada nasce sem o clique');
    L.ok(/^J09 \(/.test(await pg.$eval('#projectSelect', s => s.options[s.selectedIndex].textContent)), 'o J09 está aberto');
    await pg.click('.ncr-item:nth-child(1)');
    const numero = await pg.inputValue('#f-ncrId');
    const antes = await pg.evaluate(() => document.querySelector('.status-op.is-on .status-op-name').textContent);
    L.ok(await pg.$('#comunicarItemBtn') !== null, 'item do J09: o botão 📣 Comunicar está na barra de situação');
    await pg.click('.status-op:has-text("Waiver accepted")');
    await pg.waitForTimeout(400);
    let t = await aviso(pg);
    L.ok(/Waiver accepted/.test(t.texto) && t.botoes.indexOf('📣 Comunicar') >= 0,
      'aceitar o waiver salva como sempre e o aviso oferece "📣 Comunicar": ' + t.texto.slice(0, 50));
    L.igual(await pg.evaluate(() => Comunicados.locais().length), 0, 'mas nenhum comunicado foi criado');
    await pg.waitForTimeout(3500);   /* a gravação na pasta acontece 2,5 s depois */
    L.igual(await lerDaPasta(pg, 'comunicados.json'), null, 'e nada foi para a pasta (comunicados.json nem existe)');

    console.log('a prévia');
    await pg.click('#comunicarItemBtn');
    await pg.waitForFunction(() => document.getElementById('comunicarDialog').open);
    const previa = await pg.evaluate(() => {
      const dl = document.getElementById('comunicarCampos');
      const campos = {};
      const dts = dl.querySelectorAll('dt');
      dts.forEach(dt => { campos[dt.textContent] = dt.nextElementSibling.textContent; });
      return {
        campos: campos, frase: document.querySelector('#comunicarPrevia .com-frase').textContent,
        tipos: Array.from(document.querySelectorAll('#comunicarTipos input')).map(i => i.value + (i.checked ? '*' : '')),
        botao: document.getElementById('comunicarOk').textContent, ja: !document.getElementById('comunicarJa').hidden
      };
    });
    L.igual(Object.keys(previa.campos), ['Tipo', 'Marco', 'Número', 'Situação nova', 'Título', 'Autor', 'Data e hora'],
      'a prévia mostra tipo, marco, número, situação nova, título, autor, data e hora');
    L.igual(previa.campos['Tipo'], 'Waiver accepted', 'tipo: Waiver accepted (o item está aceito)');
    L.igual(previa.campos['Marco'], 'J09', 'marco: J09');
    L.ok(previa.campos['Número'].indexOf(numero) === 0 && /Waiver NCR/.test(previa.campos['Número']), 'número: ' + previa.campos['Número']);
    L.igual(previa.campos['Situação nova'], 'Waiver accepted (antes: ' + antes + ')',
      'situação nova, com a de antes (mesmo pelo botão da barra): ' + previa.campos['Situação nova']);
    L.igual(previa.campos['Autor'], 'Teste', 'autor: quem está usando');
    L.igual(previa.frase, 'O waiver da ' + numero + ', no marco J09, foi aceito.', 'a frase do comunicado se entende sozinha');
    L.igual(previa.tipos, ['novo-waiver', 'waiver-aceito*'], 'dá para escolher entre "novo waiver" e "waiver accepted"');
    L.ok(!previa.ja && /Publicar comunicado/.test(previa.botao), 'nada comunicado ainda: "📣 Publicar comunicado"');
    await pg.fill('#comunicarMsg', 'x'.repeat(300));
    L.igual((await pg.inputValue('#comunicarMsg')).length, 280, 'a mensagem opcional tem no máximo 280 caracteres');
    await pg.fill('#comunicarMsg', SEGREDO);
    L.ok(await pg.textContent('#comunicarPrevia .com-msg-texto') === SEGREDO &&
      /Mensagem de Teste/.test(await pg.textContent('#comunicarPrevia .com-msg-rot')),
      'a mensagem aparece na prévia enquanto se escreve, com o nome de quem comunicou');
    const destaque = await pg.$eval('#comunicarPrevia .com-msg-texto', n => {
      const c = getComputedStyle(n), b = getComputedStyle(n.parentNode);
      return { peso: Number(c.fontWeight), fundo: b.backgroundColor, barra: b.borderLeftWidth };
    });
    L.ok(destaque.peso >= 700 && destaque.fundo !== 'rgba(0, 0, 0, 0)' && destaque.barra === '3px',
      'a mensagem sai destacada: negrito, fundo próprio e barra lateral');
    await pg.screenshot({ path: L.arquivo('comunicados-previa.png') });
    await pg.click('#comunicarCancelarBtn');
    L.igual(await pg.evaluate(() => Comunicados.locais().length), 0, 'Cancelar não cria nada');

    console.log('publicar o comunicado');
    await pg.click('#comunicarItemBtn');
    await pg.fill('#comunicarMsg', SEGREDO);
    await pg.click('#comunicarOk');
    await pg.waitForFunction(() => !document.getElementById('comunicarDialog').open);
    await pg.waitForTimeout(800);
    const locais = await pg.evaluate(() => Comunicados.locais());
    L.igual(locais.length, 1, 'o clique cria um comunicado');
    const c1 = locais[0];
    const campos = ['id', 'tipo', 'projetoId', 'marco', 'kind', 'itemId', 'ncrKey', 'numero', 'resumo', 'statusAntes',
      'statusNovo', 'mensagem', 'autor', 'em', 'chave'];
    L.igual(Object.keys(c1).sort(), campos.slice().sort(), 'com os campos mínimos, e só eles');
    L.ok(c1.tipo === 'waiver-aceito' && c1.statusNovo === 'aceito' && c1.statusAntes === 'justificar' && c1.kind === 'ncr' && c1.marco === 'J09',
      'tipo, situação anterior e nova pelos valores internos (' + c1.statusAntes + ' → ' + c1.statusNovo + ')');
    L.ok(c1.resumo.length <= 140, 'o título curto não passa de 140 caracteres (' + c1.resumo.length + ')');
    const arq = JSON.parse(await lerDaPasta(pg, 'comunicados.json') || 'null');
    L.ok(arq && arq.format === 'derrogacao-comunicados' && arq.comunicados.length === 1 && arq.comunicados[0].id === c1.id,
      'foi para a pasta da equipe, em comunicados.json');
    const dados = JSON.parse(await lerDaPasta(pg, 'derrogacao-dados.json'));
    L.ok(!('comunicados' in dados), 'o derrogacao-dados.json não ganhou campo novo');
    t = await aviso(pg);
    L.ok(/Comunicado guardado na pasta da equipe/.test(t.texto) && t.botoes.indexOf('Publicar…') >= 0,
      'sem a pasta dos visualizadores, o aviso diz que vai na próxima publicação: ' + t.texto.slice(0, 60));

    console.log('duplicado');
    await pg.click('#comunicarItemBtn');
    const dup = await pg.evaluate(() => ({ ja: !document.getElementById('comunicarJa').hidden,
      texto: document.getElementById('comunicarJa').textContent, botao: document.getElementById('comunicarOk').textContent }));
    L.ok(dup.ja && /já foi comunicado/.test(dup.texto) && /por Teste/.test(dup.texto), 'o mesmo acontecimento avisa "já comunicado … por Teste"');
    L.ok(/Comunicar de novo/.test(dup.botao), 'e o botão passa a dizer "Comunicar de novo"');
    await pg.click('#comunicarCancelarBtn');

    console.log('item novo, ainda sem número');
    await pg.click('#addNcrBtn');
    await pg.waitForTimeout(300);
    await pg.click('#comunicarItemBtn');
    t = await aviso(pg);
    L.ok(/Escreva o número/.test(t.texto) && !(await pg.evaluate(() => document.getElementById('comunicarDialog').open)),
      '"+ Nova NCR" no J09: o 📣 já está lá, e sem número ele diz o que falta');
    await pg.fill('#f-ncrId', 'NCR-NOVA-J09-1');
    await pg.click('#comunicarItemBtn');
    L.ok(await pg.evaluate(() => document.getElementById('comunicarDialog').open) &&
      (await pg.textContent('#comunicarPrevia .com-frase')) === 'Um novo waiver foi adicionado ao marco J09: NCR-NOVA-J09-1.',
      'com o número escrito, a prévia do "novo waiver" abre na hora, sem redesenhar a tela');
    await pg.click('#comunicarCancelarBtn');
    await pg.click('#delNcrBtn');
    await pg.waitForTimeout(300);

    console.log('outros marcos');
    await pg.selectOption('#projectSelect', { label: await pg.$eval('#projectSelect', s => Array.from(s.options).find(o => /^J08 \(/.test(o.textContent)).textContent) });
    await pg.click('.ncr-item:nth-child(4)');
    L.ok(await pg.$('#comunicarItemBtn') !== null, 'item do J08: o botão 📣 está na barra (qualquer marco, quando quiser)');
    await pg.click('.status-op:has-text("Waiver requested")');
    await pg.click('.status-op:has-text("Waiver accepted")');
    await pg.waitForTimeout(400);
    t = await aviso(pg);
    L.ok(t.botoes.indexOf('📣 Comunicar') < 0, 'aceitar um waiver do J08 não OFERECE comunicado sozinho');
    const quantosAntes = await pg.evaluate(() => Comunicados.locais().length);
    await pg.click('#comunicarItemBtn');
    L.ok(/^O waiver da NCR-.*, no marco J08, foi aceito\.$/.test(await pg.textContent('#comunicarPrevia .com-frase')),
      'mas o botão abre a prévia do J08: ' + await pg.textContent('#comunicarPrevia .com-frase'));
    await pg.click('#comunicarCancelarBtn');
    L.igual(await pg.evaluate(() => Comunicados.locais().length), quantosAntes, 'e cancelar não cria nada');
    await pg.selectOption('#projectSelect', { label: await pg.$eval('#projectSelect', s => Array.from(s.options).find(o => /^J09 Ind/.test(o.textContent)).textContent) });
    await pg.click('.ncr-item:nth-child(1)');
    L.ok(await pg.$('#comunicarItemBtn') !== null, 'item do J09 Ind: também tem o botão 📣');
    await pg.click('#comunicarItemBtn');
    L.ok(/marco J09 Ind/.test(await pg.textContent('#comunicarPrevia .com-frase')),
      'e o comunicado sai como "J09 Ind", não como J09: ' + await pg.textContent('#comunicarPrevia .com-frase'));
    await pg.click('#comunicarCancelarBtn');

    console.log('nova NCR, pelo banco');
    await pg.click('.tab[data-kind="banco"]');
    const alvo = await pg.evaluate(() => Ncrs.lista().find(r => r.waiver.marcoAtual === 'J08').key);
    await pg.evaluate((k) => NcrView.abrirFicha(k), alvo);
    await pg.waitForFunction(() => document.getElementById('ncrDialog').open);
    L.ok(await pg.evaluate(() => Array.from(document.querySelectorAll('#ncrDialog button')).some(b => /Comunicar: nova NCR no J08/.test(b.textContent))),
      'NCR com Marco Atual J08: a ficha tem "📣 Comunicar: nova NCR no J08"');
    await pg.selectOption('#nbFicha-marcoAtual', 'J09');
    await pg.waitForTimeout(500);
    t = await aviso(pg);
    L.ok(/Marco Atual/.test(t.texto) && t.botoes.indexOf('📣 Comunicar') >= 0, 'Marco Atual → J09: o aviso oferece "📣 Comunicar"');
    L.ok(await pg.evaluate(() => Array.from(document.querySelectorAll('#ncrDialog button')).some(b => /Comunicar: nova NCR no J09/.test(b.textContent))),
      'e a ficha passa a ter "📣 Comunicar: nova NCR no J09"');
    L.igual(await pg.evaluate(() => Comunicados.locais().length), 1, 'ainda assim, nada foi criado sem o clique');
    await pg.evaluate(() => Array.from(document.querySelectorAll('#ncrDialog button')).find(b => /Comunicar: nova NCR/.test(b.textContent)).click());
    await pg.waitForFunction(() => document.getElementById('comunicarDialog').open);
    const frNcr = await pg.textContent('#comunicarPrevia .com-frase');
    L.ok(/^Uma nova NCR foi adicionada ao marco J09: NCR-/.test(frNcr), frNcr);
    await pg.click('#comunicarOk');
    await pg.waitForTimeout(600);
    await pg.evaluate(() => document.getElementById('ncrDialog').close());
    L.igual(await pg.evaluate(() => Comunicados.locais().map(c => c.tipo)), ['nova-ncr', 'waiver-aceito'], 'dois comunicados, o mais novo primeiro');

    console.log('mesclagem, importação e retenção');
    const deOutro = await pg.evaluate(async () => {
      /* um colega grava um comunicado na pasta: a troca junta pelo id */
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle('comunicados.json');
      const d = JSON.parse(await (await fh.getFile()).text());
      d.comunicados.push({ id: 'c-do-colega', tipo: 'novo-waiver', projetoId: '', marco: 'J09', kind: 'dev', itemId: '',
        ncrKey: '', numero: 'DEV-SBR4-J09-2', resumo: 'Desvio', statusAntes: '', statusNovo: 'preenchendo', mensagem: '',
        autor: 'Colega', em: new Date(Date.now() - 60000).toISOString(), chave: '' });
      const w = await fh.createWritable(); await w.write(JSON.stringify(d)); await w.close();
      return d.comunicados.length;
    });
    await pg.click('#atualizarBtn');
    await pg.waitForTimeout(1500);
    L.igual(await pg.evaluate(() => Comunicados.locais().length), deOutro, 'o comunicado do colega chegou pela pasta (união pelo id)');
    const retencao = await pg.evaluate(() => {
      const muitos = [];
      for (let i = 0; i < 130; i++) muitos.push({ id: 'x' + i, tipo: 'novo-waiver', marco: 'J09', numero: 'N' + i, em: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() });
      const l = Comunicados.juntar(muitos, []);
      return [l.length, l[0].id, l[99].id];
    });
    L.igual(retencao, [100, 'x129', 'x30'], 'guarda os últimos 100 (os mais novos)');

    /* backup de tudo: leva os comunicados; abrir um backup não cria nenhum */
    const bk = await L.baixar(pg, async () => { await pg.click('#menuBtn'); await pg.click('#backupAllBtn'); });
    await pg.evaluate(() => { const d = document.getElementById('backupDoneDialog'); if (d.open) d.close(); });
    const bkJson = JSON.parse(bk.buffer.toString('utf8'));
    L.igual((bkJson.comunicados || []).length, 3, 'o backup de tudo leva os comunicados');
    await pg.setInputFiles('#restoreInput', path.join(L.RAIZ, 'exemplos/WaiverRequest_SBR4_J06.json'));
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
    L.igual(await pg.evaluate(() => Comunicados.locais().length), 3, 'abrir um backup antigo (sem a coleção) não cria nem apaga comunicado');
    const soComunicados = { format: 'x', projects: [], comunicados: bkJson.comunicados };
    const arqBk = L.arquivo('backup-so-comunicados.json');
    fs.writeFileSync(arqBk, JSON.stringify(soComunicados));
    await pg.setInputFiles('#restoreInput', arqBk);
    await pg.waitForTimeout(800);
    await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
    L.igual(await pg.evaluate(() => Comunicados.locais().length), 3, 'reabrir o mesmo backup não duplica (mesmos ids)');

    console.log('o diário não leva o texto');
    const diario = await pg.evaluate(() => Log.historico());
    L.ok(diario.indexOf(SEGREDO) < 0 && diario.indexOf(numero) < 0 && /comunicado criado/.test(diario),
      'o diário registra "comunicado criado" sem a mensagem e sem o número');

    console.log('publicação');
    await pg.click('#menuBtn');
    await pg.click('#publicarBtn');
    await pg.click('#publicarEscolherBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('publicarPastaNome').textContent));
    await pg.click('#publicarAgoraBtn');
    await pg.waitForTimeout(1500);
    await pg.click('#publicarFecharBtn');
    let pub = await lerDaPasta(pg, 'visualizador-dados.js');
    L.ok(pub && /"comunicados":\[/.test(pub), 'a publicação para o visualizador leva os comunicados');
    L.igual(await pg.evaluate((t) => Publicacao.interpretar(t).comunicados.length, pub), 3, 'e o visualizador os lê (3)');
    srv.extras['visualizador-dados.js'] = () => pub;

    console.log('visualizador: o pop-up');
    const v = await L.abrir();
    outros.push(v);
    const vp = v.pagina;
    await vp.goto(srv.url + 'index.html?modo=leitura');
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.waitForTimeout(500);
    let pop = await vp.evaluate(() => ({
      n: document.querySelectorAll('.com-pop').length, visivel: !document.getElementById('comPop').hidden,
      tit: (document.querySelector('.com-pop-tit') || {}).textContent, cartoes: document.querySelectorAll('#comPop .com-cartao').length,
      chip: document.getElementById('comChipConta').textContent, chipVis: !document.getElementById('comChip').hidden,
      foco: document.activeElement && document.activeElement.closest ? !!document.activeElement.closest('#comPop') : false
    }));
    L.ok(pop.visivel && pop.n === 1 && pop.cartoes === 3 && /3 comunicados novos/.test(pop.tit),
      'três comunicados novos viram um pop-up só, com a lista: ' + pop.tit);
    L.ok(!pop.foco, 'o pop-up não toma o foco de quem está trabalhando');
    L.ok(pop.chipVis && pop.chip === '3', 'a etiqueta 📣 na barra de cima mostra 3');
    await vp.screenshot({ path: L.arquivo('comunicados-popup.png') });
    const vistos = await vp.evaluate(() => Array.from(document.querySelectorAll('#comPop .com-frase')).map(x => x.textContent));
    L.ok(vistos.indexOf('O waiver da ' + numero + ', no marco J09, foi aceito.') >= 0, 'inclusive "O waiver da … foi aceito."');
    L.igual(await vp.evaluate(() => localStorage.getItem('derrogacao:comunicados')), null, 'o visualizador não guarda comunicados como editor');

    console.log('visualizador: abrir o waiver');
    await vp.evaluate((n) => {
      const c = Array.from(document.querySelectorAll('#comPop .com-cartao')).find(x => x.querySelector('.com-frase').textContent.indexOf(n) >= 0);
      c.querySelector('.com-abrir').click();
    }, numero);
    await vp.waitForTimeout(600);
    const aberto = await vp.evaluate(() => ({ num: document.getElementById('f-ncrId').value,
      rel: document.getElementById('projectSelect').options[document.getElementById('projectSelect').selectedIndex].textContent,
      tab: document.querySelector('.tab[aria-selected="true"]').dataset.kind }));
    L.ok(aberto.num === numero && /^J09 \(/.test(aberto.rel) && aberto.tab === 'ncr', '"Abrir waiver" leva ao item, no relatório do J09, na aba Waiver NCR');
    pop = await vp.evaluate(() => ({ cartoes: document.querySelectorAll('#comPop .com-cartao').length, chip: document.getElementById('comChipConta').textContent }));
    L.ok(pop.cartoes === 2 && pop.chip === '2', 'e o que foi aberto conta como lido (restam 2)');

    console.log('visualizador: marcar como lido, recarregar');
    await vp.click('#comPop .com-pop-acoes .btn--accent');
    L.ok(await vp.evaluate(() => document.getElementById('comPop').hidden), '"Marcar todos como lidos" fecha o pop-up');
    L.igual(await vp.textContent('#comChipConta'), '', 'e a etiqueta fica sem número');
    await vp.reload();
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.waitForTimeout(600);
    L.ok(await vp.evaluate(() => document.getElementById('comPop').hidden), 'depois de recarregar, os lidos não voltam como pop-up');

    console.log('visualizador: um comunicado novo, pelo botão Atualizar');
    await pg.click('.tab[data-kind="ncr"]');
    await pg.selectOption('#projectSelect', { label: await pg.$eval('#projectSelect', s => Array.from(s.options).find(o => /^J09 \(/.test(o.textContent)).textContent) });
    await pg.click('.ncr-item:nth-child(3)');
    const num3 = await pg.inputValue('#f-ncrId');
    await pg.click('#comunicarItemBtn');
    await pg.click('#comunicarOk');
    await pg.waitForTimeout(2500);   /* com a pasta dos visualizadores ligada, publica na hora */
    t = await aviso(pg);
    L.ok(/Comunicado publicado/.test(t.texto), 'com a pasta dos visualizadores ligada, o comunicado é publicado na hora');
    pub = await lerDaPasta(pg, 'visualizador-dados.js');
    await vp.click('#atualizarBtn');
    await vp.waitForTimeout(1200);
    pop = await vp.evaluate(() => ({ visivel: !document.getElementById('comPop').hidden,
      tit: (document.querySelector('.com-pop-tit') || {}).textContent, frase: (document.querySelector('#comPop .com-frase') || {}).textContent }));
    L.ok(pop.visivel && /Comunicado · J09/.test(pop.tit) && pop.frase === 'Um novo waiver foi adicionado ao marco J09: ' + num3 + '.',
      'no Atualizar, só o novo aparece: ' + pop.frase);

    console.log('visualizador: depois');
    await vp.click('#comPop .com-pop-acoes .btn--quiet');
    L.ok(await vp.evaluate(() => document.getElementById('comPop').hidden), '"Depois" fecha o pop-up');
    L.igual(await vp.textContent('#comChipConta'), '1', 'mas a etiqueta continua dizendo 1 não lido');
    await vp.click('#atualizarBtn');
    await vp.waitForTimeout(1000);
    L.ok(await vp.evaluate(() => document.getElementById('comPop').hidden), 'e ele não volta a cada atualização');
    await vp.reload();
    await vp.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await vp.waitForTimeout(600);
    L.ok(!(await vp.evaluate(() => document.getElementById('comPop').hidden)), 'na próxima abertura, o "Depois" volta');

    console.log('visualizador: o histórico');
    await vp.click('#comChip');
    await vp.waitForFunction(() => document.getElementById('comunicadosDialog').open);
    const hist = await vp.evaluate(() => ({
      itens: document.querySelectorAll('#comunicadosLista .com-hist-item').length,
      novos: document.querySelectorAll('#comunicadosLista .is-novo').length,
      lidosBtn: !document.getElementById('comunicadosLidosBtn').hidden, novoBtn: !document.getElementById('comunicadosNovoBtn').hidden
    }));
    L.ok(hist.itens === 4 && hist.novos === 1, 'o histórico mostra os 4, com o não lido marcado como “novo”');
    L.ok(hist.lidosBtn && !hist.novoBtn, 'no visualizador, "Marcar todos como lidos" — e nada de criar comunicado');
    await vp.screenshot({ path: L.arquivo('comunicados-historico.png') });
    await vp.click('#comunicadosLidosBtn');
    L.igual(await vp.evaluate(() => document.querySelectorAll('#comunicadosLista .is-novo').length), 0, 'marcados como lidos');
    await vp.click('#comunicadosFecharBtn');

    console.log('visualizador: o prazo de 4 dias (primeira abertura e volta) e publicação antiga');
    L.igual(await pg.evaluate(() => Config.DIAS_COMUNICADO_NOVO), 4, 'o prazo mora num lugar só: Config.DIAS_COMUNICADO_NOVO = 4');
    /* comunicados com N dias, acrescentados à publicação */
    const comIdades = (texto, idades) => pg.evaluate((a) => {
      const d = Publicacao.interpretar(a.texto);
      const extra = a.idades.map(x => Object.assign({}, d.comunicados[0], { id: 'c-' + x[1],
        em: new Date(Date.now() - x[0] * 86400000).toISOString(), chave: x[1] + '|J09|ncr|X', numero: x[1] }));
      return a.texto.replace('"comunicados":[', '"comunicados":[' + extra.map(c => JSON.stringify(c)).join(',') + ',');
    }, { texto: texto, idades: idades });
    const antigo = await comIdades(pub, [[30, 'NCR-VELHA'], [5, 'NCR-CINCO'], [3, 'NCR-TRES']]);
    srv.extras['visualizador-dados.js'] = () => antigo;
    const v2 = await L.abrir();
    outros.push(v2);
    await v2.pagina.goto(srv.url + 'index.html?modo=leitura');
    await v2.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v2.pagina.waitForTimeout(500);
    const prim = await v2.pagina.evaluate(() => ({
      frases: Array.from(document.querySelectorAll('#comPop .com-frase')).map(x => x.textContent), chip: document.getElementById('comChipConta').textContent
    }));
    L.ok(prim.frases.length === 5 && prim.frases.some(f => /NCR-TRES/.test(f)) && !prim.frases.some(f => /NCR-VELHA|NCR-CINCO/.test(f)),
      'primeira abertura: o de 3 dias vira pop-up; os de 5 e 30 dias não (' + prim.frases.length + ' no pop-up)');
    await v2.pagina.click('#comPop .com-pop-acoes .btn--accent');
    const deVolta = await comIdades(pub, [[6, 'NCR-SEIS'], [1, 'NCR-ONTEM']]);
    srv.extras['visualizador-dados.js'] = () => deVolta;
    await v2.pagina.reload();
    await v2.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v2.pagina.waitForTimeout(600);
    const volta = await v2.pagina.evaluate(() => ({
      frases: Array.from(document.querySelectorAll('#comPop .com-frase')).map(x => x.textContent), chip: document.getElementById('comChipConta').textContent,
      noHistorico: null
    }));
    L.ok(volta.frases.length === 1 && /NCR-ONTEM/.test(volta.frases[0]) && volta.chip === '1',
      'quem volta depois: só o não lido de ontem vira pop-up; o de 6 dias não (nem conta na etiqueta)');
    await v2.pagina.click('#comChip');
    const hist6 = await v2.pagina.evaluate(() => Array.from(document.querySelectorAll('#comunicadosLista .com-frase')).some(x => /NCR-SEIS/.test(x.textContent)));
    L.ok(hist6, 'o de 6 dias continua no histórico');
    await v2.pagina.click('#comunicadosFecharBtn');
    const semColecao = pub.replace(/"comunicados":\[.*?\],"projects"/, '"projects"');
    L.ok(!/"comunicados"/.test(semColecao), 'publicação antiga, sem a coleção, preparada');
    srv.extras['visualizador-dados.js'] = () => semColecao;
    const v3 = await L.abrir();
    outros.push(v3);
    await v3.pagina.goto(srv.url + 'index.html?modo=leitura');
    await v3.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v3.pagina.waitForTimeout(500);
    const velha = await v3.pagina.evaluate(() => ({ pop: document.getElementById('comPop').hidden, chip: document.getElementById('comChip').hidden,
      /* abre no Banco NCR (Config.ABA_INICIAL): conta as linhas de lá */
      itens: document.querySelectorAll('#nb2Table tbody tr').length }));
    L.ok(velha.pop && velha.chip && velha.itens > 0, 'a publicação antiga abre normalmente, sem pop-up e sem etiqueta');
  } finally {
    const errosOutros = [];
    outros.forEach(o => errosOutros.push.apply(errosOutros, o.erros.filter(e => !/404|Failed to load resource/.test(e))));
    const f = L.resultado('comunicados', s.erros.concat(errosOutros));
    for (const o of outros) await o.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
