/* A pasta da equipe com TRÊS pessoas ao mesmo tempo, cada uma com o seu
   navegador, numa pasta de verdade (tests/pasta-disco.js).

   O que era o problema: com as três janelas abertas e ninguém digitando,
   cada máquina relia e regravava a pasta a cada conferência — a gravação de
   uma parecia novidade para as outras —, e em toda rodada relia o banco NCR
   inteiro. E o histórico ("as últimas 40 versões") cobria uns dez minutos.

   Confere: parados, ninguém lê nem grava; quem só recebe não regrava; duas
   pessoas no mesmo item, em campos diferentes, não se apagam; uma cópia
   atrasada que passa por cima é corrigida por quem escreveu (o atropelo),
   também depois de uma rodada em que nada foi gravado; o banco NCR só é lido
   quando muda; o histórico guardado por tempo; a limpeza de imagens. */
'use strict';
const path = require('path');
const L = require('./lib');
const Disco = require('./pasta-disco');

/* a conferência da pasta a cada 1,5 s, em vez de 20 s */
const POLL = 1500;
const RAPIDO = `(() => {
  let c = null;
  Object.defineProperty(window, 'Config', { configurable: true,
    get() { return c; },
    set(v) { v.INTERVALO_PASTA_MS = ${POLL}; c = v; } });
})();`;

const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
const DADOS = 'derrogacao-dados.json';
const BANCO = 'derrogacao-ncr-banco.json';
const WAIVER = 'derrogacao-ncr-waiver.json';

/* o item, como está gravado no navegador daquela pessoa */
function item(pg, id) {
  return pg.evaluate(async (i) => {
    for (const p of await Store.list()) {
      const n = (p.ncrs || []).concat(p.devs || []).filter((x) => x.id === i)[0];
      if (n) return n;
    }
    return null;
  }, id);
}

/* espera `cond` dar verdadeiro (perguntando de novo a cada 300 ms) */
async function ate(cond, limite) {
  const fim = Date.now() + (limite || 40000);
  while (Date.now() < fim) {
    if (await cond()) return true;
    await dorme(300);
  }
  return false;
}

async function abrirItem(pg, id) {
  await pg.click('.tab[data-kind="ncr"]');
  await pg.waitForSelector('#ncrList li[data-id="' + id + '"]', { timeout: 20000 });
  await pg.click('#ncrList li[data-id="' + id + '"]');
  await dorme(300);
}

async function digitar(pg, campo, texto) {
  await pg.click('#f-' + campo);
  await pg.keyboard.press('End');
  await pg.keyboard.type(texto, { delay: 20 });
}

(async () => {
  const srv = await L.servidor();
  const pw = L.playwright();
  const nav = await pw.chromium.launch(process.env.DERROG_CHROME ? { executablePath: process.env.DERROG_CHROME } : {});
  const pasta = Disco.criar(path.join(L.SAIDA, 'pasta-tres-pessoas'));
  const nomes = ['Bruno', 'Maria', 'Ana'];
  const pags = [];
  const erros = [];
  for (const nome of nomes) {
    const ctx = await nav.newContext({ viewport: { width: 1500, height: 950 }, locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo' });
    await pasta.ligar(ctx, nome);
    await ctx.addInitScript(RAPIDO);
    await ctx.addInitScript('window.print = function () {};');
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(nome + ' pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error') erros.push(nome + ' console: ' + m.text()); });
    pg.on('dialog', (d) => d.accept());
    pags.push(pg);
  }
  const [A, B, C] = pags;
  try {
    /* Bruno tem os relatórios e o banco NCR; Maria e Ana chegam vazias */
    await L.semear(A, srv.url);
    await A.evaluate(() => localStorage.setItem('derrogacao:user', 'Bruno'));
    await A.reload();
    await L.esperarPronto(A);
    for (const [i, pg] of [[1, B], [2, C]]) {
      await pg.goto(srv.url + 'index.html');
      await pg.evaluate((n) => localStorage.setItem('derrogacao:user', n), nomes[i]);
      await pg.reload();
      await L.esperarPronto(pg);
    }

    console.log('as três ligam a mesma pasta');
    for (const pg of pags) {
      await pg.click('#pastaNoticeBtn');
      await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent),
        null, { timeout: 60000 });
      await pasta.calma(2500);
    }
    L.ok(await pasta.calma(3000), 'depois de ligar, a pasta sossega');
    /* os itens do J09 que dá para editar (os aceitos abrem travados) */
    const j09 = await A.evaluate(async () => {
      const p = (await Store.list()).filter((x) => x.marco === 'J09')[0];
      return p.ncrs.filter((n) => n.status !== 'aceito').map((n) => n.id);
    });
    const temTudo = await Promise.all([B, C].map((pg) => item(pg, j09[0])));
    L.ok(temTudo.every(Boolean), 'Maria e Ana receberam os relatórios do Bruno pela pasta');

    console.log('parados: as três janelas abertas e ninguém digitando');
    const hist0 = pasta.listar('historico').length;
    let m = pasta.marca();
    await dorme(POLL * 5);
    let fase = pasta.desde(m);
    L.ok(fase.filter((o) => o.op === 'stat').length >= 3 * 3,
      'as três continuam conferindo a data dos arquivos (' + fase.filter((o) => o.op === 'stat').length + ' conferências)');
    L.igual(fase.filter((o) => o.op === 'write').length, 0, 'ninguém regravou nada (antes: cada uma regravava a cada conferência)');
    L.igual(pasta.contar(fase, 'read', DADOS), 0, 'ninguém releu o arquivo de dados');
    L.igual(pasta.contar(fase, 'read', BANCO) + pasta.contar(fase, 'read', WAIVER), 0, 'nem o banco NCR');
    L.igual(pasta.listar('historico').length, hist0, 'e o histórico não ganhou cópia "antes de juntar" — não havia o que perder');

    console.log('o Bruno escreve; Maria e Ana só recebem');
    await abrirItem(A, j09[0]);
    m = pasta.marca();
    await digitar(A, 'currentSituation', ' [A1]');
    const chegou = await ate(async () => {
      const r = await Promise.all([B, C].map((pg) => item(pg, j09[0])));
      return r.every((n) => n && /\[A1\]/.test(n.currentSituation));
    });
    L.ok(chegou, 'o texto do Bruno chegou na Maria e na Ana');
    await pasta.calma(2500);
    fase = pasta.desde(m);
    L.ok(pasta.contar(fase, 'write', DADOS, 'Bruno') >= 1, 'o Bruno gravou o arquivo de dados');
    L.igual(pasta.contar(fase, 'write', DADOS, 'Maria') + pasta.contar(fase, 'write', DADOS, 'Ana'), 0,
      'Maria e Ana leram e NÃO regravaram (não tinham nada que a pasta não tivesse)');
    L.igual(pasta.contar(fase, 'read', BANCO), 0, 'ninguém releu o banco NCR por causa de um campo do relatório');
    L.ok(/\[A1\]/.test(pasta.ler(DADOS)), 'o arquivo da pasta tem o texto');

    console.log('Bruno e Maria no mesmo item, em campos diferentes, ao mesmo tempo');
    await abrirItem(B, j09[0]);
    await Promise.all([digitar(A, 'arguments', ' [A-arg]'), digitar(B, 'whyNotPossible', ' [B-why]')]);
    const juntos = await ate(async () => {
      const r = await Promise.all(pags.map((pg) => item(pg, j09[0])));
      return r.every((n) => n && /\[A-arg\]/.test(n['arguments']) && /\[B-why\]/.test(n.whyNotPossible) &&
        /\[A1\]/.test(n.currentSituation));
    });
    L.ok(juntos, 'os dois textos ficaram, nas três máquinas — um não apagou o do outro');
    await pasta.calma(2500);

    console.log('a Maria escreve; o Bruno só recebe');
    await abrirItem(B, j09[2]);
    m = pasta.marca();
    await digitar(B, 'currentSituation', ' [B-novo]');
    L.ok(await ate(async () => /\[B-novo\]/.test((await item(A, j09[2]) || {}).currentSituation)),
      'o texto da Maria chegou no Bruno');
    await pasta.calma(2500);
    L.igual(pasta.contar(pasta.desde(m), 'write', DADOS, 'Bruno') + pasta.contar(pasta.desde(m), 'write', DADOS, 'Ana'), 0,
      'Bruno e Ana receberam sem regravar');

    console.log('uma cópia atrasada passa por cima (o atropelo, com três pessoas)');
    /* o arquivo como estava antes da gravação do Bruno: é dele que parte a
       cópia de uma quarta máquina, que nunca viu o texto do Bruno */
    const velho = JSON.parse(pasta.ler(DADOS));
    const velhoData = Math.floor(require('fs').statSync(path.join(pasta.dir, DADOS)).mtimeMs);
    await abrirItem(A, j09[1]);
    await digitar(A, 'currentSituation', ' [A-novo]');
    L.ok(await ate(async () => {
      const r = await Promise.all([B, C].map((pg) => item(pg, j09[1])));
      return r.every((n) => n && /\[A-novo\]/.test(n.currentSituation));
    }), 'o texto do Bruno chegou em todos');
    await pasta.calma(2500);
    /* uma versão antiga do programa regrava o mesmo conteúdo (ela não
       escreve `baseadoEm`): ninguém tem o que acrescentar, ninguém regrava —
       e o Bruno passa por uma rodada sem gravar antes do atropelo */
    const igual = JSON.parse(pasta.ler(DADOS));
    delete igual.baseadoEm;
    igual.updatedBy = 'Ana (versão antiga do programa)';
    m = pasta.marca();
    pasta.gravar(DADOS, JSON.stringify(igual));
    await dorme(POLL * 3);
    await pasta.calma(2500);
    const reacao = pasta.desde(m);
    L.ok(pasta.contar(reacao, 'read', DADOS) >= 3 && pasta.contar(reacao, 'write', DADOS) === 0,
      'a regravação sem mudança foi lida pelas três e ninguém respondeu gravando (era o pingue-pongue)');
    /* a cópia da quarta máquina: partiu do arquivo velho e traz um texto dela */
    const atrasada = JSON.parse(JSON.stringify(velho));
    const quarto = atrasada.projects.filter((p) => p.marco === 'J09')[0].ncrs.filter((n) => n.id === j09[3])[0];
    quarto.currentSituation += ' [Q-quarto]';
    quarto.editedAt = new Date().toISOString();
    quarto.editedBy = 'Fulano';
    atrasada.baseadoEm = velhoData;
    atrasada.updatedBy = 'Fulano (cópia atrasada)';
    pasta.gravar(DADOS, JSON.stringify(atrasada));
    const voltou = await ate(async () => {
      const arq = pasta.ler(DADOS) || '';
      if (!/\[A-novo\]/.test(arq) || !/\[Q-quarto\]/.test(arq) || !/\[B-novo\]/.test(arq)) return false;
      for (const pg of pags) {
        const a = await item(pg, j09[1]), b = await item(pg, j09[2]), q = await item(pg, j09[3]);
        if (!/\[A-novo\]/.test(a.currentSituation) || !/\[B-novo\]/.test(b.currentSituation) ||
          !/\[Q-quarto\]/.test(q.currentSituation)) return false;
      }
      return true;
    }, 45000);
    L.ok(voltou, 'o Bruno reconheceu a cópia atrasada e pôs o texto dele de volta; o texto da quarta máquina ficou; ' +
      'a pasta e as três máquinas têm tudo');
    await pasta.calma(2500);

    console.log('banco NCR: só é lido quando muda');
    const chave = await A.evaluate(() => Ncrs.lista()[0].key);
    m = pasta.marca();
    await A.evaluate(async (k) => {
      await Ncrs.editarWaiver(Ncrs.get(k), 'observacao', 'OBS-TESTE-PASTA', 'Bruno');
      document.getElementById('atualizarBtn').click();
    }, chave);
    const obs = await ate(async () => {
      const r = await Promise.all([B, C].map((pg) => pg.evaluate((k) => Ncrs.get(k).waiver.observacao, chave)));
      return r.every((v) => v === 'OBS-TESTE-PASTA');
    });
    L.ok(obs, 'a Observação escrita pelo Bruno chegou na Maria e na Ana');
    await pasta.calma(2500);
    fase = pasta.desde(m);
    L.ok(pasta.contar(fase, 'write', WAIVER, 'Bruno') >= 1, 'o Bruno gravou o arquivo dos campos do Waiver');
    L.igual(pasta.contar(fase, 'read', BANCO), 0, 'e ninguém leu o arquivo do banco (megabytes que não mudaram)');

    m = pasta.marca();
    await A.evaluate(async (k) => {
      /* uma importação nova, com o status de uma NCR mudado */
      const regs = Ncrs.lista().filter((r) => r.fonte.importadoEm).map((r) => ({ id: r.numero, campos: Object.assign({}, r.fonte.campos) }));
      const alvo = regs.filter((r) => r.id === Ncrs.get(k).numero)[0];
      Object.keys(alvo.campos).forEach((c) => { if (/^status$/i.test(c)) alvo.campos[c] = 'Closed'; });
      const r = Ncrs.importarBase({ tipo: 'ncr', registros: regs }, 'banco-2.json', 'Bruno');
      await Ncrs.salvar(r.alterados);
      await Ncrs.salvarMeta();
      document.getElementById('atualizarBtn').click();
    }, chave);
    const fechou = await ate(async () => {
      const r = await Promise.all([B, C].map((pg) => pg.evaluate((k) => Ncrs.fonte(Ncrs.get(k)).status, chave)));
      return r.every((v) => v === 'Closed');
    });
    L.ok(fechou, 'a importação do Bruno chegou: a NCR está Closed na Maria e na Ana');
    fase = pasta.desde(m);
    L.ok(pasta.contar(fase, 'write', BANCO, 'Bruno') >= 1 &&
      pasta.contar(fase, 'read', BANCO, 'Maria') >= 1 && pasta.contar(fase, 'read', BANCO, 'Ana') >= 1,
      'quando o banco muda, ele é gravado por quem importou e lido pelas outras');
    await pasta.calma(2500);

    console.log('histórico: guardado por tempo, nome com segundos');
    const ret = await A.evaluate(() => {
      const p = (n) => String(n).padStart(2, '0');
      const agora = new Date(2026, 10, 2, 15, 0, 0).getTime();
      const nomes = [];
      for (let k = 0; k < 60; k++) {   /* 14:30:00 … 14:59:30, de 30 em 30 s */
        const d = new Date(2026, 10, 2, 14, 30, k * 30);
        nomes.push('2026-11-02_14h' + p(d.getMinutes()) + 'm' + p(d.getSeconds()) + '_maria-antes.json');
      }
      nomes.push('2026-11-02_10h15m00_ana.json', '2026-11-02_10h45m00_ana.json',
        '2026-11-01_09h05_bruno.json', '2026-11-01_09h40_bruno-antes.json',
        '2026-10-10_08h00m00_ana.json', '2026-10-10_12h00m00_bruno.json',
        '2026-09-01_12h00_bruno.json', 'leia-me.json');
      return {
        apagar: Pasta.aApagarDoHistorico(nomes, agora).sort(),
        nome: Pasta.carimboDeNome(new Date(2026, 10, 2, 14, 5, 33)),
        lido: Pasta.lerNomeVersao('2026-11-02_14h05m33_bruno-antes.json'),
        antigo: Pasta.lerNomeVersao('2026-11-02_14h05_bruno.json')
      };
    });
    const primeiras20 = [];
    for (let k = 0; k < 20; k++) {
      const s = k * 30;
      primeiras20.push('2026-11-02_14h' + String(30 + Math.floor(s / 60)).padStart(2, '0') + 'm' +
        String(s % 60).padStart(2, '0') + '_maria-antes.json');
    }
    L.igual(ret.apagar, primeiras20.concat(['2026-09-01_12h00_bruno.json', '2026-10-10_08h00m00_ana.json',
      '2026-11-01_09h05_bruno.json', '2026-11-02_10h15m00_ana.json']).sort(),
    'ficam as 40 mais novas, a última de cada hora (24 h) e a de cada dia (30 dias); o que não é versão nunca sai');
    L.igual(ret.nome, '2026-11-02_14h05m33', 'o nome da versão leva os segundos (duas no mesmo minuto não se apagam)');
    L.ok(ret.lido && ret.lido.seg === '33' && ret.lido.quem === 'bruno-antes' && ret.antigo && ret.antigo.min === '05',
      'os nomes novos e os antigos (sem segundos) são lidos');
    const lista = await A.evaluate(() => Pasta.listarHistorico());
    L.ok(lista.length > 0 && lista.every((v, i) => i === 0 || lista[i - 1].em >= v.em) && /:\d\d:\d\d$/.test(lista[0].quando),
      'a lista do histórico vem da mais nova para a mais antiga, com a hora até os segundos (' + lista[0].quando + ')');

    console.log('imagens sem uso: só as velhas, e nunca as que o histórico cita');
    for (const n of ['velha-usada.jpg', 'velha-solta.jpg', 'velha-no-historico.jpg', 'nova-solta.jpg']) {
      pasta.gravar('imagens/' + n, 'x');
    }
    for (const n of ['velha-usada.jpg', 'velha-solta.jpg', 'velha-no-historico.jpg']) pasta.envelhecer('imagens/' + n, 10);
    const img = await A.evaluate(async () => {
      const cand = await Pasta.imagensSemUso(['imagens/velha-usada.jpg']);
      const nomes = cand.map((c) => c.nome).sort();
      const apagadas = await Pasta.apagarImagens(cand, ['imagens/velha-no-historico.jpg']);
      return { nomes: nomes, apagadas: apagadas };
    });
    L.igual(img.nomes, ['velha-no-historico.jpg', 'velha-solta.jpg'], 'candidatas: sem uso e com mais de sete dias');
    const sobrou = pasta.listar('imagens');
    L.ok(img.apagadas === 1 && sobrou.indexOf('velha-solta.jpg') < 0 && sobrou.indexOf('velha-no-historico.jpg') >= 0 &&
      sobrou.indexOf('velha-usada.jpg') >= 0 && sobrou.indexOf('nova-solta.jpg') >= 0,
      'apagada só a solta; a citada pelo histórico, a usada e a nova ficaram');
  } finally {
    const f = L.resultado('pasta da equipe, três pessoas', erros);
    await nav.close();
    srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch((e) => { console.error(e); process.exit(1); });
