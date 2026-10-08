/* ==========================================================================
   cartao.js — uma ficha em imagem, numa folha A4
   --------------------------------------------------------------------------
   Pedido do Bruno: baixar a imagem do pop-up dos produtos (as NCRs de cada
   um) e a do pop-up da NCR, "em boa resolução, bem organizada, que caiba em
   uma folha A4". O pop-up da tela não serve de foto: ele rola, tem botões e
   muda com a largura da janela. Então a imagem é DESENHADA de novo, num
   canvas, a partir dos mesmos dados — sem biblioteca, sem rede, igual em
   qualquer computador.

   A folha é A4 em retrato, a 300 dpi (2480 × 3508 px), desenhada em unidades
   de 1240 × 1754 e ampliada ×2. Quem chama descreve BLOCOS; `gerar` mede e,
   se o conteúdo passa da folha, reduz a letra (até `ESCALA_MIN`) antes de
   desistir — e diz quando desistiu, para o chamador cortar o que sobra.

   Blocos:
     { t: 'cab',   titulo, sub, tags: [{t, c}] }
     { t: 'sec',   titulo, sub }
     { t: 'pares', itens: [[rotulo, valor]], cols }
     { t: 'chips', rot, chips: [{t, c}] }
     { t: 'texto', rot, texto, linhas }
     { t: 'tab',   cols: [{t, w}], rows: [[celula]] }     celula: texto | {chips} | {tag}
     { t: 'nota',  texto }
   `c` de um chip/tag é uma das chaves de CORES.
   ========================================================================== */
(function (global) {
  'use strict';

  var L = 1240, A = 1754, ZOOM = 2, ESCALA_MIN = 0.62;
  var MARGEM = 54;
  var FONTE = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  var MONO = 'Consolas, "Courier New", monospace';

  var CORES = {
    marco: ['#e8eefb', '#1a4fa0'], fv: ['#f3f6df', '#4a5906'], na: ['#eceef2', '#6d7383'],
    exato: ['#e7f4ec', '#1d6b45'], variacao: ['#fff4d6', '#8a5a00'], parecido: ['#ffffff', '#6d7383'],
    aberta: ['#fdeadc', '#b4470f'], fechada: ['#e7f4ec', '#1d6b45'], erro: ['#fdecec', '#b42318'],
    info: ['#eef0f4', '#3a4252'], sbr: ['#e9eef4', '#34506b']
  };

  function str(v) { return v == null ? '' : String(v); }

  /* quebra o texto em linhas que caibam em `larg` (palavras longas são cortadas) */
  function quebrar(ctx, texto, larg) {
    var linhas = [];
    str(texto).split(/\n/).forEach(function (par) {
      var palavras = par.split(/\s+/).filter(Boolean);
      if (!palavras.length) { linhas.push(''); return; }
      var atual = '';
      palavras.forEach(function (p) {
        while (ctx.measureText(p).width > larg && p.length > 1) {
          var n = p.length;
          while (n > 1 && ctx.measureText(p.slice(0, n)).width > larg) n--;
          if (atual) { linhas.push(atual); atual = ''; }
          linhas.push(p.slice(0, n));
          p = p.slice(n);
        }
        var t = atual ? atual + ' ' + p : p;
        if (ctx.measureText(t).width <= larg) atual = t;
        else { linhas.push(atual); atual = p; }
      });
      if (atual) linhas.push(atual);
    });
    return linhas;
  }

  function limitar(linhas, max, ctx, larg) {
    if (!max || linhas.length <= max) return linhas;
    var cortadas = linhas.slice(0, max);
    var u = cortadas[max - 1];
    while (u.length > 1 && ctx.measureText(u + '…').width > larg) u = u.slice(0, -1);
    cortadas[max - 1] = u + '…';
    return cortadas;
  }

  function rect(ctx, x, y, w, h, r, fill, stroke, tracejado) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.setLineDash(tracejado ? [4, 3] : []);
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /**
   * Desenha (ou só mede, com `seco`) os blocos na escala `f`. Devolve a altura
   * usada. Tudo em unidades de 1240 de largura.
   */
  function desenhar(ctx, blocos, f, seco, tema) {
    var y = MARGEM;
    var W = L - 2 * MARGEM;
    var fs = function (n) { return Math.round(n * f * 10) / 10; };
    function fonte(px, peso, mono) { ctx.font = (peso || 400) + ' ' + fs(px) + 'px ' + (mono ? MONO : FONTE); }

    function chip(x, yy, t, c, tamanho) {
      var cor = CORES[c] || CORES.info;
      fonte(tamanho || 15, 700);
      var w = ctx.measureText(t).width + fs(16), h = fs((tamanho || 15) + 9);
      if (!seco) {
        rect(ctx, x, yy, w, h, h / 2, cor[0], c === 'parecido' ? cor[1] : null, c === 'parecido');
        ctx.fillStyle = cor[1]; ctx.textBaseline = 'middle';
        ctx.fillText(t, x + fs(8), yy + h / 2 + 1);
      }
      return { w: w, h: h };
    }

    /* uma fila de chips que quebra de linha; devolve a altura */
    function fila(x, yy, largMax, chips, tamanho) {
      var cx = x, cy = yy, h = 0, gap = fs(6);
      chips.forEach(function (ch) {
        fonte(tamanho || 15, 700);
        var w = ctx.measureText(ch.t).width + fs(16);
        if (cx + w > x + largMax && cx > x) { cx = x; cy += h + gap; }
        var m = chip(cx, cy, ch.t, ch.c, tamanho);
        h = m.h; cx += m.w + gap;
      });
      return cy + h - yy;
    }

    blocos.forEach(function (b) {
      if (b.t === 'cab') {
        fonte(36, 800); ctx.textBaseline = 'alphabetic';
        if (!seco) {
          ctx.fillStyle = tema.cor; ctx.fillRect(0, 0, L, fs(10));
          ctx.fillStyle = tema.cor; ctx.fillText(b.titulo, MARGEM, y + fs(40));
        }
        y += fs(40);
        if (b.sub) {
          fonte(18, 400);
          var ls = limitar(quebrar(ctx, b.sub, W), 3, ctx, W);
          ls.forEach(function (l) { if (!seco) { ctx.fillStyle = '#2a2f3a'; ctx.fillText(l, MARGEM, y + fs(28)); } y += fs(25); });
          y += fs(4);
        }
        if (b.tags && b.tags.length) { y += fs(10); y += fila(MARGEM, y, W, b.tags, 16); }
        y += fs(14);
        if (!seco) { ctx.fillStyle = '#c9ced8'; ctx.fillRect(MARGEM, y, W, 1.5); }
        y += fs(18);
      } else if (b.t === 'sec') {
        y += fs(10);
        fonte(15, 800); ctx.textBaseline = 'alphabetic';
        if (!seco) {
          ctx.fillStyle = tema.cor; ctx.fillRect(MARGEM, y, fs(5), fs(20));
          ctx.fillStyle = '#3a4252'; ctx.fillText(str(b.titulo).toUpperCase(), MARGEM + fs(14), y + fs(16));
        }
        if (b.sub) {
          fonte(13, 400);
          if (!seco) { ctx.fillStyle = '#6d7383'; ctx.fillText(b.sub, MARGEM + fs(14) + ctx.measureText(str(b.titulo).toUpperCase()).width * 1.18 + fs(14), y + fs(16)); }
        }
        y += fs(30);
      } else if (b.t === 'pares') {
        var cols = b.cols || 2, cw = W / cols, linhasMax = 0;
        var alturas = [], i;
        b.itens.forEach(function (it, k) {
          fonte(13, 700);
          var rot = str(it[0]);
          fonte(16, 400, it[2]);
          var vl = limitar(quebrar(ctx, it[1] || '—', cw - fs(20)), it[3] || 3, ctx, cw - fs(20));
          alturas.push({ vl: vl, mono: it[2], rot: rot });
        });
        for (i = 0; i < alturas.length; i += cols) {
          var linha = alturas.slice(i, i + cols), h = 0;
          linha.forEach(function (a) { h = Math.max(h, fs(18) + a.vl.length * fs(21)); });
          linha.forEach(function (a, k) {
            var x = MARGEM + k * cw;
            if (!seco) {
              fonte(12, 700); ctx.fillStyle = '#6d7383'; ctx.textBaseline = 'alphabetic';
              ctx.fillText(a.rot.toUpperCase(), x, y + fs(13));
              fonte(16, 400, a.mono); ctx.fillStyle = '#1b1f27';
              a.vl.forEach(function (l, n) { ctx.fillText(l, x, y + fs(34) + n * fs(21)); });
            }
          });
          y += h + fs(12);
        }
      } else if (b.t === 'chips') {
        fonte(13, 700); ctx.textBaseline = 'alphabetic';
        var rw = fs(150);
        if (!seco) { ctx.fillStyle = '#6d7383'; ctx.fillText(str(b.rot).toUpperCase(), MARGEM, y + fs(19)); }
        var hh = fila(MARGEM + rw, y, W - rw, b.chips, 15);
        y += Math.max(hh, fs(24)) + fs(10);
      } else if (b.t === 'texto') {
        fonte(12, 700); ctx.textBaseline = 'alphabetic';
        if (!seco) { ctx.fillStyle = '#6d7383'; ctx.fillText(str(b.rot).toUpperCase(), MARGEM, y + fs(13)); }
        y += fs(20);
        fonte(16, 400);
        var tl = limitar(quebrar(ctx, b.texto || '—', W), b.linhas || 6, ctx, W);
        tl.forEach(function (l) { if (!seco) { ctx.fillStyle = '#1b1f27'; ctx.fillText(l, MARGEM, y + fs(16)); } y += fs(21); });
        y += fs(10);
      } else if (b.t === 'nota') {
        fonte(14, 400);
        var nl = quebrar(ctx, b.texto, W);
        nl.forEach(function (l) { if (!seco) { ctx.fillStyle = '#6d7383'; ctx.fillText(l, MARGEM, y + fs(14)); } y += fs(19); });
        y += fs(8);
      } else if (b.t === 'tab') {
        var tot = 0;
        b.cols.forEach(function (c) { tot += c.w; });
        var xs = [], acc = MARGEM;
        b.cols.forEach(function (c) { xs.push(acc); acc += W * c.w / tot; });
        var larguras = b.cols.map(function (c) { return W * c.w / tot - fs(16); });
        /* cabeçalho */
        var hc = fs(30);
        if (!seco) {
          ctx.fillStyle = '#eef1f5'; ctx.fillRect(MARGEM, y, W, hc);
          fonte(12, 800); ctx.fillStyle = '#4b5261'; ctx.textBaseline = 'middle';
          b.cols.forEach(function (c, k) { ctx.fillText(c.t.toUpperCase(), xs[k] + fs(8), y + hc / 2); });
        }
        y += hc;
        b.rows.forEach(function (row, ri) {
          var alt = fs(30), medidas = [];
          row.forEach(function (cel, k) {
            var m;
            if (cel && cel.chips) {
              var cx = 0, cy = 0, hh2 = 0, gap = fs(5);
              cel.chips.forEach(function (ch) {
                fonte(13, 700);
                var w = ctx.measureText(ch.t).width + fs(14);
                if (cx + w > larguras[k] && cx > 0) { cx = 0; cy += fs(22) + gap; }
                cx += w + gap; hh2 = cy + fs(22);
              });
              m = { h: hh2 + fs(10) };
            } else if (cel && cel.tag) {
              m = { h: fs(34) + (cel.sub ? fs(18) : 0) };
            } else {
              fonte(15, 400, cel && cel.mono);
              var ll = limitar(quebrar(ctx, str(cel && cel.t != null ? cel.t : cel), larguras[k]), 3, ctx, larguras[k]);
              m = { ll: ll, h: ll.length * fs(19) + fs(12) };
            }
            medidas.push(m);
            alt = Math.max(alt, m.h);
          });
          if (!seco) {
            if (ri % 2) { ctx.fillStyle = '#f5f7fa'; ctx.fillRect(MARGEM, y, W, alt); }
            ctx.fillStyle = '#dde1e8'; ctx.fillRect(MARGEM, y + alt - 1, W, 1);
            row.forEach(function (cel, k) {
              var x = xs[k] + fs(8);
              if (cel && cel.chips) {
                var cx2 = x, cy2 = y + fs(6), gap2 = fs(5);
                cel.chips.forEach(function (ch) {
                  fonte(13, 700);
                  var w = ctx.measureText(ch.t).width + fs(14);
                  if (cx2 + w > x + larguras[k] && cx2 > x) { cx2 = x; cy2 += fs(22) + gap2; }
                  var cor = CORES[ch.c] || CORES.info;
                  rect(ctx, cx2, cy2, w, fs(22), fs(11), cor[0], null);
                  ctx.fillStyle = cor[1]; ctx.textBaseline = 'middle'; ctx.fillText(ch.t, cx2 + fs(7), cy2 + fs(11) + 1);
                  cx2 += w + gap2;
                });
              } else if (cel && cel.tag) {
                chip(x, y + fs(6), cel.tag.t, cel.tag.c, 13);
                if (cel.sub) { fonte(11, 400); ctx.fillStyle = '#6d7383'; ctx.textBaseline = 'alphabetic'; ctx.fillText(cel.sub, x, y + fs(46)); }
              } else {
                fonte(15, cel && cel.t != null && cel.forte ? 700 : 400, cel && cel.mono);
                ctx.fillStyle = (cel && cel.cor) || '#1b1f27'; ctx.textBaseline = 'alphabetic';
                medidas[k].ll.forEach(function (l, n) { ctx.fillText(l, x, y + fs(21) + n * fs(19)); });
              }
            });
          }
          y += alt;
        });
        y += fs(10);
      }
    });
    return y;
  }

  /**
   * Gera o canvas A4. `opts`: tema { cor }, rodape. Devolve { canvas, coube,
   * escala }. `coube` falso = nem na escala mínima coube: o chamador corta
   * conteúdo e tenta de novo.
   */
  function gerar(blocos, opts) {
    opts = opts || {};
    var tema = opts.tema || { cor: '#34506b' };
    var cv = document.createElement('canvas');
    cv.width = L * ZOOM; cv.height = A * ZOOM;
    var ctx = cv.getContext('2d');
    ctx.scale(ZOOM, ZOOM);
    var reserva = 46;                            /* o rodapé */
    var f = 1.3, usado = 0;
    for (; f >= ESCALA_MIN - 0.001; f -= 0.04) {
      usado = desenhar(ctx, blocos, f, true, tema);
      if (usado <= A - reserva) break;
    }
    var coube = usado <= A - reserva;
    if (!coube) f = ESCALA_MIN;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, L, A);
    desenhar(ctx, blocos, f, false, tema);
    ctx.font = '400 12px ' + FONTE; ctx.fillStyle = '#8a91a0'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str(opts.rodape), MARGEM, A - 24);
    return { canvas: cv, coube: coube, escala: f };
  }

  /** Baixa o canvas como PNG. */
  function baixar(canvas, nome) {
    function salvar(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    if (canvas.toBlob) { canvas.toBlob(function (b) { salvar(b); }, 'image/png'); return; }
    var d = canvas.toDataURL('image/png').split(',')[1], bin = atob(d), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    salvar(new Blob([u], { type: 'image/png' }));
  }

  /** Nome de arquivo seguro. */
  function nomeSeguro(s) { return str(s).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'ficha'; }

  global.Cartao = { gerar: gerar, baixar: baixar, nomeSeguro: nomeSeguro, LARGURA: L * ZOOM, ALTURA: A * ZOOM };
})(window);
