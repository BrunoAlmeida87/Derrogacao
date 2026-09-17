/* ==========================================================================
   lado.js — o item preso ao lado, em só leitura
   --------------------------------------------------------------------------
   Serve a uma coisa só: escrever uma NCR olhando outra. A do marco anterior,
   a do colega, a que já ficou pronta e serve de modelo.

   **Só leitura, e de propósito.** Não há um campo sequer aqui. O formulário do
   editor amarra cada campo ao *item selecionado* (`field()` em app.js escreve
   no que `currentNcr()` devolver na hora da tecla), então dois formulários
   abertos escreveriam os dois no mesmo item — e os ids `f-<campo>`, que são
   únicos na página, passariam a achar o painel errado. Enquanto essa amarra
   não mudar, a coluna ao lado mostra e não escreve. O que ela oferece no
   lugar é o botão de copiar o texto de cada bloco.

   O desenho repete as cores das seções do relatório (as mesmas do editor e do
   PDF), porque é assim que se acha o bloco procurado sem ler os títulos.
   ========================================================================== */

(function (global) {
  'use strict';

  /* As mesmas seções, na mesma ordem e nas mesmas cores do relatório. */
  var SECOES = [
    ['description',      'Description',                                '#A9A9A9'],
    ['currentSituation', 'Current Situation',                          '#8FBC8B'],
    ['whyNotPossible',   'Why is not possible to treat the deviation',  '#FFCCE5'],
    ['arguments',        'What are the arguments for the derrogation',  '#CCCCFF'],
    ['archAnswer',       'Arch Answer',                                '#00B4FF']
  ];

  var CAMPOS_WAIVER = [
    ['requestExpiry',  'Waiver Request Expiry (before)'],
    ['archStatus',     'Arch Status Waiver'],
    ['approvedExpiry', 'Waiver Approved Expiry (before)']
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function str(v) { return (v == null ? '' : String(v)).trim(); }

  function dataCurta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  /** Um texto que pode estar vazio — e, estando, diz isso. */
  function texto(valor) {
    var v = str(valor);
    var p = el('p', 'lado-txt' + (v ? '' : ' lado-txt--vazio'), v || 'em branco');
    return p;
  }

  /** Cabeçalho de bloco com a cor da seção e o botão de copiar. */
  function cabecalho(titulo, cor, valor, copiar) {
    var cab = el('div', 'lado-sec-cab');
    if (cor) {
      var sw = el('span', 'swatch');
      sw.style.cssText = 'display:inline-block;width:10px;height:10px;border:1px solid rgba(0,0,0,.25);' +
        'border-radius:2px;margin-right:6px;vertical-align:middle;background:' + cor;
      cab.appendChild(sw);
    }
    cab.appendChild(el('span', 'lado-sec-nome', titulo));
    if (copiar && str(valor)) {
      var b = el('button', 'btn btn--sm btn--quiet lado-copiar', 'copiar');
      b.type = 'button';
      b.title = 'Copiar o texto deste bloco';
      b.addEventListener('click', function () { copiar(str(valor), titulo); });
      cab.appendChild(b);
    }
    return cab;
  }

  function bloco(titulo, cor, valor, copiar) {
    var b = el('div', 'lado-sec');
    if (cor) b.style.setProperty('--sec-color', cor);
    b.appendChild(cabecalho(titulo, cor, valor, copiar));
    b.appendChild(texto(valor));
    return b;
  }

  /* --- as partes ---------------------------------------------------------- */

  function identificacao(item, kind, project) {
    var box = el('div', 'lado-id');
    var linha = el('div', 'lado-id-num');
    linha.appendChild(el('strong', null, str(item.ncrId) || '(sem número)'));
    var etiqueta = el('span', 'lado-etiqueta', kind === 'dev' ? 'DEV' : 'NCR');
    linha.appendChild(etiqueta);
    box.appendChild(linha);

    var sub = (kind === 'dev' ? [item.func] : [item.systems, item.func])
      .filter(function (x) { return str(x); }).join(' | ');
    box.appendChild(el('div', 'lado-id-sub', sub || 'sem sistema nem função'));

    if (global.Report && Report.ncrLabel) {
      box.appendChild(el('div', 'lado-id-tit',
        'Waiver Request for ' + Report.ncrLabel(item, kind)));
    }

    var pe = el('div', 'lado-id-pe');
    if (global.Store && Store.statusInfo) {
      var st = Store.statusInfo(item.status);
      var chip = el('span', 'lado-chip', st.nome);
      chip.style.setProperty('--st', st.cor);
      pe.appendChild(chip);
    }
    var quem = str(item.editedBy);
    var quando = dataCurta(item.editedAt);
    if (quem || quando) {
      pe.appendChild(el('span', 'lado-quem',
        (quem ? 'por ' + quem : 'editado') + (quando ? ' em ' + quando : '')));
    }
    box.appendChild(pe);
    return box;
  }

  /** A observação interna do item — não existe no relatório, só aqui e no editor. */
  function anotacao(item, copiar) {
    var box = el('div', 'lado-sec lado-sec--nota');
    box.style.setProperty('--sec-color', '#E4A11B');
    box.appendChild(cabecalho('📝 Observação interna', '#E4A11B', item.nota, copiar));
    box.appendChild(texto(item.nota));
    return box;
  }

  function waiver(item, copiar) {
    var box = el('div', 'lado-sec lado-sec--waiver');
    box.appendChild(cabecalho('Status do waiver', '#4B0082', '', null));
    CAMPOS_WAIVER.forEach(function (c) {
      var l = el('div', 'lado-par');
      l.appendChild(el('span', 'lado-par-rot', c[1]));
      var v = str(item[c[0]]);
      l.appendChild(el('span', 'lado-par-val' + (v ? '' : ' lado-txt--vazio'), v || 'em branco'));
      box.appendChild(l);
    });

    var hist = str(item.historic);
    box.appendChild(cabecalho('Waiver Historic', null, hist, copiar));
    box.appendChild(texto(hist));
    /* o mesmo desenho do editor, no tamanho pequeno — sem o ponto dos cards:
       aqui a coluna já é a consulta, e um balão dentro dela seria consulta
       dentro de consulta */
    if (hist && global.Fluxo) {
      var palco = el('div', 'fx-palco fx-palco--mini');
      palco.appendChild(Fluxo.svg(Fluxo.analisar(hist), { escala: 'compacto' }));
      box.appendChild(palco);
    }
    return box;
  }

  function certificados(item) {
    var lista = (item.certificates || []).filter(function (c) { return str(c); });
    var box = el('div', 'lado-sec');
    box.appendChild(cabecalho('Certificados', null, '', null));
    if (!lista.length) { box.appendChild(texto('')); return box; }
    var ul = el('ul', 'lado-lista');
    lista.forEach(function (c) { ul.appendChild(el('li', null, str(c))); });
    box.appendChild(ul);
    return box;
  }

  function evidencias(item) {
    var evs = item.evidence || [];
    var box = el('div', 'lado-sec');
    box.appendChild(cabecalho('Evidências', null, '', null));
    if (!evs.length) { box.appendChild(texto('')); return box; }

    evs.forEach(function (ev, i) {
      var e = el('div', 'lado-ev');
      e.appendChild(el('div', 'lado-ev-ref', str(ev.ref) || 'Evidência ' + (i + 1)));
      if (str(ev.note)) e.appendChild(el('div', 'lado-ev-nota', str(ev.note)));
      var imgs = (ev.images || []);
      if (imgs.length) {
        var tira = el('div', 'lado-ev-tira');
        imgs.forEach(function (im) {
          if (im.src) {
            var img = document.createElement('img');
            img.src = im.src;
            img.alt = str(im.caption) || 'evidência';
            img.loading = 'lazy';
            tira.appendChild(img);
          } else {
            /* imagem que mora na pasta e ainda não foi lida: dizer isso é
               melhor do que um quadrado quebrado */
            tira.appendChild(el('div', 'lado-ev-falta', str(im.arquivo) || 'imagem na pasta'));
          }
        });
        e.appendChild(tira);
      }
      box.appendChild(e);
    });
    return box;
  }

  /* --- a coluna inteira ---------------------------------------------------- */

  /**
   * Monta o item dentro de `host`.
   *
   * opts.copiar   function(texto, rótulo) — o botão de copiar de cada bloco
   */
  function montar(host, project, item, kind, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!item) return host;

    host.appendChild(identificacao(item, kind, project));
    /* A anotação vem antes das seções do documento: quando ela existe, é o
       que explica o estado do item, e é o primeiro que se quer ler. */
    if (str(item.nota)) host.appendChild(anotacao(item, opts.copiar));
    SECOES.forEach(function (s) {
      host.appendChild(bloco(s[1], s[2], item[s[0]], opts.copiar));
    });
    host.appendChild(waiver(item, opts.copiar));
    host.appendChild(certificados(item));
    host.appendChild(evidencias(item));
    return host;
  }

  global.Lado = {
    SECOES: SECOES,
    montar: montar
  };
})(window);
