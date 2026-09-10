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

  /* Uma sessão por abertura da página. */
  var SESSION_ID = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  var isDev = function () { return state.kind === 'dev'; };
  var isResumo = function () { return state.kind === 'resumo'; };
  /** Lista de itens da aba ativa. */
  var items = function () {
    if (!state.project || isResumo()) return [];
    return state.project[Store.itemsKey(state.kind)];
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
      refreshSuggestions();
      renderTabs();
      renderUser();
      renderBackupNotice();
      if (isResumo()) renderSummary();
    }).catch(markError);
  }

  /**
   * Marca que o item foi mexido nesta sessão. Chamado nos pontos que alteram
   * conteúdo — não em reordenação, que não muda nenhum item.
   */
  function touch(item, action) {
    var n = item || currentNcr();
    if (!n || !state.project) return;
    Store.logChange(state.project, SESSION_ID, state.kind, n, action || 'editou');
    renderSessionInfo();
    renderItemAuthor();
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
    $('#marcoInput').value = project.marco;
    refreshProjectSelect();
    refreshSuggestions();
    renderTabs();
    renderNcrList();
    renderEditor();
    renderUser();
    renderSessionInfo();
    renderBackupNotice();
    if (isResumo()) renderSummary();
    markSaved();
  }

  /* --- abas NCR / DEV --------------------------------------------------- */

  function renderTabs() {
    if (!state.project) return;
    $$('.tab').forEach(function (t) {
      var on = t.dataset.kind === state.kind;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      var cnt = $('.tab-count', t);
      if (cnt) cnt.textContent = state.project[Store.itemsKey(t.dataset.kind)].length;
    });

    /* a aba de resumo troca a tela inteira: não há lista nem formulário */
    $('#sidebarBody').hidden = isResumo();
    $('#sidebarResumo').hidden = !isResumo();
    $('#editorScroll').hidden = isResumo();
    $('#summaryScroll').hidden = !isResumo();
    $('#previewBtn').hidden = isResumo();
    if (isResumo()) {
      $('#pdfBtn').textContent = 'Exportar PDF…';
      return;
    }

    var t = kindName();
    $('#addNcrBtn').textContent = '+ Nova ' + t;
    $('#addNcrBtn').title = 'Adicionar ' + t + ' a este relatório';
    $('#sidebarTitle').textContent = t + 's';
    $('#ncrFilter').placeholder = 'Filtrar ' + t + 's…';
    $('#previewBtn').textContent = 'Pré-visualizar ' + t;
  }

  function switchKind(kind) {
    if (state.kind === kind) return;
    state.kind = kind;
    renderTabs();
    if (isResumo()) { renderSummary(); return; }
    renderNcrList();
    renderEditor();
    $('#editorScroll').scrollTop = 0;
  }

  /* ---------------------------------------------------------------------- */
  /* aba de resumo                                                           */
  /* ---------------------------------------------------------------------- */

  var summaryFilter = '';

  function renderSummary() {
    SummaryView.render($('#summaryScroll'), state.projects, summaryFilter, {
      onFiltro: function (id) { summaryFilter = id; renderSummary(); },
      onCsv: exportarCsv,
      onPdf: exportarResumoPdf,
      onBackup: function (project) {
        var antes = state.project;
        state.project = project;
        exportBackup(false);
        state.project = antes;
      }
    });
    $('#summaryScroll').scrollTop = 0;
  }

  function exportarCsv(project) {
    var csv = SummaryView.toCsv(project);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download(blob, Report.suggestedFileName(project, 'csv').replace('WaiverRequest_', 'Resumo_'));
    toast('Planilha do marco salva.');
  }

  /** Monta as páginas A4 do resumo e manda para a impressão. */
  function exportarResumoPdf(project) {
    var root = $('#printRoot');
    root.innerHTML = '';
    root.appendChild(buildSummaryPage(project));
    var titulo = document.title;
    document.title = project
      ? Report.suggestedFileName(project, 'pdf', 'ncr').replace('WaiverRequest_', 'Resumo_').replace(/\.pdf$/, '')
      : 'Resumo_geral_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = titulo; }, 500);
    }, 60);
  }

  /** Uma folha A4 com os números, os gráficos e a tabela do escopo. */
  function buildSummaryPage(project) {
    var pg = el('section', 'rep-page rep-page--summary');
    var alvos = project ? [project] : state.projects;
    var dados = Summary.compute(alvos);
    var st = project ? dados.porMarco[0] : dados.geral;

    var titulo = project
      ? 'Resumo de derrogações — ' + (Report.marcoOf(project, 'ncr') || project.name)
      : 'Resumo de derrogações — todos os marcos';
    pg.appendChild(el('div', 'rep-cover-title', titulo));
    pg.appendChild(el('div', 'sm-print-date',
      'Gerado em ' + new Date().toLocaleDateString('pt-BR') +
      (Store.getUser() ? ' por ' + Store.getUser() : '')));

    pg.appendChild(SummaryView.kpiRow(st));

    var g1 = SummaryView.bloco('Progresso');
    g1.appendChild(SummaryView.graficoProgresso(dados.porMarco));
    pg.appendChild(g1);

    var g2 = SummaryView.bloco('Situação do waiver');
    g2.appendChild(SummaryView.graficoSituacao(dados.porMarco));
    pg.appendChild(g2);

    var g3 = SummaryView.bloco('Itens por sistema');
    g3.appendChild(SummaryView.graficoSistemas(
      project ? dados.porMarco[0].porSistema : dados.geral.porSistema));
    pg.appendChild(g3);

    if (project) {
      var t = SummaryView.bloco('Itens');
      t.appendChild(SummaryView.tabela([
        { titulo: 'Tipo', valor: function (r) { return r.kind === 'dev' ? 'DEV' : 'NCR'; } },
        { titulo: 'Número', valor: function (r) { return r.item.ncrId || '(sem número)'; } },
        { titulo: 'Sistemas', valor: function (r) { return r.item.systems || '—'; } },
        { titulo: 'Função / descrição', valor: function (r) { return r.item.func || '—'; } },
        { titulo: 'Situação', valor: function (r) { return Summary.situacao(r.item); } },
        { titulo: 'Concluído', valor: function (r) { return r.item.done ? 'Sim' : '—'; } }
      ], dados.porMarco[0].linhas));
      pg.appendChild(t);
    }

    if (state.project && state.project.footer) {
      pg.appendChild(el('div', 'rep-footer', state.project.footer));
    }
    return pg;
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
      renderProgress(rows);
      return;
    }
    $('#sidebarEmpty').hidden = true;
    ul.hidden = false;
    renderProgress(rows);

    var pendingOnly = $('#pendingOnly').checked;
    var touched = touchedIds();
    rows.forEach(function (ncr, i) {
      var hay = (ncr.ncrId + ' ' + ncr.systems + ' ' + ncr.func).toLowerCase();
      if (term && hay.indexOf(term) === -1) return;
      if (pendingOnly && ncr.done) return;

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

      var badges = el('div', 'ncr-item-badge');
      var imgCount = ncr.evidence.reduce(function (s, e) { return s + e.images.length; }, 0);
      if (imgCount) badges.appendChild(el('span', null, '🖼 ' + imgCount));
      if (ncr.done) {
        li.classList.add('is-done');
        badges.appendChild(el('span', 'done-tick', '✓'));
      }
      if (touched[ncr.id]) {
        li.classList.add('is-touched');
        var dot = el('span', 'touch-dot', '●');
        dot.title = 'Você ' + actionLabel(touched[ncr.id]) + ' este item nesta sessão';
        badges.appendChild(dot);
      }
      if (badges.childNodes.length) li.appendChild(badges);

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

  /* "7 de 12 concluídas" — ajuda a saber o que ainda falta num marco grande. */
  function renderProgress(rows) {
    var total = rows.length;
    var done = rows.filter(function (n) { return n.done; }).length;
    var box = $('.progress-row');
    box.hidden = total === 0;
    $('#progressText').textContent = total
      ? done + ' de ' + total + ' concluída' + (total > 1 ? 's' : '')
      : '';
    box.classList.toggle('is-complete', total > 0 && done === total);
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
    touch(ncr, 'criou');
    setSelectedId(ncr.id);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
    var f = $('#f-ncrId');
    if (f) f.focus();
  }

  function deleteNcr() {
    var ncr = currentNcr();
    if (!ncr) return;
    if (!confirm('Excluir a ' + kindName() + ' "' + (ncr.ncrId || 'sem número') + '" e todas as suas evidências?')) return;
    touch(ncr, 'excluiu');
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
      if (SUGGEST.indexOf(key) >= 0) input.setAttribute('list', 'dl-' + key);
    }
    input.id = id;
    input.value = ncr[key] || '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.addEventListener('input', function () {
      var n = currentNcr();
      if (!n) return;
      n[key] = input.value;
      touch(n);
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
    var collapseBtn = el('button', 'btn btn--sm', 'Recolher preenchidos');
    collapseBtn.type = 'button';
    collapseBtn.style.marginLeft = 'auto';
    $('h3', textCard).appendChild(collapseBtn);

    var stack = el('div', 'stack');
    var defs = [
      ['description',      'Description',                                  '#A9A9A9', 4],
      ['currentSituation', 'Current Situation',                            '#8FBC8B', 6],
      ['whyNotPossible',   'Why is not possible to treat the deviation',   '#FFCCE5', 5],
      ['arguments',        'What are the arguments for the derrogation',   '#CCCCFF', 5],
      ['archAnswer',       'Arch Answer',                                  '#00B4FF', 3]
    ];
    var blocks = [];
    defs.forEach(function (d) {
      /* Cada bloco é recolhível: com cinco caixas de texto a tela fica longa
         demais para chegar às evidências. */
      var det = document.createElement('details');
      det.className = 'sec';
      det.open = true;
      var sum = document.createElement('summary');
      var sw = el('span', 'swatch');
      sw.style.cssText = 'display:inline-block;width:11px;height:11px;border:1px solid #999;border-radius:2px;margin-right:7px;vertical-align:middle;background:' + d[2];
      sum.appendChild(sw);
      sum.appendChild(el('span', 'sec-name', d[1]));
      var peek = el('span', 'sec-peek');
      sum.appendChild(peek);
      det.appendChild(sum);

      var f = field(d[1], d[0], { rows: d[3] });
      $('label', f).remove();
      det.appendChild(f);

      function updatePeek() {
        var v = (currentNcr()[d[0]] || '').trim();
        peek.textContent = v ? v.split('\n')[0].slice(0, 70) : 'em branco';
        peek.classList.toggle('is-empty', !v);
      }
      updatePeek();
      $('#f-' + d[0], det).addEventListener('input', updatePeek);

      blocks.push({ det: det, key: d[0] });
      stack.appendChild(det);
    });

    collapseBtn.addEventListener('click', function () {
      var anyOpen = blocks.some(function (b) { return b.det.open && (currentNcr()[b.key] || '').trim(); });
      blocks.forEach(function (b) {
        if ((currentNcr()[b.key] || '').trim()) b.det.open = !anyOpen;
      });
      collapseBtn.textContent = anyOpen ? 'Expandir preenchidos' : 'Recolher preenchidos';
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

    /* --- concluir --- */
    host.appendChild(renderDoneBar());
  }

  /* O salvamento já é automático a cada tecla; este botão existe para dar o
     retorno visível de "terminei este item" e marcar a NCR/DEV como pronta. */
  function renderDoneBar() {
    var ncr = currentNcr();
    var bar = el('div', 'done-bar');

    var info = el('div', 'done-bar-info');
    info.appendChild(el('strong', null, ncr.done ? '✓ Item concluído' : 'Item em edição'));
    info.appendChild(el('span', null, ncr.done
      ? 'Marcado como pronto. Você pode reabrir para editar a qualquer momento.'
      : 'As alterações são gravadas sozinhas enquanto você digita. Ao terminar, confirme aqui.'));
    var who = el('span', 'done-bar-who');
    who.id = 'doneBarWho';
    info.appendChild(who);
    renderItemAuthor();
    bar.appendChild(info);

    var btn = el('button', 'btn ' + (ncr.done ? '' : 'btn--primary'),
      ncr.done ? 'Reabrir item' : '✓ Concluir ' + kindName());
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var n = currentNcr();
      n.done = !n.done;
      touch(n);
      flushSave().then(function () {
        renderNcrList();
        renderEditor();
        toast(n.done
          ? kindName() + ' "' + (n.ncrId || 'sem número') + '" concluída e salva.'
          : 'Item reaberto para edição.');
      });
    });
    bar.appendChild(btn);

    var next = el('button', 'btn', '✓ Concluir e criar outra');
    next.type = 'button';
    next.hidden = ncr.done;
    next.addEventListener('click', function () {
      currentNcr().done = true;
      flushSave().then(function () {
        addNcr();
        toast('Item salvo. Comece o próximo.');
      });
    });
    bar.appendChild(next);

    return bar;
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
        inp.setAttribute('list', 'dl-certificates');
        inp.addEventListener('input', function () {
          currentNcr().certificates[i] = inp.value;
          touch();
          scheduleSave();
        });
        var del = el('button', 'btn btn--sm btn--danger', '✕');
        del.type = 'button';
        del.title = 'Remover certificado';
        del.addEventListener('click', function () {
          currentNcr().certificates.splice(i, 1);
          touch();
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
      touch();
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
        touch();
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
    refInput.addEventListener('input', function () { ev.ref = refInput.value; touch(); scheduleSave(); });
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
      touch();
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
      touch();
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
    note.addEventListener('input', function () { ev.note = note.value; touch(); scheduleSave(); });
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
        cap.addEventListener('input', function () { img.caption = cap.value; touch(); scheduleSave(); });
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
          touch();
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
        touch();
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
  /* identidade e histórico de edição                                        */
  /* ---------------------------------------------------------------------- */

  function renderUser() {
    var name = Store.getUser();
    $('#userBtnLabel').textContent = name ? '👤 ' + name : 'Definir meu nome';
    if (state.project) {
      $('#menuMarco').textContent = state.project.marco || state.project.name || 'sem marco';
    }
    $('#menuBtn').classList.toggle('btn--nudge', !name);

    var p = state.project;
    var box = $('#editedBy');
    if (!p || (!p.lastEditedBy && !p.lastBackupBy)) { box.textContent = ''; return; }
    var bits = [];
    if (p.lastEditedBy) bits.push('editado por ' + p.lastEditedBy + ' · ' + shortDate(p.lastEditedAt));
    if (p.lastBackupBy) bits.push('backup por ' + p.lastBackupBy + ' · ' + shortDate(p.lastBackupAt));
    box.textContent = bits.join('  |  ');
    box.title = bits.join('\n');
  }

  function shortDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /* --- o que mudou nesta sessão ---------------------------------------- */

  /** A sessão corrente dentro do relatório aberto (ou null, se nada mudou). */
  function currentSession() {
    if (!state.project || !state.project.sessions) return null;
    return state.project.sessions.filter(function (x) { return x.id === SESSION_ID; })[0] || null;
  }

  /** Ids dos itens mexidos nesta sessão, para marcar na lista lateral. */
  function touchedIds() {
    var sess = currentSession();
    var set = {};
    if (sess) sess.changes.forEach(function (c) { set[c.itemId] = c.action; });
    return set;
  }

  /* Atualiza só a linha de autoria, para não redesenhar o formulário (e
     perder o cursor) a cada tecla. */
  function renderItemAuthor() {
    var box = $('#doneBarWho');
    if (!box) return;
    var n = currentNcr();
    if (!n || (!n.editedBy && !n.editedAt)) { box.textContent = ''; box.hidden = true; return; }
    box.hidden = false;
    box.textContent = 'Última alteração: ' + (n.editedBy || 'sem nome') + ' · ' + shortDate(n.editedAt);
  }

  function renderSessionInfo() {
    var sess = currentSession();
    var n = sess ? sess.changes.length : 0;
    var box = $('#sessionInfo');
    box.hidden = n === 0;
    $('#sessionCount').textContent = n === 1
      ? '1 item alterado nesta sessão'
      : n + ' itens alterados nesta sessão';
  }

  function actionLabel(a) {
    return a === 'criou' ? 'criou' : (a === 'excluiu' ? 'excluiu' : 'editou');
  }

  /* Histórico completo: as sessões viajam dentro do backup, então dá para ver
     o que cada pessoa mexeu depois de restaurar o arquivo dela. */
  function openSessions() {
    var body = $('#sessionsBody');
    body.innerHTML = '';
    var all = (state.project.sessions || []).slice().reverse();

    if (!all.length) {
      body.appendChild(el('p', null, 'Nenhuma alteração registrada neste relatório ainda.'));
      $('#sessionsDialog').showModal();
      return;
    }

    all.forEach(function (sess) {
      var box = el('div', 'sess' + (sess.id === SESSION_ID ? ' sess--current' : ''));
      var head = el('div', 'sess-head');
      head.appendChild(el('strong', null, sess.user || '(sem nome)'));
      head.appendChild(el('span', 'sess-when', shortDate(sess.startedAt) +
        (sess.endedAt && sess.endedAt !== sess.startedAt ? ' → ' + shortDate(sess.endedAt) : '')));
      if (sess.id === SESSION_ID) head.appendChild(el('span', 'pick-tag', 'esta sessão'));
      box.appendChild(head);

      if (!sess.changes.length) {
        box.appendChild(el('div', 'sess-empty', 'nenhum item alterado'));
      } else {
        var ul = document.createElement('ul');
        ul.className = 'sess-list';
        sess.changes.forEach(function (c) {
          var li = document.createElement('li');
          li.appendChild(el('span', 'sess-kind', c.kind === 'dev' ? 'DEV' : 'NCR'));
          li.appendChild(el('span', 'sess-label', c.label));
          li.appendChild(el('span', 'sess-action sess-action--' + c.action, actionLabel(c.action)));
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      body.appendChild(box);
    });
    $('#sessionsDialog').showModal();
  }

  /** Texto simples do que mudou nesta sessão, para colar num e-mail. */
  function sessionSummaryText() {
    var sess = currentSession();
    if (!sess || !sess.changes.length) return '';
    var head = (sess.user || 'Sem nome') + ' — ' +
      (Report.marcoOf(state.project, 'ncr') || state.project.name) + ' — ' +
      shortDate(sess.startedAt);
    var linhas = sess.changes.map(function (c) {
      return '- ' + (c.kind === 'dev' ? 'DEV' : 'NCR') + ' ' + c.label + ' (' + actionLabel(c.action) + ')';
    });
    return head + '\n' + linhas.join('\n');
  }

  function openUserDialog() {
    $('#userNameInput').value = Store.getUser();
    $('#userDialog').showModal();
    $('#userNameInput').focus();
  }

  /* ---------------------------------------------------------------------- */
  /* lembrete de backup                                                      */
  /* ---------------------------------------------------------------------- */

  var DIAS_SEM_BACKUP = 7;
  var noticeDismissed = false;

  function renderBackupNotice() {
    var el0 = $('#backupNotice');
    if (noticeDismissed) { el0.hidden = true; return; }

    var temConteudo = state.projects.some(function (p) {
      return p.ncrs.length || p.devs.length;
    });
    if (!temConteudo) { el0.hidden = true; return; }

    var last = Store.getLastBackupAt();
    var dias = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
    if (dias !== null && dias < DIAS_SEM_BACKUP) { el0.hidden = true; return; }

    $('#backupNoticeText').textContent = last
      ? 'Seu último backup foi há ' + dias + ' dias. Os relatórios ficam só neste navegador — um backup evita perder tudo se os dados do site forem limpos.'
      : 'Você ainda não fez backup. Os relatórios ficam só neste navegador; se os dados do site forem limpos, tudo se perde.';
    el0.hidden = false;
  }

  /* ---------------------------------------------------------------------- */
  /* sugestões de preenchimento                                              */
  /* ---------------------------------------------------------------------- */

  var SUGGEST = ['systems', 'func', 'requestExpiry', 'archStatus', 'approvedExpiry'];

  /* Junta os valores já usados em todos os relatórios, para oferecer como
     sugestão nos campos que se repetem muito (PÓS TRAP, WAIVER ACCEPTED…). */
  function refreshSuggestions() {
    var buckets = {};
    SUGGEST.forEach(function (k) { buckets[k] = {}; });
    buckets.certificates = {};

    state.projects.forEach(function (p) {
      ['ncrs', 'devs'].forEach(function (key) {
        p[key].forEach(function (n) {
          SUGGEST.forEach(function (k) {
            var v = (n[k] || '').trim();
            if (v) buckets[k][v] = (buckets[k][v] || 0) + 1;
          });
          (n.certificates || []).forEach(function (c) {
            var v = (c || '').trim();
            if (v) buckets.certificates[v] = (buckets.certificates[v] || 0) + 1;
          });
        });
      });
    });

    Object.keys(buckets).forEach(function (k) {
      var dl = $('#dl-' + k);
      if (!dl) return;
      dl.innerHTML = '';
      Object.keys(buckets[k])
        .sort(function (a, b) { return buckets[k][b] - buckets[k][a] || a.localeCompare(b); })
        .slice(0, 40)
        .forEach(function (v) {
          var o = document.createElement('option');
          o.value = v;
          dl.appendChild(o);
        });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* ajustes do relatório                                                    */
  /* ---------------------------------------------------------------------- */

  /* Textos fixos da capa e do rodapé, e o marco alternativo da DEV — coisas
     que quase nunca mudam e por isso ficam fora da barra principal. */
  var SETTINGS = [
    ['coverTitle',    'Título da capa — NCR',  'Waiver Request For',
     'Sai como "Waiver Request For <marco>".'],
    ['coverTitleDev', 'Título da capa — DEV',  'DEV: Waiver Request For',
     'Sai como "DEV: Waiver Request For <marco>".'],
    ['marcoDev',      'Marco só da capa da DEV', '',
     'Deixe em branco para a DEV usar o mesmo marco do relatório. Preencha apenas se a capa da DEV precisar de um marco diferente (ex.: NCR em RANAE J06 e DEV em J05 DQR).'],
    ['coverSubtitle', 'Subtítulo da capa',     'List of Waiver Requested :', ''],
    ['footer',        'Rodapé das páginas',    'Gerência técnica operacional', '']
  ];

  function openSettings() {
    var body = $('#settingsBody');
    body.innerHTML = '';
    SETTINGS.forEach(function (def) {
      var f = el('div', 'field');
      f.style.marginBottom = '12px';
      f.appendChild(el('label', null, def[1]));
      var input = document.createElement('input');
      input.type = 'text';
      input.value = state.project[def[0]] || '';
      input.placeholder = def[2];
      input.addEventListener('input', function () {
        state.project[def[0]] = input.value;
        scheduleSave();
      });
      f.appendChild(input);
      if (def[3]) f.appendChild(el('div', 'hint', def[3]));
      body.appendChild(f);
    });
    $('#settingsDialog').showModal();
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
        touch(copy, 'criou');
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
  function findGaps(project, kind) {
    var gaps = [];
    var t = kind === 'dev' ? 'DEV' : 'NCR';
    if (!Report.marcoOf(project, kind)) {
      gaps.push({ ncr: null, what: 'O marco do relatório de ' + t + ' está vazio.' });
    }
    Report.items(project, kind).forEach(function (n, i) {
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
    if (!Report.items(project, kind).length) {
      gaps.push({ ncr: null, what: 'O relatório de ' + t + ' não tem nenhum item.' });
    }
    return gaps;
  }

  function renderGaps(picked) {
    var host = $('#pdfGaps');
    host.innerHTML = '';
    if (!picked || !picked.length) { host.hidden = true; return; }
    host.hidden = false;

    var gaps = [];
    picked.forEach(function (r) {
      findGaps(r.project, r.kind).forEach(function (g) {
        g.project = r.project;
        g.kind = r.kind;
        gaps.push(g);
      });
    });

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
          if (g.project.id !== state.project.id) loadProject(g.project);
          state.kind = g.kind;
          renderTabs();
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

  function buildPrintRoot(picked) {
    var root = $('#printRoot');
    Report.buildMany(picked, root);
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

  /* Todos os relatórios disponíveis: cada projeto (marco) rende uma linha de
     NCR e uma de DEV. Marcar mais de uma gera um PDF único, na ordem da
     lista; marcar uma só gera o relatório isolado. */
  function availableReports() {
    var out = [];
    state.projects.forEach(function (p) {
      ['ncr', 'dev'].forEach(function (kind) {
        out.push({
          project: p,
          kind: kind,
          count: p[Store.itemsKey(kind)].length,
          marco: Report.marcoOf(p, kind) || p.name || 'sem marco',
          current: p.id === state.project.id && kind === state.kind
        });
      });
    });
    return out;
  }

  function exportPdf() {
    if (!state.project) return;
    var list = availableReports();
    var body = $('#pdfPick');
    body.innerHTML = '';

    var byProject = {};
    list.forEach(function (r) {
      (byProject[r.project.id] = byProject[r.project.id] || []).push(r);
    });

    Object.keys(byProject).forEach(function (pid) {
      var rows = byProject[pid];
      var group = el('div', 'pick-group');
      group.appendChild(el('div', 'pick-group-title', rows[0].project.marco || rows[0].project.name || 'Sem marco'));

      rows.forEach(function (r) {
        var row = el('label', 'pick-row' + (r.count ? '' : ' is-empty'));
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pick-cb';
        cb.disabled = !r.count;
        /* já vem marcado o relatório da aba em que você está */
        cb.checked = r.current && r.count > 0;
        cb.dataset.pid = r.project.id;
        cb.dataset.kind = r.kind;
        row.appendChild(cb);

        var main = el('div', 'pick-row-main');
        main.appendChild(el('div', 'pick-row-name',
          (r.kind === 'dev' ? 'DEV' : 'NCR') + ' — ' + r.marco));
        main.appendChild(el('div', 'pick-row-sub', r.count
          ? r.count + (r.count === 1 ? ' item' : ' itens') + ' · ' + (r.count + 1) + ' páginas ou mais'
          : 'sem itens'));
        row.appendChild(main);

        if (r.current) row.appendChild(el('span', 'pick-tag', 'aba aberta'));
        group.appendChild(row);
      });
      body.appendChild(group);
    });

    updatePickSummary();
    $$('.pick-cb', body).forEach(function (cb) {
      cb.addEventListener('change', updatePickSummary);
    });
    $('#pdfDialog').showModal();
  }

  /** Relatórios marcados no diálogo, na ordem em que aparecem. */
  function pickedReports() {
    return $$('.pick-cb')
      .filter(function (cb) { return cb.checked && !cb.disabled; })
      .map(function (cb) {
        return {
          project: state.projects.filter(function (p) { return p.id === cb.dataset.pid; })[0],
          kind: cb.dataset.kind
        };
      })
      .filter(function (r) { return r.project; });
  }

  function updatePickSummary() {
    var picked = pickedReports();
    var n = picked.length;
    $('#pdfGoBtn').disabled = n === 0;
    $('#pdfSummary').textContent = n === 0
      ? 'Marque pelo menos um relatório.'
      : (n === 1
        ? 'Um arquivo com o relatório escolhido.'
        : 'Um único arquivo com os ' + n + ' relatórios, em sequência.');
    renderGaps(picked);
  }

  function doPrint() {
    var picked = pickedReports();
    if (!picked.length) return;
    buildPrintRoot(picked);
    $('#pdfDialog').close();

    /* O nome do arquivo vem do título da página, que o Chrome usa como
       sugestão em "Salvar como PDF". */
    var title = document.title;
    document.title = picked.length === 1
      ? Report.suggestedFileName(picked[0].project, 'pdf', picked[0].kind).replace(/\.pdf$/, '')
      : 'WaiverRequest_' + picked.length + '_relatorios_' +
        new Date().toISOString().slice(0, 10).replace(/-/g, '');

    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = title; }, 500);
    }, 60);
  }

  /* ---------------------------------------------------------------------- */
  /* backup / restauração                                                   */
  /* ---------------------------------------------------------------------- */

  function exportBackup(all) {
    /* Sem nome não dá para saber depois quem gerou o arquivo. */
    if (!Store.getUser()) {
      openUserDialog();
      toast('Informe seu nome — ele fica registrado no backup.');
      return;
    }
    var projects = all ? state.projects : [state.project];
    var data = Store.toBackup(projects);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var name = all
      ? 'WaiverRequest_TODOS_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.json'
      : Report.suggestedFileName(state.project, 'json');   /* leva as duas abas */
    download(blob, name);
    Store.setLastBackupAt(data.exportedAt);
    noticeDismissed = false;
    renderBackupNotice();
    /* grava a autoria do backup nos projetos exportados */
    Promise.all(projects.map(function (p) { return Store.save(p); })).then(renderUser);
    toast(all
      ? 'Backup completo salvo: ' + projects.length + ' relatório(s), NCR e DEV.'
      : 'Backup apenas deste relatório salvo.');
  }

  /* ---------------------------------------------------------------------- */
  /* mesclagem de arquivos                                                   */
  /* ---------------------------------------------------------------------- */

  var pendingMerge = null;

  /** Junta o diff das duas abas de um relatório. */
  function diffBoth(local, incoming) {
    var a = Store.diffProject(local, incoming, 'ncr');
    var b = Store.diffProject(local, incoming, 'dev');
    return {
      local: local,
      incoming: incoming,
      novos: a.novos.concat(b.novos),
      atualizados: a.atualizados.concat(b.atualizados),
      conflitos: a.conflitos.concat(b.conflitos),
      removidos: a.removidos.concat(b.removidos),
      iguais: a.iguais + b.iguais
    };
  }

  function kindTag(k) { return k === 'dev' ? 'DEV' : 'NCR'; }

  function quem(item) {
    if (!item || (!item.editedBy && !item.editedAt)) return 'sem registro';
    return (item.editedBy || 'sem nome') + ' · ' + shortDate(item.editedAt);
  }

  /* Monta a tela que explica, item a item, o que vai acontecer. */
  function openMergeDialog(plan, origem) {
    pendingMerge = plan;
    var body = $('#mergeBody');
    body.innerHTML = '';
    $('#mergeOrigin').textContent = origem || '';

    var total = 0;

    function grupo(titulo, explica, entradas, render) {
      if (!entradas.length) return;
      total += entradas.length;
      var box = el('div', 'mg-group');
      var h = el('div', 'mg-group-head');
      h.appendChild(el('strong', null, titulo + ' (' + entradas.length + ')'));
      h.appendChild(el('span', 'mg-group-sub', explica));
      box.appendChild(h);
      entradas.forEach(function (e, i) { box.appendChild(render(e, i)); });
      body.appendChild(box);
    }

    grupo('Novos', 'não existem aqui — serão acrescentados', plan.novos, function (e) {
      var row = el('label', 'mg-row');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = true; cb.className = 'mg-new';
      cb.dataset.idx = plan.novos.indexOf(e);
      row.appendChild(cb);
      row.appendChild(el('span', 'sess-kind', kindTag(e.kind)));
      row.appendChild(el('span', 'mg-label', e.incoming.ncrId || '(sem número)'));
      row.appendChild(el('span', 'mg-who', quem(e.incoming)));
      return row;
    });

    grupo('Atualizados pelo colega', 'você não mexeu neles — a versão do arquivo é mais nova',
      plan.atualizados, function (e) {
        var row = el('label', 'mg-row');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = true; cb.className = 'mg-upd';
        cb.dataset.idx = plan.atualizados.indexOf(e);
        row.appendChild(cb);
        row.appendChild(el('span', 'sess-kind', kindTag(e.kind)));
        row.appendChild(el('span', 'mg-label', e.incoming.ncrId || e.mine.ncrId || '(sem número)'));
        row.appendChild(el('span', 'mg-who', quem(e.incoming)));
        return row;
      });

    grupo('Conflitos', 'os dois lados mexeram — escolha qual versão fica', plan.conflitos,
      function (e, i) {
        var row = el('div', 'mg-row mg-row--conflict');
        var head = el('div', 'mg-conflict-head');
        head.appendChild(el('span', 'sess-kind', kindTag(e.kind)));
        head.appendChild(el('span', 'mg-label', e.mine.ncrId || e.incoming.ncrId || '(sem número)'));
        row.appendChild(head);

        var opts = el('div', 'mg-choices');
        [['mine', 'Manter a minha', quem(e.mine)],
         ['theirs', 'Usar a do arquivo', quem(e.incoming)]].forEach(function (o, k) {
          var lab = el('label', 'mg-choice');
          var r = document.createElement('input');
          r.type = 'radio';
          r.name = 'mg-conf-' + i;
          r.value = o[0];
          r.className = 'mg-conf';
          r.dataset.idx = String(i);
          /* por segurança, o que já está aqui é o padrão */
          if (k === 0) r.checked = true;
          lab.appendChild(r);
          var txt = el('span');
          txt.appendChild(el('span', 'mg-choice-name', o[1]));
          txt.appendChild(el('span', 'mg-who', o[2]));
          lab.appendChild(txt);
          opts.appendChild(lab);
        });
        row.appendChild(opts);
        return row;
      });

    grupo('Excluídos pelo colega', 'existem aqui e sumiram do arquivo — marque para excluir também',
      plan.removidos, function (e) {
        var row = el('label', 'mg-row');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = false; cb.className = 'mg-del';
        cb.dataset.idx = plan.removidos.indexOf(e);
        row.appendChild(cb);
        row.appendChild(el('span', 'sess-kind', kindTag(e.kind)));
        row.appendChild(el('span', 'mg-label', e.mine.ncrId || '(sem número)'));
        row.appendChild(el('span', 'mg-who', quem(e.mine)));
        return row;
      });

    if (!total) {
      body.appendChild(el('p', 'mg-none',
        '✓ Nenhuma diferença: o arquivo está igual ao que você já tem' +
        (plan.iguais ? ' (' + plan.iguais + ' itens conferidos).' : '.')));
    }
    $('#mergeApplyBtn').disabled = !total;
    $('#mergeSummary').textContent = total
      ? plan.iguais + ' itens já estão iguais nos dois lados.'
      : '';
    $('#mergeDialog').showModal();
  }

  /** Aplica as escolhas da tela, guardando antes um retrato para desfazer. */
  function applyMerge() {
    var plan = pendingMerge;
    if (!plan) return;
    var local = plan.local;

    var novos = $$('.mg-new').filter(function (c) { return c.checked; })
      .map(function (c) { return plan.novos[+c.dataset.idx]; });
    var upds = $$('.mg-upd').filter(function (c) { return c.checked; })
      .map(function (c) { return plan.atualizados[+c.dataset.idx]; });
    var confs = $$('.mg-conf').filter(function (r) { return r.checked && r.value === 'theirs'; })
      .map(function (r) { return plan.conflitos[+r.dataset.idx]; });
    var dels = $$('.mg-del').filter(function (c) { return c.checked; })
      .map(function (c) { return plan.removidos[+c.dataset.idx]; });

    Store.saveSnapshot(state.projects, 'antes de mesclar ' + (local.marco || local.name))
      .then(function () {
        novos.forEach(function (e) {
          var copia = Store.normalizeNcr(JSON.parse(JSON.stringify(e.incoming)));
          copia.syncBase = copia.editedAt;
          local[Store.itemsKey(e.kind)].push(copia);
        });

        upds.concat(confs).forEach(function (e) {
          var lista = local[Store.itemsKey(e.kind)];
          var at = lista.findIndex(function (n) { return n.id === e.mine.id; });
          if (at < 0) return;
          var copia = Store.normalizeNcr(JSON.parse(JSON.stringify(e.incoming)));
          copia.syncBase = copia.editedAt;
          lista[at] = copia;
        });

        dels.forEach(function (e) {
          var lista = local[Store.itemsKey(e.kind)];
          var at = lista.findIndex(function (n) { return n.id === e.mine.id; });
          if (at >= 0) lista.splice(at, 1);
        });

        /* o que eu mantive vira a nova base comum */
        ['ncrs', 'devs'].forEach(function (k) {
          local[k].forEach(function (n) { if (!n.syncBase) n.syncBase = n.editedAt; });
        });

        /* as sessões do colega entram no histórico deste relatório */
        var minhas = {};
        (local.sessions || []).forEach(function (x) { minhas[x.id] = true; });
        (plan.incoming.sessions || []).forEach(function (x) {
          if (!minhas[x.id]) local.sessions.push(x);
        });
        local.sessions.sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });
        if (local.sessions.length > Store.MAX_SESSIONS) {
          local.sessions = local.sessions.slice(-Store.MAX_SESSIONS);
        }

        return Store.save(local);
      })
      .then(function () { return Store.list(); })
      .then(function (list) {
        state.projects = list;
        loadProject(list.filter(function (p) { return p.id === local.id; })[0] || list[0]);
        refreshUndo();
        $('#mergeDialog').close();
        pendingMerge = null;
        toast('Mesclado: ' + novos.length + ' novo(s), ' +
          (upds.length + confs.length) + ' atualizado(s), ' + dels.length + ' excluído(s).');
      })
      .catch(function (e) { markError(e); alert('Falha ao mesclar.'); });
  }

  /* --- desfazer --------------------------------------------------------- */

  function refreshUndo() {
    Store.getSnapshot().then(function (snap) {
      var b = $('#undoMergeBtn');
      b.hidden = !snap;
      if (snap) $('#undoMergeWhen').textContent = 'volta ao estado de ' + shortDate(snap.at);
    });
  }

  function undoMerge() {
    Store.getSnapshot().then(function (snap) {
      if (!snap) { toast('Não há mesclagem para desfazer.'); return; }
      if (!confirm('Voltar ao estado de ' + shortDate(snap.at) + '?\n\n' +
        'Tudo que foi mesclado ou editado depois disso será descartado.')) return;
      Promise.all(snap.projects.map(function (p) { return Store.save(Store.normalizeProject(p)); }))
        .then(Store.clearSnapshot)
        .then(Store.list)
        .then(function (list) {
          state.projects = list;
          loadProject(list[0]);
          refreshUndo();
          toast('Mesclagem desfeita.');
        })
        .catch(function (e) { markError(e); alert('Falha ao desfazer.'); });
    });
  }

  function importBackupFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var raw, incoming;
      try {
        raw = JSON.parse(String(reader.result));
        incoming = Store.fromBackup(raw);
      } catch (e) {
        alert('Não foi possível ler o backup: ' + e.message);
        return;
      }

      var origem = raw && raw.exportedBy
        ? 'Arquivo de ' + raw.exportedBy +
          (raw.exportedAt ? ', gerado em ' + shortDate(raw.exportedAt) : '') + '.'
        : 'O arquivo não diz quem o gerou.';

      /* Relatórios que ainda não existem aqui entram inteiros, sem perguntar:
         não há nada para sobrescrever. */
      var conhecidos = {};
      state.projects.forEach(function (p) { conhecidos[p.id] = p; });
      var inteiros = incoming.filter(function (q) { return !conhecidos[q.id]; });
      var repetidos = incoming.filter(function (q) { return conhecidos[q.id]; });

      Promise.all(inteiros.map(function (q) {
        ['ncrs', 'devs'].forEach(function (k) {
          q[k].forEach(function (n) { n.syncBase = n.editedAt; });
        });
        return Store.save(q);
      }))
        .then(Store.list)
        .then(function (list) {
          state.projects = list;
          if (!repetidos.length) {
            loadProject(list.filter(function (p) { return p.id === incoming[0].id; })[0] || list[0]);
            toast(inteiros.length + ' relatório(s) importado(s) — ' + origem);
            return;
          }

          /* Já existe aqui: em vez de substituir, comparar item a item. */
          var alvo = repetidos[0];
          var localAlvo = state.projects.filter(function (p) { return p.id === alvo.id; })[0];
          loadProject(localAlvo);

          if (repetidos.length > 1) {
            toast('Mesclando "' + (alvo.marco || alvo.name) + '". Os demais relatórios repetidos ficam para uma próxima importação.');
          }
          openMergeDialog(diffBoth(localAlvo, alvo), origem);
        })
        .catch(function (e) { markError(e); alert('Falha ao ler os relatórios do arquivo.'); });
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------------- */
  /* inicialização                                                          */
  /* ---------------------------------------------------------------------- */

  function wire() {
    $('#marcoInput').addEventListener('input', function () {
      state.project.marco = this.value;
      state.project.name = this.value || 'Relatório sem nome';
      scheduleSave();
    });

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchKind(t.dataset.kind); });
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
        state.kind = 'ncr';   /* relatório novo começa pela aba NCR */
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
    $('#delNcrBtn').addEventListener('click', deleteNcr);
    $('#ncrFilter').addEventListener('input', renderNcrList);

    /* menu ⋯ */
    var menuPop = $('#menuPop');
    function closeMenu() {
      menuPop.hidden = true;
      $('#menuBtn').setAttribute('aria-expanded', 'false');
    }
    $('#menuBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      menuPop.hidden = !menuPop.hidden;
      $('#menuBtn').setAttribute('aria-expanded', menuPop.hidden ? 'false' : 'true');
    });
    document.addEventListener('click', function (e) {
      if (!menuPop.hidden && !menuPop.contains(e.target) && e.target !== $('#menuBtn')) closeMenu();
    });
    $$('.menu-item').forEach(function (b) { b.addEventListener('click', closeMenu); });

    /* nome de quem usa */
    $('#userBtn').addEventListener('click', openUserDialog);
    $('#userCancelBtn').addEventListener('click', function () { $('#userDialog').close(); });
    $('#userSaveBtn').addEventListener('click', function () {
      Store.setUser($('#userNameInput').value);
      $('#userDialog').close();
      renderUser();
      flushSave();
      toast(Store.getUser() ? 'Nome registrado: ' + Store.getUser() : 'Nome removido.');
    });
    $('#userNameInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#userSaveBtn').click(); }
    });

    /* lembrete de backup */
    $('#backupNoticeBtn').addEventListener('click', function () { exportBackup(true); });
    $('#backupNoticeDismiss').addEventListener('click', function () {
      noticeDismissed = true;
      renderBackupNotice();
    });

    $('#pendingOnly').addEventListener('change', renderNcrList);

    /* histórico de alterações */
    $('#mergeCancelBtn').addEventListener('click', function () {
      $('#mergeDialog').close();
      pendingMerge = null;
    });
    $('#mergeApplyBtn').addEventListener('click', applyMerge);
    $('#undoMergeBtn').addEventListener('click', undoMerge);

    $('#sessionsBtn').addEventListener('click', openSessions);
    $('#sessionInfoBtn').addEventListener('click', openSessions);
    $('#sessionsCloseBtn').addEventListener('click', function () { $('#sessionsDialog').close(); });
    $('#sessionsCopyBtn').addEventListener('click', function () {
      var txt = sessionSummaryText();
      if (!txt) { toast('Nada alterado nesta sessão.'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt)
          .then(function () { toast('Resumo da sessão copiado.'); })
          .catch(function () { toast('Não foi possível copiar.'); });
      } else {
        toast('Cópia indisponível neste navegador.');
      }
    });

    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsCloseBtn').addEventListener('click', function () { $('#settingsDialog').close(); });
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
    refreshUndo();
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
