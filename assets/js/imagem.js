/* ==========================================================================
   imagem.js — cada gráfico e cada tabela da aba Resumo, para levar embora
   --------------------------------------------------------------------------
   Pedido do Bruno: "botões para baixar em imagem de alta resolução cada um
   dos gráficos e tabelas, ou exportá-los da melhor forma que você julgar".

   Sem biblioteca (§2). O card que está na tela é redesenhado como um SVG
   AUTÔNOMO — título, subtítulo, o gráfico (ou a tabela), a legenda e um
   rodapé dizendo de onde veio e qual recorte —, com as fontes e as cores
   escritas por extenso (o desenho não depende do app.css, como o do
   ncrfluxo.js). Desse SVG saem:

   - PNG em alta resolução: o SVG desenhado num canvas a 3× (≈ 3600 px de
     largura) — nítido no PowerPoint, no Word e impresso;
   - SVG: vetor, que o Office aceita colado ou inserido, sem perder nitidez;
   - Excel, para as tabelas: os números como dado, com a aba "Recorte" (a
     regra de todas as planilhas do programa).

   Nada sai do computador: o SVG vira imagem por um blob: local, e a CSP já
   permite `img-src data: blob:`.

   Não usa ninguém ao carregar; `Xlsx` só na hora da planilha.
   ========================================================================== */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var LARGURA = 1200;      /* largura lógica da imagem; o PNG sai a 3× */
  var ESCALA = 3;
  var MARGEM = 40;
  var FONTE = 'Arial, Helvetica, sans-serif';
  var TINTA = '#1a1c20', TINTA2 = '#4b5261', APAGADO = '#6b7280', LINHA = '#e3e6ec', ZEBRA = '#f6f7f9';

  function str(v) { return v == null ? '' : String(v); }
  function esc(s) {
    return str(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* largura aproximada de um texto em Arial: serve para quebrar linha e
     acomodar legenda sem medir no DOM */
  function largura(t, px) { return str(t).length * px * 0.56; }

  /** Quebra o texto em linhas que caibam em `max` px. */
  function quebrar(t, px, max) {
    var palavras = str(t).split(/\s+/), linhas = [], atual = '';
    palavras.forEach(function (w) {
      var tent = atual ? atual + ' ' + w : w;
      if (largura(tent, px) > max && atual) { linhas.push(atual); atual = w; }
      else atual = tent;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  function texto(x, y, t, px, cor, extra) {
    return '<text x="' + x + '" y="' + y + '" font-family="' + FONTE + '" font-size="' + px + '" fill="' + cor + '"' +
      (extra || '') + '>' + esc(t) + '</text>';
  }

  /* o cabeçalho (título + subtítulo) e o rodapé, comuns a gráfico e tabela */
  function cabecalho(card, y) {
    var out = '';
    var h = card.querySelector('.sm-card-head h3');
    var p = card.querySelector('.sm-card-head p');
    out += texto(MARGEM, y + 22, h ? h.textContent : '', 22, TINTA, ' font-weight="700"');
    y += 34;
    if (p && p.textContent) {
      quebrar(p.textContent, 13, LARGURA - 2 * MARGEM).forEach(function (l) {
        out += texto(MARGEM, y + 14, l, 13, APAGADO);
        y += 18;
      });
    }
    return { svg: out, y: y + 14 };
  }

  function rodape(info, y) {
    var t = 'Waiver Request · ' + str(info.escopo) + ' · ' + new Date().toLocaleDateString('pt-BR') +
      (info.recorte ? ' · Recorte: ' + info.recorte : '');
    var out = '<line x1="' + MARGEM + '" y1="' + (y + 6) + '" x2="' + (LARGURA - MARGEM) + '" y2="' + (y + 6) +
      '" stroke="' + LINHA + '" stroke-width="1"/>';
    y += 24;
    quebrar(t, 11, LARGURA - 2 * MARGEM).forEach(function (l) {
      out += texto(MARGEM, y, l, 11, APAGADO);
      y += 15;
    });
    return { svg: out, y: y + MARGEM - 14 };
  }

  function documento(conteudo, altura) {
    return '<svg xmlns="' + NS + '" width="' + LARGURA + '" height="' + Math.ceil(altura) +
      '" viewBox="0 0 ' + LARGURA + ' ' + Math.ceil(altura) + '">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' + conteudo + '</svg>';
  }

  /* As classes que os gráficos usam, por extenso (as do app.css). */
  var ESTILO_TEXTO = {
    'sm-axis-label': { size: 11, weight: '400', fill: '#3f4550' },
    'sm-total-label': { size: 11, weight: '600', fill: '#6b7280' },
    'sm-bar-label': { size: 11, weight: '600', fill: '#ffffff' }
  };

  /** O SVG do gráfico, com os estilos escritos em cada texto. */
  function graficoEmbutido(svgTela, x, y, larg) {
    var clone = svgTela.cloneNode(true);
    var vb = (svgTela.getAttribute('viewBox') || '0 0 720 100').split(/\s+/).map(Number);
    var alt = larg * vb[3] / vb[2];
    Array.prototype.forEach.call(clone.querySelectorAll('text'), function (t) {
      var cls = str(t.getAttribute('class'));
      var e = ESTILO_TEXTO['sm-axis-label'];
      Object.keys(ESTILO_TEXTO).forEach(function (k) { if (cls.indexOf(k) >= 0) e = ESTILO_TEXTO[k]; });
      var fill = cls.indexOf('sm-bar-label--dark') >= 0 ? '#3f4550' : e.fill;
      t.setAttribute('font-family', FONTE);
      t.setAttribute('font-size', e.size);
      t.setAttribute('font-weight', e.weight);
      t.setAttribute('fill', fill);
      t.removeAttribute('class');
    });
    Array.prototype.forEach.call(clone.querySelectorAll('title'), function (t) { t.parentNode.removeChild(t); });
    clone.removeAttribute('class');
    clone.removeAttribute('role');
    /* rótulo comprido não pode ser cortado na borda do gráfico */
    clone.setAttribute('overflow', 'visible');
    clone.setAttribute('x', x);
    clone.setAttribute('y', y);
    clone.setAttribute('width', larg);
    clone.setAttribute('height', alt);
    clone.setAttribute('xmlns', NS);
    return { svg: new XMLSerializer().serializeToString(clone), alt: alt };
  }

  /* a legenda (HTML na tela) redesenhada: quadradinho + nome, quebrando linha */
  function legendaEmbutida(card, y) {
    var itens = card.querySelectorAll('.sm-legend-item');
    if (!itens.length) return { svg: '', y: y };
    var out = '', x = MARGEM, px = 13;
    Array.prototype.forEach.call(itens, function (it) {
      var dot = it.querySelector('.sm-legend-dot');
      var cor = dot ? (dot.style.background || getComputedStyle(dot).backgroundColor) : '#999';
      var nome = it.textContent;
      var w = 18 + largura(nome, px) + 22;
      if (x + w > LARGURA - MARGEM && x > MARGEM) { x = MARGEM; y += 22; }
      out += '<rect x="' + x + '" y="' + (y + 2) + '" width="12" height="12" rx="3" fill="' + esc(cor) + '"/>';
      out += texto(x + 18, y + 13, nome, px, TINTA2);
      x += w;
    });
    return { svg: out, y: y + 30 };
  }

  /** O gráfico do card como SVG autônomo. Devolve { svg, larg, alt }. */
  function svgDoGrafico(card, info) {
    var c = cabecalho(card, MARGEM);
    var y = c.y, out = c.svg;
    var svgTela = card.querySelector('svg.sm-svg');
    if (svgTela) {
      /* uma folga à esquerda para o rótulo que passa do começo do viewBox */
      var folga = 30;
      var g = graficoEmbutido(svgTela, MARGEM + folga, y, LARGURA - 2 * MARGEM - folga);
      out += g.svg;
      y += g.alt + 16;
    } else {
      var vazio = card.querySelector('.sm-empty');
      out += texto(MARGEM, y + 16, vazio ? vazio.textContent : 'Sem dados.', 14, APAGADO, ' font-style="italic"');
      y += 36;
    }
    var l = legendaEmbutida(card, y);
    out += l.svg;
    var r = rodape(info, l.y);
    out += r.svg;
    return { svg: documento(out, r.y), larg: LARGURA, alt: r.y };
  }

  /** A tabela do card, lida da tela: [{titulo, num}], [[{texto, cor}]] */
  function lerTabela(card) {
    var t = card.querySelector('table.sm-table');
    if (!t) return null;
    var cols = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) {
      return { titulo: th.textContent.trim(), num: th.classList.contains('is-num'), larg: th.getBoundingClientRect().width };
    });
    var linhas = Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (tr) {
      return Array.prototype.map.call(tr.children, function (td) {
        var pill = td.querySelector('.sm-pill');
        return { texto: td.textContent.replace(/\s+/g, ' ').trim(),
          cor: pill ? pill.style.getPropertyValue('--st') : '' };
      });
    });
    return { colunas: cols, linhas: linhas };
  }

  /** A tabela do card como SVG autônomo (cabeçalho, zebra, a bolinha da situação). */
  function svgDaTabela(card, info) {
    var tb = lerTabela(card);
    var c = cabecalho(card, MARGEM);
    var y = c.y, out = c.svg;
    var util = LARGURA - 2 * MARGEM;
    var px = 12, ALT = 26;
    if (!tb || !tb.linhas.length) {
      out += texto(MARGEM, y + 16, 'Nada a listar.', 14, APAGADO, ' font-style="italic"');
      y += 36;
    } else {
      /* larguras proporcionais às da tela, com um mínimo pelo texto */
      var pesos = tb.colunas.map(function (col, i) {
        var maior = largura(col.titulo, 11);
        tb.linhas.forEach(function (l) { if (l[i]) maior = Math.max(maior, Math.min(largura(l[i].texto, px), 320)); });
        return Math.max(col.larg || 0, maior + 16);
      });
      var soma = pesos.reduce(function (a, b) { return a + b; }, 0);
      var larg = pesos.map(function (p) { return p * util / soma; });
      var xs = [], acc = MARGEM;
      larg.forEach(function (w) { xs.push(acc); acc += w; });
      var cabe = function (t, w) {
        t = str(t);
        var max = Math.floor((w - 12) / (px * 0.56));
        return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t;
      };
      /* cabeçalho */
      tb.colunas.forEach(function (col, i) {
        var xt = col.num ? xs[i] + larg[i] - 6 : xs[i] + 6;
        out += texto(xt, y + 17, col.titulo.toUpperCase(), 11, APAGADO,
          ' font-weight="700" letter-spacing=".5"' + (col.num ? ' text-anchor="end"' : ''));
      });
      y += ALT;
      out += '<line x1="' + MARGEM + '" y1="' + y + '" x2="' + (LARGURA - MARGEM) + '" y2="' + y + '" stroke="#c9ced8" stroke-width="2"/>';
      tb.linhas.forEach(function (l, k) {
        if (k % 2 === 1) out += '<rect x="' + MARGEM + '" y="' + y + '" width="' + util + '" height="' + ALT + '" fill="' + ZEBRA + '"/>';
        l.forEach(function (cel, i) {
          var col = tb.colunas[i] || {};
          var xt = col.num ? xs[i] + larg[i] - 6 : xs[i] + 6;
          if (cel.cor) {
            out += '<circle cx="' + (xt + 5) + '" cy="' + (y + ALT / 2) + '" r="5" fill="' + esc(cel.cor) + '"/>';
            xt += 15;
          }
          out += texto(xt, y + 17, cabe(cel.texto, larg[i] - (cel.cor ? 15 : 0)), px, TINTA,
            col.num ? ' text-anchor="end"' : '');
        });
        y += ALT;
        out += '<line x1="' + MARGEM + '" y1="' + y + '" x2="' + (LARGURA - MARGEM) + '" y2="' + y + '" stroke="' + LINHA + '" stroke-width="1"/>';
      });
      y += 10;
    }
    var r = rodape(info, y);
    out += r.svg;
    return { svg: documento(out, r.y), larg: LARGURA, alt: r.y };
  }

  /* --- baixar ----------------------------------------------------------- */

  function baixar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /** O SVG desenhado num canvas a 3× e salvo em PNG. Devolve uma Promise. */
  function paraPng(d, nome) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(new Blob([d.svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = Math.round(d.larg * ESCALA);
        cv.height = Math.round(d.alt * ESCALA);
        var g = cv.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (!b) { falha(new Error('o navegador não gerou a imagem')); return; }
          baixar(b, nome);
          ok({ largura: cv.width, altura: cv.height });
        }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error('não foi possível desenhar a imagem')); };
      img.src = url;
    });
  }

  function paraSvg(d, nome) {
    baixar(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + d.svg], { type: 'image/svg+xml;charset=utf-8' }), nome);
  }

  /** A tabela do card em .xlsx, com a aba "Recorte". */
  function paraExcel(card, info, nome) {
    var tb = lerTabela(card);
    if (!tb) return;
    var h = card.querySelector('.sm-card-head h3');
    var linhas = tb.linhas.map(function (l) {
      return l.map(function (c, i) {
        var col = tb.colunas[i] || {};
        var v = c.texto;
        /* número como número (o Excel soma), o resto como texto */
        if (col.num && /^-?\d+(?:[.,]\d+)?$/.test(v)) return Number(v.replace(',', '.'));
        return v;
      });
    });
    var recorte = [
      ['Tabela', h ? h.textContent : ''],
      ['Escopo', str(info.escopo)],
      ['Recorte', info.recorte || 'sem filtro'],
      ['Linhas', linhas.length],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Por', str(info.quem)]
    ];
    baixar(Xlsx.blob([
      { nome: (h ? h.textContent : 'Tabela').slice(0, 31), colunas: tb.colunas.map(function (c) {
        return { titulo: c.titulo, larg: Math.min(60, Math.max(10, Math.round((c.larg || 80) / 7))) };
      }), linhas: linhas },
      { nome: 'Recorte', colunas: [{ titulo: 'Campo', larg: 14 }, { titulo: 'Valor', larg: 70 }], linhas: recorte, filtros: false }
    ]), nome);
  }

  /** Nome de arquivo: resumo_<escopo>_<card>_<aaaa-mm-dd>.<ext> */
  function nomeArquivo(info, card, ext) {
    var h = card.querySelector('.sm-card-head h3');
    var limpa = function (t) {
      t = str(t);
      if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    };
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'resumo_' + (limpa(info.escopo) || 'geral') + '_' + (limpa(h ? h.textContent : '') || 'item') + '_' +
      d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.' + ext;
  }

  global.Imagem = {
    ESCALA: ESCALA,
    svgDoGrafico: svgDoGrafico,
    svgDaTabela: svgDaTabela,
    lerTabela: lerTabela,
    paraPng: paraPng,
    paraSvg: paraSvg,
    paraExcel: paraExcel,
    nomeArquivo: nomeArquivo
  };
})(window);
