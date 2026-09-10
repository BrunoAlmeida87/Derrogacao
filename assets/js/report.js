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

  /** Rótulo completo da NCR: "NCR-...|RM|FV 01 - Sea water circuit integrity" */
  function ncrLabel(ncr) {
    return [ncr.ncrId, ncr.systems, ncr.func]
      .map(function (s) { return (s || '').trim(); })
      .filter(Boolean)
      .join('|');
  }

  function anchorNcr(ncr)  { return 'ncr-' + ncr.id; }
  function anchorEvid(ev)  { return 'evid-' + ev.id; }

  function page(landscape) {
    var p = el('section', 'rep-page' + (landscape ? ' rep-page--landscape' : ''));
    return p;
  }

  /* --- capa / índice ---------------------------------------------------- */

  function buildCover(project) {
    var p = page(false);
    p.id = 'rep-cover';

    var title = (project.coverTitle || 'Waiver Request For').trim();
    var marco = (project.marco || '').trim();
    p.appendChild(el('div', 'rep-cover-title', (title + ' ' + marco).trim()));
    p.appendChild(el('div', 'rep-cover-subtitle', project.coverSubtitle || 'List of Waiver Requested :'));

    var list = el('div', 'rep-index');
    project.ncrs.forEach(function (ncr) {
      var item = el('p', 'rep-index-item');
      var a = el('a', null, (ncr.ncrId || '(sem número)'));
      a.href = '#' + anchorNcr(ncr);
      item.appendChild(a);
      var rest = [ncr.systems, ncr.func]
        .map(function (s) { return (s || '').trim(); })
        .filter(Boolean)
        .join('|');
      if (rest) item.appendChild(document.createTextNode('|' + rest));
      list.appendChild(item);
    });
    if (!project.ncrs.length) {
      list.appendChild(el('p', 'rep-index-item', 'Nenhuma NCR cadastrada.'));
    }
    p.appendChild(list);
    return p;
  }

  /* --- página de uma NCR ------------------------------------------------ */

  function buildNcrPage(project, ncr) {
    var p = page(false);
    p.id = anchorNcr(ncr);

    /* linha de navegação: "Go to Evidence" (esq.) e "Go Back" (dir.) */
    var nav = el('div', 'rep-nav');
    var firstEvid = ncr.evidence.filter(function (e) { return e.images.length || e.note; })[0];
    if (firstEvid) {
      var goEv = el('a', null, 'Go to Evidence');
      goEv.href = '#' + anchorEvid(firstEvid);
      nav.appendChild(goEv);
    } else {
      nav.appendChild(el('span', 'rep-nav-spacer', '.'));
    }
    var back = el('a', null, 'Go Back');
    back.href = '#rep-cover';
    nav.appendChild(back);
    p.appendChild(nav);

    p.appendChild(el('div', 'rep-title', 'Waiver Request for ' + ncrLabel(ncr)));

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
      ['Waiver Approved Expiry (before):', ncr.approvedExpiry],
      ['Waiver Historic: ', ncr.historic]
    ];
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

  function buildEvidencePage(project, ncr, ev) {
    var p = page(ev.orientation !== 'portrait');
    p.classList.add('rep-page--evidence');
    p.id = anchorEvid(ev);

    var head = el('div', 'rep-evidence-head');
    var back = el('a', null, 'Back to ' + (ncr.ncrId || 'NCR'));
    back.href = '#' + anchorNcr(ncr);
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

  function build(project, target) {
    var root = target || document.createElement('div');
    root.innerHTML = '';
    root.appendChild(buildCover(project));
    project.ncrs.forEach(function (ncr) {
      root.appendChild(buildNcrPage(project, ncr));
      ncr.evidence.forEach(function (ev) {
        if (ev.images.length || ev.note) root.appendChild(buildEvidencePage(project, ncr, ev));
      });
    });
    return root;
  }

  /** Nome de arquivo sugerido, no estilo SBR3_WaiverRequest_RANAE_J06_20251001 */
  function suggestedFileName(project, ext) {
    var d = new Date();
    var stamp = d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    var marco = (project.marco || project.name || 'Relatorio')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return 'WaiverRequest_' + (marco || 'Relatorio') + '_' + stamp + '.' + ext;
  }

  global.Report = {
    build: build,
    ncrLabel: ncrLabel,
    suggestedFileName: suggestedFileName,
    SECTIONS: SECTIONS
  };
})(window);
