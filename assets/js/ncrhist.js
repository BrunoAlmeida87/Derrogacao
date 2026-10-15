/* ==========================================================================
   ncrhist.js — o histórico das NCRs, extraído aqui mesmo
   --------------------------------------------------------------------------
   Antes, a trajetória de cada NCR (o fluxo desenhado na ficha) só existia
   se alguém importasse o historico.json que o NCR Control gera. Pedido do
   Bruno: o Derrogação extrai o histórico sozinho. São as três fontes do
   NCR Control (repositório NCR_Dashboard), portadas para cá:

   1. COLUNAS DATADAS DO EXPORT (`Marcos` de lá). A planilha do banco NCR
      traz, na própria linha, as datas em que a NCR passou por cada etapa
      ("Data avanço 2.1 - Especialista ICN", "Data da rejeição 2.2 - TA
      Specialist", "CEDOC Closure Data"…). As colunas são reconhecidas pelo
      PADRÃO do cabeçalho, nunca por lista fixa, e a trajetória entra no
      banco já na primeira importação. Quando o export data só a saída de
      uma etapa, a chegada vai na mesma data, marcada como estimada.

   2. MUDANÇAS ENTRE DUAS IMPORTAÇÕES. O status que mudou de uma foto para a
      outra vira um evento, datado pela foto (a data deduzida do conteúdo —
      criação + dias de tramitação —, que não muda ao copiar o arquivo).

   3. O HISTÓRICO EXATO DO NCR INTEGRADA (`SistemaHist` de lá). O extrator
      é um script colado no Console (F12) do site, já logado: ele abre cada
      NCR, lê a aba "Histórico" (data, hora e usuário de cada mudança de
      estado, e o texto das ações) e gera um JSON. O texto do extrator está
      no index.html (<script id="extratorSrc" type="text/plain">), cópia
      literal do NCR Control — o mesmo banco do navegador e o mesmo formato
      de arquivo, então o que já foi capturado lá continua valendo aqui.

   A diferença em relação ao NCR Control, e o porquê:
   lá, a captura do sistema APAGA os eventos do histórico até a data dela e
   põe as transições reais no lugar. Aqui o histórico vive na pasta da
   equipe e é juntado por UNIÃO — o evento apagado num computador voltaria
   pela cópia do colega na sincronização seguinte. Então a captura fica À
   PARTE (`capturas`, uma por NCR, vale a de `capturadoEm` maior), em
   arquivo próprio na pasta (derrogacao-ncr-sistema.json), e a substituição
   é feita NA LEITURA (`comCaptura`): até a captura vale o sistema; depois
   dela, o que os exports registrarem. Nada é apagado de lugar nenhum.

   O status que vale para "fechada", filtros e Kanban continua sendo o do
   export. A captura mais nova que diverge dele é só mostrada na ficha.

   Carrega depois do ncrfluxo.js; usa Ncrs, NcrFluxo e Store só na hora da
   chamada.
   ========================================================================== */
(function (global) {
  'use strict';

  var META_ID = 'sistema';
  var ARQUIVO = 'derrogacao-ncr-sistema.json';
  var FORMATO = 'derrogacao-ncr-sistema';
  /* o formato do JSON do extrator (o mesmo do NCR Control) */
  var TIPO_EXTRATOR = 'ncr-control/historico-sistema';
  var ROTULO = 'Histórico do sistema';
  var DIA = 86400000;
  /* O `campo` dos eventos que esta importação gera. É a marca de que o
     evento veio do export (reconstruído ou visto entre duas fotos), e não de
     um histórico de fora (o historico.json do NCR Control). Vai no `campo`
     porque ele faz parte da assinatura do evento e nenhuma versão o
     descarta — um campo novo no evento sumiria na versão anterior. */
  var CAMPO_EXPORT = 'Status · export';
  function doExport(e) { return str(e && e.campo).indexOf(CAMPO_EXPORT) === 0; }

  function str(v) { return v == null ? '' : String(v); }
  function norm(s) { return Ncrs.norm(s); }
  function nowIso() { return new Date().toISOString(); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function uid() { return Store.uid(); }

  /* --- datas ------------------------------------------------------------------ */

  /**
   * Data de célula → ISO, ou ''. Aceita o que o leitor de planilha entrega
   * (Date já convertida em ISO), dd/mm/aaaa [hh:mm[:ss]], aaaa-mm-dd e o
   * número de série do Excel (célula de data sem formato de data).
   * Mesmo critério do Util.toISO do NCR Control.
   */
  function paraIso(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
    var s = str(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var n = parseFloat(s);
      if (n > 20000 && n < 80000) {
        var u = new Date(Date.UTC(1899, 11, 30) + Math.round(n * DIA));
        var d0 = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
        return isNaN(d0.getTime()) ? '' : d0.toISOString();
      }
      return '';
    }
    var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) {
      var y = +m[3];
      if (y < 100) y += y < 50 ? 2000 : 1900;
      var d1 = new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      return isNaN(d1.getTime()) ? '' : d1.toISOString();
    }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      var d2 = new Date(s.length > 10 ? s : s + 'T00:00:00Z');
      return isNaN(d2.getTime()) ? '' : d2.toISOString();
    }
    return '';
  }

  /** "12 dias", "12,5" → 12 (dias de tramitação e afins). */
  function dias(v) {
    var m = /(-?\d+(?:[.,]\d+)?)/.exec(str(v));
    return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : null;
  }

  function duracao(d) {
    if (d == null) return '';
    if (d < 1) return 'menos de 1 dia';
    if (d === 1) return '1 dia';
    return d + ' dias';
  }

  /* --- o fluxo (vem do ncrfluxo.js) -------------------------------------------- */

  function fluxo() { return NcrFluxo.FLUXO_LISTA; }
  function classificar(de, para) { return NcrFluxo.classificar(de, para); }
  function isFinal(s) { return NcrFluxo.isFinal(s); }

  function statusAbertura() {
    var melhor = null, ord = Infinity;
    fluxo().forEach(function (f) { if (f.ordem < ord) { ord = f.ordem; melhor = f.status; } });
    return melhor;
  }
  /* os mesmos padrões do NCR Control (Cfg.statusFinais / statusUnfounded) */
  function statusFinalPadrao() { return 'CEDOC Closure'; }
  function statusFinalUnfounded() { return 'CEDOC Closure/Unfounded'; }

  /* ==========================================================================
     1. As colunas datadas do export (porta ES5 do `Marcos` do NCR Control)
     ========================================================================== */

  /* destino=true  -> a data marca a ENTRADA da NCR nesse status
     destino=false -> a NCR ESTAVA nesse passo e ele foi concluído/rejeitado ali */
  var VERBOS = [
    { v: 'CRIACAO', rot: 'Criação', destino: true, re: /\b(criac|criad|abertur|abert|emiss|emitid|creation|creat|opened|opening)/ },
    { v: 'IMPROCEDENTE', rot: 'Improcedente', destino: true, re: /\b(unfounded|improceden|sem fundamento)/ },
    { v: 'FECHAMENTO', rot: 'Fechamento', destino: true, re: /\b(closure|closing|closed|encerr|fecham|fechad|conclus|finaliz)/ },
    { v: 'REJEICAO', rot: 'Rejeição', destino: false, re: /\b(rejeic|rejeit|reject|reprov|devoluc|devolvid|retorn|refus|recus)/ },
    { v: 'APROVACAO', rot: 'Aprovação', destino: false, re: /\b(aprovac|aprovad|approv|validac|validad|homolog)/ },
    { v: 'AVANCO', rot: 'Avanço', destino: false, re: /\b(avanc|advanc|forward|encaminh|liberac)/ }
  ];
  var RE_DATA = /\b(data|date|dt)\b/;
  var RE_PESSOA = /\b(usuario|user|responsavel|responsaveis|especialista|analista|autor|by|owner|aprovador|executante)\b/;
  var RE_MOTIVO = /\b(motivo|motivos|reason|justificativa|justificacao|observacao|comentario|comment)\b/;
  /* palavras de moldura que não fazem parte do nome da etapa */
  var RUIDO = {};
  ['data', 'date', 'dt', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'pela', 'pelo', 'por',
   'the', 'of', 'at', 'and', 'e', 'a', 'o', 'as', 'os', 'ncr', 'etapa', 'step', 'status', 'fase']
    .forEach(function (w) { RUIDO[w] = 1; });

  /* código numérico do rótulo: "2.1 - Especialista ICN" -> {maior:2, menor:1} */
  function codigo(txt) {
    var n = norm(txt);
    var m = /^(\d{1,2})(?: (\d{1,2}))?\b/.exec(n);
    if (!m) m = /\b(\d{1,2}) (\d{1,2})\b/.exec(n);
    if (!m) return null;
    return { maior: +m[1], menor: m[2] == null ? null : +m[2] };
  }
  function palavras(txt) {
    return norm(txt).split(' ').filter(function (w) { return w.length > 1 && !RUIDO[w] && !/^\d+$/.test(w); });
  }

  /* casa o rótulo restante com um status do fluxo */
  function casarStatus(token) {
    var nt = norm(token);
    if (!nt) return null;
    var fl = fluxo(), i;
    for (i = 0; i < fl.length; i++) if (norm(fl[i].status) === nt) return fl[i].status;
    var ct = codigo(token), pt = palavras(token);
    var melhor = null, melhorPt = 0;
    fl.forEach(function (f) {
      var cf = codigo(f.status), pf = palavras(f.status);
      var s = 0;
      if (ct && cf) {
        if (ct.maior === cf.maior && ct.menor === cf.menor) s += 4;
        else if (ct.maior === cf.maior) s += 1;
        else s -= 2;
      }
      var dentro = pt.length > 0;
      pt.forEach(function (w) { if (pf.indexOf(w) >= 0) s += 2; else dentro = false; });
      if (dentro) s += 3;      /* o rótulo é um subconjunto do nome do status */
      if (s > melhorPt) { melhorPt = s; melhor = f.status; }
    });
    return melhorPt >= 4 ? melhor : null;
  }

  /* remove a moldura ("Data da rejeição X"), sobrando o nome da etapa */
  function extrairToken(label, verboRe) {
    var n = norm(label);
    if (verboRe) n = n.replace(verboRe, ' ');
    n = n.replace(RE_DATA, ' ');
    return n.split(' ').filter(function (w) { return w && !RUIDO[w]; }).join(' ');
  }

  /* recorta do cabeçalho original o trecho que nomeia a etapa, preservando a
     grafia do export ("Data da rejeição 7.2 - TA" -> "7.2 - TA") */
  function rotuloDe(label, verboRe) {
    var bruto = str(label);
    var re = /[^\s]+/g, m, ini = -1, fim = -1;
    while ((m = re.exec(bruto))) {
      var n = norm(m[0]);
      if (!n || RUIDO[n] || verboRe.test(n) || RE_DATA.test(n)) continue;
      if (ini < 0) ini = m.index;
      fim = m.index + m[0].length;
    }
    if (ini < 0) return '';
    return bruto.slice(ini, fim).replace(/^[-–—:.,\s]+|[-–—:.,\s]+$/g, '').trim();
  }

  /* acha a coluna auxiliar (responsável/motivo) que se refere ao mesmo marco */
  function parear(col, verboRe, candidatas) {
    if (!candidatas.length) return null;
    var alvoTok = palavras(extrairToken(col, verboRe));
    var alvoCod = codigo(col);
    var melhor = null, pt = 0;
    candidatas.forEach(function (c) {
      var nc = norm(c);
      /* uma coluna que cita outro verbo pertence a outro marco */
      var outroVerbo = VERBOS.some(function (x) { return x.re !== verboRe && x.re.test(nc) && !verboRe.test(nc); });
      var s = outroVerbo ? -4 : 0;
      var ct = palavras(c), cc = codigo(c);
      if (alvoCod && cc && alvoCod.maior === cc.maior && alvoCod.menor === cc.menor) s += 3;
      alvoTok.forEach(function (w) { if (ct.indexOf(w) >= 0) s += 2; });
      if (verboRe.test(nc)) s += 2;
      if (s > pt) { pt = s; melhor = c; }
    });
    return pt >= 3 ? melhor : null;
  }

  /**
   * Os marcos de fluxo que as colunas do export trazem, e as colunas
   * auxiliares (criação, tempo de tramitação, tempo no status atual).
   * `tiposData`: as colunas cujas células são datas de verdade (opcional).
   */
  function detectar(cols, tiposData) {
    var marcos = [], aux = { criacao: null, tramitacao: null, recente: null };
    var pessoas = [], motivos = [];
    var lista = (cols || []).filter(Boolean);

    lista.forEach(function (c) {
      var n = norm(c);
      if (RE_PESSOA.test(n) && !RE_DATA.test(n)) pessoas.push(c);
      if (RE_MOTIVO.test(n) && !RE_DATA.test(n)) motivos.push(c);
      /* "tempo de tramitação" total x "mais recente" (dias no status atual) */
      if (/\b(tempo|dias|aging|idade|age|days)\b/.test(n)) {
        if (/\b(recente|atual|current|last|ultimo|ultima)\b/.test(n)) { if (!aux.recente) aux.recente = c; }
        else if (/\b(tramitacao|aberto|aberta|total|aging|idade|age|ciclo)\b/.test(n)) { if (!aux.tramitacao) aux.tramitacao = c; }
      }
    });

    lista.forEach(function (c) {
      var n = norm(c);
      var temData = RE_DATA.test(n);
      var ehData = tiposData ? !!tiposData[c] : false;
      if (!temData && !ehData) return;                       /* não carrega data */
      var vb = null;
      VERBOS.some(function (x) { if (x.re.test(n)) { vb = x; return true; } return false; });
      if (!vb) return;                                        /* data sem verbo de fluxo */
      /* "CEDOC Closure Data": o verbo faz parte do nome do status, então o
         rótulo completo é testado antes de remover o verbo */
      var inteiro = extrairToken(c, null);
      var token = extrairToken(c, vb.re);
      var status = casarStatus(inteiro) || casarStatus(token);
      if (vb.v === 'CRIACAO' && !aux.criacao) aux.criacao = c;
      var etapa = status || rotuloDe(c, vb.re) ||
        (vb.v === 'CRIACAO' ? statusAbertura()
          : vb.v === 'IMPROCEDENTE' ? statusFinalUnfounded()
          : vb.v === 'FECHAMENTO' ? statusFinalPadrao() : c);
      marcos.push({ col: c, v: vb.v, rot: vb.rot, destino: vb.destino, status: status, etapa: etapa,
        token: token, respCol: parear(c, vb.re, pessoas), motivoCol: parear(c, vb.re, motivos) });
    });
    return { marcos: marcos, aux: aux };
  }

  /** Data da foto deduzida do CONTEÚDO: criação + tempo de tramitação (mediana). */
  function dataFotoDoConteudo(amostras) {
    var est = [];
    amostras.forEach(function (a) {
      if (!a.criadoEm || a.tramitacao == null || a.tramitacao < 0) return;
      est.push(new Date(a.criadoEm).getTime() + a.tramitacao * DIA);
    });
    if (est.length < 3) return '';
    est.sort(function (x, y) { return x - y; });
    return new Date(est[Math.floor(est.length / 2)]).toISOString();
  }

  /** Evento do histórico, no formato do Ncrs (normalizarEvento). */
  function evento(o) {
    return {
      id: uid(), data: str(o.data), tipo: str(o.tipo || 'MARCO'), campo: str(o.campo || CAMPO_EXPORT),
      de: str(o.de), para: str(o.para), obs: str(o.obs), responsavel: str(o.responsavel),
      arquivo: str(o.arquivo), cls: str(o.cls), estimado: !!o.estimado
    };
  }

  /**
   * Reconstrói a trajetória de uma NCR a partir dos marcos da linha.
   * o: { campos, det, statusAtual, criadoEm, dataFoto, arquivo }.
   * Devolve { eventos, nMarcos } ou null.
   */
  function reconstruir(o) {
    var campos = o.campos || {}, det = o.det;
    var passos = [], vistos = {};
    (det.marcos || []).forEach(function (m) {
      var iso = paraIso(campos[m.col]);
      if (!iso) return;
      var ch = iso + '|' + m.v + '|' + m.etapa;
      if (vistos[ch]) return;
      vistos[ch] = 1;
      passos.push({ data: iso, v: m.v, rot: m.rot, destino: m.destino, etapa: m.etapa, status: m.status,
        resp: m.respCol ? str(campos[m.respCol]) : '', motivo: m.motivoCol ? str(campos[m.motivoCol]) : '', col: m.col });
    });
    /* a criação ancora o início, mesmo quando o export não traz coluna de marco */
    if (o.criadoEm && !passos.some(function (p) { return p.v === 'CRIACAO'; })) {
      passos.push({ data: o.criadoEm, v: 'CRIACAO', rot: 'Criação', destino: true, etapa: null, status: null, resp: '', motivo: '', col: null });
    }
    if (!passos.length) return null;
    passos.sort(function (a, b) {
      return a.data < b.data ? -1 : a.data > b.data ? 1 : (a.v === 'CRIACAO' ? -1 : (b.v === 'CRIACAO' ? 1 : 0));
    });

    var eventos = [], atual = null;
    function mover(para, data, cls, extra) {
      eventos.push(evento({
        data: data, tipo: 'MARCO', de: atual, para: para, cls: cls, arquivo: o.arquivo,
        obs: extra.obs, responsavel: extra.resp, estimado: extra.estimado
      }));
      atual = para;
    }
    function classe(de, para, forc) {
      if (forc) return forc;
      if (!de) return 'INICIAL';
      return classificar(de, para);
    }
    var fonte = function (p) {
      return 'Registrado na coluna "' + p.col + '" do export' + (p.resp ? ' · ' + p.resp : '') + (p.motivo ? ' · ' + p.motivo : '');
    };

    passos.forEach(function (p) {
      if (p.v === 'CRIACAO') {
        if (atual) return;                                   /* criação duplicada */
        var st0 = p.status || statusAbertura();
        mover(st0, p.data, 'INICIAL', { obs: p.col ? fonte(p) : 'Data de criação da NCR', resp: p.resp });
        return;
      }
      if (p.destino) {                                       /* fechamento / improcedente */
        var st1 = p.status || (p.v === 'IMPROCEDENTE' ? statusFinalUnfounded() : statusFinalPadrao());
        if (!st1) return;
        mover(st1, p.data, classe(atual, st1, isFinal(st1) ? 'FECHAMENTO' : null), { obs: fonte(p) + ' · ' + p.rot, resp: p.resp });
        return;
      }
      /* passagem: a NCR estava nesta etapa e ela foi concluída/rejeitada aqui.
         O export não data a CHEGADA, só a saída; a chegada entra na mesma
         data e fica marcada como estimada. */
      var st = p.status || p.etapa;
      if (!st) return;
      if (norm(st) !== norm(atual || '')) {
        mover(st, p.data, classe(atual, st), {
          obs: 'Passagem por "' + st + '" registrada pela coluna "' + p.col + '" (data de chegada não consta no export)',
          estimado: true
        });
      }
      if (p.v === 'REJEICAO') {
        /* rejeitada nesta etapa: volta para a etapa anterior conhecida */
        var volta = eventos.length > 1 ? eventos[eventos.length - 2].para : null;
        var destino = (volta && norm(volta) !== norm(st)) ? volta : null;
        if (destino) mover(destino, p.data, 'RETORNO', { obs: fonte(p) + ' · rejeitada em "' + st + '"', resp: p.resp });
        else eventos[eventos.length - 1].obs = fonte(p) + ' · rejeitada em "' + st + '"';
      }
    });
    if (!eventos.length) return null;

    /* --- entrada no status atual --- */
    var ultima = eventos[eventos.length - 1].data;
    var dataFoto = o.dataFoto || nowIso();
    var dr = det.aux.recente ? dias(campos[det.aux.recente]) : null;
    var entrada = ultima;
    if (dr != null && dr > 0) {
      var cand = new Date(new Date(dataFoto).getTime() - dr * DIA).toISOString();
      entrada = cand > ultima ? cand : ultima;              /* nunca antes do último marco */
    }
    if (entrada > dataFoto) entrada = dataFoto;
    var statusAtual = str(o.statusAtual);
    if (statusAtual && norm(statusAtual) !== norm(atual || '')) {
      mover(statusAtual, entrada, classe(atual, statusAtual), {
        obs: dr != null && dr > 0
          ? 'Status atual do export · há ' + duracao(dr) + ' nesta situação (coluna "' + det.aux.recente + '")'
          : dr === 0
            ? 'Status atual do export · a coluna "' + det.aux.recente + '" marca 0 dias, que em NCR encerrada costuma ' +
              'significar "sem contagem"; a entrada foi ancorada no último marco datado'
            : 'Status atual do export · data de entrada estimada',
        estimado: true
      });
    }
    return { eventos: eventos, nMarcos: passos.length };
  }

  /**
   * Prepara uma importação do banco: reconhece as colunas e deduz a data da
   * foto. `linhas` são as linhas lidas ({ campos }); `papeis` diz qual coluna
   * é a da criação. Devolve o contexto que `historicoDaLinha` usa.
   */
  function prepararImportacao(cols, linhas, papeis, arquivo) {
    var det = detectar(cols, null);
    var ctx = { det: det, arquivo: str(arquivo), dataFoto: '', dataFotoOrigem: '', avisos: [] };
    var colCriacao = (papeis && papeis.criadoEm) || det.aux.criacao;
    if (det.aux.tramitacao && colCriacao) {
      var amostras = [];
      for (var i = 0; i < linhas.length && amostras.length < 80; i++) {
        var c = linhas[i].campos || {};
        var cEm = paraIso(c[colCriacao]);
        if (cEm) amostras.push({ criadoEm: cEm, tramitacao: dias(c[det.aux.tramitacao]) });
      }
      var fc = dataFotoDoConteudo(amostras);
      if (fc) {
        ctx.dataFoto = fc;
        ctx.dataFotoOrigem = 'conteudo';
        ctx.avisos.push('Data da foto deduzida do conteúdo do export (' + Ncrs.data(fc) + '), a partir de "' +
          colCriacao + '" + "' + det.aux.tramitacao + '".');
      }
    }
    if (!ctx.dataFoto) ctx.dataFoto = nowIso();
    ctx.colCriacao = colCriacao;
    if (det.marcos.length) {
      ctx.avisos.push('Reconstrução de histórico: ' + det.marcos.length + ' coluna(s) de marco de fluxo reconhecida(s) — ' +
        det.marcos.map(function (m) { return m.rot + ' em "' + m.etapa + '"'; }).join('; ') + '.');
    }
    return ctx;
  }

  function temFluxo(rec) {
    return (rec.historico || []).some(function (e) {
      var t = str(e.tipo).toUpperCase();
      if (t === 'STATUS' || t === 'INICIAL' || t === 'MARCO') return !!e.para;
      return norm(e.campo) === 'status' && !!e.para;
    });
  }

  /**
   * Os eventos que esta linha do export acrescenta ao histórico da NCR.
   * - NCR sem trajetória (nova, ou importada antes desta versão) e sem
   *   captura do sistema: reconstrói pelas colunas datadas, ou registra o
   *   "estado inicial conhecido" na data da foto.
   * - NCR que já tem trajetória: o status que mudou desde a foto anterior e
   *   os marcos que ganharam data desde então.
   * Foto mais antiga que a anterior (importação retroativa) não gera evento.
   * o: { rec, antes (fonte anterior), campos, status, criadoEm }.
   * Devolve { eventos, reconstruida, nMarcos }.
   */
  function historicoDaLinha(ctx, o) {
    var out = { eventos: [], reconstruida: false, nMarcos: 0 };
    var rec = o.rec, antes = o.antes || {};
    var criadoEm = paraIso(o.criadoEm);
    if (!temFluxo(rec) && !captura(rec.key)) {
      var rc = ctx.det.marcos.length || criadoEm
        ? reconstruir({ campos: o.campos, det: ctx.det, statusAtual: o.status, criadoEm: criadoEm,
            dataFoto: ctx.dataFoto, arquivo: ctx.arquivo })
        : null;
      if (rc) {
        out.eventos = rc.eventos;
        out.reconstruida = true;
        out.nMarcos = rc.nMarcos;
      } else if (o.status) {
        out.eventos.push(evento({ data: ctx.dataFoto, tipo: 'INICIAL', para: o.status, cls: 'INICIAL',
          arquivo: ctx.arquivo, obs: 'Estado inicial conhecido' }));
      }
      return out;
    }
    if (antes.dataFoto && ctx.dataFoto < antes.dataFoto) return out;      /* foto retroativa */
    var antesCampos = antes.campos || {};
    var anterior = str(antes.status);
    ctx.det.marcos.forEach(function (m) {
      var nova = paraIso(o.campos[m.col]);
      if (!nova || paraIso(antesCampos[m.col])) return;
      var etapa = m.status || m.etapa;
      if (!etapa) return;
      out.eventos.push(evento({
        data: nova, tipo: 'MARCO', campo: CAMPO_EXPORT + ' · ' + m.col, de: anterior, para: etapa,
        cls: m.v === 'REJEICAO' ? 'RETORNO' : (m.destino && isFinal(etapa) ? 'FECHAMENTO' : classificar(anterior, etapa)),
        arquivo: ctx.arquivo,
        responsavel: m.respCol ? str(o.campos[m.respCol]) : '',
        obs: m.rot + ' registrado na coluna "' + m.col + '" do export' +
          (m.respCol && o.campos[m.respCol] ? ' · ' + str(o.campos[m.respCol]) : '') +
          (m.motivoCol && o.campos[m.motivoCol] ? ' · ' + str(o.campos[m.motivoCol]) : '')
      }));
    });
    if (o.status && anterior && norm(anterior) !== norm(o.status)) {
      var desde = antes.dataFoto || antes.importadoEm;
      var d = desde ? Math.floor(Math.max(0, new Date(ctx.dataFoto) - new Date(desde)) / DIA) : null;
      out.eventos.push(evento({
        data: ctx.dataFoto, tipo: 'STATUS', de: anterior, para: o.status, cls: classificar(anterior, o.status),
        arquivo: ctx.arquivo,
        obs: 'Mudança vista entre duas importações' + (d != null ? ' (a anterior era de ' + duracao(d) + ' antes)' : '')
      }));
    }
    return out;
  }

  /* ==========================================================================
     3. O histórico do sistema (porta ES5 do `SistemaHist` do NCR Control)
     ========================================================================== */

  var capturas = {};       // chave da NCR -> captura compactada
  var importacoes = [];    // registro das importações de capturas
  var versao = 0;
  var MAX_IMPORTACOES = 200;

  function mudou() { versao++; }

  /* chave alternativa só com letras e dígitos: tolera "NCR ICN ESC 14 0195 2024" x "NCR-ICN-ESC-14-0195-2024" */
  function chaveSolta(s) { return str(s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function localizar(numero) {
    var k = Ncrs.chave(numero);
    if (Ncrs.get(k)) return k;
    var alvo = chaveSolta(numero), achada = '';
    Ncrs.lista().some(function (r) {
      if (chaveSolta(r.key) === alvo) { achada = r.key; return true; }
      return false;
    });
    return achada || k;
  }

  /* Capturas antigas juntavam os parágrafos da linha com " | " antes de ler o
     estado, e o motivo de um Unfounded virava parte do nome
     ("7.2 - TA Unfounded | Motivo..."). Separa o estado do texto extra. */
  function separarEstado(p) {
    if (p == null) return [null, ''];
    var t = str(p), i = t.indexOf(' | ');
    return i < 0 ? [t.trim(), ''] : [t.slice(0, i).trim(), t.slice(i + 3).trim()];
  }

  /* o registro guardado: só o necessário para a trajetória e para a
     conferência (o texto de anexos e afins fica de fora) */
  function compactar(r) {
    return {
      numero: str(r.numero), sysId: r.sysId || null, url: r.url || null, capturadoEm: str(r.capturadoEm),
      statusAtual: r.statusAtual || null, autor: r.autor || null,
      eventos: (r.eventos || []).filter(function (e) { return e && e.data && (e.tipo === 'STATUS' || e.tipo === 'CRIACAO'); })
        .map(function (e) {
          var sp = separarEstado(e.para);
          var x = { data: e.data, usuario: e.usuario || '', de: e.statusDe || e.de || '', para: sp[0], tipo: e.tipo };
          var motivo = [e.motivo, sp[1]].filter(Boolean).join('\n');
          if (motivo) x.motivo = motivo;
          return x;
        }),
      outros: (r.eventos || []).filter(function (e) { return e && e.tipo !== 'STATUS' && e.tipo !== 'CRIACAO'; }).length,
      marcos: (r.marcos || []).filter(function (m) { return m && m.data; }),
      /* o que a pessoa escreveu ao avançar (Ação 1.2, Deliberação N1, Ação PCP...) */
      acoes: (r.acoes || []).filter(function (a) { return a && a.data && a.texto; })
        .map(function (a) {
          return { titulo: a.titulo || '', data: a.data, usuario: a.usuario || '', texto: str(a.texto).slice(0, 4000) };
        })
    };
  }

  /* uma captura que já veio compactada (da pasta, de um backup) */
  function normalizarCaptura(c) {
    if (!c || typeof c !== 'object' || !c.capturadoEm) return null;
    return {
      numero: str(c.numero), sysId: c.sysId || null, url: c.url || null, capturadoEm: str(c.capturadoEm),
      statusAtual: c.statusAtual || null, autor: c.autor || null,
      eventos: Array.isArray(c.eventos) ? c.eventos : [], outros: +c.outros || 0,
      marcos: Array.isArray(c.marcos) ? c.marcos : [], acoes: Array.isArray(c.acoes) ? c.acoes : []
    };
  }

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /* cada ação escrita é gravada no mesmo instante da mudança de estado que
     ela acompanha: liga pela hora (tolerância de alguns segundos), dando
     preferência à mesma pessoa; cada ação vale para uma transição só */
  function ligarAcoes(trans, acoes) {
    if (!acoes.length) return;
    var usadas = {};
    trans.forEach(function (t) {
      if (t.de == null) return;
      var tt = new Date(t.data).getTime();
      var melhor = -1, nota = Infinity;
      acoes.forEach(function (a, i) {
        if (usadas[i]) return;
        var dt = Math.abs(new Date(a.data).getTime() - tt);
        if (dt > 5000) return;
        var s = dt + (norm(a.usuario) === norm(t.usuario) ? 0 : 3000);
        if (s < nota) { nota = s; melhor = i; }
      });
      if (melhor >= 0) { usadas[melhor] = 1; t.acao = acoes[melhor].titulo; t.texto = acoes[melhor].texto; }
    });
  }

  /* transições em ordem cronológica. A página lista do mais novo para o mais
     antigo; no mesmo segundo, a ordem da página desempata (invertida). */
  function transicoes(h) {
    var evs = (h.eventos || []).map(function (e, i) {
      var x = {};
      Object.keys(e).forEach(function (k) { x[k] = e[k]; });
      x.i = i;
      return x;
    }).sort(function (a, b) { return cmp(str(a.data), str(b.data)) || (b.i - a.i); });
    var out = [], atual = null;
    evs.forEach(function (e) {
      if (e.tipo === 'CRIACAO') {
        if (out.length) return;
        atual = e.de || statusAbertura();
        out.push({ data: e.data, de: null, para: atual, usuario: e.usuario, criacao: true });
        return;
      }
      if (e.tipo !== 'STATUS' || !e.para) return;
      if (!out.length) {
        atual = e.de || statusAbertura();
        out.push({ data: e.data, de: null, para: atual, usuario: '', criacao: false });
      }
      if (norm(e.para) === norm(atual)) return;          /* reenvio para o mesmo estado: não é movimento */
      out.push({ data: e.data, de: atual, para: e.para, usuario: e.usuario, deRegistrado: e.de, motivo: e.motivo });
      atual = e.para;
    });
    ligarAcoes(out, h.acoes || []);
    /* o motivo escrito na própria linha do histórico (ex.: Unfounded) soma-se
       ao texto da ação, quando houver */
    out.forEach(function (t) {
      if (!t.motivo) return;
      t.texto = t.texto ? t.texto + '\n\n' + t.motivo : t.motivo;
      if (!t.acao) t.acao = 'Motivo registrado';
    });
    return out;
  }

  /**
   * Os eventos de fluxo, com cada fonte valendo no seu trecho:
   * - um histórico de fora (o historico.json do NCR Control) vale até o
   *   último evento dele; os gerados pelo export só contam depois disso —
   *   senão a chegada estimada de uma reconstrução se intercalaria, por data,
   *   no caminho que o NCR Control registrou;
   * - por cima, a captura do sistema (`comCaptura`).
   */
  function trajetoria(rec, eventosFluxo) {
    var fora = eventosFluxo.filter(function (e) { return !doExport(e); });
    var evs = eventosFluxo;
    if (fora.length && fora.length < eventosFluxo.length) {
      var corte = '';
      fora.forEach(function (e) { if (str(e.data) > corte) corte = str(e.data); });
      evs = eventosFluxo.filter(function (e) { return !doExport(e) || str(e.data) > corte; });
    }
    var out = comCaptura(rec.key, evs);
    /* o caminho termina no status do export quando o export é mais novo que
       o último passo conhecido (um histórico de fora que parou antes dele) */
    var f = Ncrs.fonte(rec), ult = out.length ? out[out.length - 1] : null;
    var foto = str(f.dataFoto || f.importadoEm);
    if (ult && f.status && norm(ult.para) !== norm(f.status) && foto > str(ult.data)) {
      out = out.concat([{ data: foto, tipo: 'STATUS', campo: CAMPO_EXPORT, de: ult.para, para: f.status,
        cls: classificar(ult.para, f.status), estimado: true,
        obs: 'Status do export importado em ' + Ncrs.data(foto) + '; a data exata da mudança não consta' }]);
    }
    return out;
  }

  /**
   * A trajetória que vale, para o desenho: as transições do sistema até a
   * captura e, depois dela, os eventos de fluxo do histórico (exports). O
   * primeiro evento posterior passa a partir do estado real, e o que repete
   * o estado atual não é movimento. Sem captura, devolve os eventos como
   * vieram.
   */
  function comCaptura(key, eventosFluxo) {
    var h = captura(key);
    if (!h) return eventosFluxo;
    var t = transicoes(h);
    if (!t.length) return eventosFluxo;
    var out = t.map(function (x) {
      var obs = (x.usuario ? 'Por ' + x.usuario : ROTULO) +
        (x.de == null && !x.criacao ? ' · estado inicial deduzido da primeira mudança registrada' : '') +
        (x.deRegistrado && norm(x.deRegistrado) !== norm(x.de) && norm(x.deRegistrado) !== norm(x.para)
          ? ' · o sistema registra saída de "' + x.deRegistrado + '"' : '');
      return { data: x.data, tipo: 'STATUS', campo: 'Status', de: x.de || '', para: x.para,
        cls: x.de == null ? 'INICIAL' : classificar(x.de, x.para), obs: obs, responsavel: x.usuario || '',
        acao: x.acao || '', texto: x.texto || '', sistema: true };
    });
    var atual = out[out.length - 1].para;
    eventosFluxo.filter(function (e) { return str(e.data) > h.capturadoEm; })
      .sort(function (a, b) { return cmp(str(a.data), str(b.data)); })
      .forEach(function (e) {
        if (norm(e.para) === norm(atual)) return;
        var x = {};
        Object.keys(e).forEach(function (k) { x[k] = e[k]; });
        if (norm(x.de) !== norm(atual)) { x.de = atual; x.cls = classificar(atual, x.para); }
        out.push(x);
        atual = x.para;
      });
    return out;
  }

  /** O estado que a última captura registra, e quando. */
  function estadoCapturado(key) {
    var h = captura(key);
    if (!h) return null;
    var t = transicoes(h);
    var st = h.statusAtual ? separarEstado(h.statusAtual)[0] : (t.length ? t[t.length - 1].para : '');
    return st ? { status: st, capturadoEm: h.capturadoEm } : null;
  }

  function captura(key) { return capturas[Ncrs.chave(key)] || null; }

  /**
   * Junta o JSON do extrator. Vale, por NCR, a captura mais recente.
   * Devolve { resumo, mudou }.
   */
  function importarExtrator(obj, arquivo, quem) {
    if (!obj || obj.tipo !== TIPO_EXTRATOR || !Array.isArray(obj.ncrs)) {
      throw new Error('este arquivo não é um histórico gerado pelo extrator do NCR Integrada ' +
        '(o JSON baixado no painel do extrator, com "Baixar JSON").');
    }
    /* sem "desfazer": a captura só acrescenta (vale a mais recente), e o
       "desfazer" da última importação do banco continua sendo o dela */
    var res = { titulo: 'Histórico do sistema importado', arquivo: str(arquivo), numeros: [], grupos: [], erros: [], avisos: [],
      semDesfazer: true };
    var st = { lidas: obj.ncrs.length, capturadas: 0, erros: 0, novas: 0, atualizadas: 0, maisAntigas: 0, semNumero: 0, statusDiferente: 0 };
    var fora = [], divergentes = [];
    obj.ncrs.forEach(function (x) {
      if (!x || x.erro) { st.erros++; return; }
      if (!x.numero || !x.capturadoEm) { st.semNumero++; return; }
      st.capturadas++;
      var k = localizar(x.numero);
      var prev = capturas[k];
      if (prev && prev.capturadoEm > str(x.capturadoEm)) { st.maisAntigas++; return; }
      if (prev && prev.capturadoEm === str(x.capturadoEm)) return;
      capturas[k] = compactar(x);
      if (prev) st.atualizadas++; else st.novas++;
      var rec = Ncrs.get(k);
      if (!rec) { fora.push(str(x.numero)); return; }
      var e = estadoCapturado(k), f = Ncrs.fonte(rec);
      if (e && f.status && norm(e.status) !== norm(f.status)) {
        st.statusDiferente++;
        divergentes.push(rec.numero + ' — export: ' + f.status + ' · sistema: ' + e.status);
      }
    });
    var mudouAlgo = st.novas + st.atualizadas > 0;
    if (mudouAlgo) {
      importacoes.push({ id: uid(), em: nowIso(), por: str(quem), arquivo: str(arquivo),
        origem: str(obj.origem), geradoEm: str(obj.geradoEm), numeros: { novas: st.novas, atualizadas: st.atualizadas } });
      if (importacoes.length > MAX_IMPORTACOES) importacoes = importacoes.slice(-MAX_IMPORTACOES);
      mudou();
    }
    res.numeros = [
      ['NCRs no arquivo', st.lidas],
      ['Capturadas com sucesso', st.capturadas],
      ['Capturas novas', st.novas, true],
      ['Capturas atualizadas', st.atualizadas, true],
      ['Ignoradas — já havia captura mais recente', st.maisAntigas],
      ['Ainda fora do banco NCR (aplicadas quando a NCR entrar)', fora.length],
      ['Status do sistema diferente do export', st.statusDiferente, true],
      ['Falharam na extração', st.erros],
      ['Sem número ou data de captura', st.semNumero]
    ];
    if (fora.length) res.grupos.push({ titulo: 'Capturadas, mas ainda fora do banco NCR', itens: fora,
      explica: 'ficam guardadas e passam a valer quando uma importação do banco trouxer essas NCRs' });
    if (divergentes.length) res.grupos.push({ titulo: 'Status diferente entre o export e o sistema', itens: divergentes,
      explica: 'o status do export continua valendo para "fechada", filtros e Kanban; importe um export mais recente, ou recapture estas NCRs' });
    res.avisos.push('A trajetória de cada NCR capturada passa a ser a do sistema até a data da captura; o que os exports ' +
      'registrarem depois continua sendo somado. Nada do histórico anterior é apagado.');
    if (obj.geradoEm) res.avisos.push('Extração gerada em ' + Ncrs.data(obj.geradoEm) + (obj.origem ? ' · ' + obj.origem : '') + '.');
    return { resumo: res, mudou: mudouAlgo };
  }

  function total() { return Object.keys(capturas).length; }

  function resumo() {
    var ks = Object.keys(capturas), noBanco = 0, ultima = '';
    ks.forEach(function (k) {
      if (Ncrs.get(k)) noBanco++;
      if (capturas[k].capturadoEm > ultima) ultima = capturas[k].capturadoEm;
    });
    return { total: ks.length, noBanco: noBanco, fora: ks.length - noBanco, ultima: ultima };
  }

  /* NCRs capturadas que precisam de nova captura: tudo o que não está
     encerrado nas duas fontes com o mesmo status. Pega as abertas e também
     as REABERTAS depois da captura (o export mostra aberta, o sistema
     registrou encerrada) e qualquer divergência entre as duas. */
  function paraRecapturar() {
    var out = { links: [], abertas: 0, divergentes: 0, semLink: 0 };
    Object.keys(capturas).forEach(function (k) {
      var h = capturas[k], rec = Ncrs.get(k);
      if (!rec) return;
      var e = estadoCapturado(k);
      var capt = e ? e.status : '';
      var exp = Ncrs.fonte(rec).status || '';
      var encerradaNasDuas = isFinal(exp) && isFinal(capt) && norm(exp) === norm(capt);
      if (encerradaNasDuas) return;
      if (!h.url && !h.sysId) { out.semLink++; return; }
      if (norm(exp) !== norm(capt)) out.divergentes++; else out.abertas++;
      out.links.push(h.url || h.sysId);
    });
    return out;
  }

  /** O texto do extrator (cópia literal do NCR Control, no index.html). */
  function script() {
    var el = document.getElementById('extratorSrc');
    return el ? el.textContent.replace(/^\s+|\s+$/g, '') + '\n' : '';
  }

  /* --- persistência, pasta, backup ------------------------------------------- */

  function carregar() {
    return Store.ncrMetaGet(META_ID).then(function (r) {
      adotar(r);
      return total();
    });
  }

  function salvar() {
    mudou();
    return Store.ncrMetaPut({ id: META_ID, schema: 1, capturas: capturas, importacoes: importacoes });
  }

  function arquivo(quem) {
    return { format: FORMATO, schema: 1, updatedAt: nowIso(), updatedBy: str(quem),
      importacoes: importacoes, capturas: capturas };
  }

  function paraBackup() {
    if (!total()) return null;
    return copia({ format: FORMATO, schema: 1, importacoes: importacoes, capturas: capturas });
  }

  /** Troca tudo pelo que veio (carga local, ou o retrato do visualizador). */
  function adotar(d) {
    capturas = {};
    importacoes = [];
    var cs = (d && d.capturas) || {};
    Object.keys(cs).forEach(function (k) {
      var c = normalizarCaptura(cs[k]);
      if (c) capturas[Ncrs.chave(k)] = c;
    });
    if (d && Array.isArray(d.importacoes)) importacoes = d.importacoes.slice();
    mudou();
    return total();
  }

  /**
   * Junta o que veio da pasta (ou de um backup): por NCR, vale a captura de
   * `capturadoEm` maior; as importações são união pelo id. Devolve o que
   * mudou aqui e se este lado tem algo que a pasta ainda não tem.
   */
  function juntar(d) {
    var res = { mudou: false, localMaisNovo: false, chaves: [] };
    if (!d || !d.capturas || typeof d.capturas !== 'object') {
      res.localMaisNovo = total() > 0;
      return res;
    }
    var la = {};
    Object.keys(d.capturas).forEach(function (k0) {
      var c = normalizarCaptura(d.capturas[k0]);
      if (!c) return;
      var k = Ncrs.chave(k0);
      la[k] = 1;
      var meu = capturas[k];
      if (!meu || c.capturadoEm > meu.capturadoEm) { capturas[k] = c; res.mudou = true; res.chaves.push(k); }
      else if (c.capturadoEm < meu.capturadoEm) res.localMaisNovo = true;
    });
    Object.keys(capturas).forEach(function (k) { if (!la[k]) res.localMaisNovo = true; });
    var ids = {}, laIds = {};
    importacoes.forEach(function (i) { ids[i.id] = 1; });
    (Array.isArray(d.importacoes) ? d.importacoes : []).forEach(function (i) {
      if (!i || !i.id) return;
      laIds[i.id] = 1;
      if (!ids[i.id]) { importacoes.push(i); ids[i.id] = 1; res.mudou = true; }
    });
    if (importacoes.some(function (i) { return !laIds[i.id]; })) res.localMaisNovo = true;
    importacoes.sort(function (a, b) { return cmp(str(a.em), str(b.em)); });
    if (importacoes.length > MAX_IMPORTACOES) importacoes = importacoes.slice(-MAX_IMPORTACOES);
    if (res.mudou) mudou();
    return res;
  }

  global.NcrHist = {
    ARQUIVO: ARQUIVO,
    FORMATO: FORMATO,
    TIPO_EXTRATOR: TIPO_EXTRATOR,
    paraIso: paraIso,
    detectar: detectar,
    reconstruir: reconstruir,
    dataFotoDoConteudo: dataFotoDoConteudo,
    prepararImportacao: prepararImportacao,
    historicoDaLinha: historicoDaLinha,
    transicoes: transicoes,
    comCaptura: comCaptura,
    trajetoria: trajetoria,
    doExport: doExport,
    estadoCapturado: estadoCapturado,
    captura: captura,
    importarExtrator: importarExtrator,
    total: total,
    resumo: resumo,
    paraRecapturar: paraRecapturar,
    script: script,
    carregar: carregar,
    salvar: salvar,
    arquivo: arquivo,
    paraBackup: paraBackup,
    adotar: adotar,
    juntar: juntar,
    versao: function () { return versao; }
  };
})(window);
