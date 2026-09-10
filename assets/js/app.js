/* ==========================================================================
   app.js — interface do editor de relatórios de derrogação
   ========================================================================== */

(function () {
  'use strict';

  var MAX_IMAGE_DIM = 1600;   // px — imagens maiores são reduzidas
  var JPEG_QUALITY = 0.85;

  var state = {
    projects: [],
    project: null,
    kind: 'ncr',     // aba ativa: 'ncr' ou 'dev'
    ncrId: null,     // id do item selecionado na aba NCR
    devId: null      // id do item selecionado na aba DEV
  };

  var isDev = function () { return state.kind === 'dev'; };
  /** Lista de itens da aba ativa. */
  var items = function () {
    return state.project ? state.project[Store.itemsKey(state.kind)] : [];
  };
  /** Nome da aba, para textos da interface. */
  var kindName = function () { return isDev() ? 'DEV' : 'NCR'; };
  var selectedId = function () { return isDev() ? state.devId : state.ncrId; };
  var setSelectedId = function (id) {
    if (isDev()) state.devId = id; else state.ncrId = id;
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------------------------------------------------------------- */
  /* utilidades                                                             */
  /* ---------------------------------------------------------------------- */

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  var saveTimer = null;
  function markSaving() {
    var s = $('#saveState');
    s.dataset.state = 'saving';
    s.textContent = 'salvando…';
  }
  function markSaved() {
    var s = $('#saveState');
    s.dataset.state = 'saved';
    s.textContent = 'salvo no navegador';
    updateStorageInfo(s);
  }

  /* Mostra, na dica do indicador, quanto espaço os relatórios ocupam. */
  function updateStorageInfo(node) {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (est) {
      if (!est || !est.usage) return;
      var mb = (est.usage / 1048576).toFixed(1);
      node.title = 'Dados guardados neste navegador: ' + mb + ' MB' +
        (est.quota ? ' de ~' + (est.quota / 1048576).toFixed(0) + ' MB disponíveis' : '') +
        '.\nFaça backup em arquivo para não depender do cache do navegador.';
    }).catch(function () { /* estimativa é opcional */ });
  }

  /* Pede ao navegador para não descartar os dados ao limpar o cache. */
  function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (already) {
        if (!already) return navigator.storage.persist();
      }).catch(function () { /* sem suporte: segue com armazenamento comum */ });
    }
  }
  function markError(e) {
    var s = $('#saveState');
    s.dataset.state = 'error';
    s.textContent = 'erro ao salvar';
    console.error(e);
  }

  /** Grava o projeto atual com atraso, para não escrever a cada tecla. */
  function scheduleSave() {
    if (!state.project) return;
    markSaving();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    if (!state.project) return Promise.resolve();
    return Store.save(state.project).then(function () {
      markSaved();
      refreshProjectSelect();
      renderTabs();
    }).catch(markError);
  }

  function currentNcr() {
    var id = selectedId();
    if (!state.project || !id) return null;
    return items().filter(function (n) { return n.id === id; })[0] || null;
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* ---------------------------------------------------------------------- */
  /* seletor de relatórios                                                  */
  /* ---------------------------------------------------------------------- */

  function refreshProjectSelect() {
    var sel = $('#projectSelect');
    sel.innerHTML = '';
    state.projects.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = (p.marco || p.name || 'sem nome') +
        ' (' + p.ncrs.length + ' NCR · ' + p.devs.length + ' DEV)';
      sel.appendChild(o);
    });
    if (state.project) sel.value = state.project.id;
  }

  function loadProject(project) {
    state.project = project;
    var idx = state.projects.findIndex(function (p) { return p.id === project.id; });
    if (idx >= 0) state.projects[idx] = project; else state.projects.unshift(project);
    state.ncrId = project.ncrs.length ? project.ncrs[0].id : null;
    state.devId = project.devs.length ? project.devs[0].id : null;
    $('#footerInput').value = project.footer;
    refreshProjectSelect();
    renderTabs();
    renderNcrList();
    renderEditor();
    markSaved();
  }

  /* --- abas NCR / DEV --------------------------------------------------- */

  function renderTabs() {
    if (!state.project) return;
    $$('.tab').forEach(function (t) {
      var on = t.dataset.kind === state.kind;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      var n = state.project[Store.itemsKey(t.dataset.kind)].length;
      $('.tab-count', t).textContent = n;
    });

    /* o marco é próprio de cada aba; o da DEV herda o da NCR quando vazio */
    var input = $('#marcoInput');
    input.value = isDev() ? state.project.marcoDev : state.project.marco;
    input.placeholder = isDev() ? (state.project.marco || 'J05 DQR') : 'RANAE J06';
    $('#marcoLabel').textContent = isDev() ? 'Marco (DEV)' : 'Marco (NCR)';

    var t = kindName();
    $('#addNcrBtn').textContent = '+ Nova ' + t;
    $('#addNcrBtn').title = 'Adicionar ' + t + ' a este relatório';
    $('#sidebarTitle').textContent = t + 's';
    $('#ncrFilter').placeholder = 'Filtrar ' + t + 's…';
    $('#previewBtn').textContent = 'Pré-visualizar ' + t;
    $('#pdfBtn').textContent = 'Exportar PDF (' + t + ')';
  }

  function switchKind(kind) {
    if (state.kind === kind) return;
    state.kind = kind;
    renderTabs();
    renderNcrList();
    renderEditor();
    $('#editorScroll').scrollTop = 0;
  }

  /* ---------------------------------------------------------------------- */
  /* lista lateral de NCRs                                                  */
  /* ---------------------------------------------------------------------- */

  var dragFrom = null;

  function renderNcrList() {
    var ul = $('#ncrList');
    ul.innerHTML = '';
    var rows = items();
    var term = $('#ncrFilter').value.trim().toLowerCase();

    if (!state.project || !rows.length) {
      $('#sidebarEmpty').hidden = false;
      $('#sidebarEmptyKind').textContent = kindName();
      ul.hidden = true;
      return;
    }
    $('#sidebarEmpty').hidden = true;
    ul.hidden = false;

    rows.forEach(function (ncr, i) {
      var hay = (ncr.ncrId + ' ' + ncr.systems + ' ' + ncr.func).toLowerCase();
      if (term && hay.indexOf(term) === -1) return;

      var li = el('li', 'ncr-item');
      li.tabIndex = 0;
      li.draggable = true;
      li.dataset.id = ncr.id;
      if (ncr.id === selectedId()) li.setAttribute('aria-current', 'true');

      li.appendChild(el('span', 'ncr-item-num', String(i + 1)));

      var main = el('div', 'ncr-item-main');
      main.appendChild(el('div', 'ncr-item-id', ncr.ncrId || '(sem número)'));
      var sub = (isDev() ? [ncr.func] : [ncr.systems, ncr.func]).filter(Boolean).join(' | ');
      main.appendChild(el('div', 'ncr-item-sub', sub || 'sem descrição'));
      li.appendChild(main);

      var imgCount = ncr.evidence.reduce(function (s, e) { return s + e.images.length; }, 0);
      if (imgCount) li.appendChild(el('span', 'ncr-item-badge', '🖼 ' + imgCount));

      li.addEventListener('click', function () { selectNcr(ncr.id); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNcr(ncr.id); }
      });

      li.addEventListener('dragstart', function (e) {
        dragFrom = ncr.id;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', ncr.id); } catch (err) { /* Safari */ }
      });
      li.addEventListener('dragover', function (e) {
        if (!dragFrom || dragFrom === ncr.id) return;
        e.preventDefault();
        li.classList.add('is-dragover');
      });
      li.addEventListener('dragleave', function () { li.classList.remove('is-dragover'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('is-dragover');
        moveNcr(dragFrom, ncr.id);
        dragFrom = null;
      });
      li.addEventListener('dragend', function () {
        dragFrom = null;
        $$('.ncr-item').forEach(function (n) { n.classList.remove('is-dragover'); });
      });

      ul.appendChild(li);
    });
  }

  function moveNcr(fromId, toId) {
    var list = items();
    var from = list.findIndex(function (n) { return n.id === fromId; });
    var to = list.findIndex(function (n) { return n.id === toId; });
    if (from < 0 || to < 0 || from === to) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    renderNcrList();
    scheduleSave();
  }

  function selectNcr(id) {
    setSelectedId(id);
    renderNcrList();
    renderEditor();
    $('#editorScroll').scrollTop = 0;
  }

  function addNcr() {
    var ncr = Store.newNcr();
    items().push(ncr);
    setSelectedId(ncr.id);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
    var f = $('#f-ncrId');
    if (f) f.focus();
  }

  function duplicateNcr() {
    var ncr = currentNcr();
    if (!ncr) return;
    var copy = Store.normalizeNcr(JSON.parse(JSON.stringify(ncr)));
    copy.id = Store.uid();
    copy.ncrId = ncr.ncrId ? ncr.ncrId + ' (cópia)' : '';
    copy.evidence.forEach(function (ev) {
      ev.id = Store.uid();
      ev.images.forEach(function (im) { im.id = Store.uid(); });
    });
    var list = items();
    var at = list.findIndex(function (n) { return n.id === ncr.id; });
    list.splice(at + 1, 0, copy);
    setSelectedId(copy.id);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
  }

  function deleteNcr() {
    var ncr = currentNcr();
    if (!ncr) return;
    if (!confirm('Excluir a ' + kindName() + ' "' + (ncr.ncrId || 'sem número') + '" e todas as suas evidências?')) return;
    var list = items();
    var at = list.findIndex(function (n) { return n.id === ncr.id; });
    list.splice(at, 1);
    setSelectedId(list.length ? list[Math.min(at, list.length - 1)].id : null);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
  }

  /* ---------------------------------------------------------------------- */
  /* formulário da NCR                                                      */
  /* ---------------------------------------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Campo de texto ligado a uma propriedade da NCR. */
  function field(label, key, opts) {
    opts = opts || {};
    var ncr = currentNcr();
    var wrap = el('div', 'field');
    var id = 'f-' + key;
    var lab = el('label', null, label);
    lab.htmlFor = id;
    wrap.appendChild(lab);

    var input;
    if (opts.rows) {
      input = document.createElement('textarea');
      input.rows = opts.rows;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = id;
    input.value = ncr[key] || '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener('input', function () {
      var n = currentNcr();
      if (!n) return;
      n[key] = input.value;
      if (opts.refreshList) renderNcrList();
      scheduleSave();
    });
    wrap.appendChild(input);
    if (opts.hint) wrap.appendChild(el('div', 'hint', opts.hint));
    return wrap;
  }

  function card(title, swatchColor) {
    var c = el('div', 'card');
    var h = el('h3');
    if (swatchColor) {
      var sw = el('span', 'swatch');
      sw.style.background = swatchColor;
      h.appendChild(sw);
    }
    h.appendChild(document.createTextNode(title));
    c.appendChild(h);
    return c;
  }

  function renderEditor() {
    var host = $('#editorScroll');
    host.innerHTML = '';
    var ncr = currentNcr();

    if (!state.project) return;
    if (!ncr) {
      var empty = el('div', 'editor-empty');
      empty.appendChild(el('p', null, 'Nenhuma NCR selecionada.'));
      empty.appendChild(el('p', null, 'Use “+ Nova NCR” no painel à esquerda para começar, ou carregue um backup existente.'));
      host.appendChild(empty);
      return;
    }

    /* --- identificação --- */
    var idCard = card('Identificação da ' + kindName(), '#4B0082');
    var watched;
    if (isDev()) {
      /* A DEV junta sistema e descrição num campo só, como no original. */
      var gd = el('div', 'grid grid--2');
      gd.appendChild(field('Número da DEV', 'ncrId', {
        placeholder: 'DEV-78154', refreshList: true
      }));
      gd.appendChild(field('Sistema e descrição', 'func', {
        placeholder: 'BQ - Modification des compensateurs', refreshList: true,
        hint: 'Sai no título como DEV-78154|BQ - Modification des compensateurs.'
      }));
      idCard.appendChild(gd);
      watched = ['f-ncrId', 'f-func'];
    } else {
      var g = el('div', 'grid grid--3');
      g.appendChild(field('Número da NCR', 'ncrId', {
        placeholder: 'NCR-ICN-ESC-13-1098-2023', refreshList: true
      }));
      g.appendChild(field('Sistema(s)', 'systems', {
        placeholder: 'RM   ou   BX,BQ,BD', refreshList: true
      }));
      g.appendChild(field('Função', 'func', {
        placeholder: 'FV 01 - Sea water circuit integrity', refreshList: true
      }));
      idCard.appendChild(g);
      watched = ['f-ncrId', 'f-systems', 'f-func'];
    }
    var prev = el('div', 'hint');
    prev.style.marginTop = '10px';
    prev.textContent = 'Título gerado: Waiver Request for ' + Report.ncrLabel(ncr, state.kind);
    idCard.appendChild(prev);
    watched.forEach(function (fid) {
      var input = $('#' + fid, idCard);
      if (input) input.addEventListener('input', function () {
        prev.textContent = 'Título gerado: Waiver Request for ' + Report.ncrLabel(currentNcr(), state.kind);
      });
    });
    host.appendChild(idCard);

    /* --- seções textuais, na ordem e nas cores do relatório --- */
    var textCard = card('Conteúdo da derrogação');
    var stack = el('div', 'stack');
    var defs = [
      ['description',      'Description',                                  '#A9A9A9', 4],
      ['currentSituation', 'Current Situation',                            '#8FBC8B', 6],
      ['whyNotPossible',   'Why is not possible to treat the deviation',   '#FFCCE5', 5],
      ['arguments',        'What are the arguments for the derrogation',   '#CCCCFF', 5],
      ['archAnswer',       'Arch Answer',                                  '#00B4FF', 3]
    ];
    defs.forEach(function (d) {
      var f = field(d[1], d[0], { rows: d[3] });
      var lab = $('label', f);
      var sw = el('span', 'swatch');
      sw.style.cssText = 'display:inline-block;width:11px;height:11px;border:1px solid #999;border-radius:2px;margin-right:6px;vertical-align:middle;background:' + d[2];
      lab.insertBefore(sw, lab.firstChild);
      stack.appendChild(f);
    });
    textCard.appendChild(stack);
    host.appendChild(textCard);

    /* --- status --- */
    var stCard = card('Status do waiver — ' + kindName());
    var g2 = el('div', 'grid grid--2');
    g2.appendChild(field('Waiver Request Expiry (before)', 'requestExpiry', { placeholder: 'PÓS TRAP' }));
    g2.appendChild(field('Arch Status Waiver', 'archStatus', { placeholder: 'WAIVER ACCEPTED' }));
    g2.appendChild(field('Waiver Approved Expiry (before)', 'approvedExpiry', { placeholder: 'PÓS TRAP' }));
    g2.appendChild(field('Waiver Historic', 'historic', {
      rows: 3,
      placeholder: 'J06 To: RANAE J06\nJ06Cer To: RANAE',
      hint: isDev()
        ? 'Opcional na DEV: a linha só aparece no PDF se for preenchida.'
        : 'Uma entrada por linha.'
    }));
    stCard.appendChild(g2);
    stCard.appendChild(renderCertificates());
    host.appendChild(stCard);

    /* --- evidências --- */
    host.appendChild(renderEvidenceCard());
  }

  /* --- certificados ------------------------------------------------------ */

  function renderCertificates() {
    var ncr = currentNcr();
    var wrap = el('div', 'field');
    wrap.style.marginTop = '12px';
    wrap.appendChild(el('label', null, 'Certificate Impacted'));

    var list = el('div', 'row-list');
    function redraw() {
      list.innerHTML = '';
      ncr.certificates.forEach(function (c, i) {
        var line = el('div', 'row-line');
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = c;
        inp.placeholder = 'Shipyard Certificate';
        inp.addEventListener('input', function () {
          currentNcr().certificates[i] = inp.value;
          scheduleSave();
        });
        var del = el('button', 'btn btn--sm btn--danger', '✕');
        del.type = 'button';
        del.title = 'Remover certificado';
        del.addEventListener('click', function () {
          currentNcr().certificates.splice(i, 1);
          redraw();
          scheduleSave();
        });
        line.appendChild(inp);
        line.appendChild(del);
        list.appendChild(line);
      });
      if (!ncr.certificates.length) {
        list.appendChild(el('div', 'hint', 'Nenhum certificado — o bloco não aparecerá no relatório.'));
      }
    }
    redraw();
    wrap.appendChild(list);

    var add = el('button', 'btn btn--sm', '+ Certificado');
    add.type = 'button';
    add.style.alignSelf = 'flex-start';
    add.style.marginTop = '6px';
    add.addEventListener('click', function () {
      currentNcr().certificates.push('');
      redraw();
      scheduleSave();
    });
    wrap.appendChild(add);
    return wrap;
  }

  /* --- evidências -------------------------------------------------------- */

  function renderEvidenceCard() {
    var ncr = currentNcr();
    var c = card('Evidências (páginas de anexo, em paisagem)');
    c.appendChild(el('div', 'hint',
      'Cada anexo vira uma página no fim do relatório, com o link “Go to Evidence” apontando para ela.'));

    var host = el('div');
    host.style.marginTop = '10px';

    function redraw() {
      host.innerHTML = '';
      var n = currentNcr();
      n.evidence.forEach(function (ev, i) { host.appendChild(renderEvidencePage(ev, i, redraw)); });
      if (!n.evidence.length) {
        host.appendChild(el('div', 'hint', 'Nenhuma evidência para esta NCR.'));
      }
      var add = el('button', 'btn btn--sm', '+ Novo anexo');
      add.type = 'button';
      add.style.marginTop = '8px';
      add.addEventListener('click', function () {
        currentNcr().evidence.push(Store.newEvidence(currentNcr().evidence.length + 1));
        redraw();
        renderNcrList();
        scheduleSave();
      });
      host.appendChild(add);
    }
    redraw();
    c.appendChild(host);
    return c;
  }

  function renderEvidencePage(ev, index, redrawAll) {
    var box = el('div', 'evid-page');

    var head = el('div', 'evid-page-head');
    var refField = el('div', 'field');
    refField.appendChild(el('label', null, 'Referência do anexo'));
    var refInput = document.createElement('input');
    refInput.type = 'text';
    refInput.value = ev.ref;
    refInput.placeholder = 'Attachment ' + (index + 1);
    refInput.addEventListener('input', function () { ev.ref = refInput.value; scheduleSave(); });
    refField.appendChild(refInput);
    head.appendChild(refField);

    var list = currentNcr().evidence;

    var up = el('button', 'btn btn--sm', '↑');
    up.type = 'button';
    up.title = 'Mover anexo para cima';
    up.disabled = index === 0;
    up.addEventListener('click', function () {
      var l = currentNcr().evidence;
      l.splice(index - 1, 0, l.splice(index, 1)[0]);
      redrawAll(); scheduleSave();
    });

    var down = el('button', 'btn btn--sm', '↓');
    down.type = 'button';
    down.title = 'Mover anexo para baixo';
    down.disabled = index === list.length - 1;
    down.addEventListener('click', function () {
      var l = currentNcr().evidence;
      l.splice(index + 1, 0, l.splice(index, 1)[0]);
      redrawAll(); scheduleSave();
    });

    var orient = el('div', 'field');
    orient.style.flex = '0 0 130px';
    orient.appendChild(el('label', null, 'Orientação'));
    var orientSel = document.createElement('select');
    [['landscape', 'Paisagem'], ['portrait', 'Retrato']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      orientSel.appendChild(opt);
    });
    orientSel.value = ev.orientation || 'landscape';
    orientSel.addEventListener('change', function () {
      ev.orientation = orientSel.value;
      scheduleSave();
    });
    orient.appendChild(orientSel);
    head.appendChild(orient);

    var del = el('button', 'btn btn--sm btn--danger', 'Excluir anexo');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm('Excluir este anexo e suas imagens?')) return;
      var l = currentNcr().evidence;
      l.splice(l.indexOf(ev), 1);
      redrawAll();
      renderNcrList();
      scheduleSave();
    });

    head.appendChild(up);
    head.appendChild(down);
    head.appendChild(del);
    box.appendChild(head);

    var noteField = el('div', 'field');
    noteField.style.marginBottom = '10px';
    noteField.appendChild(el('label', null, 'Texto explicativo (opcional)'));
    var note = document.createElement('textarea');
    note.rows = 2;
    note.value = ev.note;
    note.placeholder = 'Comentário exibido acima das imagens.';
    note.addEventListener('input', function () { ev.note = note.value; scheduleSave(); });
    noteField.appendChild(note);
    box.appendChild(noteField);

    /* miniaturas */
    var thumbs = el('div', 'evid-thumbs');
    function redrawThumbs() {
      thumbs.innerHTML = '';
      ev.images.forEach(function (img, i) {
        var t = el('div', 'evid-thumb');
        var im = document.createElement('img');
        im.src = img.src;
        im.alt = img.caption || 'Evidência ' + (i + 1);
        t.appendChild(im);

        var cap = document.createElement('input');
        cap.type = 'text';
        cap.value = img.caption;
        cap.placeholder = 'Legenda (opcional)';
        cap.addEventListener('input', function () { img.caption = cap.value; scheduleSave(); });
        t.appendChild(cap);

        var acts = el('div', 'evid-thumb-actions');
        var left = el('button', 'btn btn--icon', '←');
        left.type = 'button'; left.title = 'Mover para a esquerda';
        left.disabled = i === 0;
        left.addEventListener('click', function () {
          ev.images.splice(i - 1, 0, ev.images.splice(i, 1)[0]);
          redrawThumbs(); scheduleSave();
        });
        var right = el('button', 'btn btn--icon', '→');
        right.type = 'button'; right.title = 'Mover para a direita';
        right.disabled = i === ev.images.length - 1;
        right.addEventListener('click', function () {
          ev.images.splice(i + 1, 0, ev.images.splice(i, 1)[0]);
          redrawThumbs(); scheduleSave();
        });
        var rm = el('button', 'btn btn--icon btn--danger', '✕');
        rm.type = 'button'; rm.title = 'Remover imagem';
        rm.addEventListener('click', function () {
          ev.images.splice(i, 1);
          redrawThumbs(); renderNcrList(); scheduleSave();
        });
        acts.appendChild(left); acts.appendChild(right); acts.appendChild(rm);
        t.appendChild(acts);
        thumbs.appendChild(t);
      });
      thumbs.hidden = !ev.images.length;
    }
    redrawThumbs();
    box.appendChild(thumbs);

    /* área de upload */
    var drop = el('div', 'evid-drop', 'Clique para escolher imagens, cole (Ctrl+V) ou arraste os arquivos aqui.');
    var picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.hidden = true;

    function ingest(files) {
      var imgs = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
      if (!imgs.length) return;
      drop.textContent = 'Processando ' + imgs.length + ' imagem(ns)…';
      Promise.all(imgs.map(fileToCompressedDataUrl)).then(function (srcs) {
        srcs.forEach(function (src) {
          ev.images.push({ id: Store.uid(), src: src, caption: '' });
        });
        drop.textContent = 'Clique para escolher imagens, cole (Ctrl+V) ou arraste os arquivos aqui.';
        redrawThumbs();
        renderNcrList();
        scheduleSave();
      }).catch(function (e) {
        console.error(e);
        drop.textContent = 'Não foi possível ler alguma imagem. Tente novamente.';
        toast('Falha ao carregar imagem.');
      });
    }

    drop.addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', function () { ingest(picker.files); picker.value = ''; });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('is-over');
      if (e.dataTransfer && e.dataTransfer.files) ingest(e.dataTransfer.files);
    });
    drop.addEventListener('paste', function (e) {
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
        e.preventDefault();
        ingest(e.clipboardData.files);
      }
    });
    drop.tabIndex = 0;

    box.appendChild(drop);
    box.appendChild(picker);
    return box;
  }

  /** Lê o arquivo, reduz a imagem se necessário e devolve um data URL. */
  function fileToCompressedDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(reader.error); };
      reader.onload = function () {
        var dataUrl = String(reader.result);
        var img = new Image();
        img.onerror = function () { resolve(dataUrl); };  // formato exótico: guarda como veio
        img.onload = function () {
          var scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
          if (scale === 1 && dataUrl.length < 700000) { resolve(dataUrl); return; }
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
          } catch (e) {
            resolve(dataUrl);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* copiar NCRs de outro relatório                                          */
  /* ---------------------------------------------------------------------- */

  /* Um marco novo costuma repetir NCRs do marco anterior; isto evita
     redigitar tudo. As NCRs entram como cópias independentes. */
  function openCopyDialog() {
    var key = Store.itemsKey(state.kind);
    var others = state.projects.filter(function (p) {
      return p.id !== state.project.id && p[key].length;
    });
    var dlg = $('#copyDialog');
    var body = $('#copyBody');
    body.innerHTML = '';

    if (!others.length) {
      body.appendChild(el('p', null,
        'Não há outro relatório com ' + kindName() + 's neste navegador. Crie outro relatório ou restaure um backup primeiro.'));
      $('#copyGoBtn').disabled = true;
      dlg.showModal();
      return;
    }
    $('#copyGoBtn').disabled = false;

    var pick = el('div', 'field');
    pick.appendChild(el('label', null, 'Copiar ' + kindName() + 's de'));
    var sel = document.createElement('select');
    others.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = (p.marco || p.name) + ' — ' + p[key].length + ' ' + kindName();
      sel.appendChild(o);
    });
    pick.appendChild(sel);
    body.appendChild(pick);

    var listBox = el('div');
    listBox.style.cssText = 'margin-top:12px;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:8px';
    body.appendChild(listBox);

    var withImages = document.createElement('input');
    withImages.type = 'checkbox';
    withImages.checked = true;
    var wiLabel = el('label');
    wiLabel.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:10px;font-size:13px';
    wiLabel.appendChild(withImages);
    wiLabel.appendChild(document.createTextNode('Copiar também as imagens de evidência'));
    body.appendChild(wiLabel);

    function drawList() {
      listBox.innerHTML = '';
      var src = others.filter(function (p) { return p.id === sel.value; })[0];
      var all = el('label');
      all.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600;margin-bottom:6px';
      var allCb = document.createElement('input');
      allCb.type = 'checkbox';
      allCb.checked = true;
      all.appendChild(allCb);
      all.appendChild(document.createTextNode('Selecionar todas'));
      listBox.appendChild(all);

      src[key].forEach(function (n) {
        var row = el('label');
        row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;font-size:13px;padding:3px 0';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.value = n.id;
        cb.className = 'copy-ncr';
        row.appendChild(cb);
        var extra = isDev() ? n.func : n.systems;
        row.appendChild(document.createTextNode((n.ncrId || '(sem número)') +
          (extra ? ' | ' + extra : '')));
        listBox.appendChild(row);
      });

      allCb.addEventListener('change', function () {
        $$('.copy-ncr', listBox).forEach(function (cb) { cb.checked = allCb.checked; });
      });
    }
    drawList();
    sel.addEventListener('change', drawList);

    dlg.returnValue = '';
    dlg.showModal();

    $('#copyGoBtn').onclick = function () {
      var src = others.filter(function (p) { return p.id === sel.value; })[0];
      var wanted = $$('.copy-ncr', listBox)
        .filter(function (cb) { return cb.checked; })
        .map(function (cb) { return cb.value; });
      if (!wanted.length) { dlg.close(); return; }

      wanted.forEach(function (id) {
        var origin = src[key].filter(function (n) { return n.id === id; })[0];
        var copy = Store.normalizeNcr(JSON.parse(JSON.stringify(origin)));
        copy.id = Store.uid();
        if (!withImages.checked) copy.evidence = [];
        copy.evidence.forEach(function (evd) {
          evd.id = Store.uid();
          evd.images.forEach(function (im) { im.id = Store.uid(); });
        });
        items().push(copy);
      });

      dlg.close();
      setSelectedId(items()[items().length - 1].id);
      renderTabs();
      renderNcrList();
      renderEditor();
      scheduleSave();
      toast(wanted.length + ' ' + kindName() + '(s) copiada(s) de "' + (src.marco || src.name) + '".');
    };
  }

  /* ---------------------------------------------------------------------- */
  /* verificação de campos vazios                                            */
  /* ---------------------------------------------------------------------- */

  var REQUIRED = [
    ['ncrId', 'número'],
    ['func', 'função / descrição'],
    ['description', 'Description'],
    ['currentSituation', 'Current Situation'],
    ['whyNotPossible', 'Why is not possible to treat the deviation'],
    ['arguments', 'What are the arguments for the derrogation']
  ];

  /** Lista o que está faltando, para avisar antes de exportar. */
  function findGaps() {
    var gaps = [];
    var t = kindName();
    if (!Report.marcoOf(state.project, state.kind)) {
      gaps.push({ ncr: null, what: 'O marco do relatório de ' + t + ' está vazio.' });
    }
    items().forEach(function (n, i) {
      var missing = REQUIRED
        .filter(function (r) { return !(n[r[0]] || '').trim(); })
        .map(function (r) { return r[1]; });
      if (missing.length) {
        gaps.push({
          ncr: n,
          what: t + ' ' + (i + 1) + ' (' + (n.ncrId || 'sem número') + '): ' + missing.join(', ') + '.'
        });
      }
    });
    if (!items().length) gaps.push({ ncr: null, what: 'O relatório de ' + t + ' não tem nenhum item.' });
    return gaps;
  }

  function renderGaps() {
    var host = $('#pdfGaps');
    host.innerHTML = '';
    var gaps = findGaps();
    if (!gaps.length) {
      host.appendChild(el('p', null, '✓ Todos os campos essenciais estão preenchidos.'));
      return;
    }
    host.appendChild(el('p', null, 'Atenção — itens em branco sairão vazios no PDF:'));
    var ul = document.createElement('ul');
    ul.style.cssText = 'margin:0 0 12px;padding-left:20px;line-height:1.6;max-height:150px;overflow:auto';
    gaps.forEach(function (g) {
      var li = document.createElement('li');
      if (g.ncr) {
        var a = document.createElement('a');
        a.href = '#';
        a.textContent = g.what;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          $('#pdfDialog').close();
          selectNcr(g.ncr.id);
        });
        li.appendChild(a);
      } else {
        li.textContent = g.what;
      }
      ul.appendChild(li);
    });
    host.appendChild(ul);
  }

  /* ---------------------------------------------------------------------- */
  /* pré-visualização e exportação em PDF                                   */
  /* ---------------------------------------------------------------------- */

  function buildPrintRoot() {
    var root = $('#printRoot');
    Report.build(state.project, root, state.kind);
    return root;
  }

  function openPreview() {
    if (!state.project) return;
    var stage = $('#previewStage');
    Report.build(state.project, stage, state.kind);
    $('#previewKind').textContent = 'Relatório de ' + kindName();
    $('#preview').hidden = false;
    document.body.style.overflow = 'hidden';
    applyZoom();
  }

  /* A folha A4 é mais larga que muitas telas; o zoom deixa ver a página
     inteira sem rolagem horizontal. */
  function applyZoom() {
    var z = Number($('#zoomRange').value) / 100;
    $('#zoomLabel').textContent = Math.round(z * 100) + '%';
    $$('#previewStage .rep-page').forEach(function (pg) {
      pg.style.transform = 'scale(' + z + ')';
      pg.style.transformOrigin = 'top center';
      /* compensa o espaço que a escala deixa sobrando abaixo da folha */
      var h = pg.classList.contains('rep-page--landscape') ? 210 : 297;
      pg.style.marginBottom = (24 - h * (1 - z) * 3.78) + 'px';
    });
  }

  function closePreview() {
    $('#preview').hidden = true;
    $('#previewStage').innerHTML = '';
    document.body.style.overflow = '';
  }

  function exportPdf() {
    if (!state.project) return;
    buildPrintRoot();
    renderGaps();
    $('#pdfKind').textContent = kindName();
    $('#pdfDialog').showModal();
  }

  function doPrint() {
    $('#pdfDialog').close();
    var title = document.title;
    document.title = Report.suggestedFileName(state.project, 'pdf', state.kind).replace(/\.pdf$/, '');
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = title; }, 500);
    }, 60);
  }

  /* ---------------------------------------------------------------------- */
  /* backup / restauração                                                   */
  /* ---------------------------------------------------------------------- */

  function exportBackup(all) {
    var projects = all ? state.projects : [state.project];
    var data = Store.toBackup(projects);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var name = all
      ? 'WaiverRequest_backup_completo_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.json'
      : Report.suggestedFileName(state.project, 'json');   /* leva as duas abas */
    download(blob, name);
    toast(all ? 'Backup de todos os relatórios salvo.' : 'Backup do relatório salvo.');
  }

  function importBackupFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        incoming = Store.fromBackup(JSON.parse(String(reader.result)));
      } catch (e) {
        alert('Não foi possível ler o backup: ' + e.message);
        return;
      }
      var replace = state.projects.some(function (p) {
        return incoming.some(function (q) { return q.id === p.id; });
      }) && confirm(
        'Este backup contém relatórios que já existem neste navegador.\n\n' +
        'OK = substituir as versões existentes\n' +
        'Cancelar = importar como cópias novas'
      );

      var saves = incoming.map(function (p) {
        if (!replace) {
          p.id = Store.uid();
          p.name = p.name + ' (importado)';
        }
        return Store.save(p);
      });

      Promise.all(saves)
        .then(function () { return Store.list(); })
        .then(function (list) {
          state.projects = list;
          var target = list.filter(function (p) { return p.id === incoming[0].id; })[0] || list[0];
          loadProject(target);
          toast(incoming.length + ' relatório(s) importado(s).');
        })
        .catch(function (e) { markError(e); alert('Falha ao gravar os relatórios importados.'); });
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------------- */
  /* inicialização                                                          */
  /* ---------------------------------------------------------------------- */

  function wire() {
    $('#marcoInput').addEventListener('input', function () {
      if (isDev()) {
        state.project.marcoDev = this.value;
      } else {
        state.project.marco = this.value;
        state.project.name = this.value || 'Relatório sem nome';
        $('#marcoInput').placeholder = 'RANAE J06';
      }
      scheduleSave();
    });

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchKind(t.dataset.kind); });
    });
    $('#footerInput').addEventListener('input', function () {
      state.project.footer = this.value;
      scheduleSave();
    });

    $('#projectSelect').addEventListener('change', function () {
      var sel = this.value;
      flushSave().then(function () {
        var p = state.projects.filter(function (x) { return x.id === sel; })[0];
        if (p) loadProject(p);
      });
    });

    $('#newProjectBtn').addEventListener('click', function () {
      var marco = prompt('Marco do novo relatório (ex.: RANAE J06):', '');
      if (marco === null) return;
      var p = Store.newProject(marco.trim());
      flushSave().then(function () { return Store.save(p); }).then(function () {
        state.projects.unshift(p);
        loadProject(p);
        toast('Relatório criado.');
      }).catch(markError);
    });

    $('#deleteProjectBtn').addEventListener('click', function () {
      if (!state.project) return;
      if (!confirm('Excluir o relatório "' + (state.project.marco || state.project.name) + '" deste navegador?\n\nFaça um backup antes se quiser conservá-lo.')) return;
      var id = state.project.id;
      Store.remove(id).then(function () {
        state.projects = state.projects.filter(function (p) { return p.id !== id; });
        if (!state.projects.length) {
          var p = Store.newProject('');
          return Store.save(p).then(function () { state.projects = [p]; loadProject(p); });
        }
        loadProject(state.projects[0]);
      }).then(function () { toast('Relatório excluído.'); }).catch(markError);
    });

    $('#addNcrBtn').addEventListener('click', addNcr);
    $('#dupNcrBtn').addEventListener('click', duplicateNcr);
    $('#delNcrBtn').addEventListener('click', deleteNcr);
    $('#ncrFilter').addEventListener('input', renderNcrList);

    $('#copyNcrBtn').addEventListener('click', openCopyDialog);
    $('#copyCancelBtn').addEventListener('click', function () { $('#copyDialog').close(); });
    $('#zoomRange').addEventListener('input', applyZoom);

    $('#previewBtn').addEventListener('click', openPreview);
    $('#closePreviewBtn').addEventListener('click', closePreview);
    $('#previewPrintBtn').addEventListener('click', function () { closePreview(); exportPdf(); });
    $('#pdfBtn').addEventListener('click', exportPdf);
    $('#pdfCancelBtn').addEventListener('click', function () { $('#pdfDialog').close(); });
    $('#pdfGoBtn').addEventListener('click', doPrint);

    $('#backupBtn').addEventListener('click', function () { exportBackup(false); });
    $('#backupAllBtn').addEventListener('click', function () { exportBackup(true); });
    $('#restoreBtn').addEventListener('click', function () { $('#restoreInput').click(); });
    $('#restoreInput').addEventListener('change', function () {
      if (this.files && this.files[0]) importBackupFile(this.files[0]);
      this.value = '';
    });

    /* arrastar um .json para qualquer lugar da janela restaura o backup */
    window.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault();
    });
    window.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /\.json$/i.test(f.name)) {
        e.preventDefault();
        importBackupFile(f);
      }
    });

    /* Ctrl+V em qualquer ponto do editor manda a imagem para o último anexo
       da NCR aberta (criando um anexo, se ainda não houver nenhum). */
    document.addEventListener('paste', function (e) {
      if (!$('#preview').hidden) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        /* dentro de um campo de texto só interceptamos se vier imagem */
        if (!e.clipboardData || !e.clipboardData.files.length) return;
      }
      var ncr = currentNcr();
      if (!ncr || !e.clipboardData) return;
      var files = Array.prototype.slice.call(e.clipboardData.files)
        .filter(function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      e.preventDefault();
      if (!ncr.evidence.length) ncr.evidence.push(Store.newEvidence(1));
      var target = ncr.evidence[ncr.evidence.length - 1];
      Promise.all(files.map(fileToCompressedDataUrl)).then(function (srcs) {
        srcs.forEach(function (src) {
          target.images.push({ id: Store.uid(), src: src, caption: '' });
        });
        renderEditor();
        renderNcrList();
        scheduleSave();
        toast(srcs.length + ' imagem(ns) colada(s) em "' + target.ref + '".');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#preview').hidden) closePreview();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); toast('Salvo.'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); exportPdf(); }
    });

    window.addEventListener('beforeunload', function () {
      if (saveTimer) flushSave();
    });
  }

  function boot() {
    wire();
    requestPersistentStorage();
    Store.list().then(function (list) {
      state.projects = list;
      if (!list.length) {
        var p = Store.newProject('');
        return Store.save(p).then(function () {
          state.projects = [p];
          loadProject(p);
        });
      }
      loadProject(list[0]);
    }).catch(function (e) {
      markError(e);
      var p = Store.newProject('');
      state.projects = [p];
      loadProject(p);
      toast('Não foi possível ler o armazenamento local; começando do zero.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
