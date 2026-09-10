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
  function items(project, kind) { return project[conf(kind).key] || []; }

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

  /* --- capa / índice ---------------------------------------------------- */

  function buildCover(project, kind, scope) {
    var c = conf(kind);
    var p = page(false);
    p.id = anchorCover(scope);

    var title = clean(project[c.coverTitleField]) || 'Waiver Request For';
    p.appendChild(el('div', 'rep-cover-title', (title + ' ' + marcoOf(project, kind)).trim()));
    p.appendChild(el('div', 'rep-cover-subtitle', project.coverSubtitle || 'List of Waiver Requested :'));

    var list = el('div', 'rep-index');
    var rows = items(project, kind);
    rows.forEach(function (ncr) {
      var item = el('p', 'rep-index-item');
      var a = el('a', null, (ncr.ncrId || '(sem número)'));
      a.href = '#' + anchorNcr(scope, ncr);
      item.appendChild(a);
      var rest = (kind === 'dev' ? [ncr.func] : [ncr.systems, ncr.func])
        .map(clean).filter(Boolean).join('|');
      if (rest) item.appendChild(document.createTextNode(c.indexSeparator + rest));
      list.appendChild(item);
    });
    if (!rows.length) {
      list.appendChild(el('p', 'rep-index-item', 'Nenhum item cadastrado.'));
    }
    p.appendChild(list);

    /* data de emissão, discreta no rodapé da capa — pode ser desligada */
    if (project.showCoverDate !== false) {
      p.appendChild(el('div', 'rep-cover-date',
        'Gerado em ' + new Date().toLocaleDateString('pt-BR')));
    }
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
      wrap.appendChild(el('div', 'rep-section-head', sec.label));
      wrap.appendChild(el('div', 'rep-section-body', ncr[sec.key] || ''));
      p.appendChild(wrap);
    });

    /* bloco de status, à direita */
    var status = el('div', 'rep-status');
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
      cert.appendChild(el('div', 'rep-cert-head', 'Certificate Impacted:'));
      certs.forEach(function (c) { cert.appendChild(el('div', 'rep-cert-row', c)); });
      p.appendChild(cert);
    }

    if (project.footer) p.appendChild(el('div', 'rep-footer', project.footer));
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

    var n = ev.images.length;
    var grid = el('div', 'rep-evidence-grid');
    grid.setAttribute('data-count', n <= 6 ? String(n) : 'many');
    ev.images.forEach(function (img) {
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
    if (!opts || !opts.append) root.innerHTML = '';
    var scope = scopeOf(project, kind);
    root.appendChild(buildCover(project, kind, scope));
    items(project, kind).forEach(function (ncr) {
      root.appendChild(buildNcrPage(project, ncr, kind, scope));
      ncr.evidence.forEach(function (ev) {
        if (ev.images.length || ev.note) {
          root.appendChild(buildEvidencePage(project, ncr, ev, scope));
        }
      });
    });
    return root;
  }

  /** Monta vários relatórios em sequência, cada um começando na sua capa. */
  function buildMany(selection, target) {
    var root = target || document.createElement('div');
    root.innerHTML = '';
    selection.forEach(function (sel) {
      build(sel.project, root, sel.kind, { append: true });
    });
    return root;
  }

  /** Nome de arquivo sugerido, no estilo SBR3_WaiverRequest_RANAE_J06_20251001 */
  function suggestedFileName(project, ext, kind) {
    var d = new Date();
    var stamp = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    var marco = (marcoOf(project, kind) || project.name || 'Relatorio')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    var prefix = kind === 'dev' ? 'DEV_WaiverRequest_' : 'WaiverRequest_';
    return prefix + (marco || 'Relatorio') + '_' + stamp + '.' + ext;
  }

  global.Report = {
    build: build,
    buildMany: buildMany,
    ncrLabel: ncrLabel,
    suggestedFileName: suggestedFileName,
    items: items,
    marcoOf: marcoOf,
    conf: conf,
    SECTIONS: SECTIONS
  };
})(window);
