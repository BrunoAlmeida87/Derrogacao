/* NCR temporária → definitiva, detalhes do banco NCR (produtos e
   deliberações), a área administrativa com auditoria, e os status que
   querem dizer "NCR fechada".

   1. Status fechado: os quatro da lista do Bruno (e variações de escrita)
      fecham a NCR; "7.1 - CQ" e "Open" não. NCR fechada não fica "pronta
      para adicionar" nem pede waiver no Kanban.
   2. Detalhes: a NCR repetida em várias linhas, outra aba com o número e
      listas dentro do JSON chegam à ficha, em tabela.
   3. Continuidade: ligar a temporária à definitiva pela ficha junta as duas
      no vínculo, no fluxo (o ponto do marco anterior), no "levar adiante",
      no Kanban e no editor — sem reescrever número nenhum.
   4. Administrador: senha na primeira vez, correção de status com
      auditoria, a correção que o banco supera, senha errada, a pasta com o
      arquivo das correções (sem a senha em texto) e o visualizador. */
'use strict';
const L = require('./lib');

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
  const TEMP = 'NCR-TEMP-0001';
  const DEF = L.numero(12);          /* está no J09 e no banco */
  const SENHA = 'segredo-do-adm-123';
  try {
    await L.semear(pg, srv.url);

    /* um item com número temporário no J08, aceito, com o waiver valendo até o J09 */
    await pg.evaluate(async (t) => {
      const ps = await Store.list();
      const p = ps.filter(x => x.marco === 'J08')[0];
      const n = Store.newNcr();
      Object.assign(n, { ncrId: t, systems: 'BX', func: 'FV03 - EMERGENCY', description: 'Aberta no sistema provisório',
        historic: 'J06 To: J08', approvedExpiry: 'J09', archAnswer: 'Resposta do J08 para a temporária' });
      Store.setStatus(n, 'aceito');
      p.ncrs.push(n);
      await Store.save(p);
    }, TEMP);
    await pg.reload();
    await L.esperarPronto(pg);

    console.log('1. status que fecham a NCR');
    const st = await pg.evaluate(() => ({
      sim: ['CEDOC Closure/Unfounded', 'CEDOC Closure', '7.2 - TA Unfounded', 'Closed', 'cedoc closure unfounded',
        '7.2 – TA Unfounded'.replace('–', '-'), 'CLOSED'].map(Ncrs.statusFechado),
      nao: ['Open', '7.1 - CQ', '2.2 - TA Specialist', ''].map(Ncrs.statusFechado)
    }));
    L.ok(st.sim.every(Boolean), 'CEDOC Closure/Unfounded, CEDOC Closure, 7.2 - TA Unfounded e Closed fecham (com qualquer caixa)');
    L.ok(st.nao.every(x => !x), 'Open, 7.1 - CQ e 2.2 - TA Specialist continuam abertas');
    const pronta = await pg.evaluate((n) => {
      const rec = Ncrs.get(n);
      rec.fonte.status = '7.2 - TA Unfounded';
      return Ncrs.fechada(rec);
    }, L.numero(40));
    L.ok(pronta, 'a NCR em "7.2 - TA Unfounded" é fechada');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.fill('#nbBusca', L.numero(40));
    await pg.waitForTimeout(500);
    const linha40 = await pg.$eval('#nb2Table tbody tr', tr => ({ fechada: tr.classList.contains('is-fechada'), add: !!tr.querySelector('.nb2-add') }));
    L.ok(linha40.fechada && !linha40.add, 'no Banco NCR: marcada como fechada e sem o botão "+ J09 Waiver" (não precisa de waiver)');
    await pg.fill('#nbBusca', '');
    await pg.click('.tab[data-kind="kanban"]');
    await pg.waitForSelector('.kb-card');
    const kb40 = await pg.evaluate((n) => {
      const c = Array.from(document.querySelectorAll('.kb-card')).filter(x => x.textContent.indexOf(n) >= 0)[0];
      return c ? { semAdd: !/\+ J09 Waiver/.test(c.textContent), aviso: /fechada — sem waiver/.test(c.textContent) } : null;
    }, L.numero(40));
    L.ok(kb40 && kb40.semAdd && kb40.aviso, 'no Kanban: o cartão da NCR fechada diz "fechada — sem waiver", sem o botão de adicionar');

    console.log('2. detalhes do banco NCR na ficha');
    const det = await pg.evaluate(async () => {
      const wb = { sheets: [
        { name: 'NCRs', rows: [
          ['Número NCR', 'Status', 'Título', 'SBR', 'Produto', 'Deliberação'],
          ['NCR-ICN-ESC-14-2000-2025', 'Open', 'Válvula', 'SBR4', 'Válvula V-12', 'Use as is'],
          ['NCR-ICN-ESC-14-2000-2025', 'Open', 'Válvula', 'SBR4', 'Válvula V-13', 'Repair'],
          ['NCR-ICN-ESC-14-2001-2025', 'Closed', 'Cabo', 'SBR4', 'Cabo C-1', 'Scrap']
        ] },
        { name: 'Deliberações', rows: [
          ['NCR', 'Produto', 'Decisão', 'Data'],
          ['NCR-ICN-ESC-14-2000-2025', 'Válvula V-12', 'Aceito pelo arquiteto', '2026-09-10'],
          ['NCR-ICN-ESC-14-9999-2025', 'X', 'Não é do banco', '2026-09-10']
        ] }
      ] };
      const r = Ncrs.importarBase(wb, 'export-teste.xlsx', 'Teste');
      await Ncrs.salvar(r.alterados);
      const a = Ncrs.get('NCR-ICN-ESC-14-2000-2025');
      const again = Ncrs.importarBase(wb, 'export-teste.xlsx', 'Teste');
      const json = Ncrs.importarBase({ tipo: 'ncr', registros: [
        { id: 'NCR-ICN-ESC-14-2002-2025', campos: { 'Número NCR': 'NCR-ICN-ESC-14-2002-2025', Status: 'Open', SBR: 'SBR4' },
          produtos: [{ produto: 'Bomba B-1', deliberacao: 'Rework' }, { produto: 'Bomba B-2', deliberacao: 'Use as is' }] }
      ] }, 'ncr.json', 'Teste');
      await Ncrs.salvar(json.alterados);
      const j = Ncrs.get('NCR-ICN-ESC-14-2002-2025');
      return {
        grupos: a.fonte.detalhes.map(g => g.titulo + ':' + g.linhas.length),
        linhas: a.fonte.detalhes[0].linhas, campoJunto: a.fonte.campos['Produto'], status: a.fonte.status,
        iguais: again.resumo.numeros.filter(x => x[0] === 'Sem alteração')[0][1],
        json: j.fonte.detalhes.map(g => g.titulo + ':' + g.colunas.join('/') + ':' + g.linhas.length)
      };
    });
    L.igual(det.grupos, ['Produtos e deliberações:2', 'Deliberações:1'], 'NCR em duas linhas + outra aba com o número: duas tabelas na ficha');
    L.igual(det.linhas, [['Válvula V-12', 'Use as is'], ['Válvula V-13', 'Repair']], 'cada produto com a sua deliberação, linha a linha');
    L.ok(det.campoJunto === 'Válvula V-12 | Válvula V-13' && det.status === 'Open', 'o campo que muda fica com os dois valores; o status continua certo');
    L.ok(det.iguais >= 2, 'importar o mesmo arquivo de novo não muda nada (' + det.iguais + ' sem alteração)');
    L.igual(det.json, ['produtos:produto/deliberacao:2'], 'lista dentro do JSON do NCR Control vira tabela');
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.evaluate(() => NcrView.abrirFicha('NCR-ICN-ESC-14-2000-2025'));
    await pg.waitForSelector('#ncrDialog[open] .nb-sec--detalhe');
    const ficha = await pg.evaluate(() => Array.from(document.querySelectorAll('#ncrDialog .nb-sec--detalhe')).map(s => s.textContent));
    L.ok(ficha.length === 2 && /Repair/.test(ficha[0]) && /Aceito pelo arquiteto/.test(ficha[1]),
      'a ficha mostra "Produtos e deliberações" e a aba "Deliberações", no padrão das seções');
    await pg.keyboard.press('Escape');

    console.log('3. NCR temporária → definitiva');
    const avAntes = await pg.evaluate(async (t) => {
      const ps = await Store.list();
      const j08 = ps.filter(x => x.marco === 'J08')[0];
      const it = j08.ncrs.filter(n => n.ncrId === t)[0];
      return Herdar.avanco(j08, it, 'ncr', ps).estado;
    }, TEMP);
    L.igual(avAntes, 'aLevar', 'antes da ligação: a temporária aceita no J08 "falta levar" para o J09');
    await pg.evaluate((n) => NcrView.abrirFicha(n), DEF);
    await pg.waitForSelector('#ncrDialog[open] #nbContDe');
    await pg.fill('#nbContDe', TEMP);
    await pg.click('#nbContDe + .btn');
    await pg.waitForSelector('#ncrDialog .nb-chip--cont');
    const chip = await pg.$eval('#ncrDialog .nb-ficha-tags', e => e.textContent);
    L.ok(/substitui NCR-TEMP-0001/.test(chip), 'ligada pela ficha: a definitiva mostra "substitui NCR-TEMP-0001"');
    const r3 = await pg.evaluate(async (a) => {
      const ps = await Store.list();
      const j08 = ps.filter(x => x.marco === 'J08')[0];
      const j09 = ps.filter(x => x.marco === 'J09')[0];
      const temp = j08.ncrs.filter(n => n.ncrId === a.t)[0];
      const def = j09.ncrs.filter(n => n.ncrId === a.d)[0];
      const rec = Ncrs.get(a.d);
      const idx = Fluxo.indice(ps, 'ncr', j09.id);
      const ant = Fluxo.anterior(idx, Fluxo.marco('J08'), def);
      return {
        vinc: Ncrs.vinculos(rec, ps).map(v => v.project.marco + ':' + v.item.ncrId).sort(),
        caso: Ncrs.chaveCaso(temp) === Ncrs.chaveCaso(def),
        estado: Herdar.avanco(j08, temp, 'ncr', ps).estado,
        anterior: ant ? ant.archAnswer : null,
        numeroIntacto: temp.ncrId,
        aud: Correcoes.auditoria().filter(e => e.tipo === 'substituicao').length
      };
    }, { t: TEMP, d: DEF });
    L.igual(r3.vinc, ['J08:' + TEMP, 'J09:' + DEF], 'a definitiva ganha o vínculo com o item temporário do J08');
    L.ok(r3.caso, 'temporária e definitiva caem na mesma chave de caso');
    L.igual(r3.estado, 'levada', 'o "levar adiante" enxerga a definitiva no J09: já levada');
    L.igual(r3.anterior, 'Resposta do J08 para a temporária', 'o fluxo da definitiva no J09 acha a resposta do J08 (o ponto do card)');
    L.igual(r3.numeroIntacto, TEMP, 'o item do J08 continua com o número temporário (o registro antigo fica)');
    L.igual(r3.aud, 2, 'a ligação entrou na auditoria (uma linha para cada NCR)');
    await pg.keyboard.press('Escape');
    await pg.fill('#nbBusca', DEF);
    await pg.waitForTimeout(500);
    const tag = await pg.$eval('#nb2Table tbody tr', tr => tr.textContent);
    L.ok(/← NCR-TEMP-0001/.test(tag), 'no Banco NCR, a linha da definitiva diz "← NCR-TEMP-0001"');
    await pg.fill('#nbBusca', '');
    const kbDup = await pg.evaluate(async (a) => {
      const ps = await Store.list();
      return Kanban.cartoes ? Kanban.cartoes('J09', ps).filter(c => c.chave === Ncrs.chave(a.d)).length : -1;
    }, { d: DEF });
    L.ok(kbDup === 1 || kbDup === -1, 'no Kanban do J09 o caso aparece uma vez só (' + kbDup + ')');
    const recusa = await pg.evaluate(async (a) => {
      const ps = await Store.list();
      const j08 = ps.filter(x => x.marco === 'J08')[0];
      return Ncrs.vinculos(Ncrs.get(a.d), [j08]).length;
    }, { d: DEF });
    L.ok(recusa === 1, 'o J08 já tem este caso (como temporária): adicionar a definitiva lá seria duplicar');

    /* o editor: o item temporário do J08 fala da definitiva */
    await pg.click('.tab[data-kind="ncr"]');
    const opJ08 = await pg.evaluate(() => Array.from(document.querySelectorAll('#projectSelect option')).filter(o => /^J08 \(/.test(o.textContent))[0].value);
    await pg.selectOption('#projectSelect', opJ08);
    await pg.waitForTimeout(300);
    await pg.click('.ncr-item:has-text("' + TEMP + '")');
    await pg.waitForSelector('.nb-ligacao-cont');
    const lig = await pg.$eval('.nb-ligacao-cont', e => e.textContent);
    L.ok(lig.indexOf(TEMP + ' (temporária) → ' + DEF) >= 0, 'no editor, o item temporário mostra "→ ' + DEF + '"');

    console.log('4. área administrativa');
    await pg.evaluate(() => { document.getElementById('menuBtn').click(); });
    await pg.click('#settingsBtn');
    await pg.waitForSelector('#adminEntrarBtn');
    const rot = await pg.$eval('#adminEntrarBtn', b => b.textContent);
    L.ok(/Definir a senha/.test(rot), 'nos Ajustes: sem senha ainda, o botão é "Definir a senha do administrador…"');
    await pg.click('#adminEntrarBtn');
    await pg.fill('#admSenha', SENHA);
    await pg.fill('#admSenha2', SENHA);
    await pg.click('#adminDialog .dlg-actions .btn--primary');
    await pg.waitForSelector('#adminDialog .adm-abas');
    L.ok(true, 'senha definida: a área administrativa abre');
    const alvo = L.numero(0);
    const stAntes = await pg.evaluate((n) => Ncrs.get(n).fonte.status, alvo);
    await pg.fill('#admNcr', alvo);
    await pg.click('#admNcr + .btn');
    await pg.waitForSelector('input.adm-novo[data-campo="status"]');
    await pg.fill('#admMotivo', 'status atualizado no sistema oficial');
    await pg.fill('input.adm-novo[data-campo="status"]', 'CEDOC Closure');
    await pg.click('button[data-campo="status"]');
    await pg.waitForTimeout(400);
    const aj = await pg.evaluate((n) => {
      const rec = Ncrs.get(n);
      const a = Correcoes.auditoria().filter(e => e.tipo === 'ajuste')[0];
      return { emUso: Ncrs.fonte(rec).status, banco: rec.fonte.status, fechada: Ncrs.fechada(rec), a: a };
    }, alvo);
    L.ok(aj.emUso === 'CEDOC Closure' && aj.banco === stAntes && aj.fechada,
      'status corrigido: em uso "CEDOC Closure", o do banco guardado ("' + stAntes + '"), NCR fechada');
    L.ok(aj.a && aj.a.campo === 'Status' && aj.a.de === stAntes && aj.a.para === 'CEDOC Closure' && aj.a.por === 'Teste' &&
      /T\d\d:\d\d/.test(aj.a.em) && aj.a.obs === 'status atualizado no sistema oficial',
      'auditoria: campo, valor anterior, novo valor, data e hora, usuário e motivo');
    await pg.click('#adminDialog .dlg-actions .btn--primary');   /* Fechar */
    await pg.click('.tab[data-kind="banco"]');
    await pg.waitForSelector('#nb2Table tbody tr');
    await pg.evaluate((n) => NcrView.abrirFicha(n), alvo);
    await pg.waitForSelector('#ncrDialog[open]');
    const fichaAdm = await pg.evaluate(() => ({
      chip: !!document.querySelector('#ncrDialog .nb-chip--ajuste'),
      botao: !!document.querySelector('#ncrDialog .btn--admin'),
      aud: !!document.querySelector('#ncrDialog .nb-sec--auditoria')
    }));
    L.ok(fichaAdm.chip && fichaAdm.aud, 'a ficha mostra "status corrigido" e a auditoria da NCR');
    L.ok(fichaAdm.botao, 'com a área aberta, a ficha tem "✎ Corrigir dados (administrador)"');
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => Admin.sair());
    await pg.evaluate((n) => NcrView.abrirFicha(n), alvo);
    await pg.waitForSelector('#ncrDialog[open]');
    L.ok(!(await pg.$('#ncrDialog .btn--admin')), 'fora da área administrativa, o botão de correção some da ficha');
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => Admin.abrir());
    await pg.fill('#admSenha', 'errada');
    await pg.click('#adminDialog .dlg-actions .btn--primary');
    const msg = await pg.$eval('#admMsg', e => e.textContent);
    L.ok(/incorreta/.test(msg) && !(await pg.evaluate(() => Admin.ativo())), 'senha errada: não abre');
    await pg.fill('#admSenha', SENHA);
    await pg.click('#adminDialog .dlg-actions .btn--primary');
    L.ok(await pg.evaluate(() => Admin.ativo()), 'senha certa: abre');
    await pg.click('#adminDialog .dlg-actions .btn--primary');

    /* o banco andou: a correção deixa de valer sozinha */
    const sup = await pg.evaluate((n) => {
      const rec = Ncrs.get(n);
      const guardado = rec.fonte.status;
      rec.fonte = Object.assign({}, rec.fonte, { status: 'Closed' });
      const depois = { emUso: Ncrs.fonte(rec).status, superados: Correcoes.ajustesSuperados(rec).length };
      rec.fonte = Object.assign({}, rec.fonte, { status: guardado });
      return depois;
    }, alvo);
    L.ok(sup.emUso === 'Closed' && sup.superados === 1, 'importação com outro status: vale o do banco, e a correção fica marcada como superada');

    console.log('pasta e visualizador');
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(1500);
    const arq = await lerDaPasta(pg, 'derrogacao-ncr-correcoes.json');
    const d = arq ? JSON.parse(arq) : {};
    L.ok(d.substituicoes && d.substituicoes.length === 1 && d.ajustes.length === 1 && d.auditoria.length >= 4,
      'a pasta ganhou derrogacao-ncr-correcoes.json com a ligação, a correção e a auditoria');
    L.ok(d.senha && /^[0-9a-f]{64}$/.test(d.senha.hash) && arq.indexOf(SENHA) < 0, 'a senha vai só como resumo (hash), nunca em texto');

    const pub = await L.publicacao(pg);
    const hash = d.senha ? d.senha.hash : 'nenhum';
    L.ok(pub.indexOf('"correcoes"') >= 0 && pub.indexOf(hash) < 0 && pub.indexOf('"sal"') < 0, 'a publicação leva as correções, sem a senha');
    srv.extras['visualizador-dados.js'] = () => pub;
    const v = await L.abrir();
    outros.push(v);
    await v.pagina.goto(srv.url + 'index.html?modo=leitura');
    await v.pagina.waitForFunction(() => document.getElementById('projectSelect').options.length > 0);
    await v.pagina.waitForTimeout(500);
    const vis = await v.pagina.evaluate((a) => ({
      status: Ncrs.fonte(Ncrs.get(a.alvo)).status,
      subs: Correcoes.listaSubstituicoes().map(x => x.deNumero + '>' + x.paraNumero),
      admin: Admin.ativo()
    }), { alvo: alvo });
    L.ok(vis.status === 'CEDOC Closure', 'no visualizador: o status corrigido');
    L.igual(vis.subs, [TEMP + '>' + DEF], 'no visualizador: a ligação temporária → definitiva');
    await v.pagina.click('.tab[data-kind="banco"]');
    await v.pagina.waitForSelector('#nb2Table tbody tr');
    await v.pagina.evaluate((n) => NcrView.abrirFicha(n), DEF);
    await v.pagina.waitForSelector('#ncrDialog[open]');
    const visFicha = await v.pagina.evaluate(() => ({
      chip: /substitui NCR-TEMP-0001/.test(document.querySelector('#ncrDialog .nb-ficha-tags').textContent),
      form: !!document.querySelector('#ncrDialog #nbContDe'),
      adm: !!document.querySelector('#ncrDialog .btn--admin')
    }));
    L.ok(visFicha.chip && !visFicha.form && !visFicha.adm, 'na ficha do visualizador: a ligação à vista, sem formulário nem correção');
  } finally {
    const errosOutros = [];
    outros.forEach(o => errosOutros.push.apply(errosOutros, o.erros.filter(e => !/404|Failed to load resource/.test(e))));
    const f = L.resultado('correções', s.erros.concat(errosOutros));
    for (const o of outros) await o.navegador.close();
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
