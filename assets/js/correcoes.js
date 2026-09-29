/* ==========================================================================
   correcoes.js — a continuidade das NCRs e as correções do administrador
   --------------------------------------------------------------------------
   Três coisas que o banco NCR importado não sabe e que só existem aqui:

   1. SUBSTITUIÇÕES. Enquanto o sistema interno estava fora do ar, algumas
      NCRs foram abertas com um número provisório. Voltando o sistema, a
      temporária foi encerrada e uma definitiva, com o número oficial,
      continuou o caso. `substituir(temporária, definitiva)` grava essa
      ligação, e o resto do programa passa a ler as duas como o mesmo caso:
      o vínculo com os relatórios, o fluxo do waiver (o ponto do marco
      anterior), o painel, o Kanban, o "levar adiante". Nada é renomeado: o
      item do J06 continua com o número temporário que tinha — o registro
      antigo fica rastreável — e é a ligação que diz que ele continua na
      definitiva.

   2. AJUSTES. Correção manual de um dado do banco NCR (o status, por
      exemplo), feita na área administrativa. O ajuste NÃO reescreve a
      `fonte` da NCR: ele é uma camada por cima (`fonte(rec)`), e guarda o
      valor que o banco tinha quando foi feito. Se uma importação trouxer
      outro valor naquele campo, o banco andou e o ajuste deixa de valer
      sozinho — senão uma correção de hoje esconderia para sempre o que o
      sistema oficial disser amanhã.

   3. AUDITORIA. Cada ajuste e cada substituição (feitos e desfeitos) vira
      uma linha: campo, valor anterior, novo valor, data e hora, quem.

   E a SENHA da área administrativa, que mora no mesmo arquivo da pasta.
   Ela esconde as funções de quem não é administrador; não é controle de
   acesso — o programa roda inteiro no navegador de quem o abre, e quem
   manda de verdade é a permissão da pasta na rede (CLAUDE.md §6).

   Arquivo próprio na pasta (derrogacao-ncr-correcoes.json), pelo motivo
   dos comunicados: a versão anterior do programa, ao regravar o arquivo do
   Waiver ou o do banco, apagaria em silêncio um campo que não conhece.

   Carrega depois do ncrs.js e usa Ncrs, Store e Log só na hora da chamada.
   ========================================================================== */
(function (global) {
  'use strict';

  var ARQUIVO = 'derrogacao-ncr-correcoes.json';
  var MAX_AUDITORIA = 3000;
  var ITERACOES = 2000;

  /* Os dados do banco que o administrador pode corrigir, além de qualquer
     coluna do export ('c:<nome da coluna>'). */
  var CAMPOS = [
    { id: 'status', nome: 'Status' },
    { id: 'titulo', nome: 'Título' },
    { id: 'descricao', nome: 'Descrição' },
    { id: 'sistema', nome: 'Sistema (bigramas)' },
    { id: 'responsavel', nome: 'Responsável' },
    { id: 'criadoEm', nome: 'Data de criação' },
    { id: 'fechamento', nome: 'Data de fechamento' }
  ];

  function str(v) { return v == null ? '' : String(v); }
  function nowIso() { return new Date().toISOString(); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function chave(s) { return global.Ncrs ? Ncrs.chave(s) : str(s).toUpperCase().replace(/\s+/g, ''); }
  function depoisDe(t) { return global.Store && Store.depoisDe ? Store.depoisDe(t) : nowIso(); }
  function uid() {
    return global.Store && Store.uid ? Store.uid()
      : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* --- estado ------------------------------------------------------------- */

  var est = vazio();
  var versao = 0;
  /* a senha foi definida ou trocada NESTE navegador e ainda não chegou à
     pasta. Só nesse caso a senha daqui entra na junção — no resto, quem diz
     qual é a senha é o arquivo da pasta (é o que permite zerá-la lá). */
  var senhaPendente = false;

  function vazio() {
    return { id: 'correcoes', substituicoes: {}, ajustes: {}, auditoria: [], senha: null, senhaPendente: false };
  }

  function mudou() { versao++; cache = {}; }

  function normSubst(s) {
    if (!s || typeof s !== 'object') return null;
    var de = chave(s.de || s.deNumero);
    if (!de) return null;
    return {
      de: de, deNumero: str(s.deNumero) || de,
      para: chave(s.para || s.paraNumero), paraNumero: str(s.paraNumero) || chave(s.para),
      por: str(s.por), em: str(s.em), obs: str(s.obs), removida: s.removida === true
    };
  }

  function normAjuste(a, campo) {
    if (!a || typeof a !== 'object') return null;
    return {
      campo: str(a.campo || campo), rotulo: str(a.rotulo), valor: str(a.valor), banco: str(a.banco),
      por: str(a.por), em: str(a.em), obs: str(a.obs), removido: a.removido === true
    };
  }

  function normAuditoria(e) {
    if (!e || typeof e !== 'object' || !e.id) return null;
    return {
      id: str(e.id), em: str(e.em), por: str(e.por), tipo: str(e.tipo),
      key: str(e.key), ncr: str(e.ncr), campo: str(e.campo),
      de: str(e.de), para: str(e.para), obs: str(e.obs)
    };
  }

  function normSenha(s) {
    if (!s || typeof s !== 'object' || !s.hash || !s.sal) return null;
    return { hash: str(s.hash), sal: str(s.sal), iter: +s.iter || ITERACOES,
             criadaEm: str(s.criadaEm), em: str(s.em), por: str(s.por) };
  }

  /** Aceita o formato guardado aqui e o do arquivo da pasta (listas). */
  function normalizar(d) {
    var out = vazio();
    if (!d || typeof d !== 'object') return out;
    var subs = Array.isArray(d.substituicoes) ? d.substituicoes
      : Object.keys(d.substituicoes || {}).map(function (k) { return d.substituicoes[k]; });
    subs.forEach(function (s) {
      var n = normSubst(s);
      if (n) out.substituicoes[n.de] = n;
    });
    if (Array.isArray(d.ajustes)) {
      d.ajustes.forEach(function (a) {
        var k = chave(a && a.key), n = normAjuste(a);
        if (!k || !n || !n.campo) return;
        (out.ajustes[k] = out.ajustes[k] || {})[n.campo] = n;
      });
    } else if (d.ajustes && typeof d.ajustes === 'object') {
      Object.keys(d.ajustes).forEach(function (k) {
        var porCampo = d.ajustes[k] || {};
        Object.keys(porCampo).forEach(function (c) {
          var n = normAjuste(porCampo[c], c);
          if (n) (out.ajustes[chave(k)] = out.ajustes[chave(k)] || {})[n.campo] = n;
        });
      });
    }
    out.auditoria = (Array.isArray(d.auditoria) ? d.auditoria : []).map(normAuditoria).filter(Boolean);
    out.auditoria.sort(function (a, b) { return a.em.localeCompare(b.em); });
    out.senha = normSenha(d.senha);
    out.senhaPendente = d.senhaPendente === true;
    return out;
  }

  /* --- persistência local ----------------------------------------------- */

  function carregar() {
    if (!global.Store || !Store.ncrMetaGet) return Promise.resolve(0);
    return Store.ncrMetaGet('correcoes').then(function (r) {
      est = normalizar(r);
      senhaPendente = est.senhaPendente;
      mudou();
      return listaSubstituicoes().length;
    }, function () { return 0; });
  }

  function salvarLocal() {
    mudou();
    if (!global.Store || !Store.ncrMetaPut) return Promise.resolve(null);
    var o = copia(est);
    o.id = 'correcoes';
    o.senhaPendente = senhaPendente;
    return Store.ncrMetaPut(o);
  }

  /* --- auditoria ---------------------------------------------------------- */

  function registrar(e) {
    var linha = normAuditoria({
      id: uid(), em: nowIso(), por: e.por, tipo: e.tipo, key: e.key, ncr: e.ncr,
      campo: e.campo, de: e.de, para: e.para, obs: e.obs
    });
    est.auditoria.push(linha);
    if (est.auditoria.length > MAX_AUDITORIA) est.auditoria = est.auditoria.slice(-MAX_AUDITORIA);
    if (global.Log) Log.ok('correções', 'registro de auditoria', { tipo: linha.tipo, id: linha.id });
    return linha;
  }

  /** Da mais nova para a mais antiga. */
  function auditoria() { return est.auditoria.slice().reverse(); }

  /** As linhas de uma NCR (pela chave), da mais nova para a mais antiga. */
  function auditoriaDe(key) {
    var k = chave(key);
    return auditoria().filter(function (e) { return e.key === k; });
  }

  /* --- 1. substituições ---------------------------------------------------- */

  function ativa(s) { return s && !s.removida && s.para; }

  /** A chave da NCR que substituiu esta (um passo), ou ''. */
  function sucessora(key) {
    var s = est.substituicoes[chave(key)];
    return ativa(s) ? s.para : '';
  }

  /** O registro da substituição desta NCR temporária, ou null. */
  function substituicaoDe(key) {
    var s = est.substituicoes[chave(key)];
    return ativa(s) ? s : null;
  }

  /** A definitiva no fim da corrente (T1 → T2 → D devolve D). */
  function definitiva(key) {
    var k = chave(key), vistos = {};
    for (var i = 0; i < 20; i++) {
      vistos[k] = 1;
      var p = sucessora(k);
      if (!p || vistos[p]) return k;
      k = p;
    }
    return k;
  }

  /** As substituições ativas que apontam para esta NCR (as temporárias dela). */
  function anteriores(key) {
    var k = chave(key);
    return listaSubstituicoes().filter(function (s) { return s.para === k; });
  }

  /** Esta NCR faz parte de alguma substituição (como temporária ou definitiva)? */
  function envolvida(key) {
    var k = chave(key);
    if (!k) return false;
    return !!sucessora(k) || anteriores(k).length > 0;
  }

  function temSubstituicoes() {
    return Object.keys(est.substituicoes).some(function (k) { return ativa(est.substituicoes[k]); });
  }

  function listaSubstituicoes() {
    return Object.keys(est.substituicoes).map(function (k) { return est.substituicoes[k]; })
      .filter(ativa)
      .sort(function (a, b) { return b.em.localeCompare(a.em); });
  }

  /**
   * Liga a temporária à definitiva. Devolve { ok, erro }. A temporária tem
   * uma sucessora só: ligar de novo troca a anterior (e a auditoria guarda
   * as duas). Uma corrente em círculo é recusada.
   */
  function substituir(deNumero, paraNumero, quem, obs) {
    var de = chave(deNumero), para = chave(paraNumero);
    if (!de || !para) return { ok: false, erro: 'Informe os dois números: a NCR temporária e a definitiva.' };
    if (de === para) return { ok: false, erro: 'A NCR não pode substituir a si mesma.' };
    if (definitiva(para) === de) {
      return { ok: false, erro: 'A ' + paraNumero + ' já leva à ' + deNumero + ': a ligação fecharia um círculo.' };
    }
    var antes = est.substituicoes[de];
    if (ativa(antes) && antes.para === para) return { ok: false, erro: 'Esta ligação já existe.' };
    est.substituicoes[de] = {
      de: de, deNumero: str(deNumero).trim() || de, para: para, paraNumero: str(paraNumero).trim() || para,
      por: str(quem), em: depoisDe(antes && antes.em), obs: str(obs), removida: false
    };
    registrar({
      tipo: 'substituicao', key: de, ncr: str(deNumero).trim() || de, campo: 'Substituída por (NCR definitiva)',
      de: ativa(antes) ? antes.paraNumero : '', para: str(paraNumero).trim() || para, obs: obs, por: quem
    });
    registrar({
      tipo: 'substituicao', key: para, ncr: str(paraNumero).trim() || para, campo: 'Substitui (NCR temporária)',
      de: '', para: str(deNumero).trim() || de, obs: obs, por: quem
    });
    mudou();
    return { ok: true };
  }

  function desfazerSubstituicao(deKey, quem, obs) {
    var s = est.substituicoes[chave(deKey)];
    if (!ativa(s)) return { ok: false, erro: 'Não há ligação para desfazer.' };
    var velha = copia(s);
    s.removida = true;
    s.em = depoisDe(s.em);
    s.por = str(quem);
    s.obs = str(obs);
    registrar({ tipo: 'substituicao-desfeita', key: velha.de, ncr: velha.deNumero,
      campo: 'Substituída por (NCR definitiva)', de: velha.paraNumero, para: '', obs: obs, por: quem });
    registrar({ tipo: 'substituicao-desfeita', key: velha.para, ncr: velha.paraNumero,
      campo: 'Substitui (NCR temporária)', de: velha.deNumero, para: '', obs: obs, por: quem });
    mudou();
    return { ok: true };
  }

  /* --- 2. ajustes do administrador ----------------------------------------- */

  function rotuloCampo(campo) {
    if (str(campo).indexOf('c:') === 0) return str(campo).slice(2);
    var c = CAMPOS.filter(function (x) { return x.id === campo; })[0];
    return c ? c.nome : str(campo);
  }

  /** O valor que o banco NCR importado tem neste campo (sem ajuste). */
  function valorBanco(rec, campo) {
    if (!rec || !rec.fonte) return '';
    if (str(campo).indexOf('c:') === 0) return str((rec.fonte.campos || {})[campo.slice(2)]);
    return str(rec.fonte[campo]);
  }

  /**
   * O ajuste que vale agora neste campo, ou null. Um ajuste deixa de valer
   * quando o banco muda o valor que ele corrigiu: o banco andou.
   */
  function ajusteAtivo(rec, campo) {
    var porCampo = rec && est.ajustes[rec.key];
    var a = porCampo && porCampo[campo];
    if (!a || a.removido) return null;
    return valorBanco(rec, campo) === a.banco ? a : null;
  }

  /** Os ajustes que o banco já superou (para a área administrativa dizer). */
  function ajustesSuperados(rec) {
    var porCampo = rec && est.ajustes[rec.key];
    if (!porCampo) return [];
    return Object.keys(porCampo).map(function (c) { return porCampo[c]; }).filter(function (a) {
      return !a.removido && valorBanco(rec, a.campo) !== a.banco;
    });
  }

  function ajustesAtivos(rec) {
    var porCampo = rec && est.ajustes[rec.key];
    if (!porCampo) return [];
    return Object.keys(porCampo).map(function (c) { return ajusteAtivo(rec, c); }).filter(Boolean);
  }

  /** Todos os ajustes ativos de todas as NCRs: [{ rec, ajuste }]. */
  function todosAjustes() {
    var out = [];
    Object.keys(est.ajustes).forEach(function (k) {
      var rec = global.Ncrs ? Ncrs.get(k) : null;
      if (!rec) return;
      ajustesAtivos(rec).forEach(function (a) { out.push({ rec: rec, ajuste: a }); });
    });
    return out.sort(function (x, y) { return y.ajuste.em.localeCompare(x.ajuste.em); });
  }

  /**
   * Corrige um campo. Grava o valor novo, o valor que o banco tinha (para
   * saber quando o banco andar) e a linha da auditoria com o valor em uso
   * antes — que pode ser um ajuste anterior.
   */
  function ajustar(rec, campo, valor, quem, obs) {
    if (!rec || !campo) return { ok: false, erro: 'Escolha a NCR e o campo.' };
    var antesEmUso = valorEmUso(rec, campo);
    valor = str(valor);
    if (valor === antesEmUso) return { ok: false, erro: 'O valor novo é igual ao que já está em uso.' };
    var porCampo = est.ajustes[rec.key] = est.ajustes[rec.key] || {};
    var velho = porCampo[campo];
    porCampo[campo] = {
      campo: campo, rotulo: rotuloCampo(campo), valor: valor, banco: valorBanco(rec, campo),
      por: str(quem), em: depoisDe(velho && velho.em), obs: str(obs), removido: false
    };
    registrar({ tipo: 'ajuste', key: rec.key, ncr: rec.numero, campo: rotuloCampo(campo),
      de: antesEmUso, para: valor, obs: obs, por: quem });
    mudou();
    return { ok: true };
  }

  /** Tira a correção: o campo volta a mostrar o que o banco NCR diz. */
  function desfazerAjuste(rec, campo, quem, obs) {
    var a = ajusteAtivo(rec, campo);
    if (!a) return { ok: false, erro: 'Não há correção ativa neste campo.' };
    var antes = a.valor;
    a.removido = true;
    a.em = depoisDe(a.em);
    a.por = str(quem);
    a.obs = str(obs);
    registrar({ tipo: 'ajuste-desfeito', key: rec.key, ncr: rec.numero, campo: rotuloCampo(campo),
      de: antes, para: valorBanco(rec, campo), obs: obs, por: quem });
    mudou();
    return { ok: true };
  }

  function valorEmUso(rec, campo) {
    var a = ajusteAtivo(rec, campo);
    return a ? a.valor : valorBanco(rec, campo);
  }

  /* A `fonte` como o programa deve ler: a importada, com os ajustes ativos
     por cima. Sem ajuste, é a própria rec.fonte (nada é copiado). Com
     ajuste, uma cópia rasa — a fonte gravada nunca é tocada. */
  var cache = {};
  function fonte(rec) {
    if (!rec) return null;
    if (!est.ajustes[rec.key]) return rec.fonte;
    var v = versao + ':' + (global.Ncrs ? Ncrs.versao() : 0);
    var c = cache[rec.key];
    if (c && c.ref === rec.fonte && c.v === v) return c.valor;
    var ativos = ajustesAtivos(rec);
    var out = rec.fonte;
    if (ativos.length) {
      out = {};
      Object.keys(rec.fonte).forEach(function (k) { out[k] = rec.fonte[k]; });
      out.campos = {};
      Object.keys(rec.fonte.campos || {}).forEach(function (k) { out.campos[k] = rec.fonte.campos[k]; });
      out.ajustes = {};           // campo -> ajuste (papel ou 'c:coluna')
      out.colunasAjustadas = {};  // nome da coluna -> ajuste
      var papeis = (global.Ncrs && Ncrs.meta().papeis) || {};
      ativos.forEach(function (a) {
        out.ajustes[a.campo] = a;
        if (a.campo.indexOf('c:') === 0) {
          var col = a.campo.slice(2);
          out.campos[col] = a.valor;
          out.colunasAjustadas[col] = a;
          Object.keys(papeis).forEach(function (p) {
            if (papeis[p] === col) { out[p] = a.valor; out.ajustes[p] = a; }
          });
        } else {
          out[a.campo] = a.valor;
          if (papeis[a.campo]) { out.campos[papeis[a.campo]] = a.valor; out.colunasAjustadas[papeis[a.campo]] = a; }
        }
      });
    }
    cache[rec.key] = { ref: rec.fonte, v: v, valor: out };
    return out;
  }

  /* --- 3. senha da área administrativa ---------------------------------------- */

  /* SHA-256 escrito à mão: crypto.subtle só existe em contexto seguro, e a
     conta tem de dar o mesmo resultado em todo computador da equipe — de
     file://, do arquivo único e do site. */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function ror(x, n) { return (x >>> n) | (x << (32 - n)); }
  function utf8(s) {
    var t = unescape(encodeURIComponent(str(s))), out = [];
    for (var i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    return out;
  }
  function sha256Hex(texto) {
    var b = utf8(texto);
    var bits = b.length * 8;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    var hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
    b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64);
    for (var i = 0; i < b.length; i += 64) {
      var t;
      for (t = 0; t < 16; t++) {
        w[t] = (b[i + 4 * t] << 24) | (b[i + 4 * t + 1] << 16) | (b[i + 4 * t + 2] << 8) | b[i + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = ror(x, 7) ^ ror(x, 18) ^ (x >>> 3);
        var s1 = ror(y, 17) ^ ror(y, 19) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        var maj = (a & bb) ^ (a & c) ^ (bb & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }

  function hashSenha(senha, sal, iter) {
    var h = sha256Hex(sal + ':' + senha);
    for (var i = 0; i < (iter || ITERACOES); i++) h = sha256Hex(h + sal);
    return h;
  }

  function salNovo() {
    var bytes = [];
    try {
      var a = new Uint8Array(16);
      global.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) bytes.push(a[i]);
    } catch (e) {
      for (var j = 0; j < 16; j++) bytes.push(Math.floor(Math.random() * 256));
    }
    return bytes.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  function temSenha() { return !!est.senha; }

  function conferir(senha) {
    if (!est.senha) return false;
    return hashSenha(str(senha), est.senha.sal, est.senha.iter) === est.senha.hash;
  }

  /** Só quando ainda não há senha: a primeira definição. */
  function definirSenha(senha, quem) {
    if (est.senha) return { ok: false, erro: 'Já existe uma senha de administrador. Para trocar, use a senha atual.' };
    if (str(senha).length < 6) return { ok: false, erro: 'Use pelo menos 6 caracteres.' };
    var sal = salNovo(), agora = nowIso();
    est.senha = { hash: hashSenha(senha, sal, ITERACOES), sal: sal, iter: ITERACOES, criadaEm: agora, em: agora, por: str(quem) };
    senhaPendente = true;
    registrar({ tipo: 'senha', key: '', ncr: '', campo: 'Senha do administrador', de: '', para: 'definida', por: quem });
    return { ok: true };
  }

  function trocarSenha(atual, nova, quem) {
    if (!conferir(atual)) return { ok: false, erro: 'A senha atual não confere.' };
    if (str(nova).length < 6) return { ok: false, erro: 'Use pelo menos 6 caracteres.' };
    var sal = salNovo();
    est.senha = { hash: hashSenha(nova, sal, ITERACOES), sal: sal, iter: ITERACOES,
      criadaEm: est.senha.criadaEm, em: depoisDe(est.senha.em), por: str(quem) };
    senhaPendente = true;
    registrar({ tipo: 'senha', key: '', ncr: '', campo: 'Senha do administrador', de: '', para: 'trocada', por: quem });
    return { ok: true };
  }

  /* Entre duas senhas, vale a criada primeiro — quem definir outra senha num
     navegador desligado da pasta não passa por cima da do administrador ao
     ligar a pasta. Com a mesma criação, vale a troca mais recente. */
  function melhorSenha(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.criadaEm !== b.criadaEm) return a.criadaEm < b.criadaEm ? a : b;
    return a.em >= b.em ? a : b;
  }

  /* --- pasta, backup e publicação -------------------------------------------- */

  function ajustesEmLista() {
    var out = [];
    Object.keys(est.ajustes).forEach(function (k) {
      Object.keys(est.ajustes[k]).forEach(function (c) {
        var a = copia(est.ajustes[k][c]);
        a.key = k;
        out.push(a);
      });
    });
    return out;
  }

  /** O arquivo da pasta (com a senha). */
  function arquivo(quem) {
    return {
      format: 'derrogacao-ncr-correcoes', schema: 1, updatedAt: nowIso(), updatedBy: str(quem),
      substituicoes: Object.keys(est.substituicoes).map(function (k) { return est.substituicoes[k]; }),
      ajustes: ajustesEmLista(),
      auditoria: est.auditoria,
      senha: est.senha
    };
  }

  /** Para o backup e a publicação: tudo, menos a senha. */
  function paraBackup() {
    var a = arquivo('');
    delete a.senha;
    return copia(a);
  }

  /**
   * Junta o que veio de fora (o arquivo da pasta, ou um backup). Por registro,
   * vale o mais recente (as desfeitas também, como lápide); a auditoria é
   * união. `opts.senha`: só o arquivo da pasta decide a senha.
   * Devolve { mudou, localMaisNovo }.
   */
  function juntar(d, opts) {
    opts = opts || {};
    var res = { mudou: false, localMaisNovo: false };
    if (!d || typeof d !== 'object') return res;
    var fora = normalizar(d);

    Object.keys(fora.substituicoes).forEach(function (k) {
      var la = fora.substituicoes[k], aqui = est.substituicoes[k];
      if (!aqui || la.em > aqui.em) { est.substituicoes[k] = la; res.mudou = true; }
      else if (aqui.em > la.em) res.localMaisNovo = true;
    });
    Object.keys(est.substituicoes).forEach(function (k) { if (!fora.substituicoes[k]) res.localMaisNovo = true; });

    Object.keys(fora.ajustes).forEach(function (k) {
      Object.keys(fora.ajustes[k]).forEach(function (c) {
        var la = fora.ajustes[k][c];
        var aqui = est.ajustes[k] && est.ajustes[k][c];
        if (!aqui || la.em > aqui.em) { (est.ajustes[k] = est.ajustes[k] || {})[c] = la; res.mudou = true; }
        else if (aqui.em > la.em) res.localMaisNovo = true;
      });
    });
    Object.keys(est.ajustes).forEach(function (k) {
      Object.keys(est.ajustes[k]).forEach(function (c) {
        if (!fora.ajustes[k] || !fora.ajustes[k][c]) res.localMaisNovo = true;
      });
    });

    var ids = {}, laIds = {};
    est.auditoria.forEach(function (e) { ids[e.id] = 1; });
    fora.auditoria.forEach(function (e) {
      laIds[e.id] = 1;
      if (!ids[e.id]) { est.auditoria.push(e); ids[e.id] = 1; res.mudou = true; }
    });
    if (est.auditoria.some(function (e) { return !laIds[e.id]; })) res.localMaisNovo = true;
    est.auditoria.sort(function (a, b) { return a.em.localeCompare(b.em); });
    if (est.auditoria.length > MAX_AUDITORIA) est.auditoria = est.auditoria.slice(-MAX_AUDITORIA);

    if (opts.senha) {
      var antes = JSON.stringify(est.senha);
      if (senhaPendente) {
        var m = melhorSenha(fora.senha, est.senha);
        if (m === est.senha && JSON.stringify(m) !== JSON.stringify(fora.senha)) res.localMaisNovo = true;
        else { est.senha = fora.senha; senhaPendente = false; }
      } else {
        /* a pasta é quem diz: inclusive quando a senha foi apagada lá */
        est.senha = fora.senha;
      }
      if (JSON.stringify(est.senha) !== antes) res.mudou = true;
    }
    if (res.mudou) mudou();
    return res;
  }

  /** Depois de gravar na pasta: a senha daqui já está lá. */
  function gravado() {
    if (senhaPendente) { senhaPendente = false; salvarLocal(); }
  }

  /** O visualizador: troca tudo pelo que veio publicado, só na memória. */
  function adotar(d) {
    est = normalizar(d);
    est.senha = null;
    senhaPendente = false;
    mudou();
  }

  global.Correcoes = {
    ARQUIVO: ARQUIVO,
    CAMPOS: CAMPOS,
    carregar: carregar,
    salvarLocal: salvarLocal,
    versao: function () { return versao; },
    /* continuidade */
    sucessora: sucessora,
    substituicaoDe: substituicaoDe,
    definitiva: definitiva,
    anteriores: anteriores,
    envolvida: envolvida,
    temSubstituicoes: temSubstituicoes,
    listaSubstituicoes: listaSubstituicoes,
    substituir: substituir,
    desfazerSubstituicao: desfazerSubstituicao,
    /* ajustes */
    rotuloCampo: rotuloCampo,
    valorBanco: valorBanco,
    valorEmUso: valorEmUso,
    ajusteAtivo: ajusteAtivo,
    ajustesAtivos: ajustesAtivos,
    ajustesSuperados: ajustesSuperados,
    todosAjustes: todosAjustes,
    ajustar: ajustar,
    desfazerAjuste: desfazerAjuste,
    fonte: fonte,
    /* auditoria */
    registrar: registrar,
    auditoria: auditoria,
    auditoriaDe: auditoriaDe,
    /* senha */
    temSenha: temSenha,
    conferir: conferir,
    definirSenha: definirSenha,
    trocarSenha: trocarSenha,
    sha256Hex: sha256Hex,
    /* pasta */
    arquivo: arquivo,
    paraBackup: paraBackup,
    juntar: juntar,
    gravado: gravado,
    adotar: adotar
  };
})(window);
