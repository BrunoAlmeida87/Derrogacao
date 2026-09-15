/* ==========================================================================
   report.js — monta o DOM do relatório no padrão do PDF original
   Produz: 1 página de capa (índice) + 1 página por NCR + N páginas de
   evidência (paisagem), com os mesmos blocos, cores e ordem do modelo.
   ========================================================================== */

(function (global) {
  'use strict';

  var SECTIONS = [
    { key: 'description',      cls: 'description', label: 'Description:' },
    { key: 'currentSituation', cls: 'situation',   label: 'Current Situation:' },
    { key: 'whyNotPossible',   cls: 'why',         label: 'Why is not possible to treat the deviation:' },
    { key: 'arguments',        cls: 'arguments',   label: 'What are the arguments for the derrogation:' },
    { key: 'archAnswer',       cls: 'arch',        label: 'Arch Answer:' }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clean(v) { return (v || '').trim(); }

  /**
   * Rótulo do item, na barra de título.
   *   NCR: "NCR-ICN-ESC-13-1098-2023|RM|FV 01 - Sea water circuit integrity"
   *   DEV: "DEV-78154|BQ - Modification des compensateurs"
   * A DEV junta sistema e descrição num campo só, como no relatório original.
   */
  function ncrLabel(ncr, kind) {
    var parts = kind === 'dev' ? [ncr.ncrId, ncr.func] : [ncr.ncrId, ncr.systems, ncr.func];
    return parts.map(clean).filter(Boolean).join('|');
  }

  /* Configuração de cada aba. */
  var KINDS = {
    ncr: {
      key: 'ncrs',
      coverTitleField: 'coverTitle',
      marcoField: 'marco',
      indexSeparator: '|',
      showHistoric: true,
      label: 'NCR'
    },
    dev: {
      key: 'devs',
      coverTitleField: 'coverTitleDev',
      marcoField: 'marcoDev',
      indexSeparator: ' ',   /* na capa da DEV o número é seguido de espaço */
      showHistoric: false,
      label: 'DEV'
    }
  };

  function conf(kind) { return KINDS[kind === 'dev' ? 'dev' : 'ncr']; }

  /** Itens da aba. */
  /* A ordem escolhida no editor é a ordem das páginas: índice da capa,
     páginas das NCRs e páginas de evidência, tudo na mesma sequência. */
  function items(project, kind) { return Store.ordenar(project, kind); }

  /** Marco da aba — a DEV cai no marco geral quando não tem um próprio. */
  function marcoOf(project, kind) {
    var c = conf(kind);
    return clean(project[c.marcoField]) || clean(project.marco);
  }

  /* Os âncoras levam um prefixo por relatório, para que vários possam ser
     montados no mesmo documento sem colidir os links internos. */
  function scopeOf(project, kind) { return conf(kind).label.toLowerCase() + '-' + project.id; }
  function anchorCover(scope) { return scope + '-cover'; }
  function anchorNcr(scope, ncr) { return scope + '-item-' + ncr.id; }
  function anchorEvid(scope, ev) { return scope + '-evid-' + ev.id; }

  function page(landscape) {
    var p = el('section', 'rep-page' + (landscape ? ' rep-page--landscape' : ''));
    return p;
  }

  /* --- paginação: nada pode transbordar a folha -------------------------- */

  /* A folha tem margens feitas de padding e a impressão usa @page sem margem
     nenhuma — é o que permite mandar "Margens: Nenhuma" na janela de
     impressão e ainda assim sair no lugar certo. O preço é que um texto que
     passe do fim da folha continuaria na seguinte colado na borda do papel.
     Em vez de deixar isso acontecer, o conteúdo que não cabe é levado para
     uma folha de continuação de verdade — com as mesmas margens. */

  var LIMITE_VOLTAS = 200; /* trava contra laço infinito em caso estranho */
  var umMm = 0;

  function mm(valor) {
    if (!umMm) {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;height:100mm';
      document.body.appendChild(probe);
      umMm = probe.offsetHeight / 100 || 3.7795;
      document.body.removeChild(probe);
    }
    return valor * umMm;
  }

  /** Altura da folha, em pixels. */
  function limite(p) {
    return mm(p.classList.contains('rep-page--landscape') ? 210 : 297);
  }

  /* A folha tem `min-height` de uma página inteira, então altura igual ao
     limite é folha cheia e certa; só passar disso é transbordar. O respiro
     contra o arredondamento da impressão vem da classe .rep-medindo, que
     encurta a área útil enquanto a conta é feita. */
  function transbordou(p) {
    return p.scrollHeight > limite(p) + 0.5;
  }

  /* O #printRoot fica escondido; para medir é preciso dar-lhe layout por um
     instante, fora da vista. Sem isso toda altura mediria zero e a paginação
     simplesmente não aconteceria. */
  function abrirMedida(root) {
    if (!root || !root.isConnected) return null;
    var win = root.ownerDocument.defaultView;
    if (!win || win.getComputedStyle(root).display !== 'none') return null;
    var antes = root.getAttribute('style');
    root.setAttribute('style', (antes || '') +
      ';display:block;position:absolute;left:-30000px;top:0;width:320mm;visibility:hidden;');
    return { root: root, antes: antes };
  }

  function fecharMedida(m) {
    if (!m) return;
    if (m.antes == null) m.root.removeAttribute('style');
    else m.root.setAttribute('style', m.antes);
  }

  function mensuravel(p) {
    return !!(p && p.isConnected && (p.offsetWidth || p.offsetHeight));
  }

  /**
   * Blocos que podem mudar de folha, na ordem em que aparecem.
   * Um bloco marcado `data-lista` entrega os próprios filhos — é o caso do
   * índice da capa, onde a unidade é cada linha, não a lista inteira.
   */
  function unidades(pag) {
    var out = [];
    var filhos = pag.children;
    for (var i = 0; i < filhos.length; i++) {
      var c = filhos[i];
      if (!c.hasAttribute('data-fluido')) continue;
      if (c.hasAttribute('data-lista')) {
        for (var j = 0; j < c.children.length; j++) {
          /* o cabeçalho não muda de folha: é repetido em cada uma */
          if (c.children[j].hasAttribute('data-cabecalho')) continue;
          out.push({ no: c.children[j], lista: c });
        }
      } else {
        out.push({ no: c, lista: null });
      }
    }
    return out;
  }

  /**
   * Repete na continuação os filhos marcados como cabeçalho da lista — o
   * título do bloco e a linha de rótulos das colunas. Sem isso, a segunda
   * folha de uma lista comprida chega sem dizer o que são as colunas.
   */
  function repetirCabecalho(lista, clone) {
    for (var i = 0; i < lista.children.length; i++) {
      if (lista.children[i].hasAttribute('data-cabecalho')) {
        clone.appendChild(lista.children[i].cloneNode(true));
      }
    }
  }

  /* Uma lista que ficou só com o cabeçalho é um título solto no fim da
     folha, com as linhas todas na seguinte. Melhor não existir. */
  function limparListasVazias(pag) {
    var listas = pag.querySelectorAll('[data-lista]');
    for (var i = 0; i < listas.length; i++) {
      var l = listas[i], vazia = true;
      for (var j = 0; j < l.children.length; j++) {
        if (!l.children[j].hasAttribute('data-cabecalho')) { vazia = false; break; }
      }
      if (vazia && l.children.length && l.parentNode) l.parentNode.removeChild(l);
    }
  }

  /** Corta o texto numa quebra de linha ou espaço, para não partir palavra. */
  function quebraNatural(texto, k) {
    var janela = texto.slice(0, k);
    var nl = janela.lastIndexOf('\n');
    if (nl > k * 0.5) return nl + 1;
    var sp = janela.lastIndexOf(' ');
    if (sp > k * 0.5) return sp + 1;
    return k;
  }

  /**
   * Último recurso: uma seção sozinha maior que a folha. Parte o texto no
   * ponto exato em que deixa de caber e devolve o resto numa seção igual,
   * com o cabeçalho marcado como continuação.
   */
  function partirSecao(sec, pag) {
    var corpo = sec.querySelector('.rep-section-body');
    var cab = sec.querySelector('.rep-section-head');
    if (!corpo || !cab) return null;
    var texto = corpo.textContent;
    if (texto.length < 40) return null;

    var lo = 0, hi = texto.length, melhor = -1;
    while (lo <= hi) {
      var meio = (lo + hi) >> 1;
      corpo.textContent = texto.slice(0, meio);
      if (transbordou(pag)) { hi = meio - 1; } else { melhor = meio; lo = meio + 1; }
    }
    if (melhor <= 0) { corpo.textContent = texto; return null; }

    var corte = quebraNatural(texto, melhor);
    corpo.textContent = texto.slice(0, corte).replace(/\s+$/, '');

    var resto = el('div', sec.className);
    resto.setAttribute('data-fluido', '');
    var rotulo = cab.textContent.replace(/ \(cont\.\)$/, '');
    resto.appendChild(el('div', cab.className, rotulo + ' (cont.)'));
    resto.appendChild(el('div', corpo.className, texto.slice(corte).replace(/^\s+/, '')));
    return resto;
  }

  /** Tira do fim da folha o que não coube; devolve os blocos retirados. */
  function retirarExcedente(pag) {
    var lista = unidades(pag);
    var fora = [];
    while (lista.length > 1 && transbordou(pag)) {
      var u = lista.pop();
      (u.lista || pag).removeChild(u.no);
      fora.unshift(u);
    }
    if (transbordou(pag) && lista.length === 1) {
      var unico = lista[0];
      var resto = unico.no.classList.contains('rep-section')
        ? partirSecao(unico.no, pag)
        : null;
      if (resto) fora.unshift({ no: resto, lista: unico.lista });
    }
    return fora;
  }

  /**
   * Quebra `pag` em quantas folhas forem necessárias, criando cada
   * continuação com `criar(n)`. Devolve todas as folhas, na ordem.
   *
   * `rodape`, quando existe, já está na folha original e é copiado para o
   * fim de cada continuação — entrando na conta, e não depois dela.
   */
  function paginar(pag, root, criar, rodape) {
    var paginas = [pag];
    if (!mensuravel(pag)) return paginas;
    pag.classList.add('rep-medindo');
    var atual = pag;
    var voltas = 0;
    while (transbordou(atual) && voltas++ < LIMITE_VOLTAS) {
      var fora = retirarExcedente(atual);
      if (!fora.length) break;
      var nova = criar(paginas.length);
      nova.classList.add('rep-medindo');
      var listaAtual = null;
      var clone = null;
      fora.forEach(function (u) {
        if (!u.lista) { nova.appendChild(u.no); clone = null; listaAtual = null; return; }
        if (u.lista !== listaAtual) {
          listaAtual = u.lista;
          clone = u.lista.cloneNode(false);
          repetirCabecalho(u.lista, clone);
          nova.appendChild(clone);
        }
        clone.appendChild(u.no);
      });
      if (rodape) nova.appendChild(rodape.cloneNode(true));
      root.insertBefore(nova, atual.nextSibling);
      paginas.push(nova);
      atual = nova;
    }
    paginas.forEach(function (p) {
      p.classList.remove('rep-medindo');
      limparListasVazias(p);
    });
    return paginas;
  }

  /* --- capa / índice ---------------------------------------------------- */

  function buildCover(project, kind, scope) {
    var c = conf(kind);
    var p = page(false);
    p.id = anchorCover(scope);

    var title = clean(project[c.coverTitleField]) || 'Waiver Request For';
    p.appendChild(el('div', 'rep-cover-title', (title + ' ' + marcoOf(project, kind)).trim()));
    p.appendChild(el('div', 'rep-cover-subtitle', project.coverSubtitle || 'List of Waiver Requested :'));

    var list = el('div', 'rep-index');
    /* o índice é a parte que cresce: cada linha pode mudar de folha */
    list.setAttribute('data-fluido', '');
    list.setAttribute('data-lista', '');
    var rows = items(project, kind);
    rows.forEach(function (ncr) {
      var item = el('p', 'rep-index-item');
      var a = el('a', null, (ncr.ncrId || '(sem número)'));
      a.href = '#' + anchorNcr(scope, ncr);
      item.appendChild(a);
      /* O índice fecha com o Arch Status, como no relatório de origem:
         NCR-…|HP|FV 09 - …|WAIVER ACCEPTED. Sem status, a linha só termina
         antes — nada de um separador solto no fim. */
      var rest = (kind === 'dev' ? [ncr.func] : [ncr.systems, ncr.func])
        .map(clean).filter(Boolean).join('|');
      if (rest) item.appendChild(document.createTextNode(c.indexSeparator + rest));
      if (clean(ncr.archStatus)) {
        item.appendChild(el('span', 'rep-index-status',
          (rest ? '|' : c.indexSeparator) + clean(ncr.archStatus)));
      }
      list.appendChild(item);
    });
    if (!rows.length) {
      list.appendChild(el('p', 'rep-index-item', 'Nenhum item cadastrado.'));
    }
    p.appendChild(list);

    /* A data de emissão fica por último, na última folha da capa: é por isso
       que ela sai daqui e volta depois da paginação. */
    var data = null;
    if (project.showCoverDate !== false) {
      data = el('div', 'rep-cover-date', 'Gerado em ' + new Date().toLocaleDateString('pt-BR'));
      data.setAttribute('data-fluido', '');
    }
    return { pag: p, data: data, titulo: (title + ' ' + marcoOf(project, kind)).trim() };
  }

  /** Folha seguinte da capa, quando o índice não cabe numa só. */
  function capaContinuacao(titulo) {
    var p = page(false);
    p.classList.add('rep-page--cont');
    p.appendChild(el('div', 'rep-cover-title', titulo + ' (cont.)'));
    return p;
  }

  /* --- página de uma NCR ------------------------------------------------ */

  function buildNcrPage(project, ncr, kind, scope) {
    var c = conf(kind);
    var p = page(false);
    p.id = anchorNcr(scope, ncr);

    /* linha de navegação: "Go to Evidence" (esq.) e "Go Back" (dir.) */
    var nav = el('div', 'rep-nav');
    var firstEvid = ncr.evidence.filter(function (e) { return e.images.length || e.note; })[0];
    if (firstEvid) {
      var goEv = el('a', null, 'Go to Evidence');
      goEv.href = '#' + anchorEvid(scope, firstEvid);
      nav.appendChild(goEv);
    } else {
      nav.appendChild(el('span', 'rep-nav-spacer', '.'));
    }
    var back = el('a', null, 'Go Back');
    back.href = '#' + anchorCover(scope);
    nav.appendChild(back);
    p.appendChild(nav);

    p.appendChild(el('div', 'rep-title', 'Waiver Request for ' + ncrLabel(ncr, kind)));

    SECTIONS.forEach(function (sec) {
      var wrap = el('div', 'rep-section rep-section--' + sec.cls);
      wrap.setAttribute('data-fluido', '');
      wrap.appendChild(el('div', 'rep-section-head', sec.label));
      wrap.appendChild(el('div', 'rep-section-body', ncr[sec.key] || ''));
      p.appendChild(wrap);
    });

    /* bloco de status, à direita */
    var status = el('div', 'rep-status');
    status.setAttribute('data-fluido', '');
    var rows = [
      ['Waiver Request Expiry (before):', ncr.requestExpiry],
      ['Arch Status Waiver:', ncr.archStatus],
      ['Waiver Approved Expiry (before):', ncr.approvedExpiry]
    ];
    /* O relatório de DEV não traz a linha de histórico; a de NCR traz sempre,
       mesmo vazia, como no original. */
    if (c.showHistoric || clean(ncr.historic)) rows.push(['Waiver Historic: ', ncr.historic]);
    rows.forEach(function (r) {
      status.appendChild(el('div', 'rep-status-row', r[0] + (r[1] || '')));
    });
    p.appendChild(status);

    /* certificados impactados, à esquerda */
    var certs = (ncr.certificates || []).filter(function (c) { return (c || '').trim(); });
    if (certs.length) {
      var cert = el('div', 'rep-cert');
      cert.setAttribute('data-fluido', '');
      cert.appendChild(el('div', 'rep-cert-head', 'Certificate Impacted:'));
      certs.forEach(function (c) { cert.appendChild(el('div', 'rep-cert-row', c)); });
      p.appendChild(cert);
    }

    /* O rodapé repete em toda folha do item. Fica dentro da folha desde já,
       para entrar na conta da paginação em vez de estourá-la depois. */
    var rodape = null;
    if (project.footer) {
      rodape = el('div', 'rep-footer', project.footer);
      p.appendChild(rodape);
    }
    return { pag: p, rodape: rodape, nav: nav.cloneNode(true), titulo: p.querySelector('.rep-title').textContent };
  }

  /** Folha seguinte de um item, quando o texto não cabe numa só. */
  function itemContinuacao(info) {
    var p = page(false);
    p.classList.add('rep-page--cont');
    p.appendChild(info.nav.cloneNode(true));
    p.appendChild(el('div', 'rep-title', info.titulo + ' (cont.)'));
    return p;
  }

  /* --- páginas de evidência (paisagem) ---------------------------------- */

  function buildEvidencePage(project, ncr, ev, scope) {
    var p = page(ev.orientation !== 'portrait');
    p.classList.add('rep-page--evidence');
    p.id = anchorEvid(scope, ev);

    var head = el('div', 'rep-evidence-head');
    var back = el('a', null, 'Back to ' + (ncr.ncrId || 'NCR'));
    back.href = '#' + anchorNcr(scope, ncr);
    head.appendChild(back);
    head.appendChild(el('br'));
    head.appendChild(el('span', 'rep-evidence-ref', 'Reference: ' + (ev.ref || '')));
    p.appendChild(head);

    if (ev.note) p.appendChild(el('div', 'rep-evidence-note', ev.note));

    /* Imagem que ainda não veio da pasta não vira um quadro quebrado no
       PDF: fica de fora até o conteúdo chegar. */
    var fotos = ev.images.filter(function (img) { return img.src; });
    var n = fotos.length;
    var grid = el('div', 'rep-evidence-grid');
    grid.setAttribute('data-count', n <= 6 ? String(n) : 'many');
    fotos.forEach(function (img) {
      var fig = el('figure', 'rep-evidence-fig');
      fig.style.margin = '0';
      var im = document.createElement('img');
      im.src = img.src;
      im.alt = img.caption || ('Evidência de ' + (ncr.ncrId || ''));
      fig.appendChild(im);
      if (img.caption) fig.appendChild(el('figcaption', 'rep-evidence-caption', img.caption));
      grid.appendChild(fig);
    });
    p.appendChild(grid);
    return p;
  }

  /* --- montagem completa ------------------------------------------------ */

  /**
   * Monta um relatório dentro de `target`.
   * `opts.append` acrescenta em vez de substituir, para juntar vários
   * relatórios num único PDF.
   */
  function build(project, target, kind, opts) {
    var root = target || document.createElement('div');
    if (!opts || !opts.append) { root.innerHTML = ''; zerarContagem(); }
    var scope = scopeOf(project, kind);
    var medida = abrirMedida(root);
    var folhas = [];
    try {
      var capa = buildCover(project, kind, scope);
      var fazCapa = function () { return capaContinuacao(capa.titulo); };
      root.appendChild(capa.pag);
      var pagsCapa = paginar(capa.pag, root, fazCapa);
      if (capa.data) {
        var ultima = pagsCapa[pagsCapa.length - 1];
        ultima.appendChild(capa.data);
        paginar(ultima, root, fazCapa);
      }

      items(project, kind).forEach(function (ncr) {
        var info = buildNcrPage(project, ncr, kind, scope);
        root.appendChild(info.pag);
        var pags = paginar(info.pag, root, function () { return itemContinuacao(info); }, info.rodape);
        if (pags.length > 1) folhas.push({ id: ncr.id, ncrId: ncr.ncrId, kind: kind, folhas: pags.length });
        ncr.evidence.forEach(function (ev) {
          if (ev.images.length || ev.note) {
            root.appendChild(buildEvidencePage(project, ncr, ev, scope));
          }
        });
      });
    } finally {
      fecharMedida(medida);
    }
    ultimaContagem = ultimaContagem.concat(folhas);
    return root;
  }

  /* Itens que passaram de uma folha na última montagem — o editor usa isso
     para avisar antes de exportar, em vez de a surpresa aparecer no PDF. */
  var ultimaContagem = [];
  function zerarContagem() { ultimaContagem = []; }
  function itensLongos() { return ultimaContagem.slice(); }

  /** Monta vários relatórios em sequência, cada um começando na sua capa. */
  function buildMany(selection, target) {
    var root = target || document.createElement('div');
    root.innerHTML = '';
    zerarContagem();
    selection.forEach(function (sel) {
      build(sel.project, root, sel.kind, { append: true });
    });
    return root;
  }

  /* Os backups circulam várias vezes ao dia pela pasta de rede: só a data
     deixaria dois arquivos do mesmo dia indistinguíveis na hora de escolher. */
  function timeStamp(withTime) {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var s = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    if (withTime) s += '_' + pad(d.getHours()) + 'h' + pad(d.getMinutes());
    return s;
  }

  /** Nome de arquivo sugerido, no estilo WaiverRequest_RANAE_J06_20251001 */
  function suggestedFileName(project, ext, kind) {
    var stamp = timeStamp(ext === 'json');
    var marco = (marcoOf(project, kind) || project.name || 'Relatorio')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    var prefix = kind === 'dev' ? 'DEV_WaiverRequest_' : 'WaiverRequest_';
    return prefix + (marco || 'Relatorio') + '_' + stamp + '.' + ext;
  }

  global.Report = {
    build: build,
    /* A paginação serve a qualquer folha montada por aqui — o resumo e os
       fluxos usam a mesma, para não repetirem o erro de transbordar. */
    paginar: paginar,
    abrirMedida: abrirMedida,
    fecharMedida: fecharMedida,
    itensLongos: itensLongos,
    zerarContagem: zerarContagem,
    buildMany: buildMany,
    ncrLabel: ncrLabel,
    suggestedFileName: suggestedFileName,
    timeStamp: timeStamp,
    items: items,
    marcoOf: marcoOf,
    conf: conf,
    SECTIONS: SECTIONS
  };
})(window);
