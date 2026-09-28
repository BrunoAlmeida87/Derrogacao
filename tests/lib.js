/* ==========================================================================
   tests/lib.js — o que todas as suítes usam
   --------------------------------------------------------------------------
   Sobe um servidor estático mínimo (Node puro, sem dependência) na raiz do
   repositório, abre o Chromium do Playwright e semeia dados de exemplo pela
   própria API do programa (Store, Ncrs) — o mesmo caminho que um usuário
   percorreria, só que sem clicar item por item.

   Nada aqui é do programa: o programa continua sem build e sem dependência.
   As suítes são ferramenta de quem edita (CLAUDE.md, §7).
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = process.env.DERROG_TMP || path.join(os.tmpdir(), 'derrogacao-testes');
fs.mkdirSync(SAIDA, { recursive: true });

/* O Playwright do projeto, se houver; senão o global (npm i -g playwright). */
function playwright() {
  try { return require('playwright'); } catch (e) { /* segue para o global */ }
  const global = execSync('npm root -g').toString().trim();
  return require(path.join(global, 'playwright'));
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

/**
 * Servidor estático na raiz do repositório. Resolve com { url, fechar, extras }.
 * `extras` mapeia um caminho a uma função que devolve o conteúdo — é como os
 * testes servem um visualizador-dados.js que muda no meio do teste.
 */
function servidor() {
  const extras = {};
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      if (extras[rel]) {
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(rel)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(extras[rel]());
        return;
      }
      const alvo = path.join(RAIZ, rel);
      if (!alvo.startsWith(RAIZ)) { res.writeHead(403); res.end(); return; }
      fs.readFile(alvo, function (err, buf) {
        if (err) { res.writeHead(404); res.end('não achei'); return; }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', function () {
      resolve({ url: 'http://127.0.0.1:' + srv.address().port + '/', extras: extras,
        fechar: function () { srv.close(); } });
    });
  });
}

/* A "pasta da rede" dos testes: um diretório OPFS no lugar do seletor do
   Windows — a mesma interface FileSystemDirectoryHandle que a pasta entrega. */
const PASTA_FALSA = `
  window.__pastaFalsa = async () => {
    const raiz = await navigator.storage.getDirectory();
    return await raiz.getDirectoryHandle('Derrogacao', { create: true });
  };
  window.showDirectoryPicker = () => window.__pastaFalsa();
`;

/** Abre o navegador e uma página já com o nome do usuário definido. */
async function abrir(opts) {
  opts = opts || {};
  const pw = playwright();
  const navegador = await pw.chromium.launch(process.env.DERROG_CHROME
    ? { executablePath: process.env.DERROG_CHROME } : {});
  const contexto = await navegador.newContext({
    viewport: opts.viewport || { width: 1600, height: 1000 },
    acceptDownloads: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo'
  });
  if (opts.pasta) await contexto.addInitScript(PASTA_FALSA);
  /* a janela de impressão não existe no navegador sem tela: conta as chamadas */
  await contexto.addInitScript('window.__impressoes = 0; window.print = function () { window.__impressoes++; };');
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', function (e) { erros.push('pageerror: ' + e.message); });
  pagina.on('console', function (m) { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  pagina.on('dialog', function (d) { d.accept(); });
  return { navegador: navegador, contexto: contexto, pagina: pagina, erros: erros };
}

/* --- dados de exemplo ------------------------------------------------------ */

const STATUS_NCR = ['Open', 'Under analysis', 'Closed', 'CEDOC Closure', 'CEDOC Closure Unfounded', 'Waiting for action'];
const SITUACOES = ['preenchendo', 'solicitado', 'justificar', 'aceito'];
const FUNCOES = ['03 - Emergency shut-off sea water systems', '09 - Coordinate damage control',
  '14 - Fight the fire', '20 - Electric supply', '36 - Pressure hull integrity'];
const LONGO = 'During the inspection of the compartment the team found that the equipment ' +
  'was installed with pending components and the supplier delivery forecast moved again. ' +
  'The temporary solution keeps the function available with operational restrictions, ' +
  'described in the attached procedure, until the definitive material arrives on board. ';

function numero(i) { return 'NCR-ICN-ESC-14-' + String(1000 + i).padStart(4, '0') + '-2025'; }

/**
 * O retrato semeado. `marcos` diz quais relatórios existem e com que itens;
 * o J10 é gravado por último de propósito — é o "mais recente", e a abertura
 * tem de preferir o J09 mesmo assim.
 */
function dadosDeExemplo(opts) {
  opts = opts || {};
  const semJ09 = !!opts.semJ09;
  const item = function (i, marco, extra) {
    const sit = SITUACOES[i % 4];
    return Object.assign({
      ncrId: numero(i), systems: ['BX', 'HP', 'RM', 'BD'][i % 4],
      func: 'FV' + String(3 + (i % 5)).padStart(2, '0') + ' - ' + FUNCOES[i % 5].replace(/^\d+ - /, '').toUpperCase(),
      description: (i % 3 === 0 ? LONGO + LONGO : 'Descrição curta da NCR ' + numero(i) + '.'),
      currentSituation: 'Situação atual do item ' + i, whyNotPossible: 'Material atrasado',
      arguments: 'Argumentos do item ' + i, archAnswer: '', requestExpiry: '', archStatus: '',
      approvedExpiry: '', historic: '', status: sit, editedBy: ['Bruno', 'Maria', 'Ana'][i % 3],
      editedAt: new Date(Date.UTC(2026, 8, 1 + (i % 20), 12, 0, 0)).toISOString()
    }, extra || {});
  };
  const projetos = [];
  /* J08: parte dos itens aceitos com o waiver valendo até o J09 — "a caminho" */
  projetos.push({ marco: 'J08', atualizado: '2026-09-20T10:00:00Z', ncrs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) {
    return item(i, 'J08', { historic: 'J06 To: J08', approvedExpiry: i % 4 === 3 ? 'J09' : '',
      requestExpiry: i % 4 === 1 ? 'J09' : '' });
  }), devs: [] });
  if (!semJ09) {
    projetos.push({ marco: 'J09', atualizado: '2026-09-21T10:00:00Z', ncrs: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(function (i) {
      return item(i, 'J09', { historic: 'J08 To: J09' });
    }), devs: [0, 1, 2].map(function (k) {
      return item(100 + k, 'J09', { ncrId: 'DEV-SBR4-J09-' + (k + 1), systems: 'CM', func: 'Desvio ' + (k + 1) });
    }) });
  }
  projetos.push({ marco: 'J09 Ind', atualizado: '2026-09-22T10:00:00Z', ncrs: [26, 27].map(function (i) {
    return item(i, 'J09 Ind');
  }), devs: [] });
  projetos.push({ marco: 'J10', atualizado: '2026-09-26T10:00:00Z', ncrs: [28, 29].map(function (i) {
    return item(i, 'J10');
  }), devs: [] });

  /* o banco NCR: 60 NCRs do SBR4, com marco atual e status variados */
  const registros = [];
  const correlacao = [];
  for (let i = 0; i < 60; i++) {
    const marcoAtual = i < 10 ? 'J08' : (i < 46 ? 'J09' : (i < 50 ? 'J09 Ind' : 'J10'));
    registros.push({ id: numero(i), campos: {
      'Número NCR': numero(i), 'Status': STATUS_NCR[i % STATUS_NCR.length],
      'Título': 'Título da NCR ' + i, 'Descrição': (i % 2 ? LONGO : 'Descrição da NCR ' + i),
      'Bigramas': ['BX', 'HP', 'RM', 'BD'][i % 4], 'SBR': 'SBR4',
      'Data criação': '2025-0' + (1 + (i % 9)) + '-1' + (i % 9), 'Responsável': ['João', 'Carla', 'Pedro'][i % 3]
    } });
    correlacao.push({ numero: numero(i), marcoOriginal: 'J06', marcoAtual: marcoAtual,
      funcaoVital: FUNCOES[i % 5], observacao: i % 7 === 0 ? 'Observação ' + i : '' });
  }
  return { projetos: projetos, banco: { tipo: 'ncr', registros: registros }, correlacao: { itens: correlacao } };
}

/** Grava o retrato no navegador pela API do programa e recarrega a página. */
async function semear(pagina, url, opts) {
  opts = opts || {};
  await pagina.goto(url + (opts.pagina || 'index.html'));
  await pagina.waitForFunction(function () { return window.Store && window.Ncrs; });
  const dados = dadosDeExemplo(opts);
  const exemploJ06 = opts.semJ06 ? null : JSON.parse(fs.readFileSync(path.join(RAIZ, 'exemplos/WaiverRequest_SBR4_J06.json'), 'utf8'));
  await pagina.evaluate(async function (a) {
    localStorage.setItem('derrogacao:user', 'Teste');
    const antigos = await Store.list();
    for (const p of antigos) await Store.remove(p.id);
    const lista = [];
    if (a.j06) {
      const p06 = Store.normalizeProject(a.j06.projects[0]);
      p06.updatedAt = '2026-09-10T10:00:00Z';
      lista.push(p06);
    }
    a.dados.projetos.forEach(function (d) {
      const p = Store.newProject(d.marco);
      d.ncrs.forEach(function (x) { const n = Store.newNcr(); Object.assign(n, x); Store.setStatus(n, x.status); p.ncrs.push(n); });
      d.devs.forEach(function (x) { const n = Store.newNcr(); Object.assign(n, x); Store.setStatus(n, x.status); p.devs.push(n); });
      lista.push(p);
      p.__atualizado = d.atualizado;
    });
    for (const p of lista) {
      const quando = p.__atualizado || p.updatedAt;
      delete p.__atualizado;
      await Store.save(p);
      /* Store.save carimba updatedAt com "agora": regrava o carimbo pedido,
         direto no banco, para a ordem de "mais recente" ser a do roteiro */
      p.updatedAt = quando;
      await new Promise(function (ok, erro) {
        const r = indexedDB.open('derrogacao');
        r.onsuccess = function () {
          const db = r.result;
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put(p);
          tx.oncomplete = function () { db.close(); ok(); };
          tx.onerror = function () { erro(tx.error); };
        };
        r.onerror = function () { erro(r.error); };
      });
    }
    if (!a.semBanco) {
      const r1 = Ncrs.importarBase(a.dados.banco, 'banco-teste.json', 'Teste');
      await Ncrs.salvar(r1.alterados);
      const r2 = Ncrs.importarCorrelacao(Ncrs.lerCorrelacao(a.dados.correlacao), 'correl-teste.json', 'Teste', {});
      await Ncrs.salvar(r2.alterados);
      await Ncrs.salvarMeta();
    }
  }, { dados: dados, j06: exemploJ06, semBanco: !!opts.semBanco });
  await pagina.reload();
  await esperarPronto(pagina);
  /* O editor abre no Banco NCR (Config.ABA_INICIAL_EDITOR). As suítes que
     começam pela lista de itens pedem a aba Waiver NCR; quem confere a
     abertura em si passa { naAbertura: true } e fica onde o programa abriu. */
  if (!opts.naAbertura && !/visualizador/.test(opts.pagina || '')) {
    await pagina.click('.tab[data-kind="ncr"]');
    await pagina.waitForTimeout(200);
  }
  return dados;
}

/** O texto do visualizador-dados.js, montado no editor já semeado. */
async function publicacao(pagina) {
  return pagina.evaluate(async function () {
    const lista = await Store.list();
    return Publicacao.texto(Publicacao.montar(lista, 'Teste', Ncrs.paraBackup()));
  });
}

/* O ciclo da atualização automática com outro intervalo, para o teste não
   esperar 5 minutos: troca o valor assim que o config.js o define. */
function intervaloCurto(ms) {
  return `(() => {
    let c = null;
    Object.defineProperty(window, 'Config', { configurable: true,
      get() { return c; },
      set(v) { v.INTERVALO_ATUALIZACAO_MS = ${ms}; c = v; } });
  })();`;
}

/** Espera o programa terminar de abrir (lista de relatórios montada). */
async function esperarPronto(pagina) {
  await pagina.waitForFunction(function () {
    const sel = document.getElementById('projectSelect');
    return sel && sel.options.length > 0;
  });
  await pagina.waitForTimeout(300);
}

/* --- asserções -------------------------------------------------------------- */

let falhas = 0;
let passos = 0;
function ok(cond, msg) {
  passos++;
  if (cond) { console.log('  ✓ ' + msg); return true; }
  falhas++;
  console.log('  ✗ ' + msg);
  return false;
}
function igual(a, b, msg) {
  const certo = JSON.stringify(a) === JSON.stringify(b);
  return ok(certo, certo ? msg : msg + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');
}
function resultado(nome, erros) {
  if (erros && erros.length) {
    falhas++;
    console.log('  ✗ erros no console:\n    ' + erros.join('\n    '));
  }
  console.log((falhas ? '✗ ' : '✓ ') + nome + ': ' + (passos - falhas) + '/' + passos + ' conferências');
  return falhas;
}

function arquivo(nome) { return path.join(SAIDA, nome); }

/** Clica e devolve o arquivo baixado: { nome, buffer }. */
async function baixar(pagina, clicar) {
  const esperado = pagina.waitForEvent('download');
  await clicar();
  const dl = await esperado;
  const destino = arquivo(dl.suggestedFilename());
  await dl.saveAs(destino);
  return { nome: dl.suggestedFilename(), buffer: fs.readFileSync(destino), caminho: destino };
}

/* Um PDF gerado pelo Chromium: quantas páginas e o tamanho de cada uma, em
   mm, lidos direto do arquivo — sem biblioteca. */
function lerPdf(buffer) {
  const txt = buffer.toString('latin1');
  const paginas = (txt.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  const caixas = [];
  const re = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g;
  let m;
  while ((m = re.exec(txt))) {
    caixas.push([Math.round((m[3] - m[1]) / 72 * 25.4), Math.round((m[4] - m[2]) / 72 * 25.4)]);
  }
  return { paginas: paginas, tamanhos: caixas };
}

/** Garante que o #printRoot foi montado e gera o PDF como a impressão faria. */
async function pdfDaImpressao(pagina, nome) {
  const destino = arquivo(nome);
  await pagina.pdf({ path: destino, preferCSSPageSize: true, printBackground: true });
  return Object.assign(lerPdf(fs.readFileSync(destino)), { caminho: destino });
}

module.exports = {
  RAIZ: RAIZ, SAIDA: SAIDA, arquivo: arquivo,
  playwright: playwright, servidor: servidor, abrir: abrir,
  dadosDeExemplo: dadosDeExemplo, semear: semear, esperarPronto: esperarPronto, numero: numero,
  publicacao: publicacao, intervaloCurto: intervaloCurto,
  baixar: baixar, lerPdf: lerPdf, pdfDaImpressao: pdfDaImpressao,
  ok: ok, igual: igual, resultado: resultado
};
