/* ==========================================================================
   fluxo.js — o caminho do waiver, lido do campo "Waiver Historic"
   --------------------------------------------------------------------------
   O campo é escrito à mão, uma entrada por linha, no formato do relatório:

       J01 & J03 To: J02 & J04
       J02 & J04 To: J06
       J06Cer To: J06

   Cada linha é uma seta: o waiver saiu de um marco e foi para outro. Juntando
   as setas aparece o caminho inteiro — J01 & J03 → J02 & J04 → J06 —, que é o
   que este arquivo monta: primeiro o entendimento do texto (analisar), depois
   o desenho (svg).

   Nada aqui altera o campo: o texto continua sendo a verdade, e o fluxo é
   só a leitura dele. Um marco que ninguém escreveu não aparece.
   ========================================================================== */

(function (global) {
  'use strict';

  /* Ordem dos marcos do programa. Vale para colocar os cards na fila quando o
     texto não diz quem vem antes — as setas escritas sempre mandam mais. */
  var ORDEM = ['J01 & J03', 'J02 & J04', 'J05', 'J06', 'J07', 'J08', 'J09', 'J10', 'J11', 'J12'];

  /* "To:" é o que o relatório usa; os outros entram só para não perder o que
     alguém escrever à mão de outro jeito. */
  var SETAS = /\s*(?:\bto\s*:|->|=>|→)\s*/i;

  function texto(v) { return (v == null ? '' : String(v)).trim(); }

  /* --- entendimento de um pedaço de texto -------------------------------- */

  /**
   * Um lado da seta vira um card. "J1", "J01", "RANAE J06" e "j 06" são o
   * mesmo marco; "J06Cer" é outro card, o do certificado; e o que não tiver
   * marco nenhum ("RANAE") entra como está, para não sumir da vista.
   */
  function marco(bruto) {
    var t = texto(bruto);
    if (!t) return null;

    var achados = [];
    var re = /J\s*0*(\d{1,2})\s*(CER)?/gi;
    var m;
    while ((m = re.exec(t))) {
      achados.push({
        num: Number(m[1]),
        cer: !!m[2]
      });
    }

    if (!achados.length) {
      /* sem marco no texto: é um destino escrito por extenso, como "RANAE" */
      return { chave: t.toUpperCase(), rotulo: t, num: null, cer: false, solto: true };
    }

    /* "J01 & J03" é um card só: os números do mesmo lado da seta andam juntos */
    var cer = achados.some(function (a) { return a.cer; });
    var nums = achados.map(function (a) { return a.num; }).sort(function (a, b) { return a - b; });
    var unicos = [];
    nums.forEach(function (n) { if (unicos.indexOf(n) < 0) unicos.push(n); });

    var rotulo = unicos.map(function (n) { return 'J' + (n < 10 ? '0' : '') + n; }).join(' & ');
    if (cer) rotulo += 'Cer';
    return { chave: rotulo.toUpperCase(), rotulo: rotulo, num: unicos[unicos.length - 1], cer: cer, solto: false };
  }

  /** Posição na fila dos marcos. O "Cer" vem logo antes do marco dele. */
  function posicao(no) {
    if (no.solto) return 900;                       /* o que não é marco vai para o fim */
    var base = no.rotulo.replace(/Cer$/i, '');
    var i = ORDEM.indexOf(base);
    var listado = i >= 0;
    if (!listado) {
      /* marco fora da lista (J04 sozinho, J13): entra pelo número */
      i = ORDEM.length;
      for (var k = 0; k < ORDEM.length; k++) {
        var mk = /J\s*0*(\d{1,2})/i.exec(ORDEM[k]);
        if (mk && no.num != null && no.num < Number(mk[1])) { i = k; break; }
      }
      /* um tiquinho antes de quem o sucede: "J04" fica acima de "J05" na
         coluna, em vez de empatar com ele e depender da ordem de digitação */
      i -= 0.25;
    }
    return no.cer ? i - 0.5 : i;                    /* J06Cer fica antes de J06 */
  }

  /**
   * Lê o campo inteiro e devolve o que precisa para desenhar:
   *   nos       cada card, uma vez só
   *   arestas   as setas escritas
   *   colunas   os cards distribuídos da esquerda para a direita
   *   linhas    o texto como foi escrito, para conferir
   *   avisos    o que o texto tem de estranho (linha sem seta, ciclo)
   */
  function analisar(campo) {
    var res = { nos: [], arestas: [], colunas: [], linhas: [], avisos: [], vazio: true };
    var cru = texto(campo);
    if (!cru) return res;

    var porChave = {};
    function registra(no) {
      if (!no) return null;
      if (!porChave[no.chave]) {
        no.ordem = res.nos.length;
        no.pos = posicao(no);
        porChave[no.chave] = no;
        res.nos.push(no);
      }
      return porChave[no.chave];
    }

    cru.split('\n').forEach(function (linha) {
      var l = texto(linha);
      if (!l) return;
      res.linhas.push(l);

      var partes = l.split(SETAS).map(texto).filter(Boolean);
      if (partes.length === 1) {
        /* linha sem "To:": ainda é um marco citado, vira card solto */
        registra(marco(partes[0]));
        res.avisos.push('“' + l + '” não tem “To:”, então virou um card sozinho.');
        return;
      }
      /* "A To: B To: C" encadeia, embora o relatório use uma seta por linha */
      for (var i = 0; i < partes.length - 1; i++) {
        var de = registra(marco(partes[i]));
        var para = registra(marco(partes[i + 1]));
        if (!de || !para || de.chave === para.chave) continue;
        var repetida = res.arestas.some(function (a) {
          return a.de === de.chave && a.para === para.chave;
        });
        if (!repetida) res.arestas.push({ de: de.chave, para: para.chave });
      }
    });

    if (!res.nos.length) return res;
    res.vazio = false;

    /* Coluna de cada card: uma a mais que a do card que aponta para ele. É o
       que faz "J04 To: J06" e "J06 To: J08" virarem J04 → J06 → J08 sozinhos,
       e faz dois marcos que vão para o mesmo lugar se juntarem numa seta só. */
    var nivel = {};
    res.nos.forEach(function (n) { nivel[n.chave] = 0; });
    /* Teto: com N cards, ninguém pode passar da coluna N-1. Quem tentar está
       dentro de um círculo de setas ("A To: B" e "B To: A"), e sem o teto o
       fluxo cresceria para sempre. A seta que fecha o círculo é ignorada e o
       texto ganha um aviso — ninguém fica sem ver o que escreveu. */
    var teto = Math.max(0, res.nos.length - 1);
    var circulo = false;
    var mudou = true;
    var voltas = 0;
    while (mudou && voltas <= res.nos.length) {
      mudou = false;
      voltas++;
      res.arestas.forEach(function (a) {
        var alvo = nivel[a.de] + 1;
        if (alvo > teto) { circulo = true; return; }
        if (nivel[a.para] < alvo) { nivel[a.para] = alvo; mudou = true; }
      });
    }
    if (circulo || mudou) res.avisos.push('As setas voltam sobre si mesmas — confira o texto.');

    var usados = {};
    res.nos.forEach(function (n) { usados[nivel[n.chave]] = true; });
    /* colunas vazias não viram espaço em branco no desenho */
    var compacto = Object.keys(usados).map(Number).sort(function (a, b) { return a - b; });
    res.nos.forEach(function (n) { n.nivel = compacto.indexOf(nivel[n.chave]); });
    compacto.forEach(function () { res.colunas.push([]); });
    res.nos.forEach(function (n) { res.colunas[n.nivel].push(n); });
    res.colunas.forEach(function (col) {
      col.sort(function (a, b) { return (a.pos - b.pos) || (a.ordem - b.ordem); });
    });
    return res;
  }

  /** O caminho em texto: "J01 & J03 → J02 & J04 → J06". */
  function caminhoTexto(analise) {
    if (!analise || analise.vazio) return '';
    return analise.colunas.map(function (col) {
      return col.map(function (n) { return n.rotulo; }).join(' + ');
    }).join(' → ');
  }

  /* --- desenho ----------------------------------------------------------- */

  var SVGNS = 'http://www.w3.org/2000/svg';
  var LARG = 122;     /* card */
  var ALT = 38;
  var GAP_X = 42;     /* espaço para a seta */
  var GAP_Y = 12;
  var BORDA = 4;

  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /**
   * Desenha o fluxo. SVG escrito à mão, como o resto do programa: sem
   * biblioteca, imprime em vetor e funciona com o arquivo aberto do disco.
   *
   * opts.destaque  rótulo do card a realçar (o marco do próprio relatório)
   * opts.escala    'compacto' para as listas
   */
  function svg(analise, opts) {
    opts = opts || {};
    var compacto = opts.escala === 'compacto';
    var largCard = compacto ? 96 : LARG;
    var altCard = compacto ? 30 : ALT;
    var gapX = compacto ? 34 : GAP_X;
    var fonte = compacto ? 11 : 13;

    if (!analise || analise.vazio) {
      var vazio = sv('svg', {
        class: 'fx-svg fx-svg--vazio', viewBox: '0 0 260 34',
        width: 260, height: 34, role: 'img'
      });
      var tit = sv('title', {});
      tit.textContent = 'Sem waivers anteriores escritos';
      vazio.appendChild(tit);
      var t0 = sv('text', { x: 4, y: 22, class: 'fx-vazio-txt' });
      t0.textContent = 'Nenhum waiver anterior escrito.';
      vazio.appendChild(t0);
      return vazio;
    }

    var altura = 0;
    analise.colunas.forEach(function (col) {
      var h = col.length * altCard + (col.length - 1) * GAP_Y;
      if (h > altura) altura = h;
    });
    var largura = analise.colunas.length * largCard + (analise.colunas.length - 1) * gapX;
    var total = { w: largura + BORDA * 2, h: altura + BORDA * 2 };

    /* width e height de verdade, não só o viewBox: sem eles o desenho ocupa
       espaço na tela mas sai em branco na impressão — o layout de impressão
       do Chrome não deduz o tamanho do SVG como o da tela. */
    var s = sv('svg', {
      class: 'fx-svg',
      viewBox: '0 0 ' + total.w + ' ' + total.h,
      width: total.w,
      height: total.h,
      role: 'img',
      'aria-label': 'Fluxo: ' + caminhoTexto(analise)
    });
    s.style.maxWidth = total.w + 'px';

    /* posição de cada card, para as setas saberem onde começar e terminar */
    var onde = {};
    analise.colunas.forEach(function (col, ci) {
      var hCol = col.length * altCard + (col.length - 1) * GAP_Y;
      var y0 = BORDA + (altura - hCol) / 2;
      col.forEach(function (no, i) {
        onde[no.chave] = {
          x: BORDA + ci * (largCard + gapX),
          y: y0 + i * (altCard + GAP_Y),
          w: largCard,
          h: altCard
        };
      });
    });

    /* setas primeiro, para ficarem por baixo dos cards */
    analise.arestas.forEach(function (a) {
      var de = onde[a.de], para = onde[a.para];
      if (!de || !para) return;
      var x1 = de.x + de.w, y1 = de.y + de.h / 2;
      var x2 = para.x - 7, y2 = para.y + para.h / 2;
      var meio = x1 + (x2 - x1) / 2;
      var d = (Math.abs(y1 - y2) < 0.5)
        ? 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2
        : 'M' + x1 + ' ' + y1 + ' C' + meio + ' ' + y1 + ' ' + meio + ' ' + y2 + ' ' + x2 + ' ' + y2;
      s.appendChild(sv('path', { d: d, class: 'fx-seta' }));
      /* ponta desenhada à mão: <marker> com id colide quando há vários
         fluxos na mesma página */
      s.appendChild(sv('path', {
        d: 'M' + x2 + ' ' + y2 + ' l-7 -4.5 l0 9 z',
        class: 'fx-ponta'
      }));
    });

    analise.colunas.forEach(function (col) {
      col.forEach(function (no) {
        var p = onde[no.chave];
        var g = sv('g', { class: 'fx-card' + (no.rotulo === opts.destaque ? ' is-destaque' : '') +
          (no.solto ? ' is-solto' : '') });
        g.appendChild(sv('rect', {
          x: p.x, y: p.y, width: p.w, height: p.h, rx: 6, class: 'fx-card-caixa'
        }));
        var txt = sv('text', {
          x: p.x + p.w / 2,
          y: p.y + p.h / 2 + fonte * 0.35,
          'text-anchor': 'middle',
          class: 'fx-card-txt',
          'font-size': fonte
        });
        txt.textContent = no.rotulo;
        g.appendChild(txt);
        var titulo = sv('title', {});
        titulo.textContent = no.rotulo + (no.rotulo === opts.destaque ? ' — marco deste relatório' : '');
        g.appendChild(titulo);
        s.appendChild(g);
      });
    });
    return s;
  }

  global.Fluxo = {
    ORDEM: ORDEM,
    analisar: analisar,
    caminhoTexto: caminhoTexto,
    marco: marco,
    svg: svg
  };
})(window);
