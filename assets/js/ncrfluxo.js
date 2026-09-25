/* ==========================================================================
   ncrfluxo.js — o desenho do fluxo da NCR, igual ao do NCR Control
   --------------------------------------------------------------------------
   Porta, em JavaScript de navegador antigo, das duas leituras da aba "Fluxo
   gráfico" do NCR Control (Detalhe.trajSVG e Detalhe.flowSVG), com o mesmo
   fluxo de status, as mesmas etapas e a mesma classificação de movimento.

   A fonte é o histórico importado (Importar histórico NCR): os eventos de
   status do NCR Control já vêm com a classificação (cls) e, quando não vêm,
   ela é refeita aqui pela mesma regra (`classificar`). Sem histórico, o
   desenho mostra só o status atual — e diz isso.

   Não depende de nada além de Ncrs (norm, data).
   ========================================================================== */
(function (global) {
  'use strict';

  /* Cfg.FLUXO_PADRAO e Cfg.ETAPAS do NCR Control */
  var FLUXO = [
    [1, 'ICN 1.1/1.2'], [1, '2.1 - Especialista ICN'],
    [2, '2.2 - TA Qualité'], [2, '2.2 - TA Qualité Validation'], [2, '2.2 - TA Specialist'],
    [3, '3.2 - DA'],
    [4, '5.1 - COMISS Combate'], [4, '5.1 - COMISS Plataf'], [4, '5.1 - DELIN'],
    [5, '6.1 - COMISS'], [5, '6.1 - COMISS RE-TESTE'], [5, '6.1 - CQ'], [5, '6.1 - GPL'],
    [5, '6.1 - PCP'], [5, '6.1 - PCP PEND MATERIAL'], [5, '6.1 - PROD DOC'], [5, '6.1 - PROD EXEC'],
    [6, '7.1 - CQ'],
    [7, 'CEDOC Closure'], [7, 'CEDOC Closure/Unfounded'], [7, 'Closed'], [7, 'Closed/Unfounded']
  ];
  var ETAPAS = {
    1: '1 · Abertura', 2: '2 · Análise Técnica', 3: '3 · Deliberação',
    4: '4 · Comissionamento', 5: '5 · Execução', 6: '6 · Qualidade', 7: '7 · Encerramento'
  };
  var FINAIS = ['CEDOC Closure', 'CEDOC Closure/Unfounded', 'Closed', 'Closed/Unfounded'];

  var LABEL = {
    AVANCO: 'Avanço', RETORNO: 'Retorno', LATERAL: 'Lateral', FECHAMENTO: 'Fechamento',
    REABERTURA: 'Reabertura', INICIAL: 'Estado inicial conhecido', INDEFINIDA: 'Não classificado',
    PERMANENCIA: 'Permanência'
  };
  var ICON = { AVANCO: '↑', RETORNO: '↩', LATERAL: '→', FECHAMENTO: '✔', REABERTURA: '⟲',
    INICIAL: '•', INDEFINIDA: '?', PERMANENCIA: '=' };
  /* as cores do NCR Control (--good, --critical, --warning, --s7, --serious),
     escritas por extenso: o desenho não depende das variáveis de lá */
  var CORES = {
    AVANCO: '#0c8a4a', RETORNO: '#d03b3b', LATERAL: '#c77c00', FECHAMENTO: '#4a3aa7',
    REABERTURA: '#c2410c', INDEFINIDA: '#8a90a0', INICIAL: '#2a78d6', PERMANENCIA: '#8a90a0'
  };
  var SUP = '#eef0f4', SUP_BRANCO = '#ffffff', TINTA = '#1a1c20', TINTA2 = '#4b5261',
      APAGADO = '#8a90a0', GRADE = '#d8dbe2', EIXO = '#a9aebb', ATUAL = '#1d6b45',
      ATUAL_FUNDO = '#e3f3ea', FECHADA = '#0c8a4a', FECHADA_FUNDO = 'rgba(12,163,12,.14)',
      REPETE = '#7a4fc7';

  function norm(s) { return Ncrs.norm(s); }
  function str(v) { return v == null ? '' : String(v); }
  function esc(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var mapa = {};
  FLUXO.forEach(function (f) { mapa[f[1]] = f[0]; mapa[norm(f[1])] = f[0]; });
  var finais = {};
  FINAIS.forEach(function (f) { finais[norm(f)] = true; });

  function lookup(status) {
    if (!status) return null;
    var s = str(status).trim();
    if (mapa[s] != null) return mapa[s];
    var n = norm(s);
    return mapa[n] != null ? mapa[n] : null;
  }

  /* "7.2 - TA" não está no fluxo: a ordem sai do código numérico do rótulo */
  function codigoNum(s) {
    var n = norm(s);
    var m = /^(\d{1,2})(?: (\d{1,2}))?\b/.exec(n);
    if (!m) m = /\b(\d{1,2}) (\d{1,2})\b/.exec(n);
    return m ? { maior: +m[1], menor: m[2] == null ? null : +m[2] } : null;
  }

  function ordemInferida(status) {
    var direto = lookup(status);
    if (direto != null) return direto;
    var c = codigoNum(status);
    if (!c) return null;
    var grupo = [], exato = null;
    FLUXO.forEach(function (f) {
      var k = codigoNum(f[1]);
      if (!k || k.maior !== c.maior) return;
      grupo.push({ o: f[0], menor: k.menor == null ? 0 : k.menor });
      if (k.menor === c.menor) exato = f[0];
    });
    if (exato != null) return exato;
    if (!grupo.length) return null;
    var alvo = c.menor == null ? 0 : c.menor;
    grupo.sort(function (a, b) { return Math.abs(a.menor - alvo) - Math.abs(b.menor - alvo) || a.o - b.o; });
    return grupo[0].o;
  }

  function isFinal(s) { return !!finais[norm(s || '')]; }

  function classificar(de, para) {
    if (!de) return 'INICIAL';
    if (norm(de) === norm(para)) return 'PERMANENCIA';
    var od = ordemInferida(de), op = ordemInferida(para);
    var fd = isFinal(de), fp = isFinal(para);
    if (fd && !fp) return 'REABERTURA';
    if (!fd && fp) return 'FECHAMENTO';
    if (od == null || op == null) return 'INDEFINIDA';
    if (op > od) return 'AVANCO';
    if (op < od) return 'RETORNO';
    return 'LATERAL';
  }

  function etapa(ordem) { return ordem == null ? 'Fora do fluxo' : (ETAPAS[ordem] || 'Etapa ' + ordem); }

  /** Evento de movimento no fluxo: os de status do NCR Control, e os marcos reconstruídos. */
  function eventoDeFluxo(e) {
    var t = str(e.tipo).toUpperCase();
    if (t === 'STATUS' || t === 'INICIAL' || t === 'MARCO') return !!e.para;
    return norm(e.campo) === 'status' && !!e.para;
  }

  /** Os passos da NCR, na ordem em que aconteceram. */
  function sequencia(rec) {
    var out = [];
    (rec.historico || []).filter(eventoDeFluxo).forEach(function (e) {
      var cls = str(e.cls).toUpperCase();
      if (!LABEL[cls]) cls = classificar(e.de || (out.length ? out[out.length - 1].status : ''), e.para);
      out.push({ status: e.para, data: e.data, cls: cls, de: e.de, estimado: !!e.estimado, obs: e.obs });
    });
    if (!out.length && rec.fonte && rec.fonte.status) {
      out.push({ status: rec.fonte.status, data: rec.fonte.criadoEm || '', cls: 'INICIAL', semHistorico: true });
    }
    return out;
  }

  function visitas(seq) {
    var v = {};
    seq.forEach(function (s, i) {
      var k = str(s.status);
      if (!v[k]) v[k] = { n: 0, ms: 0 };
      v[k].n++;
      var prox = seq[i + 1];
      if (prox && s.data && prox.data) {
        var d = new Date(prox.data) - new Date(s.data);
        if (d > 0) v[k].ms += d;
      }
    });
    return v;
  }

  /* As colunas são as etapas; dentro de cada uma, os status do fluxo. Status
     fora do fluxo entram na coluna da ordem inferida, ou em "Fora do fluxo". */
  function grade(rec) {
    var ordens = [], porOrdem = {};
    FLUXO.forEach(function (f) {
      if (!porOrdem[f[0]]) { porOrdem[f[0]] = []; ordens.push(f[0]); }
      porOrdem[f[0]].push(f[1]);
    });
    var seq = sequencia(rec);
    var fora = [], extras = {}, descobertos = {};
    seq.forEach(function (s) {
      if (!s.status || lookup(s.status) != null) return;
      var oi = ordemInferida(s.status);
      if (oi != null && porOrdem[oi]) {
        extras[oi] = extras[oi] || [];
        if (extras[oi].indexOf(s.status) < 0) { extras[oi].push(s.status); descobertos[s.status] = true; }
      } else if (fora.indexOf(s.status) < 0) fora.push(s.status);
    });
    var colunas = ordens.map(function (o) {
      return { ordem: o, titulo: etapa(o), status: porOrdem[o].concat(extras[o] || []) };
    });
    if (fora.length) colunas.push({ ordem: null, titulo: 'Fora do fluxo', status: fora });
    var colDe = {};
    colunas.forEach(function (c, i) {
      c.status.forEach(function (s) { colDe[str(s)] = i; colDe[norm(s)] = i; });
    });
    var col = function (s) { var c = colDe[str(s)]; return c != null ? c : colDe[norm(s)]; };
    return { seq: seq, colunas: colunas, col: col, descobertos: descobertos };
  }

  function marcadores() {
    var d = '<defs>';
    Object.keys(CORES).forEach(function (k) {
      d += '<marker id="nfx-' + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="' + CORES[k] + '"/></marker>';
    });
    return d + '</defs>';
  }

  function svgWrap(W, H, g) {
    return '<svg class="nfx-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W +
      '" height="' + H + '" font-family="Arial, Helvetica, sans-serif">' + g + '</svg>';
  }

  /* polilinha ortogonal com cantos arredondados (mesma do NCR Control) */
  function ortho(pts, r) {
    var p = [];
    pts.forEach(function (q) {
      var u = p[p.length - 1];
      if (!u || Math.sqrt(Math.pow(u[0] - q[0], 2) + Math.pow(u[1] - q[1], 2)) > 0.5) p.push(q);
    });
    if (p.length < 2) return '';
    var d = 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
    for (var i = 1; i < p.length - 1; i++) {
      var px = p[i - 1][0], py = p[i - 1][1], cx = p[i][0], cy = p[i][1], nx = p[i + 1][0], ny = p[i + 1][1];
      var d1 = Math.sqrt(Math.pow(cx - px, 2) + Math.pow(cy - py, 2));
      var d2 = Math.sqrt(Math.pow(nx - cx, 2) + Math.pow(ny - cy, 2));
      var rr = Math.max(1, Math.min(r, d1 / 2, d2 / 2));
      d += ' L' + (cx + (px - cx) / d1 * rr).toFixed(1) + ',' + (cy + (py - cy) / d1 * rr).toFixed(1) +
        ' Q' + cx.toFixed(1) + ',' + cy.toFixed(1) + ' ' + (cx + (nx - cx) / d2 * rr).toFixed(1) + ',' + (cy + (ny - cy) / d2 * rr).toFixed(1);
    }
    var z = p[p.length - 1];
    return d + ' L' + z[0].toFixed(1) + ',' + z[1].toFixed(1);
  }

  var DIA = 86400000;
  function dataCurta(v) { var t = Ncrs.data(v); return t.split(' ')[0]; }
  function diasDesde(iso) {
    var t = new Date(iso).getTime();
    return isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / DIA));
  }
  function cortar(t, n) { t = str(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  /* ----- leitura 1: trajetória — um passo por linha, na ordem do tempo ----- */
  function trajetoria(rec) {
    var gr = grade(rec), seq = gr.seq, colunas = gr.colunas;
    if (!seq.length) return '';
    var fechada = Ncrs.fechada(rec);
    var NW = 158, NH = 30, HG = 14, RH = 66, GUT = 104, PY = 44, PB = 16;
    var W = GUT + colunas.length * NW + (colunas.length - 1) * HG + 16;
    var H = PY + seq.length * RH + PB;
    var colX = function (i) { return GUT + i * (NW + HG); };
    var vis = visitas(seq), ocorrencia = {};
    var g = marcadores();
    colunas.forEach(function (c, i) {
      var x = colX(i);
      g += '<rect x="' + x + '" y="12" width="' + NW + '" height="22" rx="6" fill="' + SUP + '"/>';
      g += '<text x="' + (x + NW / 2) + '" y="27" text-anchor="middle" fill="' + TINTA2 + '" font-size="10.5" font-weight="600">' +
        esc(cortar(c.titulo, 22)) + '</text>';
    });
    g += '<text x="12" y="27" fill="' + APAGADO + '" font-size="10" font-weight="600">PASSO</text>';
    /* faixas primeiro, para as setas passarem por cima */
    seq.forEach(function (s, i) {
      if (i % 2 === 0) g += '<rect x="0" y="' + (PY + i * RH - (RH - NH) / 2) + '" width="' + W + '" height="' + RH + '" rx="6" fill="' + SUP + '" opacity=".55"/>';
    });
    for (var i = 1; i < seq.length; i++) {
      var a = seq[i - 1], b = seq[i];
      var ca = gr.col(a.status), cb = gr.col(b.status);
      if (ca == null || cb == null) continue;
      var cls = b.cls || 'INDEFINIDA', cor = CORES[cls] || APAGADO;
      var x1 = colX(ca) + NW / 2, x2 = colX(cb) + NW / 2;
      var y1 = PY + (i - 1) * RH + NH, y2 = PY + i * RH, ym = (y1 + y2) / 2;
      g += '<path d="' + ortho([[x1, y1], [x1, ym], [x2, ym], [x2, y2]], 8) + '" fill="none" stroke="' + cor + '" opacity=".9" stroke-width="2"' +
        (b.estimado ? ' stroke-dasharray="5 4"' : '') + ' marker-end="url(#nfx-' + cls + ')"><title>' +
        esc((LABEL[cls] || cls) + ' — ' + dataCurta(b.data) + ': ' + a.status + ' → ' + b.status +
          (b.estimado ? '\n(data estimada: o export registra apenas a saída da etapa)' : '') + (b.obs ? '\n' + b.obs : '')) +
        '</title></path>';
      if (Math.abs(x2 - x1) > 40) {
        g += '<text x="' + ((x1 + x2) / 2) + '" y="' + (ym - 6) + '" text-anchor="middle" fill="' + cor +
          '" font-size="9.5" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">' +
          esc((ICON[cls] || '') + ' ' + (LABEL[cls] || cls)) + '</text>';
      }
    }
    seq.forEach(function (s, i) {
      var ci = gr.col(s.status), y = PY + i * RH;
      var cls = s.cls || 'INDEFINIDA', cor = CORES[cls] || APAGADO;
      var ehAtual = i === seq.length - 1;
      var n = (ocorrencia[str(s.status)] || 0) + 1;
      ocorrencia[str(s.status)] = n;
      g += '<circle cx="20" cy="' + (y + NH / 2) + '" r="10" fill="' + cor + '"/>';
      g += '<text x="20" y="' + (y + NH / 2 + 3.5) + '" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">' + (i + 1) + '</text>';
      g += '<text x="36" y="' + (y + NH / 2 - 2) + '" fill="' + TINTA2 + '" font-size="10">' + esc(dataCurta(s.data)) + '</text>';
      var info = '';
      if (i < seq.length - 1) {
        var esp = (s.data && seq[i + 1].data) ? new Date(seq[i + 1].data) - new Date(s.data) : null;
        if (esp != null) info = esp >= DIA ? Math.round(esp / DIA) + ' d aqui' : (seq[i + 1].estimado ? 'sem intervalo' : 'no mesmo dia');
      } else if (!fechada && s.data && diasDesde(s.data) != null) {
        info = 'há ' + diasDesde(s.data) + ' d';
      }
      if (info) g += '<text x="36" y="' + (y + NH / 2 + 9) + '" fill="' + APAGADO + '" font-size="9">' + esc(info) + '</text>';
      if (ci == null) return;
      var x = colX(ci), desc = !!gr.descobertos[s.status];
      var fill = ehAtual ? (fechada ? FECHADA_FUNDO : ATUAL_FUNDO) : SUP_BRANCO;
      var stroke = ehAtual ? (fechada ? FECHADA : ATUAL) : cor;
      var v = vis[str(s.status)];
      g += '<g><title>' + esc(s.status + ' — passo ' + (i + 1) + ' de ' + seq.length + (s.data ? ', ' + Ncrs.data(s.data) : '') +
        (n > 1 ? '\n' + n + 'ª passagem por esta etapa' : '') + (v && v.n > 1 ? '\n' + v.n + ' passagens no total' : '') +
        (desc ? '\netapa registrada apenas nas colunas datadas do export (ordem inferida)' : '') + (s.obs ? '\n' + s.obs : '')) + '</title>';
      g += '<rect x="' + x + '" y="' + y + '" width="' + NW + '" height="' + NH + '" rx="7" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' +
        (ehAtual ? 2 : 1.4) + '"' + (desc ? ' stroke-dasharray="4 3"' : '') + '/>';
      g += '<text x="' + (x + 10) + '" y="' + (y + NH / 2 + 4) + '" fill="' + TINTA + '" font-size="11"' + (ehAtual ? ' font-weight="600"' : '') + '>' +
        esc(cortar(s.status, 21)) + '</text>';
      if (n > 1) {
        g += '<circle cx="' + (x + NW - 14) + '" cy="' + (y + NH / 2) + '" r="9" fill="' + REPETE + '"/>' +
          '<text x="' + (x + NW - 14) + '" y="' + (y + NH / 2 + 3.5) + '" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">' + n + 'ª</text>';
      }
      g += '</g>';
    });
    return svgWrap(W, H, g);
  }

  /* ----- leitura 2: mapa do fluxo — todas as etapas, cada seta na sua faixa ----- */
  function mapaDoFluxo(rec) {
    var gr = grade(rec), seq = gr.seq, colunas = gr.colunas;
    var fechada = Ncrs.fechada(rec);
    var NW = 172, NH = 28, VG = 9, HG = 74, PX = 16, PY = 46;
    var maxRows = Math.max.apply(null, colunas.map(function (c) { return c.status.length; }));
    var W = PX * 2 + colunas.length * NW + (colunas.length - 1) * HG;
    var gridBot = PY + maxRows * (NH + VG);
    var pos = {};
    colunas.forEach(function (c, i) {
      c.status.forEach(function (s, j) { pos[str(s)] = { x: PX + i * (NW + HG), y: PY + j * (NH + VG), col: i, row: j }; });
    });
    var posDe = function (s) { return pos[str(s)] || pos[str(colunas.reduce(function (acc, c) {
      return acc || c.status.filter(function (x) { return norm(x) === norm(s); })[0]; }, null))] || null; };
    var vis = visitas(seq);
    var atual = seq.length ? seq[seq.length - 1].status : (rec.fonte && rec.fonte.status);
    var arestas = [], usoCorredor = {}, faixasBaixo = 0;
    for (var i = 1; i < seq.length; i++) {
      var pa = posDe(seq[i - 1].status), pb = posDe(seq[i].status);
      if (!pa || !pb) continue;
      var dc = pb.col - pa.col;
      var e = { i: i, a: seq[i - 1], b: seq[i], pa: pa, pb: pb, dc: dc };
      if (dc === 1 || dc === 0 || dc === -1) {
        var vao = dc === -1 ? pb.col : pa.col;
        var n = usoCorredor[vao] || 0;
        usoCorredor[vao] = n + 1;
        e.tipo = 'corredor'; e.vao = vao; e.faixa = n;
      } else {
        e.tipo = 'baixo'; e.faixa = faixasBaixo++;
      }
      arestas.push(e);
    }
    var usaBorda = arestas.some(function (x) { return x.tipo === 'corredor' && x.vao === colunas.length - 1; });
    var WT = W + (usaBorda ? 72 : 0);
    var H = gridBot + (faixasBaixo ? 24 + faixasBaixo * 15 : 16);
    var g = marcadores();
    colunas.forEach(function (c, i) {
      var x = PX + i * (NW + HG);
      g += '<rect x="' + x + '" y="14" width="' + NW + '" height="22" rx="6" fill="' + SUP + '"/>';
      g += '<text x="' + (x + NW / 2) + '" y="29" text-anchor="middle" fill="' + TINTA2 + '" font-size="10.5" font-weight="600">' + esc(cortar(c.titulo, 26)) + '</text>';
    });
    colunas.forEach(function (c) {
      c.status.forEach(function (s) {
        var p = pos[str(s)], v = vis[str(s)];
        var visitado = !!v, ehAtual = norm(s) === norm(atual);
        var fill = ehAtual ? (fechada ? FECHADA_FUNDO : ATUAL_FUNDO) : visitado ? SUP : SUP_BRANCO;
        var stroke = ehAtual ? (fechada ? FECHADA : ATUAL) : visitado ? EIXO : GRADE;
        var ink = visitado || ehAtual ? TINTA : APAGADO;
        var dias = v && v.ms ? Math.round(v.ms / DIA) : 0;
        var desc = !!gr.descobertos[s];
        g += '<g><title>' + esc(s + (visitado ? ' — ' + v.n + ' passagem(ns)' + (dias ? ', ' + dias + ' dia(s) acumulados' : '') : ' — não percorrido') +
          (desc ? ' · etapa registrada apenas nas colunas datadas do export (ordem inferida)' : '')) + '</title>';
        g += '<rect x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="7" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' +
          (ehAtual ? 2 : 1) + '"' + (desc ? ' stroke-dasharray="4 3"' : '') + '/>';
        if (ehAtual) g += '<rect x="' + p.x + '" y="' + (p.y + 4) + '" width="3" height="' + (NH - 8) + '" rx="2" fill="' + (fechada ? FECHADA : ATUAL) + '"/>';
        g += '<text x="' + (p.x + 10) + '" y="' + (p.y + NH / 2 + 4) + '" fill="' + ink + '" font-size="11"' + (ehAtual ? ' font-weight="600"' : '') + '>' + esc(cortar(s, 23)) + '</text>';
        if (visitado && v.n > 1) {
          g += '<circle cx="' + (p.x + NW - 13) + '" cy="' + (p.y + NH / 2) + '" r="9" fill="' + REPETE + '"/><text x="' + (p.x + NW - 13) + '" y="' +
            (p.y + NH / 2 + 3.5) + '" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">' + v.n + '×</text>';
        } else if (dias > 0) {
          g += '<text x="' + (p.x + NW - 9) + '" y="' + (p.y + NH / 2 + 4) + '" text-anchor="end" fill="' + APAGADO + '" font-size="9.5">' + dias + 'd</text>';
        }
        g += '</g>';
      });
    });
    var vaoDe = function (col, faixa) { return PX + col * (NW + HG) + NW + 14 + (faixa % 4) * 15; };
    var badges = [];
    function acomodar(x, y) {
      var yy = y;
      for (var k = 0; k < badges.length; k++) {
        var bb = badges[k];
        if (Math.abs(bb.x - x) < 19 && Math.abs(bb.y - yy) < 19) { yy = bb.y + 19; k = -1; }
      }
      badges.push({ x: x, y: yy });
      return yy;
    }
    arestas.forEach(function (e) {
      var cls = e.b.cls || 'INDEFINIDA', cor = CORES[cls] || APAGADO;
      var nVao = e.tipo === 'corredor' ? usoCorredor[e.vao] : 1;
      var d, mx, my, y1, y2, x1, x2;
      if (e.tipo === 'corredor') {
        var xc = vaoDe(e.vao, e.faixa);
        var off = nVao > 1 ? (e.faixa - (nVao - 1) / 2) * Math.min(7, (NH - 8) / nVao) : 0;
        y1 = e.pa.y + NH / 2 + off; y2 = e.pb.y + NH / 2 + off;
        x1 = e.dc === -1 ? e.pa.x : e.pa.x + NW;
        x2 = e.dc === 1 ? e.pb.x : e.pb.x + NW;
        d = ortho([[x1, y1], [xc, y1], [xc, y2], [x2, y2]], 7);
        mx = xc; my = Math.abs(y2 - y1) < 14 ? y1 - 13 : (y1 + y2) / 2;
      } else {
        var yc = gridBot + 15 + e.faixa * 15, frente = e.dc > 0;
        y1 = e.pa.y + NH / 2; y2 = e.pb.y + NH / 2;
        x1 = frente ? e.pa.x + NW : e.pa.x;
        x2 = frente ? e.pb.x : e.pb.x + NW;
        var g1 = vaoDe(frente ? e.pa.col : e.pa.col - 1, e.faixa);
        var g2 = vaoDe(frente ? e.pb.col - 1 : e.pb.col, e.faixa);
        d = ortho([[x1, y1], [g1, y1], [g1, yc], [g2, yc], [g2, y2], [x2, y2]], 9);
        var sx = g2 > g1 ? 1 : -1;
        mx = g1 + sx * Math.min(34 + e.faixa * 30, Math.abs(g2 - g1) / 2);
        my = yc;
      }
      g += '<path d="' + d + '" fill="none" stroke="' + cor + '" opacity=".9" stroke-width="2"' + (e.b.estimado ? ' stroke-dasharray="5 4"' : '') +
        ' marker-end="url(#nfx-' + cls + ')"><title>' + esc('Passo ' + e.i + ' — ' + (LABEL[cls] || cls) + ', ' + dataCurta(e.b.data) + ': ' +
          e.a.status + ' → ' + e.b.status + (e.b.obs ? '\n' + e.b.obs : '')) + '</title></path>';
      var by = acomodar(mx, my);
      if (Math.abs(by - my) > 1) g += '<path d="M' + mx + ',' + my + ' L' + mx + ',' + by + '" stroke="' + cor + '" opacity=".45" stroke-width="1" stroke-dasharray="2 2"/>';
      g += '<circle cx="' + mx + '" cy="' + by + '" r="9" fill="' + cor + '" stroke="#fff" stroke-width="1.5"/>';
      g += '<text x="' + mx + '" y="' + (by + 3.5) + '" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">' + e.i + '</text>';
    });
    return svgWrap(WT, H, g);
  }

  function legenda() {
    var it = ['AVANCO', 'RETORNO', 'LATERAL', 'FECHAMENTO', 'REABERTURA'];
    return '<div class="nfx-legenda">' + it.map(function (k) {
      return '<span><i style="background:' + CORES[k] + '"></i>' + ICON[k] + ' ' + LABEL[k] + '</span>';
    }).join('') + '<span><i style="background:' + EIXO + '"></i>Etapa percorrida</span>' +
      '<span><i style="background:' + GRADE + '"></i>Não percorrida</span>' +
      '<span><i class="nfx-tracejado"></i>Data estimada</span></div>';
  }

  global.NcrFluxo = {
    sequencia: sequencia,
    trajetoria: trajetoria,
    mapa: mapaDoFluxo,
    legenda: legenda,
    classificar: classificar,
    etapa: etapa,
    ordemInferida: ordemInferida,
    LABEL: LABEL
  };
})(window);
