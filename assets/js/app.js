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
  var isFluxos = function () { return state.kind === 'fluxos'; };
  var isConversa = function () { return state.kind === 'conversa'; };
  var isTabela = function () { return state.kind === 'tabela'; };
  /* Abas que tomam a tela inteira: não têm lista lateral nem formulário. */
  var telaCheia = function () {
    return isResumo() || isFluxos() || isConversa() || isTabela();
  };
  /** Lista de itens da aba ativa — o vetor de verdade, para alterar. */
  var items = function () {
    if (!state.project || telaCheia()) return [];
    return state.project[Store.itemsKey(state.kind)];
  };
  /** A mesma lista na ordem escolhida — para mostrar e para exportar. */
  var itemsNaOrdem = function () {
    if (!state.project || telaCheia()) return [];
    return Store.ordenar(state.project, state.kind);
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
  /**
   * Aviso rápido no pé da tela.
   * `acao` — {rotulo, fn} — vira um botão dentro do aviso: é assim que o
   * "Desfazer" da exclusão fica à mão sem virar mais uma janela.
   */
  function toast(msg, ms, acao) {
    var t = $('#toast');
    /* mostrar antes de escrever: escondido, o aviso está fora da árvore de
       acessibilidade e a mudança de texto não seria anunciada */
    t.hidden = false;
    t.textContent = '';
    t.appendChild(document.createTextNode(msg));
    if (acao) {
      var b = document.createElement('button');
      b.className = 'btn btn--sm btn--accent toast-acao';
      b.type = 'button';
      b.textContent = acao.rotulo;
      b.addEventListener('click', function () {
        t.hidden = true;
        clearTimeout(toastTimer);
        acao.fn();
      });
      t.appendChild(b);
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }

  var saveTimer = null;
  var ultimaCaptura = 0;
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
    Log.erro('salvar', 'não consegui gravar neste navegador', e,
      'o armazenamento do navegador pode estar cheio ou bloqueado. Faça um backup ' +
      '(⋯ Mais → Salvar backup de tudo) AGORA, antes de escrever mais.');
  }

  /** Grava o projeto atual com atraso, para não escrever a cada tecla. */
  function scheduleSave() {
    if (!state.project) return;
    markSaving();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  /* A pasta é rede: escrever a cada tecla seria lento e inútil. */
  function agendarGravacaoPasta() {
    if (!Pasta.ligada() || pastaEstado !== 'on') return;
    clearTimeout(gravaTimer);
    gravaTimer = setTimeout(function () { sincronizar({ silencioso: true, semRedesenhar: true }); }, 2500);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    if (!state.project) return Promise.resolve();
    return Store.save(state.project).then(function () {
      Log.detalhe('salvar', 'gravado neste navegador', {
        relatorio: state.project.marco || state.project.name,
        itens: (state.project.ncrs || []).length + (state.project.devs || []).length
      });
      agendarGravacaoPasta();
      /* O diário também vale para quem trabalha sem a pasta — mas não a cada
         tecla: de minuto em minuto a escrita já virou um parágrafo. */
      if (Date.now() - ultimaCaptura > 60000) {
        ultimaCaptura = Date.now();
        capturarRevisoes();
      }
      markSaved();
      refreshProjectSelect();
      refreshSuggestions();
      renderTabs();
      renderUser();
      renderBackupNotice();
      if (isResumo()) renderSummary();
      if (isFluxos()) renderFluxos(true);
      if (isTabela()) renderTabela(true);
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

  /**
   * Copia texto para a área de transferência.
   *
   * `navigator.clipboard` não existe fora de contexto seguro, e abrir o
   * programa do disco (`file://`) é exatamente isso — era assim que o arquivo
   * único respondia "cópia indisponível". A reserva é o `<textarea>` com
   * `execCommand('copy')`, que funciona em qualquer lugar por vir de um
   * clique do usuário.
   */
  function copiarTexto(txt, ok, falha) {
    ok = ok || function () {};
    falha = falha || function () {};
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, function () { reservaDeCopia(txt, ok, falha); });
      return;
    }
    reservaDeCopia(txt, ok, falha);
  }

  function reservaDeCopia(txt, ok, falha) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var deu = false;
    try { deu = document.execCommand('copy'); } catch (e) { deu = false; }
    ta.remove();
    if (deu) ok(); else falha();
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
    renderOrdem();
    renderNcrList();
    renderEditor();
    renderUser();
    renderSessionInfo();
    renderBackupNotice();
    if (isResumo()) renderSummary();
    if (isFluxos()) renderFluxos();
    if (isTabela()) renderTabela();
    if (isConversa()) renderCanais();
    markSaved();
  }

  /* --- abas NCR / DEV --------------------------------------------------- */

  function renderTabs() {
    if (!state.project) return;
    /* tinge a interface inteira com a cor da aba: à primeira vista já se sabe
       se o que está na tela é NCR, DEV ou resumo */
    document.body.dataset.kind = state.kind;
    $$('.tab').forEach(function (t) {
      var on = t.dataset.kind === state.kind;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      /* uma faixa de abas é um ponto só na tabulação; entre elas, as setas */
      t.tabIndex = on ? 0 : -1;
      /* a contagem é de itens: as abas que não têm itens usam a etiqueta
         para outra coisa (a Conversa mostra ali os recados não lidos) */
      var cnt = $('.tab-count', t);
      if (cnt && (t.dataset.kind === 'ncr' || t.dataset.kind === 'dev')) {
        cnt.textContent = state.project[Store.itemsKey(t.dataset.kind)].length;
      }
    });
    renderConversaBadge();

    /* resumo, fluxos e conversa trocam a tela inteira: não há lista nem formulário */
    $('#sidebarBody').hidden = telaCheia();
    $('#sidebarResumo').hidden = !isResumo();
    $('#sidebarFluxos').hidden = !isFluxos();
    $('#sidebarTabela').hidden = !isTabela();
    $('#sidebarConversa').hidden = !isConversa();
    $('#editorScroll').hidden = telaCheia();
    $('#editorScroll').setAttribute('aria-labelledby', isDev() ? 'tabDev' : 'tabNcr');
    $('#summaryScroll').hidden = !isResumo();
    $('#fluxosScroll').hidden = !isFluxos();
    $('#tabelaScroll').hidden = !isTabela();
    $('#conversaScroll').hidden = !isConversa();
    $('#previewBtn').hidden = telaCheia();
    renderAoLado();     /* o item ao lado só existe onde há editor ao lado dele */
    if (telaCheia()) {
      $('#pdfBtn').textContent = 'Exportar PDF…';
      return;
    }

    var t = kindName();
    $('#addNcrBtn').textContent = '+ Nova ' + t;
    $('#addNcrBtn').title = 'Adicionar ' + t + ' a este relatório';
    $('#sidebarTitle').textContent = t + 's';
    /* a busca não é só pelo número: dizer isso no campo é o que faz alguém
       tentar procurar por um certificado ou por um trecho do texto */
    $('#ncrFilter').placeholder = 'Buscar em todo o texto da ' + t + '…';
    $('#previewBtn').textContent = 'Pré-visualizar';
    $('#previewBtn').title = 'Ver as folhas do relatório de ' + t + ' como sairão no PDF';
  }

  function switchKind(kind) {
    if (state.kind === kind) return;
    state.kind = kind;
    renderTabs();
    if (isResumo()) { renderSummary(); return; }
    if (isFluxos()) { renderFluxos(); return; }
    if (isTabela()) { renderTabela(); return; }
    if (isConversa()) { abrirCanal(canalAberto); return; }
    renderNcrList();
    renderEditor();
    $('#editorScroll').scrollTop = 0;
  }

  /* ---------------------------------------------------------------------- */
  /* aba de resumo                                                           */
  /* ---------------------------------------------------------------------- */

  var summaryFilter = '';
  var summaryFiltros = {};
  /* aba Fluxos: recorte do que está à vista */
  var fluxosFiltro = {
    busca: '', soComFluxo: false, marcos: [], tipo: '',
    vista: 'lista', escopo: 'projeto',
    /* o marco do painel: qual é a chegada que estamos olhando */
    painel: ''
  };

  function renderSummary(semRolar) {
    SummaryView.render($('#summaryScroll'), state.projects, summaryFilter, {
      onFiltro: function (id) { summaryFilter = id; renderSummary(); },
      onFiltros: function (f) {
        var focado = document.activeElement;
        var eraBusca = focado && focado.type === 'search';
        summaryFiltros = f;
        renderSummary(true);
        /* a busca redesenha a cada tecla: devolve o cursor para o campo */
        if (eraBusca) {
          var novo = $('.sm-filtros input[type="search"]');
          if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
        }
      },
      onCsv: exportarCsv,
      onPdf: exportarResumoPdf,
      onBackup: function (project) {
        var antes = state.project;
        state.project = project;
        exportBackup(false);
        state.project = antes;
      }
    }, summaryFiltros);
    if (!semRolar) $('#summaryScroll').scrollTop = 0;
  }

  function exportarCsv(project) {
    var csv = SummaryView.toCsv(project, summaryFiltros);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download(blob, Report.suggestedFileName(project, 'csv').replace('WaiverRequest_', 'Resumo_'));
    toast('Planilha do marco salva.');
  }

  /** Monta as folhas A4 do resumo e manda para a impressão. */
  function exportarResumoPdf(project) {
    var root = $('#printRoot');
    root.innerHTML = '';
    /* A mesma paginação do relatório. Sem ela, um resumo com muitos itens
       passava do fim da folha e continuava colado na borda do papel — as
       margens do layout são padding da folha, e padding não se repete. */
    var medida = Report.abrirMedida(root);
    try {
      var folha = buildSummaryPage(project);
      root.appendChild(folha.pag);
      Report.paginar(folha.pag, root, function () {
        var c = el('section', 'rep-page rep-page--summary rep-page--cont');
        c.appendChild(el('div', 'rep-cover-title', folha.titulo + ' (cont.)'));
        return c;
      }, folha.rodape);
    } finally {
      Report.fecharMedida(medida);
    }
    var titulo = document.title;
    document.title = project
      ? Report.suggestedFileName(project, 'pdf', 'ncr').replace('WaiverRequest_', 'Resumo_').replace(/\.pdf$/, '')
      : 'Resumo_geral_' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = titulo; }, 500);
    }, 60);
  }

  /**
   * As folhas A4 com os números, os gráficos e a lista do escopo.
   *
   * Cada bloco é marcado `data-fluido`: é a unidade que a paginação leva
   * para a folha seguinte quando não couber nesta. A lista de itens vai
   * além — cada linha é uma unidade, para uma lista comprida ser partida no
   * ponto certo em vez de transbordar.
   */
  function buildSummaryPage(project) {
    var pg = el('section', 'rep-page rep-page--summary');
    /* acrescenta o bloco já marcado como movível */
    function fluido(node) {
      node.setAttribute('data-fluido', '');
      pg.appendChild(node);
      return node;
    }
    var alvos = project ? [project] : state.projects;
    var dados = Summary.compute(alvos, summaryFiltros);
    var st = project ? dados.porMarco[0] : dados.geral;

    var titulo = project
      ? 'Resumo de derrogações — ' + (Report.marcoOf(project, 'ncr') || project.name)
      : 'Resumo de derrogações — todos os marcos';
    pg.appendChild(el('div', 'rep-cover-title', titulo));
    fluido(el('div', 'sm-print-date',
      'Gerado em ' + new Date().toLocaleDateString('pt-BR') +
      (Store.getUser() ? ' por ' + Store.getUser() : '')));

    /* Um resumo filtrado que não diga que está filtrado engana quem o lê. */
    if (Summary.algumFiltro(summaryFiltros)) {
      var ditos = [];
      if (summaryFiltros.tipo) ditos.push('tipo: ' + (summaryFiltros.tipo === 'dev' ? 'DEV' : 'NCR'));
      if (summaryFiltros.situacao) ditos.push('situação: ' + summaryFiltros.situacao);
      if (summaryFiltros.sistema) ditos.push('sistema: ' + summaryFiltros.sistema);
      if (summaryFiltros.archStatus) ditos.push('arch status: ' + summaryFiltros.archStatus);
      if (summaryFiltros.evidencia) ditos.push(summaryFiltros.evidencia === 'com' ? 'só com anexo' : 'só sem anexo');
      if (summaryFiltros.busca) ditos.push('texto: “' + summaryFiltros.busca + '”');
      fluido(el('div', 'sm-print-filtro',
        'Recorte: ' + ditos.join(' · ') + ' — ' + st.total + ' de ' + st.totalSemFiltro + ' itens.'));
    }

    fluido(SummaryView.kpiRow(st));

    var g1 = SummaryView.bloco('Progresso');
    g1.appendChild(SummaryView.graficoProgresso(dados.porMarco));
    fluido(g1);

    var g2 = SummaryView.bloco('Situação dos itens (controle interno)');
    g2.appendChild(SummaryView.graficoSituacao(dados.porMarco));
    fluido(g2);

    var g3 = SummaryView.bloco('Itens por sistema');
    g3.appendChild(SummaryView.graficoSistemas(
      project ? dados.porMarco[0].porSistema : dados.geral.porSistema));
    fluido(g3);

    if ((st.parados || []).length) {
      pg.appendChild(SummaryView.blocoLista(
        'Parados há ' + Summary.DIAS_PARADO + '+ dias',
        'Pendentes sem nenhuma edição há ' + Summary.DIAS_PARADO + ' dias ou mais.',
        SummaryView.colunasParados(true), st.parados));
    }

    if (project) {
      pg.appendChild(SummaryView.blocoLista('Itens', null, [
        { titulo: 'Tipo', larg: 7, valor: function (r) { return r.kind === 'dev' ? 'DEV' : 'NCR'; } },
        { titulo: 'Número', larg: 22, valor: function (r) { return r.item.ncrId || '(sem número)'; } },
        { titulo: 'Sistemas', larg: 12, valor: function (r) { return r.item.systems || '—'; } },
        { titulo: 'Função / descrição', larg: 24, valor: function (r) { return r.item.func || '—'; } },
        { titulo: 'Situação', larg: 16, valor: function (r) { return Summary.situacao(r.item); } },
        /* "WAIVER REQUESTED" é a resposta mais comprida e a mais comum:
           mais estreito do que isto, ela sai partida ao meio */
        { titulo: 'Arch Status', larg: 19, valor: function (r) { return r.item.archStatus || '—'; } }
      ], dados.porMarco[0].linhas, 'Nenhum item neste recorte.'));
    }

    /* O rodapé fica dentro da folha desde já, para entrar na conta da
       paginação — e é repetido em cada folha de continuação. */
    var rodape = null;
    if (state.project && state.project.footer) {
      rodape = el('div', 'rep-footer', state.project.footer);
      pg.appendChild(rodape);
    }
    return { pag: pg, titulo: titulo, rodape: rodape };
  }

  /* ---------------------------------------------------------------------- */
  /* lista lateral de NCRs                                                  */
  /* ---------------------------------------------------------------------- */

  var dragFrom = null;

  /* ---------------------------------------------------------------------- */
  /* aba Fluxos — o caminho de cada item, tudo junto                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Uma linha por item, na ordem do PDF, com o fluxo já analisado.
   *
   * O escopo escolhido decide de onde vêm os itens: só o relatório aberto
   * (o de sempre) ou todos os marcos deste navegador — no mapa, ver o
   * caminho de um marco só responde metade da pergunta.
   */
  function linhasDeFluxo() {
    var out = [];
    var alvos = fluxosFiltro.escopo === 'todos'
      ? state.projects
      : (state.project ? [state.project] : []);
    alvos.forEach(function (p) {
      ['ncr', 'dev'].forEach(function (kind) {
        var marco = Report.marcoOf(p, kind) || p.name || 'sem marco';
        Store.ordenar(p, kind).forEach(function (item) {
          out.push({
            projeto: p, projetoId: p.id, marco: marco,
            kind: kind, item: item, fluxo: Fluxo.analisar(item.historic)
          });
        });
      });
    });
    return out;
  }

  function passaNoFiltroDeFluxo(r) {
    if (fluxosFiltro.soComFluxo && r.fluxo.vazio) return false;
    if (fluxosFiltro.tipo && r.kind !== fluxosFiltro.tipo) return false;
    /* marco marcado: só passa quem tem aquele card no próprio fluxo. É o que
       responde "o que veio do J04?" sem ler item por item. */
    if (!Fluxo.passaPor(r.fluxo, fluxosFiltro.marcos)) return false;
    var t = (fluxosFiltro.busca || '').trim().toLowerCase();
    if (!t) return true;
    var palheiro = (Store.textoBusca(r.item) + ' ' + Fluxo.caminhoTexto(r.fluxo)).toLowerCase();
    return palheiro.indexOf(t) >= 0;
  }

  /* As três leituras da mesma coisa. A lista responde "por onde passou esta
     NCR"; o mapa e a matriz respondem "por onde passou o trabalho deste
     marco", que é outra pergunta e não se enxerga em trinta desenhos
     separados. */
  var VISTAS = [
    { id: 'lista', nome: 'Lista', ajuda: 'Um fluxo por item, na ordem do PDF.' },
    { id: 'mapa', nome: 'Mapa do marco', ajuda: 'Todos os fluxos somados num desenho só: a seta engorda com o número de itens que passam por ela.' },
    { id: 'matriz', nome: 'Matriz de/para', ajuda: 'Uma linha por seta escrita, da mais usada para a menos.' },
    { id: 'painel', nome: 'Painel do marco', ajuda: 'Tudo o que está indo para um marco: quantos itens, de onde vêm, em que pé estão e quais são. Olha todos os relatórios deste navegador e sai em PDF.' }
  ];

  function vistaAtual() {
    var v = fluxosFiltro.vista || 'lista';
    return VISTAS.filter(function (x) { return x.id === v; })[0] || VISTAS[0];
  }

  function fluxosDe(linhas) {
    return linhas.map(function (r) { return r.fluxo; });
  }

  /* Os marcos que alguém escreveu como DESTINO de uma seta. O painel do J09
     só faz sentido se alguém disse "… To: J09" em algum lugar; oferecer a
     lista fixa dos marcos do programa encheria o seletor de painéis vazios. */
  function marcosDoPainel() {
    return Painel.marcosDeDestino(state.projects);
  }

  /**
   * O marco do painel. Sem escolha guardada, vale o marco do relatório
   * aberto — quase sempre é ele que a pessoa quer ver chegando.
   */
  function marcoDoPainel() {
    var lista = marcosDoPainel();
    if (!lista.length) return null;
    var achado = null;
    lista.forEach(function (m) { if (m.chave === fluxosFiltro.painel) achado = m; });
    if (achado) return achado;
    var meu = marcoDesteRelatorio();
    if (meu) lista.forEach(function (m) { if (!achado && m.chave === meu.chave) achado = m; });
    /* nada combinou: o último da fila é o marco mais adiantado que alguém
       escreveu, e é o que costuma estar por vir */
    return achado || lista[lista.length - 1];
  }

  /** O mapa: os fluxos dos itens à vista somados num desenho só. */
  function blocoMapaDeFluxo(linhas, paraImpressao) {
    var ag = Fluxo.agregado(fluxosDe(linhas));
    var bloco = SummaryView.bloco('Mapa do marco',
      ag.vazio
        ? 'Nenhum dos itens à vista tem waiver anterior escrito.'
        : ag.itens + ' item(ns) com fluxo, somados. A espessura da seta e o ' +
          'número ao lado dizem quantos itens passam por ali.');
    if (paraImpressao) bloco.setAttribute('data-fluido', '');
    if (ag.vazio) return bloco;

    var palco = el('div', 'fx-palco');
    palco.appendChild(Fluxo.svg(ag, {
      pesos: true,
      destaque: marcoDesteRelatorio()
    }));
    bloco.appendChild(palco);
    return bloco;
  }

  /** Quantos marcos cada item já atravessou — o waiver que vem se arrastando. */
  function blocoSaltos(linhas, paraImpressao) {
    var s = Fluxo.saltos(fluxosDe(linhas));
    var bloco = SummaryView.bloco('Quantos marcos cada item atravessou',
      'Um item em quatro colunas é um waiver renovado três vezes. ' +
      s.comFluxo + ' item(ns) com fluxo escrito.');
    if (paraImpressao) bloco.setAttribute('data-fluido', '');
    bloco.appendChild(Summary.barras(s.linhas, { vazio: 'Nenhum fluxo escrito ainda.' }));
    return bloco;
  }

  /** A matriz de/para: uma linha por seta, da mais usada para a menos. */
  function blocoMatriz(linhas) {
    var m = Fluxo.matriz(fluxosDe(linhas));
    return SummaryView.blocoLista('Matriz de/para',
      'Cada linha é uma seta escrita no Waiver Historic dos ' + m.itens +
      ' item(ns) com fluxo à vista.',
      [
        { titulo: 'De', larg: 26, valor: function (r) { return r.de; } },
        { titulo: 'Para', larg: 26, valor: function (r) { return r.para; } },
        { titulo: 'Itens', larg: 14, num: true, valor: function (r) { return r.peso; } },
        { titulo: 'Dos itens com fluxo', larg: 30, num: true, valor: function (r) {
          return m.itens ? Math.round((r.peso / m.itens) * 100) + '%' : '—';
        } }
      ],
      m.linhas, 'Nenhuma seta escrita nos itens à vista.');
  }

  function renderFluxos(semRolar) {
    var host = $('#fluxosScroll');
    if (!state.project) return;
    var antes = host.scrollTop;
    host.innerHTML = '';

    var todas = linhasDeFluxo();
    var linhas = todas.filter(passaNoFiltroDeFluxo);
    var comFluxo = todas.filter(function (r) { return !r.fluxo.vazio; }).length;
    var marcosDisponiveis = Fluxo.marcosCitados(fluxosDe(todas));
    var vista = vistaAtual();
    /* um índice por categoria, montado uma vez: a lista pergunta por cada
       card de cada item, e remontar a procura a cada pergunta seria refazer
       o mesmo trabalho dezenas de vezes */
    var idxs = { ncr: indiceDeAnteriores('ncr'), dev: indiceDeAnteriores('dev') };

    /* --- barra: o que está à vista e como exportar --- */
    var barra = el('div', 'sm-bar');
    var info = el('div', 'fx-info');
    info.appendChild(el('strong', null, vista.id === 'painel'
      ? 'Painel do marco'
      : (fluxosFiltro.escopo === 'todos'
        ? 'Todos os marcos deste navegador'
        : (Report.marcoOf(state.project, 'ncr') || state.project.name || 'sem marco'))));
    info.appendChild(el('span', null, vista.id === 'painel'
      ? 'O painel lê o Waiver Historic de todos os relatórios deste navegador.'
      : comFluxo + ' de ' + todas.length +
        ' item(ns) com waivers anteriores escritos · ' + linhas.length + ' no recorte.'));
    /* preenchido no fim, quando os cards já estão na tela e dá para contar
       quantos acharam o mesmo item em outro relatório */
    var achou = el('span', 'fx-achou');
    info.appendChild(achou);
    barra.appendChild(info);

    var acoes = el('div', 'sm-bar-actions');
    var bpdf = el('button', 'btn btn--sm btn--primary', 'Esta vista em PDF');
    bpdf.type = 'button';
    bpdf.title = 'Gera em A4 exatamente o que está na tela: ' + vista.nome.toLowerCase() +
      ', com o recorte aplicado.';
    bpdf.addEventListener('click', function () { exportarFluxosPdf(); });
    acoes.appendChild(bpdf);
    barra.appendChild(acoes);
    host.appendChild(barra);

    /* --- escolha da vista --- */
    var vistas = el('div', 'fx-vistas');
    vistas.setAttribute('role', 'tablist');
    vistas.setAttribute('aria-label', 'Como ver os fluxos');
    VISTAS.forEach(function (v) {
      var b = el('button', 'fx-vista' + (v.id === vista.id ? ' is-on' : ''), v.nome);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', v.id === vista.id ? 'true' : 'false');
      b.title = v.ajuda;
      b.addEventListener('click', function () {
        fluxosFiltro.vista = v.id;
        renderFluxos(true);
      });
      vistas.appendChild(b);
    });
    vistas.appendChild(el('span', 'fx-vista-ajuda', vista.ajuda));
    host.appendChild(vistas);

    /* O painel tem uma regra só — quem tem seta terminando no marco — e ela
       vale para todos os relatórios. Escopo, busca, tipo e "passa por" são do
       fluxo por item; mostrá-los aqui seria oferecer botões que não fazem
       nada. Quem recorta o painel é o seletor de marco, logo abaixo. */
    var soDoFluxo = vista.id !== 'painel';

    /* De onde vêm os itens. O mapa de um marco só responde "por onde passou
       este marco"; com todos, responde "por onde passa o programa". */
    var escopo = el('div', 'fx-vistas fx-vistas--escopo');
    escopo.appendChild(el('span', 'fx-marcos-rot', 'Itens de:'));
    [['projeto', 'este relatório'], ['todos', 'todos os marcos']].forEach(function (o) {
      var b = el('button', 'fx-vista' + (fluxosFiltro.escopo === o[0] ? ' is-on' : ''), o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', fluxosFiltro.escopo === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        fluxosFiltro.escopo = o[0];
        renderFluxos(true);
      });
      escopo.appendChild(b);
    });
    if (soDoFluxo) host.appendChild(escopo);

    /* --- filtros --- */
    var fb = el('div', 'sm-filtros');
    var busca = el('div', 'sm-bar-field');
    busca.appendChild(el('label', null, 'Buscar'));
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.value = fluxosFiltro.busca;
    inp.setAttribute('aria-label', fluxosFiltro.escopo === 'todos'
      ? 'Buscar nos itens de todos os marcos'
      : 'Buscar nos itens deste relatório');
    inp.placeholder = 'número, função ou marco do fluxo…';
    inp.addEventListener('input', function () {
      fluxosFiltro.busca = inp.value;
      renderFluxos(true);
      var novo = $('#fluxosScroll input[type="search"]');
      if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
    });
    busca.appendChild(inp);
    fb.appendChild(busca);

    var tipo = el('div', 'sm-bar-field sm-bar-field--curto');
    tipo.appendChild(el('label', null, 'Tipo'));
    var selTipo = document.createElement('select');
    selTipo.setAttribute('aria-label', 'Tipo de item');
    [['', 'NCR e DEV'], ['ncr', 'só NCR'], ['dev', 'só DEV']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      selTipo.appendChild(op);
    });
    selTipo.value = fluxosFiltro.tipo || '';
    selTipo.addEventListener('change', function () {
      fluxosFiltro.tipo = selTipo.value;
      renderFluxos(true);
    });
    tipo.appendChild(selTipo);
    fb.appendChild(tipo);

    var so = el('label', 'fx-check');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = fluxosFiltro.soComFluxo;
    cb.addEventListener('change', function () {
      fluxosFiltro.soComFluxo = cb.checked;
      renderFluxos(true);
    });
    so.appendChild(cb);
    so.appendChild(document.createTextNode(' esconder quem não tem fluxo'));
    fb.appendChild(so);
    if (soDoFluxo) host.appendChild(fb);

    /* --- filtro por marco: os marcos que os próprios textos citam --------- */
    if (marcosDisponiveis.length && soDoFluxo) {
      var chips = el('div', 'fx-marcos');
      chips.appendChild(el('span', 'fx-marcos-rot', 'Passa por:'));
      marcosDisponiveis.forEach(function (m) {
        var ligado = fluxosFiltro.marcos.indexOf(m.chave) >= 0;
        var b = el('button', 'fx-chip' + (ligado ? ' is-on' : ''), m.rotulo);
        b.type = 'button';
        b.appendChild(el('span', 'fx-chip-n', String(m.n)));
        b.setAttribute('aria-pressed', ligado ? 'true' : 'false');
        b.title = (ligado ? 'Tirar ' : 'Mostrar só ') + 'os itens cujo fluxo passa por ' +
          m.rotulo + ' (' + m.n + ' item(ns)).';
        b.addEventListener('click', function () {
          fluxosFiltro.marcos = ligado
            ? fluxosFiltro.marcos.filter(function (c) { return c !== m.chave; })
            : fluxosFiltro.marcos.concat([m.chave]);
          renderFluxos(true);
        });
        chips.appendChild(b);
      });
      if (fluxosFiltro.marcos.length) {
        var limpa = el('button', 'btn btn--sm', 'todos os marcos');
        limpa.type = 'button';
        limpa.addEventListener('click', function () {
          fluxosFiltro.marcos = [];
          renderFluxos(true);
        });
        chips.appendChild(limpa);
      }
      host.appendChild(chips);
    }

    /* --- o conteúdo da vista escolhida --- */
    if (vista.id === 'painel') {
      var mp = marcoDoPainel();
      host.appendChild(escolhaDoPainel(mp));
      var caixa = el('div', 'pn-tela');
      if (mp) Painel.montar(caixa, state.projects, mp, { abrir: abrirDaTabela });
      else caixa.appendChild(el('p', 'hint',
        'Nenhuma seta escrita ainda: o painel lê o campo “Waiver Historic” ' +
        'dos itens. Escreva “J08 To: J09” em um item e o J09 aparece aqui.'));
      host.appendChild(caixa);
      achou.textContent = '';
      if (!semRolar) host.scrollTop = 0; else host.scrollTop = antes;
      return;
    }
    if (vista.id === 'mapa') {
      host.appendChild(blocoMapaDeFluxo(linhas));
      host.appendChild(blocoSaltos(linhas));
    } else if (vista.id === 'matriz') {
      host.appendChild(blocoMatriz(linhas));
    } else {
      /* --- um bloco por categoria --- */
      ['ncr', 'dev'].forEach(function (kind) {
        var minhas = linhas.filter(function (r) { return r.kind === kind; });
        var nome = kind === 'dev' ? 'DEV' : 'NCR';
        var total = todas.filter(function (r) { return r.kind === kind; }).length;
        if (!total) return;
        var bloco = SummaryView.bloco(nome + 's', minhas.length + ' de ' + total +
          ' item(ns), na mesma ordem do PDF.');
        if (!minhas.length) {
          bloco.appendChild(el('p', 'hint', 'Nada aqui com este recorte.'));
        }
        minhas.forEach(function (r) { bloco.appendChild(linhaDeFluxo(r, false, idxs)); });
        host.appendChild(bloco);
      });
    }

    var marcados = $$('.fx-card.is-achado', host).length;
    achou.textContent = marcados
      ? marcados + ' card(s) com ponto: o mesmo item está no relatório daquele ' +
        'marco, aqui no navegador. Passe o mouse para ler o Arch Answer de lá.'
      : (vista.id === 'lista'
        ? 'Nenhum card com resposta de outro marco neste navegador.'
        : '');

    if (!semRolar) host.scrollTop = 0; else host.scrollTop = antes;
  }

  /** A escolha do marco do painel — a única coisa que o painel filtra. */
  function escolhaDoPainel(atual) {
    var box = el('div', 'fx-vistas fx-vistas--escopo pn-escolha');
    box.appendChild(el('span', 'fx-marcos-rot', 'Chegando no marco:'));
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Marco do painel');
    marcosDoPainel().forEach(function (m) {
      var op = document.createElement('option');
      op.value = m.chave;
      op.textContent = m.rotulo + ' (' + m.n + ')';
      sel.appendChild(op);
    });
    if (atual) sel.value = atual.chave;
    sel.addEventListener('change', function () {
      fluxosFiltro.painel = sel.value;
      renderFluxos(true);
    });
    box.appendChild(sel);
    box.appendChild(el('span', 'fx-vista-ajuda',
      'O painel olha todos os relatórios deste navegador e ignora os filtros ' +
      'acima: a regra dele é uma só — entra quem tem uma seta terminando neste marco.'));
    return box;
  }

  /** A linha de um item: identificação à esquerda, fluxo à direita. */
  function linhaDeFluxo(r, paraImpressao, idxs) {
    var linha = el('div', 'fx-linha');
    if (paraImpressao) linha.setAttribute('data-fluido', '');

    var id = el('div', 'fx-linha-id');
    var num = el('div', 'fx-linha-num', r.item.ncrId || '(sem número)');
    if (!paraImpressao) {
      var a = el('a', 'sm-link', r.item.ncrId || '(sem número)');
      a.href = '#';
      a.title = 'Abrir este item';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        /* com o escopo em "todos os marcos", o item pode estar em outro
           relatório: abrir sem trocar de relatório mostraria o item errado */
        if (r.projetoId && state.project && r.projetoId !== state.project.id) {
          abrirDaTabela(r);
          return;
        }
        state.kind = r.kind;
        renderTabs();
        renderNcrList();
        selectNcr(r.item.id);
      });
      num.textContent = '';
      num.appendChild(a);
    }
    id.appendChild(num);
    var partes = (r.kind === 'dev' ? [r.item.func] : [r.item.systems, r.item.func]);
    /* fora do relatório aberto, o número sozinho não identifica: a NCR-001 do
       J06 e a do J08 são itens diferentes */
    if (fluxosFiltro.escopo === 'todos' && r.marco) partes.unshift(r.marco);
    var sub = partes.filter(Boolean).join(' | ');
    id.appendChild(el('div', 'fx-linha-sub', sub || '—'));
    linha.appendChild(id);

    var palco = el('div', 'fx-palco fx-palco--linha');
    /* na impressão não vai `antes`: o papel não tem mouse, e a marca sem o
       balão seria uma pergunta sem resposta */
    palco.appendChild(Fluxo.svg(r.fluxo, {
      escala: 'compacto',
      destaque: marcoDesteRelatorio(),
      antes: paraImpressao ? null : buscadorDeAnteriores(idxs && idxs[r.kind], r.item),
      abrir: paraImpressao ? null : abrirAchado
    }));
    linha.appendChild(palco);
    return linha;
  }

  /**
   * O compilado em PDF. Usa a mesma paginação do relatório: uma lista
   * comprida não pode terminar no fim da folha e continuar na borda do papel.
   */
  function exportarFluxosPdf() {
    if (vistaAtual().id === 'painel') { exportarPainelPdf(); return; }
    var root = $('#printRoot');
    root.innerHTML = '';
    var medida = Report.abrirMedida(root);
    try {
      var pg = el('section', 'rep-page rep-page--summary');
      var marco = fluxosFiltro.escopo === 'todos'
        ? 'todos os marcos'
        : (Report.marcoOf(state.project, 'ncr') || state.project.name || '');
      pg.appendChild(el('div', 'rep-cover-title', 'Fluxo dos waivers — ' + marco));
      pg.appendChild(el('div', 'sm-print-date',
        'Gerado em ' + new Date().toLocaleDateString('pt-BR') +
        (Store.getUser() ? ' por ' + Store.getUser() : '')));

      var linhas = linhasDeFluxo().filter(passaNoFiltroDeFluxo);
      var vista = vistaAtual();

      /* o recorte tem de estar escrito na folha: fluxo filtrado que não diz
         que está filtrado é lido como se fosse o marco inteiro */
      var ditos = [];
      if (fluxosFiltro.tipo) ditos.push('tipo: ' + (fluxosFiltro.tipo === 'dev' ? 'DEV' : 'NCR'));
      if (fluxosFiltro.marcos.length) ditos.push('passa por: ' + fluxosFiltro.marcos.join(', '));
      if (fluxosFiltro.soComFluxo) ditos.push('só quem tem fluxo');
      if (fluxosFiltro.busca) ditos.push('texto: \u201c' + fluxosFiltro.busca + '\u201d');
      if (ditos.length) {
        var av = el('div', 'sm-print-filtro',
          'Recorte: ' + ditos.join(' \u00b7 ') + ' \u2014 ' + linhas.length + ' item(ns).');
        av.setAttribute('data-fluido', '');
        pg.appendChild(av);
      }

      if (vista.id === 'mapa') {
        pg.appendChild(blocoMapaDeFluxo(linhas, true));
        pg.appendChild(blocoSaltos(linhas, true));
      } else if (vista.id === 'matriz') {
        pg.appendChild(blocoMatriz(linhas));
      } else {
        var lista = el('div', 'fx-lista');
        lista.setAttribute('data-fluido', '');
        lista.setAttribute('data-lista', '');
        linhas.forEach(function (r) { lista.appendChild(linhaDeFluxo(r, true)); });
        if (!linhas.length) lista.appendChild(el('p', null, 'Nenhum item neste recorte.'));
        pg.appendChild(lista);
      }
      root.appendChild(pg);

      Report.paginar(pg, root, function () {
        var c = el('section', 'rep-page rep-page--summary rep-page--cont');
        c.appendChild(el('div', 'rep-cover-title', 'Fluxo dos waivers — ' + marco + ' (cont.)'));
        return c;
      });
    } finally {
      Report.fecharMedida(medida);
    }

    var titulo = document.title;
    document.title = Report.suggestedFileName(state.project, 'pdf', 'ncr')
      .replace('WaiverRequest_', 'Fluxos_').replace(/\.pdf$/, '');
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = titulo; }, 500);
    }, 60);
  }

  /**
   * O painel do marco em A4. Mesma montagem da tela — é o mesmo
   * `Painel.montar` —, só que sem os links e com os blocos marcados para a
   * paginação poder levá-los à folha seguinte.
   */
  function exportarPainelPdf() {
    var mp = marcoDoPainel();
    if (!mp) { toast('Não há marco de destino escrito em nenhum item.'); return; }
    var root = $('#printRoot');
    root.innerHTML = '';
    var medida = Report.abrirMedida(root);
    try {
      /* duas folhas de propósito: os números e os gráficos numa, a lista na
         outra (ver o comentário de Painel.montar). Cada uma é paginada por
         conta própria, então a lista comprida continua atravessando folhas
         com o cabeçalho repetido. */
      var cont = function (titulo) {
        return function () {
          var c = el('section', 'rep-page rep-page--summary rep-page--painel rep-page--cont');
          c.appendChild(el('div', 'rep-cover-title', titulo + ' (cont.)'));
          return c;
        };
      };
      var titulo = 'Painel do marco ' + mp.rotulo;

      var folha = el('section', 'rep-page rep-page--summary rep-page--painel');
      var res = Painel.montar(folha, state.projects, mp, { impressao: true, parte: 'painel' });
      root.appendChild(folha);
      Report.paginar(folha, root, cont(titulo));

      if (res.st.total) {
        var lista = el('section', 'rep-page rep-page--summary rep-page--painel');
        lista.appendChild(el('div', 'rep-cover-title', titulo));
        Painel.montar(lista, state.projects, mp, { impressao: true, parte: 'lista' });
        root.appendChild(lista);
        Report.paginar(lista, root, cont(titulo));
      }
    } finally {
      Report.fecharMedida(medida);
    }
    var titulo = document.title;
    document.title = 'Painel_' + mp.rotulo.replace(/[^\w]+/g, '_') + '_' + Report.timeStamp();
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = titulo; }, 500);
    }, 60);
  }

  /* ---------------------------------------------------------------------- */
  /* aba Tabela — todos os itens, de todos os relatórios                     */
  /* ---------------------------------------------------------------------- */

  /* Colunas e ordenação vêm do navegador de quem está aqui (Tabela.lerEstado);
     o filtro nasce vazio a cada abertura, de propósito — reabrir o programa
     com uma busca velha aplicada esconde itens sem dizer por quê. */
  var tabelaEstado = null;

  function renderTabela(semRolar) {
    var host = $('#tabelaScroll');
    if (!tabelaEstado) tabelaEstado = Tabela.lerEstado();
    var antes = host.scrollTop;
    /* a busca redesenha a cada tecla: guarda onde estava o cursor */
    var focado = document.activeElement;
    var eraBusca = focado && focado.id === 'tabelaBusca';
    var caret = eraBusca ? focado.selectionStart : 0;

    Tabela.render(host, state.projects, tabelaEstado, {
      onMudou: function () { renderTabela(true); },
      abrir: abrirDaTabela,
      onXlsx: exportarTabelaXlsx,
      onCsv: exportarTabelaCsv,
      onPdf: exportarTabelaPdf
    });

    if (eraBusca) {
      var novo = $('#tabelaBusca');
      if (novo) { novo.focus(); novo.setSelectionRange(caret, caret); }
    }
    host.scrollTop = semRolar ? antes : 0;
  }

  /**
   * Clique numa linha: abre aquele item, mesmo que ele esteja em outro marco.
   * Grava o que está na tela antes de sair — trocar de relatório redesenha
   * tudo, e o que estivesse esperando os 500 ms da gravação se perderia.
   */
  function abrirDaTabela(r) {
    var alvo = state.projects.filter(function (p) { return p.id === r.projetoId; })[0];
    if (!alvo) { toast('Esse relatório não está mais neste navegador.'); return; }
    function ir() {
      state.kind = r.kind;
      if (!state.project || alvo.id !== state.project.id) loadProject(alvo);
      renderTabs();
      renderNcrList();
      selectNcr(r.item.id);
      toast((r.item.ncrId || 'Item') + ' aberta no relatório ' + r.marco + '.');
    }
    flushSave().then(ir, ir);
  }

  function nomeDeArquivoDaTabela(ext) {
    return 'Derrogacoes_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.' + ext;
  }

  /** As linhas do "recorte": o que estava filtrado quando o arquivo saiu. */
  function recorteDaTabela(f, cols, quantos) {
    var linhas = [
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Gerado por', Store.getUser() || '(sem nome)'],
      ['Itens nesta planilha', quantos],
      ['Recorte', Tabela.descricaoDoFiltro(f, state.projects) || 'sem filtro — todos os itens'],
      ['Colunas', cols.map(function (c) { return c.titulo; }).join(' · ')],
      ['Observação', 'A ordem desta planilha é a da tela. Ela não altera a ordem ' +
        'dos itens no relatório nem no PDF.']
    ];
    return linhas;
  }

  /**
   * A planilha do Excel. Vai com duas abas: os itens e o recorte que os
   * produziu — planilha que anda pela empresa sem dizer de que filtro veio
   * é planilha que alguém lê como se fosse o total.
   */
  function exportarTabelaXlsx(lista, cols, f) {
    var planilha = {
      nome: 'Derrogações',
      colunas: cols.map(function (c) { return { titulo: c.titulo, larg: c.larg || 16 }; }),
      linhas: Tabela.valores(lista, cols)
    };
    var recorte = {
      nome: 'Recorte',
      colunas: [{ titulo: 'Campo', larg: 24 }, { titulo: 'Valor', larg: 80 }],
      linhas: recorteDaTabela(f, cols, lista.length),
      filtros: false
    };
    try {
      download(Xlsx.blob([planilha, recorte]), nomeDeArquivoDaTabela('xlsx'));
      toast('Planilha salva em Downloads: ' + lista.length + ' item(ns).', 4000);
    } catch (e) {
      markError(e);
      toast('Não foi possível gerar a planilha.');
    }
  }

  function exportarTabelaCsv(lista, cols, f) {
    var csv = Tabela.toCsv(lista, cols);
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nomeDeArquivoDaTabela('csv'));
    toast('CSV salvo em Downloads: ' + lista.length + ' item(ns).', 4000);
  }

  /** A mesma tabela em folhas A4, com a paginação do relatório. */
  function exportarTabelaPdf(lista, cols, f) {
    var root = $('#printRoot');
    root.innerHTML = '';
    var medida = Report.abrirMedida(root);
    var titulo = 'Derrogações — todos os marcos';
    /* com muita coluna, retrato parte toda palavra ao meio (medido: "MARCO"
       saindo "MARC O"). A folha deitada é a mesma das páginas de anexo. */
    var deitada = cols.length > 5 ? ' rep-page--landscape' : '';
    try {
      var pg = el('section', 'rep-page rep-page--summary' + deitada);
      pg.appendChild(el('div', 'rep-cover-title', titulo));
      var cab = el('div', 'sm-print-date',
        'Gerado em ' + new Date().toLocaleDateString('pt-BR') +
        (Store.getUser() ? ' por ' + Store.getUser() : '') +
        ' · ' + lista.length + ' item(ns)');
      cab.setAttribute('data-fluido', '');
      pg.appendChild(cab);

      var recorte = Tabela.descricaoDoFiltro(f, state.projects);
      if (recorte) {
        var av = el('div', 'sm-print-filtro', 'Recorte: ' + recorte + '.');
        av.setAttribute('data-fluido', '');
        pg.appendChild(av);
      }

      /* Larguras proporcionais ao que a coluna pede na planilha: sem isso,
         "Arch Status" e "Tipo" saem com a mesma fatia da folha.
         O rótulo entra na conta porque ele também tem de caber — uma coluna
         estreita demais sai com "MARCO" partido em "MARC O" no cabeçalho. */
      var peso = function (c) { return Math.max(c.larg || 16, c.titulo.length + 1); };
      var soma = cols.reduce(function (a, c) { return a + peso(c); }, 0);
      var colunas = cols.map(function (c) {
        return {
          titulo: c.titulo,
          num: !!c.num,
          larg: Math.max(6, Math.round((peso(c) / soma) * 100)),
          valor: function (r) { var v = c.valor(r); return (v === '' || v == null) ? '—' : String(v); }
        };
      });
      pg.appendChild(SummaryView.blocoLista('Itens', null, colunas, lista,
        'Nenhum item neste recorte.'));
      root.appendChild(pg);

      Report.paginar(pg, root, function () {
        var c = el('section', 'rep-page rep-page--summary rep-page--cont' + deitada);
        c.appendChild(el('div', 'rep-cover-title', titulo + ' (cont.)'));
        return c;
      });
    } finally {
      Report.fecharMedida(medida);
    }

    var doc = document.title;
    document.title = nomeDeArquivoDaTabela('pdf').replace(/\.pdf$/, '');
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = doc; }, 500);
    }, 60);
  }

  /* ---------------------------------------------------------------------- */
  /* aba Conversa — recados da equipe, pela pasta da rede                    */
  /* ---------------------------------------------------------------------- */

  /* Tudo o que este navegador conhece da conversa. A cópia que vale é a da
     pasta; esta existe para a aba abrir antes de a pasta responder, e para o
     que você escreveu não se perder se a rede estiver fora do ar. */
  var conversas = [];
  var canalAberto = Chat.GERAL;
  var pessoasConhecidas = [];
  var conversaTimer = null;
  var sincronizandoConversa = false;
  /* arquivo de conversa gravado por uma versão mais nova: só leitura, pela
     mesma razão dos dados — o que esta página não conhece sumiria */
  var conversaSoLeitura = false;
  var caixaDeTexto = null;

  function podeConversar() {
    return Chat.ligado() && Pasta.ligada() && pastaEstado === 'on';
  }

  function atualizarPessoas() {
    pessoasConhecidas = Chat.pessoas(state.projects, conversas, Store.getUser());
    return pessoasConhecidas;
  }

  function nomeDaChave(chave) {
    var achado = pessoasConhecidas.filter(function (p) { return p.chave === chave; })[0];
    return achado ? achado.nome : chave;
  }

  function rotuloCanal(canal) {
    return canal === Chat.GERAL ? 'Geral' : nomeDaChave(Chat.outroLado(canal, Store.getUser()));
  }

  /** Recados não lidos, na etiqueta da aba. */
  function renderConversaBadge() {
    var tab = $('.tab[data-kind="conversa"]');
    if (!tab) return;
    tab.hidden = !Chat.ligado();
    var box = $('#conversaCount');
    var n = Chat.ligado() ? Chat.naoLidas(conversas, Store.getUser()).total : 0;
    box.hidden = !n;
    tab.title = n
      ? n + (n === 1 ? ' recado não lido' : ' recados não lidos')
      : 'Recados da equipe, pela pasta da rede';
  }

  /** A lista de canais, na lateral: o geral e uma linha por pessoa. */
  function renderCanais() {
    var host = $('#convCanais');
    if (!host) return;
    host.innerHTML = '';
    atualizarPessoas();
    var contas = Chat.naoLidas(conversas, Store.getUser()).canais;

    function linha(canal, rotulo, sub) {
      var b = el('button', 'conv-canal' + (canal === canalAberto ? ' is-on' : ''));
      b.type = 'button';
      var topo = el('div', 'conv-canal-topo');
      topo.appendChild(el('span', 'conv-canal-nome', rotulo));
      var n = contas[canal] || 0;
      if (n) topo.appendChild(el('span', 'conv-canal-n', String(n)));
      b.appendChild(topo);
      if (sub) b.appendChild(el('span', 'conv-canal-sub', sub));
      b.addEventListener('click', function () { abrirCanal(canal); });
      host.appendChild(b);
    }

    linha(Chat.GERAL, 'Geral', 'todo mundo que abre esta pasta');
    host.appendChild(el('div', 'conv-canais-tit', 'Conversa direta'));

    if (!Store.getUser()) {
      host.appendChild(el('p', 'hint',
        'Informe o seu nome (no menu “⋯ Mais”) para falar com alguém em separado.'));
      return;
    }
    if (!pessoasConhecidas.length) {
      host.appendChild(el('p', 'hint',
        'Ninguém mais assinou nada nesta pasta ainda. Quem editar um item ou ' +
        'escrever no geral aparece aqui.'));
      return;
    }
    pessoasConhecidas.forEach(function (p) {
      linha(Chat.canalDireto(Store.getUser(), p.nome), p.nome, '');
    });
  }

  /** Lido até a mensagem mais nova que está à vista neste canal. */
  function marcarCanalLido(canal) {
    var msgs = Chat.doCanal(conversas, canal);
    Chat.marcarLido(canal, msgs.length ? msgs[msgs.length - 1].em : '');
  }

  function abrirCanal(canal) {
    canalAberto = canal;
    marcarCanalLido(canal);
    renderCanais();
    renderConversa();
    renderConversaBadge();
  }

  /**
   * Monta a aba. O campo de escrever é montado aqui e só aqui: a lista de
   * mensagens se redesenha sozinha a cada sincronização, e refazer o campo
   * junto apagaria o que está sendo digitado.
   */
  function renderConversa() {
    var host = $('#conversaScroll');
    if (!host) return;
    var rascunho = caixaDeTexto ? caixaDeTexto.value : '';
    host.innerHTML = '';
    caixaDeTexto = null;

    var cab = el('div', 'conv-cab');
    cab.appendChild(el('strong', null, rotuloCanal(canalAberto)));
    cab.appendChild(el('span', 'conv-cab-sub', canalAberto === Chat.GERAL
      ? 'Recado para quem abrir esta pasta.'
      : 'Conversa entre você e ' + rotuloCanal(canalAberto) + '.'));
    host.appendChild(cab);

    /* O aviso não é enfeite: sem ele alguém trataria a conversa direta como
       canal reservado, que ela não é. */
    var aviso = el('div', 'conv-aviso');
    aviso.appendChild(el('strong', null, 'Isto não é canal seguro. '));
    aviso.appendChild(document.createTextNode(
      'Tudo fica num arquivo dentro da pasta da rede (' + Pasta.CONVERSAS + '), ' +
      'inclusive as conversas diretas: quem abre a pasta pode ler. E o nome é o ' +
      'que cada um digitou — não há senha que prove quem escreveu.'));
    host.appendChild(aviso);

    if (!Pasta.ligada() || pastaEstado !== 'on') {
      var sem = el('div', 'conv-sem-pasta');
      sem.appendChild(el('strong', null, 'A pasta da rede não está ligada. '));
      sem.appendChild(document.createTextNode(
        'O que você escrever fica só neste navegador até a pasta voltar — ' +
        'e ninguém mais vê. Ligue em “⋯ Mais → Pasta da rede como banco de dados”.'));
      host.appendChild(sem);
    } else if (conversaSoLeitura) {
      host.appendChild(el('div', 'conv-sem-pasta',
        'A conversa desta pasta foi gravada por uma versão mais nova do programa. ' +
        'Só leitura até você recarregar a página (Ctrl+F5).'));
    }

    var lista = el('div', 'conv-lista');
    lista.id = 'convLista';
    host.appendChild(lista);

    var form = el('div', 'conv-form');
    var caixa = document.createElement('textarea');
    caixa.rows = 2;
    caixa.id = 'convTexto';
    caixa.maxLength = Chat.MAX_TEXTO;
    caixa.placeholder = 'Escreva o recado… (Enter envia, Shift+Enter quebra a linha)';
    caixa.value = rascunho;
    caixa.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarConversa(); }
    });
    form.appendChild(caixa);
    caixaDeTexto = caixa;

    var enviar = el('button', 'btn btn--primary', 'Enviar');
    enviar.type = 'button';
    enviar.id = 'convEnviarBtn';
    enviar.addEventListener('click', enviarConversa);
    form.appendChild(enviar);
    host.appendChild(form);

    renderMensagens(true);
  }

  /** Só a lista de mensagens — é o que a sincronização redesenha. */
  function renderMensagens(irParaOFim) {
    var lista = $('#convLista');
    if (!lista) return;
    /* quem estava lendo mais acima não é jogado para o fim a cada recado */
    var colado = irParaOFim ||
      (lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 30);
    lista.innerHTML = '';

    var msgs = Chat.doCanal(conversas, canalAberto).filter(function (m) { return !m.apagada; });
    if (!msgs.length) {
      lista.appendChild(el('p', 'hint', canalAberto === Chat.GERAL
        ? 'Nenhum recado ainda. O primeiro é seu.'
        : 'Vocês ainda não trocaram nenhum recado.'));
      return;
    }

    var meu = Chat.chaveNome(Store.getUser());
    var diaAnterior = '';
    msgs.forEach(function (m) {
      var dia = String(m.em).slice(0, 10);
      if (dia !== diaAnterior) {
        diaAnterior = dia;
        var d = new Date(m.em);
        lista.appendChild(el('div', 'conv-dia',
          isNaN(d) ? dia : d.toLocaleDateString('pt-BR')));
      }

      var ehMinha = Chat.chaveNome(m.de) === meu && !!meu;
      var linha = el('div', 'conv-msg' + (ehMinha ? ' is-minha' : ''));
      var cabMsg = el('div', 'conv-msg-cab');
      cabMsg.appendChild(el('span', 'conv-msg-quem', m.de || 'sem nome'));
      cabMsg.appendChild(el('span', 'conv-msg-quando', horaDe(m.em)));
      if (ehMinha) {
        var x = el('button', 'conv-msg-apagar', '✕');
        x.type = 'button';
        x.title = 'Apagar este recado para todo mundo';
        x.addEventListener('click', function () { apagarMensagem(m); });
        cabMsg.appendChild(x);
      }
      linha.appendChild(cabMsg);
      linha.appendChild(el('div', 'conv-msg-txt', m.texto));
      lista.appendChild(linha);
    });

    if (colado) lista.scrollTop = lista.scrollHeight;
  }

  function horaDe(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function enviarConversa() {
    var texto = (caixaDeTexto ? caixaDeTexto.value : '').trim();
    if (!texto) return;
    /* o recado é assinado: sem nome não dá para saber de quem veio */
    if (!Store.getUser()) {
      openUserDialog(function () { enviarConversa(); });
      toast('Informe o seu nome — é ele que assina o recado.');
      return;
    }
    conversas = Chat.juntar(conversas, [Chat.nova(canalAberto, texto, Store.getUser())]);
    Chat.gravarLocais(conversas);
    marcarCanalLido(canalAberto);
    caixaDeTexto.value = '';
    caixaDeTexto.focus();
    renderMensagens(true);
    renderCanais();
    renderConversaBadge();
    sincronizarConversas({ forcar: true }).then(function (r) {
      if (r === 'sem-pasta') {
        toast('Sem a pasta da rede, o recado fica só neste navegador.', 4500);
      }
    });
  }

  /* Apagar vale para todo mundo: a marca viaja junto, senão o recado voltaria
     pela sincronização de quem ainda não soube — a mesma lápide dos itens. */
  function apagarMensagem(m) {
    if (!confirm('Apagar este recado para todo mundo?')) return;
    m.apagada = true;
    m.texto = '';
    Chat.gravarLocais(conversas);
    renderMensagens();
    sincronizarConversas({ forcar: true });
  }

  /**
   * Lê a conversa da pasta, junta com a daqui e grava de volta o resultado.
   *
   * Ler-juntar-gravar, e não só gravar: dois navegadores escrevendo ao mesmo
   * tempo apagariam o recado um do outro. Como mensagem não se edita, a
   * junção é união por identificador — e sempre converge.
   */
  function sincronizarConversas(opts) {
    opts = opts || {};
    if (!Chat.ligado()) return Promise.resolve(null);
    if (!Pasta.ligada() || pastaEstado !== 'on') return Promise.resolve('sem-pasta');
    if (sincronizandoConversa) return Promise.resolve(null);
    sincronizandoConversa = true;

    var antes = Chat.naoLidas(conversas, Store.getUser()).total;
    return Pasta.lerConversas()
      .then(function (dados) {
        if (dados && Number(dados.schema) > 1) conversaSoLeitura = true;
        var remotas = (dados && Array.isArray(dados.mensagens)) ? dados.mensagens : [];
        conversas = Chat.juntar(conversas, remotas);
        Chat.gravarLocais(conversas);
        if (conversaSoLeitura) return false;
        if (!opts.forcar && !Chat.faltamLa(conversas, remotas)) return false;
        return Pasta.gravarConversas(Chat.envelope(conversas));
      })
      .then(function () {
        sincronizandoConversa = false;
        var depois = Chat.naoLidas(conversas, Store.getUser()).total;
        if (isConversa()) {
          /* o canal aberto está à vista: o que chega nele já está lido */
          marcarCanalLido(canalAberto);
          renderMensagens();
          renderCanais();
        } else if (depois > antes) {
          toast('Recado novo na aba Conversa.', 4000);
        }
        renderConversaBadge();
        return depois;
      })
      .catch(function (e) {
        sincronizandoConversa = false;
        Log.aviso('conversa', 'os recados não foram trocados com a pasta desta vez',
          Pasta.explicar(e) + ' As suas mensagens continuam aqui e vão na próxima.',
          { erro: e && e.name });
        return null;
      });
  }

  /* De tempos em tempos, como os dados. Não é conversa ao vivo, e o programa
     não promete que seja: o recado chega na próxima leitura da pasta. */
  function agendarConversa() {
    clearInterval(conversaTimer);
    if (!Chat.ligado()) return;
    conversaTimer = setInterval(function () {
      if (!podeConversar() || sincronizandoConversa) return;
      if (document.hidden) return;
      sincronizarConversas({});
    }, POLL_MS);
  }

  function iniciarConversa() {
    conversas = Chat.juntar(Chat.locais(), []);
    renderConversaBadge();
    agendarConversa();
    if (podeConversar()) sincronizarConversas({});
  }

  function renderNcrList() {
    var ul = $('#ncrList');
    ul.innerHTML = '';
    var rows = itemsNaOrdem();
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
      /* a busca alcança todo o texto do item — é o que responde "onde foi
         mesmo que a gente citou aquele certificado?" */
      if (term && Store.textoBusca(ncr).indexOf(term) === -1) return;
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

      /* o trilho colorido à esquerda e o ponto na direita mostram em que pé
         está o item sem precisar abri-lo */
      var st = Store.statusInfo(ncr.status);
      li.style.setProperty('--st', st.cor);
      li.title = 'Situação: ' + st.nome;

      var badges = el('div', 'ncr-item-badge');
      var imgCount = ncr.evidence.reduce(function (s, e) { return s + e.images.length; }, 0);
      if (imgCount) badges.appendChild(el('span', null, '🖼 ' + imgCount));
      /* o item com anotação é o que tem pendência escrita: dá para varrer a
         lista e achar onde alguém parou, sem abrir um por um */
      /* veio do marco anterior e ainda não foi conferido: é o lembrete que
         o Bruno pediu — "algumas informações terão que ser alteradas" */
      var herd = (ncr.herdadoDe || '').trim();
      if (herd) {
        var hb = el('span', 'herd-dot', '⤵');
        hb.title = 'Herdada do ' + herd + ' — confira o que precisa mudar neste marco.';
        badges.appendChild(hb);
      }
      var anot = (ncr.nota || '').trim();
      if (anot) {
        var nb = el('span', 'nota-dot', '📝');
        nb.title = 'Observação interna: ' +
          (anot.length > 160 ? anot.slice(0, 160) + '…' : anot);
        badges.appendChild(nb);
      }
      if (ncr.done) {
        li.classList.add('is-done');
        badges.appendChild(el('span', 'done-tick', '✓'));
      } else {
        var sd = el('span', 'status-dot');
        sd.title = 'Situação: ' + st.nome;
        badges.appendChild(sd);
      }
      if (mudancasDeFora[ncr.id]) {
        var fora = el('span', 'fora-dot', '⇄');
        fora.title = 'Alterado por outra pessoa — abra o item para ver o que mudou';
        badges.appendChild(fora);
      }
      if (touched[ncr.id]) {
        li.classList.add('is-touched');
        var dot = el('span', 'touch-dot', '●');
        dot.title = 'Você ' + actionLabel(touched[ncr.id]) + ' este item nesta sessão';
        badges.appendChild(dot);
      }
      if (badges.childNodes.length) li.appendChild(badges);

      var mover = el('div', 'ncr-move-box');
      [['↑', -1, 'Subir'], ['↓', 1, 'Descer']].forEach(function (m) {
        var bt = el('button', 'ncr-move', m[0]);
        bt.type = 'button';
        bt.dataset.passo = String(m[1]);
        bt.setAttribute('aria-label', m[2] + ' ' + (ncr.ncrId || 'item sem número'));
        bt.title = m[2] + ' na ordem da lista e do PDF';
        bt.addEventListener('click', function (e) {
          e.stopPropagation();
          moverNcr(ncr.id, m[1]);
        });
        mover.appendChild(bt);
      });
      li.appendChild(mover);

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
      ? done + ' de ' + total + ' com waiver accepted'
      : '';
    box.classList.toggle('is-complete', total > 0 && done === total);
  }

  /* Arrastar exige um gesto de ponteiro que nem todo mundo consegue fazer
     (WCAG 2.5.7). Os mesmos passos, com um clique só — e pelo teclado. */
  function moverNcr(id, passo) {
    if (!state.project) return;
    if (state.project.ordem !== 'manual') fixarOrdem(true);
    var list = items();
    var de = list.findIndex(function (n) { return n.id === id; });
    var para = de + passo;
    if (de < 0 || para < 0 || para >= list.length) return;
    list.splice(para, 0, list.splice(de, 1)[0]);
    renderNcrList();
    renderOrdem();
    scheduleSave();
    var volta = $('.ncr-item[data-id="' + id + '"] .ncr-move[data-passo="' + passo + '"]');
    if (volta) volta.focus();
  }

  function moveNcr(fromId, toId) {
    /* Arrastar é um gesto manual: se havia uma ordenação automática, ela vira
       o ponto de partida da ordem manual, em vez de a arrastada ser desfeita
       no próximo desenho da tela. */
    if (state.project.ordem !== 'manual') fixarOrdem(true);
    var list = items();
    var from = list.findIndex(function (n) { return n.id === fromId; });
    var to = list.findIndex(function (n) { return n.id === toId; });
    if (from < 0 || to < 0 || from === to) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    renderNcrList();
    renderOrdem();
    scheduleSave();
  }

  /** Grava a ordem que está à vista como a ordem manual do relatório. */
  function fixarOrdem(silencioso) {
    var chave = Store.itemsKey(state.kind);
    state.project[chave] = itemsNaOrdem();
    state.project.ordem = 'manual';
    if (!silencioso) {
      renderNcrList();
      renderOrdem();
      scheduleSave();
      toast('Ordem fixada. Agora dá para ajustar arrastando os itens.');
    }
  }

  function renderOrdem() {
    var sel = $('#ordemSelect');
    if (!sel || !state.project) return;
    if (!sel.options.length) {
      Store.ORDENS.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o.id; op.textContent = o.nome; op.title = o.ajuda;
        sel.appendChild(op);
      });
    }
    var atual = Store.ordemInfo(state.project.ordem);
    sel.value = atual.id;
    sel.title = atual.ajuda + '\nVale também para a ordem das páginas no PDF.';
    $('#ordemFixarBtn').hidden = atual.id === 'manual';
    $('#sidebarEmptyDrag').hidden = atual.id !== 'manual';
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
    /* sem a lápide o item voltaria na próxima sincronização, vindo do
       computador de quem ainda não soube da exclusão */
    Store.tombstone(state.project, state.kind, ncr);
    var list = items();
    var at = list.findIndex(function (n) { return n.id === ncr.id; });
    list.splice(at, 1);
    setSelectedId(list.length ? list[Math.min(at, list.length - 1)].id : null);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
    toast(kindName() + ' "' + (ncr.ncrId || 'sem número') + '" excluída.', 9000, {
      rotulo: '↩ Desfazer',
      fn: function () { desfazerExclusao(state.project, state.kind, ncr, at); }
    });
  }

  /**
   * Traz de volta o item que acabou de ser excluído.
   *
   * Tirar a lápide não basta: ela pode já ter viajado para o computador do
   * colega. O que faz o item sobreviver lá também é a hora de edição nova,
   * posterior à exclusão — pela regra da mesclagem, quem editou por último
   * vence a lápide.
   */
  function desfazerExclusao(projeto, kind, item, posicao) {
    var lista = projeto[Store.itemsKey(kind)];
    var lapide = (projeto.deleted || []).filter(function (t) { return t.id === item.id; })[0];
    projeto.deleted = (projeto.deleted || []).filter(function (t) { return t.id !== item.id; });
    lista.splice(Math.min(posicao, lista.length), 0, item);

    if (state.project && state.project.id === projeto.id) {
      state.kind = kind;
      setSelectedId(item.id);
      touch(item, 'criou');
      /* na sessão o item não foi "excluído": foi excluído e trazido de volta,
         o que é uma edição — deixar "excluiu" no histórico seria mentira */
      var sess = currentSession();
      if (sess) {
        sess.changes.forEach(function (c) { if (c.itemId === item.id) c.action = 'editou'; });
      }
    } else {
      item.editedBy = Store.getUser();
      item.editedAt = Store.nowIso();
    }
    /* A hora de edição tem de ficar depois da lápide: é ela que ressuscita o
       item também no computador de quem já recebeu a exclusão. */
    if (lapide) item.editedAt = Store.depoisDe(lapide.at);

    if (state.project && state.project.id === projeto.id) {
      renderTabs();
      renderNcrList();
      renderEditor();
      scheduleSave();
    } else {
      Store.save(projeto).then(agendarGravacaoPasta).catch(markError);
    }
    toast('"' + (item.ncrId || 'sem número') + '" de volta.');
  }

  /** Cópia do item selecionado, logo abaixo dele. */
  function duplicarNcr() {
    var ncr = currentNcr();
    if (!ncr) return;
    var copia = Store.duplicar(ncr);
    var list = items();
    var at = list.findIndex(function (n) { return n.id === ncr.id; });
    list.splice(at + 1, 0, copia);
    touch(copia, 'criou');
    /* A cópia nasce ao lado do original; com a lista em outra ordem, isso só
       se vê depois de fixar a ordem — mas o item existe do mesmo jeito. */
    setSelectedId(copia.id);
    renderTabs();
    renderNcrList();
    renderEditor();
    scheduleSave();
    var campo = $('#f-ncrId');
    if (campo) { campo.focus(); campo.select(); }
    toast('Cópia criada. Troque o número — ele veio marcado como "(cópia)".', 5000);
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

  /**
   * O bloco de anotação do item.
   *
   * Existe para o caso mais comum do dia a dia: o preenchimento está parado e
   * o motivo mora na cabeça de quem parou. O campo Situação já diz *que* está
   * pendente ("Em preenchimento", "Improve justification"); aqui fica o *por
   * quê* — o que falta, o que foi combinado, de quem se espera resposta.
   *
   * Duas regras que valem sempre:
   * - **Não sai no PDF.** É recado interno, como o campo Situação (§4). Quem
   *   monta a folha é o SECTIONS do report.js, e a nota não está lá.
   * - **Vale com o item travado.** Anotar não é editar o documento: um waiver
   *   aceito continua aceito, e é justamente nele que se anota "conferir o
   *   certificado na próxima revisão". Daí o `data-livre`.
   */
  function cardDeAnotacao(ncr) {
    var c = card('Observação interna', '#E4A11B');
    c.classList.add('card--nota');

    var acoes = el('div', 'nota-acoes');
    acoes.style.marginLeft = 'auto';
    var limpar = el('button', 'btn btn--sm', 'Apagar anotação');
    limpar.type = 'button';
    limpar.setAttribute('data-livre', '');
    limpar.title = 'Tira a anotação do item — dá para desfazer logo depois';
    limpar.hidden = !(ncr.nota || '').trim();
    acoes.appendChild(limpar);
    $('h3', c).appendChild(acoes);

    c.appendChild(el('div', 'hint nota-aviso',
      'Fica só aqui e na pasta da equipe: não entra no relatório em PDF. ' +
      'A busca da lista e a aba Tabela alcançam este texto.'));

    var campo = field('O que está pendente, e por quê', 'nota', {
      rows: 3,
      placeholder: 'esperando o certificado do fornecedor — cobrar na reunião de 5ª'
    });
    var ta = $('#f-nota', campo);
    /* a anotação continua editável no item aceito: ver o comentário acima */
    ta.setAttribute('data-livre', '');

    /* Só redesenha a lista quando o 📝 aparece ou some — refazer a lateral a
       cada tecla de um texto comprido é trabalho à toa. */
    var tinha = !!(ncr.nota || '').trim();
    ta.addEventListener('input', function () {
      var agora = !!ta.value.trim();
      limpar.hidden = !agora;
      if (agora === tinha) return;
      tinha = agora;
      renderNcrList();
    });

    limpar.addEventListener('click', function () {
      var n = currentNcr();
      if (!n) return;
      var antes = n.nota || '';
      if (!antes.trim()) return;
      n.nota = '';
      touch(n);
      renderNcrList();
      renderEditor();
      scheduleSave();
      toast('Anotação apagada.', 6000, {
        rotulo: 'Desfazer',
        fn: function () {
          var alvo = currentNcr();
          if (!alvo) return;
          alvo.nota = antes;
          touch(alvo);
          renderNcrList();
          renderEditor();
          scheduleSave();
        }
      });
    });

    c.appendChild(campo);
    return c;
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
      if (SUGGEST.indexOf(key) >= 0) input.setAttribute('list', listId(key));
    }
    input.id = id;
    input.value = ncr[key] || '';
    /* O texto de fundo é um exemplo do padrão, não um valor preenchido: o
       "ex.:" e a letra menor (app.css) deixam isso claro. */
    if (opts.placeholder) input.placeholder = 'ex.: ' + opts.placeholder;
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

  /** Clareia uma cor do relatório para servir de fundo (k = quanto de branco). */
  function tint(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var mix = function (c) { return Math.round(c + (255 - c) * k); };
    return 'rgb(' + mix(n >> 16) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
  }

  function card(title, swatchColor) {
    var c = el('div', 'card');
    var h = el('h3');
    if (swatchColor) {
      var sw = el('span', 'swatch');
      sw.style.background = swatchColor;
      h.appendChild(sw);
      c.style.setProperty('--card-color', swatchColor);
      c.style.setProperty('--card-tint', tint(swatchColor, .93));
    }
    h.appendChild(document.createTextNode(title));
    c.appendChild(h);
    return c;
  }

  function renderEditor() {
    var host = $('#editorScroll');
    host.innerHTML = '';
    var ncr = currentNcr();

    renderAoLado();
    if (!state.project) return;
    if (!ncr) {
      var empty = el('div', 'editor-empty');
      empty.appendChild(el('p', null, 'Nenhuma ' + kindName() + ' selecionada.'));
      empty.appendChild(el('p', null, 'Use “+ Nova ' + kindName() + '” no painel à esquerda para começar, ' +
        'ou abra um arquivo de backup pelo menu “⋯ Mais”.'));
      host.appendChild(empty);
      return;
    }

    /* A faixa de herdada vem antes de tudo: é a primeira coisa a saber sobre
       um item que chegou pronto de outro marco. */
    var herd = cardDeHerdada(ncr);
    if (herd) host.appendChild(herd);

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
    /* Ao lado do título, como o "Recolher preenchidos" do cartão de baixo.
       `data-livre` porque só mostra: vale mesmo com o item travado. */
    var ladoBtn = el('button', 'btn btn--sm', '⇥ Ver outra ao lado');
    ladoBtn.type = 'button';
    ladoBtn.title = 'Mostra outro item numa coluna à direita, em só leitura';
    ladoBtn.setAttribute('data-livre', '');
    ladoBtn.addEventListener('click', abrirEscolhaDoLado);

    /* Também só mostra — por isso `data-livre`, que o vale no item travado. */
    var histBtn = el('button', 'btn btn--sm', '🕘 Histórico do texto');
    histBtn.type = 'button';
    histBtn.title = 'Quem escreveu o quê neste item, campo a campo — e como trazer um texto de volta';
    histBtn.setAttribute('data-livre', '');
    histBtn.addEventListener('click', function () { abrirHistorico('item'); });

    var acoesId = el('div', 'nota-acoes');
    acoesId.style.marginLeft = 'auto';
    acoesId.appendChild(histBtn);
    acoesId.appendChild(ladoBtn);
    $('h3', idCard).appendChild(acoesId);

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

    /* --- a anotação, antes do conteúdo do documento --- */
    host.appendChild(cardDeAnotacao(ncr));

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
      det.style.setProperty('--sec-color', d[2]);
      det.style.setProperty('--sec-tint', tint(d[2], .89));
      var sum = document.createElement('summary');
      var sw = el('span', 'swatch');
      sw.style.cssText = 'display:inline-block;width:11px;height:11px;border:1px solid rgba(0,0,0,.25);border-radius:2px;margin-right:7px;vertical-align:middle;background:' + d[2];
      sum.appendChild(sw);
      sum.appendChild(el('span', 'sec-name', d[1]));
      var peek = el('span', 'sec-peek');
      sum.appendChild(peek);
      det.appendChild(sum);

      var f = field(d[1], d[0], { rows: d[3] });
      /* o nome do bloco já está no <summary>; o rótulo sairia repetido na
         tela, mas sem ele o campo fica sem nome para o leitor de tela */
      $('#f-' + d[0], f).setAttribute('aria-label', d[1]);
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
    stCard.appendChild(renderFluxoDoItem(g2));
    stCard.appendChild(renderCertificates());
    host.appendChild(stCard);

    /* --- evidências --- */
    host.appendChild(renderEvidenceCard());

    /* --- situação de acompanhamento --- */
    host.appendChild(renderStatusBar());

    /* --- travas e avisos, por cima do que já está montado --- */
    if (travado(ncr)) aplicarTrava(host);
    var mudanca = mudancasDeFora[ncr.id];
    if (mudanca) host.insertBefore(barraMudouPorFora(mudanca), host.firstChild);
  }

  /* Item aceito é documento fechado: um clique distraído num campo dele se
     espalha para todo mundo na sincronização seguinte. Fica travado até a
     pessoa dizer que quer mesmo mexer. */
  var destravados = {};

  function travado(ncr) {
    return !!(ncr && ncr.done && !destravados[ncr.id]);
  }

  function aplicarTrava(host) {
    var aviso = el('div', 'trava');
    aviso.appendChild(el('span', 'trava-txt',
      '🔒 Waiver aceito — os campos estão travados para não sobrescrever por engano.'));
    var b = el('button', 'btn btn--sm', 'Editar mesmo assim');
    b.type = 'button';
    b.addEventListener('click', function () {
      destravados[currentNcr().id] = true;
      renderEditor();
    });
    aviso.appendChild(b);

    $$('.card', host).forEach(function (card) {
      $$('input, textarea, select, button', card).forEach(function (n) {
        /* o que só mostra continua valendo: travar é para não escrever sem
           querer, não para deixar de ver */
        if (n.hasAttribute('data-livre')) return;
        if (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && n.type === 'text')) n.readOnly = true;
        else n.disabled = true;
      });
      /* a área de soltar imagens não é um controle de formulário */
      $$('.evid-drop', card).forEach(function (d) {
        d.style.pointerEvents = 'none';
        d.style.opacity = '.55';
      });
    });
    host.insertBefore(aviso, host.firstChild);
  }

  /* --- o que mudou por fora --------------------------------------------- */

  /* Itens que a sincronização substituiu pelo texto de outra pessoa, desde
     que esta página foi aberta. A regra da pasta é "vale a edição mais
     recente"; sem isto, o que foi por cima do meu texto passaria em branco. */
  var mudancasDeFora = {};

  function guardarMudancas(resumo) {
    if (!resumo || !resumo.substituidos) return;
    resumo.substituidos.forEach(function (sub) { mudancasDeFora[sub.id] = sub; });
  }

  function barraMudouPorFora(sub) {
    var bar = el('div', 'mudou');
    var perdidos = (sub.perdidos || []).length;
    var txt = 'Este item foi alterado' +
      (sub.quem ? ' por ' + sub.quem : ' em outro computador') +
      (sub.quando ? ', ' + shortDate(sub.quando) : '') +
      ' — ' + sub.campos.length + ' campo(s).';
    if (perdidos) {
      bar.classList.add('mudou--conflito');
      txt += ' Em ' + perdidos + ' deles os dois escreveram ao mesmo tempo, e um ' +
        'texto teve de sair — ele está guardado no histórico.';
    }
    bar.appendChild(el('span', 'mudou-txt', txt));
    if (perdidos) {
      var hist = el('button', 'btn btn--sm btn--accent', 'Ver o texto que saiu');
      hist.type = 'button';
      hist.addEventListener('click', function () { abrirHistorico('item'); });
      bar.appendChild(hist);
    }
    var ver = el('button', 'btn btn--sm btn--accent', 'Ver o que mudou');
    ver.type = 'button';
    ver.addEventListener('click', function () { abrirDif(sub); });
    bar.appendChild(ver);
    var ok = el('button', 'btn btn--sm btn--quiet', 'Dispensar');
    ok.type = 'button';
    ok.addEventListener('click', function () {
      delete mudancasDeFora[sub.id];
      renderEditor();
      renderNcrList();
    });
    bar.appendChild(ok);
    return bar;
  }

  function abrirDif(sub) {
    var body = $('#difBody');
    body.innerHTML = '';
    $('#difQuem').textContent = (sub.quem || 'Outro computador') +
      (sub.quando ? ' · ' + shortDate(sub.quando) : '') +
      ' · ' + (sub.ncrId || 'sem número');
    (sub.perdidos || []).forEach(function (x) {
      var aviso = el('div', 'dif-campo dif-campo--conflito');
      aviso.appendChild(el('div', 'dif-rotulo', x.rotulo + ' — os dois escreveram ao mesmo tempo'));
      var par = el('div', 'dif-par');
      var saiu = el('div', 'dif-lado dif-lado--antes');
      saiu.appendChild(el('div', 'dif-cab', 'Saiu daqui' + (x.de ? ' (' + x.de + ')' : '')));
      saiu.appendChild(el('pre', 'dif-txt', x.perdeu || '(em branco)'));
      var ficou = el('div', 'dif-lado dif-lado--depois');
      ficou.appendChild(el('div', 'dif-cab', 'Ficou'));
      ficou.appendChild(el('pre', 'dif-txt', x.ficou || '(em branco)'));
      par.appendChild(saiu); par.appendChild(ficou);
      aviso.appendChild(par);
      body.appendChild(aviso);
    });
    sub.campos.forEach(function (c) {
      var bloco = el('div', 'dif-campo');
      bloco.appendChild(el('div', 'dif-rotulo', c.rotulo));
      var par = el('div', 'dif-par');
      var antes = el('div', 'dif-lado dif-lado--antes');
      antes.appendChild(el('div', 'dif-cab', 'Estava aqui'));
      antes.appendChild(el('pre', 'dif-txt', c.antes || '(em branco)'));
      var depois = el('div', 'dif-lado dif-lado--depois');
      depois.appendChild(el('div', 'dif-cab', 'Passou a ser'));
      depois.appendChild(el('pre', 'dif-txt', c.depois || '(em branco)'));
      par.appendChild(antes);
      par.appendChild(depois);
      bloco.appendChild(par);
      body.appendChild(bloco);
    });
    $('#difDialog').showModal();
  }

  /* --- o histórico de alterações do item ---------------------------------
     A pergunta que a versão inteira do histórico da pasta responde mal:
     "quem apagou o meu texto, e o que estava escrito?". Aqui cada linha é
     uma alteração de campo, com o texto de antes guardado — e um botão que
     o traz de volta. */

  var revEstado = { escopo: 'item', item: '', busca: '' };

  function abrirHistorico(escopo) {
    var ncr = currentNcr();
    revEstado.escopo = escopo || (ncr ? 'item' : 'projeto');
    revEstado.item = ncr ? ncr.id : '';
    revEstado.busca = '';
    var busca = $('#revBusca');
    if (busca) busca.value = '';
    renderHistorico();
    $('#revDialog').showModal();
  }

  function linhasDoHistorico() {
    var lista;
    if (revEstado.escopo === 'item' && revEstado.item) lista = Revisoes.doItem(revisoes, revEstado.item);
    else if (revEstado.escopo === 'projeto' && state.project) lista = Revisoes.doProjeto(revisoes, state.project.id);
    else lista = Revisoes.todas(revisoes);
    var t = revEstado.busca.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(function (r) {
      return (r.de + ' ' + r.para + ' ' + r.rotulo + ' ' + r.por + ' ' + r.ncrId)
        .toLowerCase().indexOf(t) >= 0;
    });
  }

  /* O texto de que a linha trata: no atropelamento é o que SAIU — é ele que
     a pessoa veio procurar. Nas demais, o que foi escrito. */
  function textoDaLinha(r) {
    return r.origem === 'substituido' ? r.de : r.para;
  }

  function renderHistorico() {
    var host = $('#revBody');
    var escopos = $('#revEscopo');
    host.innerHTML = '';
    escopos.innerHTML = '';

    var ncr = currentNcr();
    [['item', ncr ? (ncr.ncrId || 'este item') : 'este item', !!ncr],
     ['projeto', 'este relatório', !!state.project],
     ['tudo', 'todos os relatórios', true]].forEach(function (o) {
      if (!o[2]) return;
      var b = el('button', 'btn btn--sm' + (revEstado.escopo === o[0] ? ' is-on' : ''), o[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        revEstado.escopo = o[0];
        renderHistorico();
      });
      escopos.appendChild(b);
    });

    var lista = linhasDoHistorico();
    var conflitos = lista.filter(function (r) { return r.origem === 'substituido'; }).length;
    $('#revResumo').textContent = lista.length
      ? lista.length + ' alteração(ões)' +
        (conflitos ? ' · ' + conflitos + ' escrita(s) por cima' : '') +
        ' · a mais recente primeiro'
      : '';

    if (!lista.length) {
      var vazio = el('p', 'hint');
      vazio.textContent = revEstado.busca
        ? 'Nada no histórico com esse texto.'
        : 'Ainda não há alterações registradas aqui. O histórico começa a ' +
          'contar a partir desta versão do programa: o que foi escrito antes ' +
          'dela não tem linha.';
      host.appendChild(vazio);
      return;
    }

    lista.slice(0, 300).forEach(function (r) {
      host.appendChild(linhaDeHistorico(r));
    });
    if (lista.length > 300) {
      host.appendChild(el('p', 'hint', 'Mostrando as 300 mais recentes de ' + lista.length + '.'));
    }
  }

  var ROTULO_ORIGEM = {
    substituido: 'escrito por cima',
    criou: 'item novo',
    restaurou: 'restaurado',
    excluiu: 'excluído'
  };

  function linhaDeHistorico(r) {
    var linha = el('div', 'rev-linha');
    linha.dataset.origem = r.origem;

    var cab = el('div', 'rev-cab');
    cab.appendChild(el('span', 'rev-quem', r.por || '(sem nome)'));
    cab.appendChild(el('span', 'rev-quando', shortDate(r.em)));
    cab.appendChild(el('span', 'rev-campo', r.rotulo));
    if (revEstado.escopo !== 'item') {
      cab.appendChild(el('span', 'rev-item',
        (r.ncrId || 'sem número') + (r.marco ? ' · ' + r.marco : '')));
    }
    if (ROTULO_ORIGEM[r.origem]) {
      cab.appendChild(el('span', 'rev-tag', ROTULO_ORIGEM[r.origem]));
    }
    linha.appendChild(cab);

    var texto = textoDaLinha(r);
    if (r.origem === 'substituido') {
      linha.appendChild(el('div', 'rev-rotulo', r.semTexto
        ? 'O que saiu (não dá para trazer de volta por aqui)'
        : 'O texto que saiu daqui'));
    }
    linha.appendChild(el('pre', 'rev-txt', texto || '(em branco)'));

    var acoes = el('div', 'rev-acoes');
    var outro = r.origem === 'substituido' ? r.para : r.de;
    if (outro) {
      var verBtn = el('button', 'btn btn--sm btn--quiet',
        r.origem === 'substituido' ? 'Ver o que ficou' : 'Ver como estava antes');
      verBtn.type = 'button';
      var caixa = el('pre', 'rev-txt rev-txt--antes', outro);
      caixa.hidden = true;
      verBtn.addEventListener('click', function () {
        caixa.hidden = !caixa.hidden;
        verBtn.textContent = caixa.hidden
          ? (r.origem === 'substituido' ? 'Ver o que ficou' : 'Ver como estava antes')
          : 'Esconder';
      });
      acoes.appendChild(verBtn);
      linha.appendChild(acoes);
      linha.appendChild(caixa);
    } else {
      linha.appendChild(acoes);
    }

    if (!r.semTexto) {
      var por = el('button', 'btn btn--sm btn--accent', 'Pôr este texto de volta');
      por.type = 'button';
      por.title = 'Escreve este texto no campo ' + r.rotulo + ' da ' + (r.ncrId || 'item');
      por.addEventListener('click', function () { restaurarTexto(r, texto); });
      acoes.appendChild(por);
    }
    return linha;
  }

  /**
   * Devolve um texto do histórico ao campo de onde ele saiu.
   *
   * É uma edição como outra qualquer — e por isso ela viaja: a hora nova faz
   * o texto restaurado valer também no computador dos outros, em vez de ser
   * apagado de volta na sincronização seguinte.
   */
  function restaurarTexto(r, texto) {
    var alvo = state.projects.filter(function (p) { return p.id === r.projeto; })[0];
    if (!alvo) { toast('O relatório dessa alteração não está mais neste navegador.'); return; }
    var lista = alvo[Store.itemsKey(r.kind)] || [];
    var item = lista.filter(function (n) { return n.id === r.item; })[0];
    if (!item) { toast('Esse item não existe mais — foi excluído depois dessa alteração.'); return; }

    var antes = Store.valorCampo(item, r.campo);
    if (antes === texto) { toast('Esse texto já é o que está no campo.'); return; }

    function aplicar(valor, aviso) {
      Store.porCampo(item, r.campo, valor);
      state.kind = r.kind;
      if (!state.project || state.project.id !== alvo.id) loadProject(alvo);
      selectNcr(item.id);
      touch(item);
      revisoes = Revisoes.acrescentar(revisoes, [Revisoes.registro({
        por: Store.getUser(), projeto: alvo.id, marco: alvo.marco || alvo.name,
        kind: r.kind, item: item.id, ncrId: item.ncrId,
        campo: r.campo, rotulo: r.rotulo,
        de: antes, para: valor, origem: 'restaurou'
      })]);
      Revisoes.gravarLocais(revisoes);
      baseDiario = Store.baseDe(state.projects);
      guardarBases();
      renderNcrList();
      renderEditor();
      scheduleSave();
      if (aviso) toast(aviso, 8000, {
        rotulo: 'Desfazer',
        fn: function () { aplicar(antes, ''); }
      });
    }

    $('#revDialog').close();
    flushSave().then(function () {
      aplicar(texto, r.rotulo + ' da ' + (item.ncrId || 'item') + ' voltou a este texto.');
    });
  }

  /* --- o caminho do waiver, dentro do item ------------------------------- */

  /** O marco deste relatório, no formato dos cards ("RANAE J06" -> "J06"). */
  function marcoDesteRelatorio() {
    var m = Fluxo.marco(Report.marcoOf(state.project, state.kind));
    return m ? m.rotulo : '';
  }

  /**
   * A procura que alimenta o balão dos cards: o mesmo número, no relatório do
   * marco daquele card. O índice é montado uma vez por desenho e o item é
   * lido a cada pergunta — assim o card acompanha quem troca o número do item
   * sem refazer o índice a cada tecla.
   */
  function indiceDeAnteriores(kind) {
    return Fluxo.indice(state.projects, kind, state.project ? state.project.id : '');
  }

  function buscadorDeAnteriores(idx, item) {
    if (!idx || !item) return null;
    return function (no) { return Fluxo.anterior(idx, no, item); };
  }

  /**
   * Clique no card marcado: abre o item no relatório de onde veio a resposta.
   * Grava o que está na tela antes de sair — trocar de relatório redesenha
   * tudo, e o que estivesse esperando os 500 ms da gravação se perderia.
   */
  function abrirAchado(dados, ev) {
    var alvo = state.projects.filter(function (p) { return p.id === dados.projectId; })[0];
    if (!alvo) { toast('Esse relatório não está mais neste navegador.'); return; }
    /* com Shift, em vez de trocar de tela, o item vai para a coluna ao lado —
       é o caminho curto para escrever este olhando aquele */
    if (ev && ev.shiftKey) {
      if ($('#fluxoDialog').open) $('#fluxoDialog').close();
      fixarAoLado(dados.projectId, dados.kind, dados.itemId);
      toast('Preso ao lado: ' + (dados.ncrId || 'item') + ' (' + (dados.marco || 'sem marco') + ').');
      return;
    }
    if ($('#fluxoDialog').open) $('#fluxoDialog').close();

    function ir() {
      state.kind = dados.kind;
      if (!state.project || alvo.id !== state.project.id) loadProject(alvo);
      renderTabs();
      renderNcrList();
      selectNcr(dados.itemId);
      toast((dados.ncrId || 'Item') + ' aberta no relatório ' + (dados.marco || 'sem marco') + '.');
    }
    flushSave().then(ir, ir);
  }

  /**
   * Mostra, embaixo do Waiver Historic, o caminho que aquelas linhas
   * descrevem — e redesenha a cada tecla, para os cards irem aparecendo
   * conforme o campo é preenchido.
   *
   * Só este pedaço é redesenhado: refazer o formulário durante a digitação
   * faria o cursor pular.
   */
  function renderFluxoDoItem(ondeEstaOCampo) {
    var bloco = el('div', 'fx-bloco');

    var cab = el('div', 'fx-bloco-cab');
    cab.appendChild(el('strong', null, 'Fluxo dos waivers'));
    var sub = el('span', 'fx-bloco-sub', 'montado a partir do Waiver Historic acima');
    cab.appendChild(sub);
    var btn = el('button', 'btn btn--sm btn--accent', '⤳ Ver fluxo');
    btn.type = 'button';
    btn.id = 'fluxoAbrirBtn';
    btn.title = 'Abre o fluxo em tamanho grande';
    btn.setAttribute('data-livre', '');   /* só mostra: vale mesmo com o item travado */
    btn.addEventListener('click', function () { abrirFluxo(currentNcr(), state.kind); });
    cab.appendChild(btn);
    bloco.appendChild(cab);

    var palco = el('div', 'fx-palco fx-palco--mini');
    bloco.appendChild(palco);

    var idx = indiceDeAnteriores(state.kind);

    function redesenhar() {
      var n = currentNcr();
      if (!n) return;
      var a = Fluxo.analisar(n.historic);
      palco.innerHTML = '';
      palco.appendChild(Fluxo.svg(a, {
        escala: 'compacto',
        destaque: marcoDesteRelatorio(),
        antes: buscadorDeAnteriores(idx, n),
        abrir: abrirAchado
      }));
      btn.textContent = a.vazio ? '⤳ Ver fluxo' : '⤳ Ver fluxo (' + a.nos.length + ')';
      var achados = $$('.fx-card.is-achado', palco).length;
      sub.textContent = achados
        ? 'montado a partir do Waiver Historic acima · ' + achados +
          (achados > 1 ? ' marcos já responderam' : ' marco já respondeu') +
          ' (passe o mouse no card)'
        : 'montado a partir do Waiver Historic acima';
    }
    redesenhar();

    /* O formulário ainda não está na tela quando este bloco é montado, então
       o campo é procurado dentro do pedaço que o contém, e não no documento. */
    var campo = $('#f-historic', ondeEstaOCampo);
    if (campo) campo.addEventListener('input', redesenhar);
    return bloco;
  }

  /** O fluxo em tamanho grande, com o texto de origem à mão. */
  function abrirFluxo(item, kind) {
    if (!item) return;
    var a = Fluxo.analisar(item.historic);
    $('#fluxoItem').textContent = (kind === 'dev' ? 'DEV ' : 'NCR ') +
      (item.ncrId || 'sem número') +
      (item.func ? ' · ' + item.func : '');

    var palco = $('#fluxoPalco');
    palco.innerHTML = '';
    palco.appendChild(Fluxo.svg(a, {
      destaque: marcoDesteRelatorio(),
      antes: buscadorDeAnteriores(indiceDeAnteriores(kind), item),
      abrir: abrirAchado
    }));

    var marcados = $$('.fx-card.is-achado', palco).length;
    $('#fluxoCaminho').textContent = a.vazio
      ? 'Escreva as entradas no Waiver Historic — uma por linha, no formato “J04 To: J06” — e os cards aparecem aqui.'
      : a.nos.length + ' marco(s): ' + Fluxo.caminhoTexto(a) +
        (marcados ? ' · ' + marcados + ' com ponto: passe o mouse para ver o que ' +
          'aquele relatório respondeu, ou clique para abrir.' : '');

    var avisos = $('#fluxoAvisos');
    avisos.innerHTML = '';
    avisos.hidden = !a.avisos.length;
    a.avisos.forEach(function (x) { avisos.appendChild(el('p', null, x)); });

    $('#fluxoCru').hidden = a.vazio;
    $('#fluxoCruTxt').textContent = a.linhas.join('\n');
    $('#fluxoDialog').showModal();
  }

  /**
   * Leva o item aceito para o relatório do marco em que o waiver foi
   * aprovado. O item de origem não é tocado: ele é o registro do que
   * aconteceu no marco dele, e é dele que o ponto no card do fluxo lê o
   * Arch Answer do marco anterior.
   */
  function levarAdiante() {
    var ncr = currentNcr();
    if (!ncr) return;
    var av = Herdar.avaliar(state.project, ncr, state.kind, state.projects);
    if (!av.pode) { toast(av.motivo, 9000); return; }

    if (!confirm('Levar a ' + (ncr.ncrId || 'NCR') + ' para o ' + av.destino.rotulo + '?\n\n' +
        Herdar.resumo(av) + '\n\n' +
        'O item deste marco não muda em nada.')) return;

    Log.passo('herdar', 'levando ' + (ncr.ncrId || 'o item') + ' para o ' +
      av.destino.rotulo, { de: av.origem ? av.origem.rotulo : '(sem marco)' });
    var copia = Herdar.copiaPara(ncr, av.origem, av.destino);
    var destino = av.projetoDestino;
    var kind = state.kind;
    destino[Store.itemsKey(kind)].push(copia);
    /* a autoria tem de ficar no relatório de destino, senão o item chega lá
       sem dono e sem hora — e a mesclagem do colega não sabe que é novo */
    Store.logChange(destino, SESSION_ID, kind, copia, 'criou');

    flushSave().then(function () { return Store.save(destino); }).then(function () {
      refreshProjectSelect();
      renderNcrList();
      renderEditor();
      agendarGravacaoPasta();
      Log.ok('herdar', (ncr.ncrId || 'item') + ' copiada para o ' + av.destino.rotulo,
        { situacao: 'Em preenchimento', historic: 'linha acrescentada' });
      toast((ncr.ncrId || 'Item') + ' copiada para o ' + av.destino.rotulo +
        ', em “Em preenchimento”.', 12000, {
        rotulo: 'Abrir lá',
        fn: function () {
          abrirDaTabela({ projetoId: destino.id, kind: kind, item: copia,
            marco: Report.marcoOf(destino, kind) || destino.name });
        }
      });
    }).catch(function (e) {
      Log.erro('herdar', 'não consegui gravar a cópia no relatório de destino', e,
        'o item de origem não foi tocado. Tente de novo; se insistir, faça um backup ' +
        'antes de continuar.');
      markError(e);
    });
  }

  /**
   * A faixa do item que veio de outro marco. Ela existe porque a cópia chega
   * com o texto do marco anterior e **precisa** ser revista: o pedido do
   * Bruno era ter onde lembrar disso. Sai quando a pessoa diz que conferiu.
   */
  function cardDeHerdada(ncr) {
    var de = (ncr.herdadoDe || '').trim();
    if (!de) return null;
    var faixa = el('div', 'herd-faixa');
    var txt = el('div', 'herd-faixa-txt');
    txt.appendChild(el('strong', null, 'Herdada do ' + de));
    txt.appendChild(el('span', null,
      'Foi copiada de lá quando o waiver foi aceito e chegou aqui em ' +
      '“Em preenchimento”. O Arch Answer, o Arch Status e as datas de ' +
      'validade vieram em branco de propósito — são a resposta do marco ' +
      'anterior. Confira o texto antes de mandar este pedido.'));
    faixa.appendChild(txt);
    var ok = el('button', 'btn btn--sm', 'Já conferi');
    ok.type = 'button';
    /* vale com o item travado: conferir não é editar o documento */
    ok.setAttribute('data-livre', '');
    ok.title = 'Tira a marca de herdada. O Waiver Historic continua como está.';
    ok.addEventListener('click', function () {
      var n = currentNcr();
      if (!n) return;
      n.herdadoDe = '';
      touch(n);
      renderNcrList();
      renderEditor();
      scheduleSave();
      toast('Marca retirada.', 8000, {
        rotulo: 'Desfazer',
        fn: function () {
          var alvo = currentNcr();
          if (!alvo) return;
          alvo.herdadoDe = de;
          touch(alvo);
          renderNcrList();
          renderEditor();
          scheduleSave();
        }
      });
    });
    faixa.appendChild(ok);
    return faixa;
  }

  /* Situação de acompanhamento. Substituiu o antigo botão "Concluir" — o item
     passa a contar como concluído quando, e só quando, chega em "Waiver
     accepted". Desde o pedido do Bruno ela também fecha a linha do item no
     índice da capa do PDF (§4 do CLAUDE.md); no resto do relatório continua
     sem aparecer. */
  function renderStatusBar() {
    var ncr = currentNcr();
    var atual = Store.statusInfo(ncr.status);
    var bar = el('div', 'done-bar status-bar' + (ncr.done ? ' done-bar--done' : ''));
    bar.style.setProperty('--st', atual.cor);

    var info = el('div', 'done-bar-info');
    info.appendChild(el('strong', null, 'Situação deste item'));
    info.appendChild(el('span', null,
      'Fecha a linha deste item no índice da capa do PDF (em inglês). O item ' +
      'conta como concluído ao chegar em “Waiver accepted”.'));
    var who = el('span', 'done-bar-who');
    who.id = 'doneBarWho';
    info.appendChild(who);
    renderItemAuthor();
    bar.appendChild(info);

    var grupo = el('div', 'status-pick');
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-label', 'Situação do item');
    Store.STATUS.forEach(function (op) {
      var b = el('button', 'status-op' + (op.id === atual.id ? ' is-on' : ''));
      b.type = 'button';
      b.style.setProperty('--st', op.cor);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', op.id === atual.id ? 'true' : 'false');
      b.title = op.ajuda;
      b.appendChild(el('span', 'status-dot'));
      b.appendChild(el('span', 'status-op-name', op.nome));
      b.addEventListener('click', function () {
        var n = currentNcr();
        if (n.status === op.id) return;
        Store.setStatus(n, op.id);
        touch(n);
        flushSave().then(function () {
          renderNcrList();
          renderEditor();
          toast('Situação: ' + op.nome +
            (op.id === Store.STATUS_CONCLUIDO ? ' — item concluído.' : '.'));
        });
      });
      grupo.appendChild(b);
    });
    var next = el('button', 'btn', '+ Criar outra ' + kindName());
    next.type = 'button';
    next.title = 'Grava o que está aberto e começa um item novo';
    next.addEventListener('click', function () {
      flushSave().then(function () {
        addNcr();
        toast('Item salvo. Comece o próximo.');
      });
    });

    /* Levar adiante. Fica à vista sempre, mesmo quando não dá: o botão
       apagado que explica o que falta ensina o caminho; o botão escondido
       faz a pessoa achar que a função não existe. */
    var av = Herdar.avaliar(state.project, ncr, state.kind, state.projects);
    var adiante = el('button', 'btn btn--herdar',
      av.pode ? '⤵ Levar para o ' + av.destino.rotulo : '⤵ Levar para o marco seguinte');
    adiante.type = 'button';
    adiante.disabled = !av.pode;
    adiante.title = Herdar.resumo(av);
    adiante.addEventListener('click', function () { levarAdiante(); });

    var linha = el('div', 'status-row');
    linha.appendChild(grupo);
    linha.appendChild(adiante);
    linha.appendChild(next);
    bar.appendChild(linha);
    if (!av.pode && Store.statusInfo(ncr.status).id === Store.STATUS_CONCLUIDO) {
      /* aceito e mesmo assim não dá: o motivo é acionável (falta a data, ou
         falta o relatório do marco), então vai escrito e não só no title */
      bar.appendChild(el('div', 'hint status-herdar-aviso', av.motivo));
    }

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
        inp.placeholder = 'ex.: Shipyard Certificate';
        inp.setAttribute('list', listId('certificates'));
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
    refInput.placeholder = 'ex.: Attachment ' + (index + 1);
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
      /* a ordem dos anexos é a ordem das páginas do PDF: mexer nela é
         editar o item, e sem o registro a troca se perderia na mesclagem */
      touch();
      redrawAll(); scheduleSave();
    });

    var down = el('button', 'btn btn--sm', '↓');
    down.type = 'button';
    down.title = 'Mover anexo para baixo';
    down.disabled = index === list.length - 1;
    down.addEventListener('click', function () {
      var l = currentNcr().evidence;
      l.splice(index + 1, 0, l.splice(index, 1)[0]);
      touch();
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
        if (img.src) {
          var im = document.createElement('img');
          im.src = img.src;
          im.alt = img.caption || 'Evidência ' + (i + 1);
          t.appendChild(im);
        } else {
          /* imagem que mora na pasta e ainda não chegou aqui: some da tela
             seria pior — a pessoa acharia que a foto se perdeu */
          var falta = el('div', 'evid-thumb-falta', '⏳ na pasta');
          falta.title = 'Imagem guardada na pasta compartilhada (' + (img.arquivo || '') +
            '). Ela chega na próxima sincronização.';
          t.appendChild(falta);
        }

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
          touch();
          redrawThumbs(); scheduleSave();
        });
        var right = el('button', 'btn btn--icon', '→');
        right.type = 'button'; right.title = 'Mover para a direita';
        right.disabled = i === ev.images.length - 1;
        right.addEventListener('click', function () {
          ev.images.splice(i + 1, 0, ev.images.splice(i, 1)[0]);
          touch();
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
        Log.erro('imagens', 'não consegui ler alguma imagem que você soltou aqui', e,
          'confira se o arquivo é mesmo uma imagem (.jpg, .png) e se não está aberto ' +
          'em outro programa.');
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
    renderDuplicado();

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

  /* Ação que estava a caminho quando faltou o nome: guardada aqui para
     seguir sozinha assim que o nome for informado, sem obrigar a repetir
     o clique. */
  var aposNome = null;

  function openUserDialog(depois) {
    aposNome = typeof depois === 'function' ? depois : null;
    $('#userNameInput').value = Store.getUser();
    $('#userDialog').showModal();
    $('#userNameInput').focus();
  }

  /* Importações feitas antes de o pareamento por marco existir deixaram
     relatórios repetidos. Enquanto houver um, o menu oferece juntá-los. */
  function duplicadoDoMarco() {
    if (!state.project) return null;
    var k = marcoChave(state.project);
    if (!k) return null;
    return state.projects.filter(function (p) {
      return p.id !== state.project.id && marcoChave(p) === k;
    })[0] || null;
  }

  function renderDuplicado() {
    var btn = $('#mergeLocalBtn');
    if (!btn) return;
    var dup = duplicadoDoMarco();
    btn.hidden = !dup;
    if (dup) {
      $('#mergeLocalWho').textContent =
        'há outro "' + (dup.marco || dup.name) + '" neste navegador, com ' +
        (dup.ncrs.length + dup.devs.length) + ' item(ns)';
    }
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

    /* Com a pasta ligada o risco é outro: os dados não estão presos a este
       navegador, mas ainda estão num lugar só. O backup passa a servir para
       tirar uma cópia de fora da pasta. */
    var naPasta = Pasta.ligada() && pastaEstado === 'on';
    $('#backupNoticeText').textContent = naPasta
      ? (last
        ? 'Seu último backup foi há ' + dias + ' dias. O trabalho está na pasta da rede, com histórico — mas uma cópia fora dela protege se a pasta se perder.'
        : 'Você ainda não guardou uma cópia fora da pasta da rede. Se a pasta se perder, o histórico vai junto.')
      : (last
        ? 'Seu último backup foi há ' + dias + ' dias. Os relatórios ficam só neste navegador — um backup evita perder tudo se os dados do site forem limpos.'
        : 'Você ainda não fez backup. Os relatórios ficam só neste navegador; se os dados do site forem limpos, tudo se perde.');
    el0.hidden = false;
  }

  /* ---------------------------------------------------------------------- */
  /* sugestões de preenchimento                                              */
  /* ---------------------------------------------------------------------- */

  var SUGGEST = ['systems', 'func', 'requestExpiry', 'archStatus', 'approvedExpiry'];

  /* NCR e DEV usam vocabulários diferentes (função, sistema, certificado): uma
     lista só misturaria os dois e atrapalharia mais do que ajudaria. Por isso
     cada aba tem o seu conjunto de <datalist>. */
  function listId(key) {
    return 'dl-' + (state.kind === 'dev' ? 'dev' : 'ncr') + '-' + key;
  }

  /* Junta os valores já usados em todos os relatórios, para oferecer como
     sugestão nos campos que se repetem muito (PÓS TRAP, WAIVER ACCEPTED…). */
  function refreshSuggestions() {
    var host = $('#datalists');
    host.innerHTML = '';

    ['ncr', 'dev'].forEach(function (kind) {
      var campo = Store.itemsKey(kind);
      var buckets = {};
      SUGGEST.forEach(function (k) { buckets[k] = {}; });
      buckets.certificates = {};

      state.projects.forEach(function (p) {
        (p[campo] || []).forEach(function (n) {
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

      Object.keys(buckets).forEach(function (k) {
        var dl = document.createElement('datalist');
        dl.id = 'dl-' + kind + '-' + k;
        Object.keys(buckets[k])
          .sort(function (a, b) { return buckets[k][b] - buckets[k][a] || a.localeCompare(b); })
          .slice(0, 40)
          .forEach(function (v) {
            var o = document.createElement('option');
            o.value = v;
            dl.appendChild(o);
          });
        host.appendChild(dl);
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* ajustes do relatório                                                    */
  /* ---------------------------------------------------------------------- */

  /* Textos fixos da capa e do rodapé, e o marco alternativo da DEV — coisas
     que quase nunca mudam e por isso ficam fora da barra principal. */
  var SETTINGS = [
    ['showCoverDate', 'Mostrar a data de emissão na capa', 'checkbox',
     'Sai pequena, no canto inferior direito da primeira página.'],
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
      var input = document.createElement('input');

      if (def[2] === 'checkbox') {
        input.type = 'checkbox';
        input.checked = state.project[def[0]] !== false;
        input.style.width = 'auto';
        var lab = el('label', 'field-check');
        lab.appendChild(input);
        lab.appendChild(document.createTextNode(def[1]));
        f.appendChild(lab);
        input.addEventListener('change', function () {
          state.project[def[0]] = input.checked;
          scheduleSave();
        });
      } else {
        f.appendChild(el('label', null, def[1]));
        input.type = 'text';
        input.value = state.project[def[0]] || '';
        input.placeholder = def[2] ? 'padrão: ' + def[2] : '';
        input.addEventListener('input', function () {
          state.project[def[0]] = input.value;
          scheduleSave();
        });
        f.appendChild(input);
      }
      if (def[3]) f.appendChild(el('div', 'hint', def[3]));
      body.appendChild(f);
    });
    /* Fora do #settingsBody de propósito: aquilo são ajustes do relatório, e
       a conversa é deste navegador. Fica como seção à parte, no fim. */
    var caixa = body.parentNode;
    var velho = $('#conversaAjuste');
    if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    caixa.appendChild(ajusteDaConversa());
    $('#settingsDialog').showModal();
  }

  /**
   * Ligar e desligar a aba Conversa.
   *
   * Fica guardado neste navegador, e não no relatório: quem decide ver
   * recados é cada pessoa, e a escolha não tem nada a ver com o marco aberto.
   * Por isso também: ligar aqui não liga a conversa dos outros.
   */
  function ajusteDaConversa() {
    var box = el('div', 'dlg-sec');
    box.id = 'conversaAjuste';
    box.appendChild(el('div', 'dlg-sec-tit', 'Conversa da equipe'));

    var f = el('div', 'field');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'conversaLigada';
    cb.checked = Chat.ligado();
    cb.style.width = 'auto';
    var lab = el('label', 'field-check');
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode('Mostrar a aba Conversa'));
    f.appendChild(lab);
    f.appendChild(el('div', 'hint',
      'Recados da equipe guardados na pasta da rede, no arquivo ' + Pasta.CONVERSAS +
      ' — sem servidor e sem nuvem, como o resto do programa. Chegam a cada ' +
      'sincronização (20 s), não na hora. Vale só para este navegador, e só ' +
      'funciona entre quem aponta para a mesma pasta. Não é canal seguro: quem ' +
      'abre a pasta lê tudo, inclusive as conversas diretas.'));
    box.appendChild(f);

    cb.addEventListener('change', function () {
      Chat.ligar(cb.checked);
      if (!cb.checked && isConversa()) {
        state.kind = 'ncr';
        renderNcrList();
        renderEditor();
      }
      renderTabs();
      agendarConversa();
      if (cb.checked) {
        iniciarConversa();
        toast(Pasta.ligada()
          ? 'Conversa ligada. A aba está na fila das outras, no alto da lista.'
          : 'Conversa ligada — mas sem a pasta da rede ninguém recebe o que você escrever.', 5000);
      } else {
        toast('Conversa desligada. Nada foi apagado da pasta.');
      }
    });
    return box;
  }

  /* ---------------------------------------------------------------------- */
  /* o item preso ao lado                                                    */
  /* ---------------------------------------------------------------------- */

  /* Uma coluna à direita do editor com outro item, em só leitura: é o que
     permite escrever a NCR-001 do J08 olhando a do J06 sem trocar de tela.

     Por que só leitura está explicado no cabeçalho do lado.js: hoje cada
     campo do formulário escreve no item *selecionado*, então dois formulários
     abertos escreveriam no mesmo item. Quem quer editar o de lá clica em
     "abrir" — aí ele passa a ser o selecionado.

     A escolha vive no localStorage, como o nome de quem usa e a conversa: é
     de quem está neste navegador, não do relatório. */

  var CHAVE_LADO = 'derrogacao:aoLado';
  var aoLado = null;          /* {projectId, kind, itemId} */

  function lerAoLado() {
    try {
      var cru = localStorage.getItem(CHAVE_LADO);
      var v = cru ? JSON.parse(cru) : null;
      return (v && v.projectId && v.itemId) ? v : null;
    } catch (e) { return null; }
  }

  function gravarAoLado(v) {
    try {
      if (v) localStorage.setItem(CHAVE_LADO, JSON.stringify(v));
      else localStorage.removeItem(CHAVE_LADO);
    } catch (e) { /* cheio ou bloqueado: a coluna só não volta ao reabrir */ }
  }

  /** O que está preso ao lado, se ainda existir. */
  function itemDoLado() {
    if (!aoLado) return null;
    var p = state.projects.filter(function (x) { return x.id === aoLado.projectId; })[0];
    if (!p) return null;
    var item = (p[Store.itemsKey(aoLado.kind)] || []).filter(function (x) {
      return x.id === aoLado.itemId;
    })[0];
    return item ? { project: p, item: item, kind: aoLado.kind } : null;
  }

  function fixarAoLado(projectId, kind, itemId) {
    aoLado = { projectId: projectId, kind: kind, itemId: itemId };
    gravarAoLado(aoLado);
    renderAoLado();
  }

  function soltarAoLado() {
    aoLado = null;
    gravarAoLado(null);
    renderAoLado();
  }

  function renderAoLado() {
    var pane = $('#ladoPane');
    if (!pane) return;
    var achado = aoLado ? itemDoLado() : null;

    /* estava preso e sumiu (excluído aqui ou pela pasta): não deixar a coluna
       mostrando um retrato do que não existe mais */
    if (aoLado && !achado && state.projects.length) {
      aoLado = null;
      gravarAoLado(null);
      toast('O item que estava ao lado não está mais neste navegador.');
    }

    if (!achado || telaCheia() || !state.project) {
      pane.hidden = true;
      $('#ladoBody').innerHTML = '';
      return;
    }

    pane.hidden = false;
    var marco = Report.marcoOf(achado.project, achado.kind) || achado.project.name || 'sem marco';
    var ehOAberto = achado.project.id === state.project.id && achado.item.id === selectedId() &&
      achado.kind === state.kind;
    $('#ladoTitulo').textContent = achado.item.ncrId || 'sem número';
    $('#ladoOnde').textContent = (achado.kind === 'dev' ? 'DEV · ' : 'NCR · ') + marco +
      (ehOAberto ? ' · é o item aberto à esquerda' : '');

    Lado.montar($('#ladoBody'), achado.project, achado.item, achado.kind, {
      copiar: function (txt, rotulo) {
        copiarTexto(txt,
          function () { toast('“' + rotulo + '” copiado — cole no campo daqui.'); },
          function () { toast('Não foi possível copiar.'); });
      }
    });
  }

  /** Abre no editor o item que está ao lado. */
  function abrirODoLado() {
    var achado = itemDoLado();
    if (!achado) return;
    abrirAchado({
      projectId: achado.project.id, kind: achado.kind, itemId: achado.item.id,
      ncrId: achado.item.ncrId,
      marco: Report.marcoOf(achado.project, achado.kind) || achado.project.name || ''
    });
  }

  /** Todos os itens de todos os relatórios, o aberto primeiro. */
  function candidatosDoLado() {
    var out = [];
    var ordemProj = state.projects.slice().sort(function (a, b) {
      if (state.project) {
        if (a.id === state.project.id) return -1;
        if (b.id === state.project.id) return 1;
      }
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    ordemProj.forEach(function (p) {
      ['ncr', 'dev'].forEach(function (kind) {
        Store.ordenar(p, kind).forEach(function (item) {
          out.push({ project: p, kind: kind, item: item });
        });
      });
    });
    return out;
  }

  var MAX_ESCOLHA = 150;      /* lista comprida demais não se lê: refine a busca */

  function abrirEscolhaDoLado() {
    var body = $('#ladoEscolhaBody');
    body.innerHTML = '';
    var todos = candidatosDoLado();

    var busca = el('div', 'sm-bar-field');
    busca.appendChild(el('label', null, 'Buscar'));
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.placeholder = 'número, marco, sistema, função…';
    busca.appendChild(inp);
    body.appendChild(busca);

    var conta = el('p', 'hint');
    body.appendChild(conta);
    var lista = el('div', 'lado-escolha');
    body.appendChild(lista);

    function desenhar() {
      var t = inp.value.trim().toLowerCase();
      var achados = todos.filter(function (c) {
        if (!t) return true;
        var marco = Report.marcoOf(c.project, c.kind) || c.project.name || '';
        return (Store.textoBusca(c.item) + ' ' + marco).toLowerCase().indexOf(t) >= 0;
      });
      lista.innerHTML = '';
      conta.textContent = achados.length + ' item(ns)' +
        (achados.length > MAX_ESCOLHA ? ' — mostrando os ' + MAX_ESCOLHA + ' primeiros.' : '.');
      achados.slice(0, MAX_ESCOLHA).forEach(function (c) {
        var b = el('button', 'lado-op');
        b.type = 'button';
        b.appendChild(el('strong', null,
          (c.kind === 'dev' ? 'DEV · ' : 'NCR · ') + (c.item.ncrId || 'sem número')));
        var marco = Report.marcoOf(c.project, c.kind) || c.project.name || 'sem marco';
        var sub = (c.kind === 'dev' ? [c.item.func] : [c.item.systems, c.item.func])
          .filter(Boolean).join(' | ');
        b.appendChild(el('span', null, marco + (sub ? ' · ' + sub : '')));
        b.addEventListener('click', function () {
          fixarAoLado(c.project.id, c.kind, c.item.id);
          $('#ladoDialog').close();
          toast('Preso ao lado: ' + (c.item.ncrId || 'item') + ' (' + marco + ').');
        });
        lista.appendChild(b);
      });
      if (!achados.length) lista.appendChild(el('p', 'hint', 'Nada com esse texto.'));
    }

    inp.addEventListener('input', desenhar);
    desenhar();
    $('#ladoDialog').showModal();
    inp.focus();
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
        /* o waiver é de cada marco: a cópia recomeça o acompanhamento */
        Store.setStatus(copy, Store.STATUS[0].id);
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

    /* verde quando não há o que corrigir, âmbar quando há */
    host.className = 'dlg-gaps' + (gaps.length ? '' : ' dlg-gaps--ok');
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

        row.appendChild(el('span', 'pick-tag' + (r.kind === 'dev' ? ' pick-tag--dev' : ''),
          r.kind === 'dev' ? 'DEV' : 'NCR'));

        var main = el('div', 'pick-row-main');
        main.appendChild(el('div', 'pick-row-name', r.marco));
        main.appendChild(el('div', 'pick-row-sub', r.count
          ? r.count + (r.count === 1 ? ' item' : ' itens') + ' · ' + (r.count + 1) + ' páginas ou mais'
          : 'sem itens'));
        row.appendChild(main);

        if (r.current) row.appendChild(el('span', 'pick-here', 'aba aberta'));
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
    agendarContagemFolhas(picked);
  }

  /**
   * Quantas folhas cada item vai ocupar.
   *
   * A conta só existe depois de montar as páginas de verdade, então a
   * montagem é a mesma da exportação — feita no #printRoot escondido, com um
   * atraso para não repetir a cada clique nas caixas de seleção.
   */
  var folhasTimer = null;
  function agendarContagemFolhas(picked) {
    clearTimeout(folhasTimer);
    var host = $('#pdfFolhas');
    if (!picked.length) { host.hidden = true; return; }
    host.hidden = false;
    host.textContent = 'Conferindo as folhas…';
    folhasTimer = setTimeout(function () { contarFolhas(picked, host); }, 220);
  }

  function contarFolhas(picked, host) {
    var longos;
    try {
      buildPrintRoot(picked);
      longos = Report.itensLongos();
    } catch (e) {
      markError(e);
      host.hidden = true;
      return;
    }
    var total = $$('#printRoot .rep-page').length;
    host.textContent = '';
    host.appendChild(el('span', null, total + ' folha(s) no total. '));
    if (!longos.length) {
      host.appendChild(el('span', null, 'Cada item cabe numa folha.'));
      return;
    }
    var nomes = longos.map(function (x) {
      return (x.ncrId || 'sem número') + ' (' + x.folhas + ')';
    }).join(', ');
    host.appendChild(el('span', 'dlg-folhas-long',
      longos.length + ' item(ns) passam de uma folha e seguem em folha de ' +
      'continuação: ' + nomes + '.'));
  }

  function doPrint() {
    var picked = pickedReports();
    if (!picked.length) return;
    var imp = Log.etapa('PDF', 'montando as folhas do relatório',
      { relatorios: picked.length });
    buildPrintRoot(picked);
    var folhas = $$('#printRoot .rep-page').length;
    var longos = Report.itensLongos();
    imp.fim('folhas prontas — a janela de impressão é do navegador',
      { folhas: folhas, itensEmMaisDeUmaFolha: longos.length });
    if (!folhas) {
      Log.erro('PDF', 'nenhuma folha foi montada', null,
        'isto não devia acontecer: confira se o relatório tem itens e mande ' +
        'Derrogacao.copiar() para quem cuida do programa.');
    }
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
      openUserDialog(function () { exportBackup(all); });
      toast('Informe seu nome — ele fica registrado no backup. O arquivo sai em seguida.');
      return;
    }
    var projects = all ? state.projects : [state.project];
    var data = Store.toBackup(projects);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var name = all
      ? 'WaiverRequest_TODOS_' + Report.timeStamp(true) + '.json'
      : Report.suggestedFileName(state.project, 'json');   /* leva as duas abas */
    download(blob, name);
    Store.setLastBackupAt(data.exportedAt);
    noticeDismissed = false;
    renderBackupNotice();
    /* grava a autoria do backup nos projetos exportados */
    Promise.all(projects.map(function (p) { return Store.save(p); })).then(renderUser);
    lembrarPasta(name, all
      ? 'Backup de tudo: ' + projects.length + ' relatório(s), NCR e DEV.'
      : 'Backup apenas do relatório aberto.');
  }

  /* O arquivo cai na pasta de downloads e para por aí: sem alguém movê-lo
     para a pasta combinada, o backup não protege nem chega a ninguém. */
  function lembrarPasta(nomeArquivo, oQueSaiu) {
    var dlg = $('#backupDoneDialog');
    $('#backupDoneFile').textContent = '📄 ' + nomeArquivo + ' — ' + oQueSaiu;
    $('#backupFolderInput').value = Store.getFolder();
    $('#backupCopyPathBtn').disabled = !Store.getFolder();
    dlg.showModal();
  }

  /* ---------------------------------------------------------------------- */
  /* mesclagem de arquivos                                                   */
  /* ---------------------------------------------------------------------- */

  var pendingMerge = null;

  /* Marcos ainda por comparar nesta importação. Cada um abre a sua tela; o
     usuário resolve um, o próximo aparece. */
  var filaMerge = [];
  var filaOrigem = '';

  function abrirProximaMesclagem() {
    var prox = filaMerge.shift();
    if (!prox) return false;
    var localAlvo = state.projects.filter(function (p) { return p.id === prox.par.local.id; })[0];
    if (!localAlvo) return abrirProximaMesclagem();
    loadProject(localAlvo);
    var plan = diffBoth(localAlvo, prox.incoming, prox.par.porMarco);
    plan.restantes = filaMerge.length;
    openMergeDialog(plan, filaOrigem);
    return true;
  }

  /** Junta o diff das duas abas de um relatório. */
  function diffBoth(local, incoming, porMarco) {
    var opts = { semRemocoes: !!porMarco };
    var a = Store.diffProject(local, incoming, 'ncr', opts);
    var b = Store.diffProject(local, incoming, 'dev', opts);
    return {
      local: local,
      incoming: incoming,
      porMarco: !!porMarco,
      novos: a.novos.concat(b.novos),
      atualizados: a.atualizados.concat(b.atualizados),
      conflitos: a.conflitos.concat(b.conflitos),
      removidos: a.removidos.concat(b.removidos),
      iguais: a.iguais + b.iguais
    };
  }

  /**
   * Marco normalizado: "RANAE  j06" e "ranae j06" são o mesmo marco.
   * Só o campo marco vale — o "name" de um relatório novo é "Novo relatório"
   * para todos, e dois relatórios ainda sem marco não são o mesmo trabalho.
   * Sem marco, devolve vazio e o arquivo entra como relatório à parte.
   */
  function marcoChave(p) {
    return String((p && p.marco) || '').trim().toUpperCase().replace(/\s+/g, ' ');
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

    /* Quando o pareamento foi pelo marco, os dois relatórios nunca foram o
       mesmo: convém dizer isso, e por que não há sugestão de exclusão. */
    var match = $('#mergeMatch');
    match.hidden = !plan.porMarco;
    match.textContent = plan.porMarco
      ? 'O arquivo traz outro relatório de "' + (plan.local.marco || plan.local.name) +
        '", criado noutro navegador. Os itens são pareados pelo número; ' +
        'como os dois nunca foram o mesmo relatório, nada é proposto para exclusão.'
      : '';

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

    grupo('Precisam da sua escolha', 'os dois lados escreveram — diga qual versão fica', plan.conflitos,
      function (e, i) {
        var row = el('div', 'mg-row mg-row--conflict');
        var head = el('div', 'mg-conflict-head');
        head.appendChild(el('span', 'sess-kind', kindTag(e.kind)));
        head.appendChild(el('span', 'mg-label', e.mine.ncrId || e.incoming.ncrId || '(sem número)'));
        if (e.porNumero) {
          var tag = el('span', 'mg-tag', 'mesmo número');
          tag.title = 'Escritos em separado, cada um no seu navegador — não há versão "mais nova"';
          head.appendChild(tag);
        }
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

    if (plan.restantes) {
      body.appendChild(el('p', 'mg-fila',
        'Este é o marco "' + (plan.local.marco || plan.local.name) + '". ' +
        'Depois dele ainda ' + (plan.restantes === 1 ? 'falta 1 marco' : 'faltam ' + plan.restantes + ' marcos') +
        ' do mesmo arquivo para comparar.'));
    }

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
          if (at < 0) return;
          /* a mesma lápide do botão Excluir: sem ela o item volta na
             sincronização seguinte, vindo de quem ainda não soube */
          Store.tombstone(local, e.kind, e.mine);
          lista.splice(at, 1);
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
          (upds.length + confs.length) + ' atualizado(s), ' + dels.length + ' excluído(s).' +
          (plan.localOrigem
            ? ' Confira e, se estiver tudo aqui, exclua o relatório repetido.'
            : ''));
        abrirProximaMesclagem();
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

      /* Achar o relatório correspondente aqui. Pelo id resolve quando o
         arquivo veio de uma cópia deste mesmo relatório. Pelo marco resolve
         a primeira troca entre duas pessoas que criaram, cada uma, o seu
         relatório do mesmo marco: os ids são diferentes, mas é o mesmo
         trabalho, e importar como um segundo "RANAE J06" só duplica. */
      var porId = {};
      var porMarco = {};
      state.projects.forEach(function (p) {
        porId[p.id] = p;
        var k = marcoChave(p);
        if (k && !porMarco[k]) porMarco[k] = p;
      });

      function correspondente(q) {
        if (porId[q.id]) return { local: porId[q.id], porMarco: false };
        var k = marcoChave(q);
        if (k && porMarco[k]) return { local: porMarco[k], porMarco: true };
        return null;
      }

      /* Relatórios que ainda não existem aqui entram inteiros, sem perguntar:
         não há nada para sobrescrever. */
      var inteiros = incoming.filter(function (q) { return !correspondente(q); });
      var repetidos = incoming.filter(function (q) { return !!correspondente(q); });

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

          /* Já existem aqui: comparar um marco de cada vez, item a item.
             Um "backup de tudo" traz vários marcos, e cada um tem a sua
             tela — daí a fila. */
          filaMerge = repetidos.map(function (q) {
            return { incoming: q, par: correspondente(q) };
          });
          filaOrigem = origem;
          abrirProximaMesclagem();
        })
        .catch(function (e) { markError(e); alert('Falha ao ler os relatórios do arquivo.'); });
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------------- */
  /* pasta compartilhada como banco de dados                                 */
  /* ---------------------------------------------------------------------- */

  /* Estado da conexão, só para a interface:
     'off' sem pasta · 'permissao' precisa de um clique · 'on' ligada ·
     'erro' a pasta sumiu ou negou acesso. */
  var pastaEstado = 'off';
  var pastaCaminho = '';        // texto informativo; o programa não abre por ele
  var sincronizando = false;
  var gravarPendente = false;
  var ultimaTecla = 0;
  var ultimaVersao = 0;
  var ultimaPoda = 0;
  var ultimoSucesso = 0;        // última vez que a pasta respondeu
  /* Dados gravados por uma versão mais nova da página: daqui para a frente
     esta sessão só lê, para não apagar campos que ainda não conhece. */
  var versaoDesatualizada = false;
  /* As duas bases de comparação (ver Store.saveBase): `mesclaBase` é o que
     já está na pasta, `baseDiario` é o que o histórico já registrou. */
  var mesclaBase = null;
  var baseDiario = null;
  var revisoes = [];
  var sincronizandoRevisoes = false;
  var avisouRelogio = false;
  var gravaTimer = null;
  var pollTimer = null;
  /* um pedido de permissão de cada vez, e o aviso do alto some quando a
     pessoa diz que não quer resolver isso agora */
  var pedidoEmVoo = null;
  var pastaNoticeFechado = false;
  var POLL_MS = 20000;

  /** Todas as imagens de todos os relatórios, com o item a que pertencem. */
  function todasAsImagens(projects) {
    var out = [];
    (projects || []).forEach(function (p) {
      ['ncrs', 'devs'].forEach(function (key) {
        (p[key] || []).forEach(function (item) {
          (item.evidence || []).forEach(function (ev) {
            (ev.images || []).forEach(function (im) { out.push(im); });
          });
        });
      });
    });
    return out;
  }

  /**
   * Manda para a pasta as imagens que ainda não têm arquivo próprio.
   *
   * O `arquivo` é gravado também na cópia local: é o que faz cada foto ser
   * escrita uma vez só, e não a cada sincronização.
   */
  function externalizarImagens() {
    var pendentes = todasAsImagens(state.projects).filter(function (im) {
      return im.src && !im.arquivo;
    });
    if (!pendentes.length) return Promise.resolve(0);
    var feito = 0;
    return pendentes.reduce(function (fila, im) {
      return fila.then(function () {
        return Pasta.gravarImagem(im.id, im.src).then(function (caminho) {
          im.arquivo = caminho;
          feito++;
        }).catch(function (e) {
          /* sem arquivo, a imagem continua viajando dentro do JSON: o
             relatório do colega não pode ficar sem a foto por causa disto */
          Log.erro('imagens', 'não consegui gravar uma imagem na pasta', e,
            Pasta.explicar(e) + ' A imagem continua aqui no seu navegador; ela vai ' +
            'para a pasta na próxima sincronização que der certo.');
        });
      });
    }, Promise.resolve()).then(function () { return feito; });
  }

  /**
   * Devolve às imagens do que veio da pasta o conteúdo que o JSON não traz
   * mais. O que já existe aqui é reaproveitado — só o que falta é lido do
   * disco, e uma vez só.
   */
  function hidratarImagens(payload) {
    var conhecidas = {};
    todasAsImagens(state.projects).forEach(function (im) {
      if (im.arquivo && im.src) conhecidas[im.arquivo] = im.src;
    });
    var faltando = todasAsImagens(payload && payload.projects).filter(function (im) {
      return !im.src && im.arquivo;
    });
    if (!faltando.length) return Promise.resolve(payload);
    return faltando.reduce(function (fila, im) {
      return fila.then(function () {
        if (conhecidas[im.arquivo]) { im.src = conhecidas[im.arquivo]; return null; }
        return Pasta.lerImagem(im.arquivo).then(function (dataUrl) {
          im.src = dataUrl;
          conhecidas[im.arquivo] = dataUrl;
        }).catch(function (e) {
          /* o arquivo pode ainda estar sendo gravado do outro lado: fica o
             ponteiro, e a próxima sincronização tenta de novo */
          Log.detalhe('imagens', 'imagem ainda não chegou da pasta',
            { arquivo: im.arquivo, erro: e && e.name });
        });
      });
    }, Promise.resolve()).then(function () { return payload; });
  }

  /**
   * O retrato que vai para a pasta. As imagens que já têm arquivo próprio
   * viajam só pelo nome — é o que mantém o JSON pequeno mesmo com centenas
   * de fotos, e o histórico com ele.
   */
  function montaPayload() {
    var copia = JSON.parse(JSON.stringify(state.projects));
    todasAsImagens(copia).forEach(function (im) {
      if (im.arquivo && im.src) delete im.src;
    });
    return {
      format: 'derrogacao-banco',
      schema: Store.SCHEMA,
      caminho: pastaCaminho,
      updatedAt: new Date().toISOString(),
      updatedBy: Store.getUser(),
      /* sem isto a exclusão de um relatório não alcançaria os outros */
      relatoriosExcluidos: Store.lapidesProjeto(),
      projects: copia
    };
  }

  function ehMaisNovoQueEu(dados) {
    if (!dados) return false;
    if ((Number(dados.schema) || 0) > Store.SCHEMA) return true;
    return Store.maisNovoQueEu(dados.projects);
  }

  /** Caminhos de imagem em uso — no que está aqui e em cada versão guardada. */
  function imagensEmUso() {
    var usados = [];
    todasAsImagens(state.projects).forEach(function (im) {
      if (im.arquivo) usados.push(im.arquivo);
    });
    return Pasta.listarHistorico().then(function (versoes) {
      return versoes.reduce(function (fila, v) {
        return fila.then(function () {
          return Pasta.lerHistorico(v.arquivo).then(function (dados) {
            todasAsImagens(dados && dados.projects).forEach(function (im) {
              if (im.arquivo) usados.push(im.arquivo);
            });
          }).catch(function () { /* versão ilegível não derruba a limpeza */ });
        });
      }, Promise.resolve()).then(function () { return usados; });
    });
  }

  /**
   * Apaga as fotos que nenhum item e nenhuma versão do histórico citam mais.
   * De hora em hora, no máximo: ler todas as versões é barato agora que elas
   * não carregam mais o base64, mas não é de graça.
   */
  function limparImagensOrfas() {
    if (Date.now() - ultimaPoda < 60 * 60 * 1000) return Promise.resolve(0);
    ultimaPoda = Date.now();
    return imagensEmUso()
      .then(function (usados) { return Pasta.podarImagens(usados); })
      .catch(function () { return 0; });
  }

  /* --- o diário de alterações ---------------------------------------------
     Quem escreveu o quê, campo a campo. Sai da comparação entre o que está
     aqui e o retrato da última captura: não custa uma tecla sequer, e não
     depende de ninguém lembrar de registrar nada. */

  /** Anota no diário o que esta pessoa escreveu desde a última captura. */
  function capturarRevisoes() {
    if (!baseDiario) {
      /* primeira vez neste navegador: não há com o que comparar, e inventar
         uma linha "mudou de vazio para o que já estava" seria mentira */
      baseDiario = Store.baseDe(state.projects);
      return guardarBases();
    }
    var novas = Revisoes.calcular(baseDiario, state.projects, Store.getUser());
    baseDiario = Store.baseDe(state.projects);
    if (novas.length) {
      revisoes = Revisoes.acrescentar(revisoes, novas);
      Revisoes.gravarLocais(revisoes);
      /* só os NOMES dos campos: o que foi escrito dentro deles não vai para o
         console (ver o topo de log.js) */
      var campos = {};
      novas.forEach(function (r) { campos[r.rotulo] = (campos[r.rotulo] || 0) + 1; });
      Log.detalhe('histórico', 'anotei o que você escreveu desde a última troca',
        { linhas: novas.length, campos: Object.keys(campos).join(', ') });
    }
    return guardarBases();
  }

  /** As linhas do que foi escrito por cima numa junção — as que mais valem. */
  /**
   * O que a junção fez, em linguagem de gente. É a linha que responde "o que
   * mudou agora?" sem abrir item por item — e a que mostra, na hora, quando
   * alguém escreveu por cima de alguém.
   *
   * Nomes de campo e números; nunca o texto do campo (ver o topo de log.js).
   */
  function relatarMesclagem(resumo) {
    if (!resumo) return;
    var mexeu = resumo.entraram || resumo.atualizados || resumo.removidos ||
      resumo.novosRelatorios;
    if (!mexeu) { Log.detalhe('mesclagem', 'nada mudou do lado de lá'); return; }
    Log.passo('mesclagem', 'trouxe o trabalho dos outros', {
      itensNovos: resumo.entraram, itensAtualizados: resumo.atualizados,
      excluidos: resumo.removidos, relatoriosNovos: resumo.novosRelatorios
    });
    (resumo.substituidos || []).forEach(function (sub) {
      var campos = (sub.perdidos || []).map(function (x) { return x.rotulo; });
      if (!campos.length) return;
      Log.aviso('mesclagem', 'escreveram por cima do seu texto em ' +
        (sub.ncrId || 'um item') + ': ' + campos.join(', '),
        'os dois mexeram no mesmo campo. O texto que saiu NÃO se perdeu: abra o ' +
        'item e use “Histórico do texto” para pôr de volta.');
    });
  }

  function registrarConflitos(resumo) {
    if (!resumo || !resumo.substituidos || !resumo.substituidos.length) return;
    var novas = Revisoes.deConflito(resumo.substituidos, state.projects, Store.getUser());
    if (!novas.length) return;
    revisoes = Revisoes.acrescentar(revisoes, novas);
    Revisoes.gravarLocais(revisoes);
  }

  function guardarBases() {
    return Store.saveBase(mesclaBase || {}, baseDiario || {});
  }

  /** Troca o diário com a pasta: união pelo id, como a conversa. */
  function sincronizarRevisoes() {
    if (!Pasta.ligada() || sincronizandoRevisoes) return Promise.resolve(null);
    sincronizandoRevisoes = true;
    return Pasta.lerRevisoes()
      .then(function (dados) {
        var remotas = (dados && Array.isArray(dados.revisoes)) ? dados.revisoes : [];
        revisoes = Revisoes.juntar(revisoes, remotas);
        Revisoes.gravarLocais(revisoes);
        /* página velha diante de um diário mais novo: lê, não regrava */
        if (versaoDesatualizada) return false;
        if (dados && Number(dados.schema) > 1) return false;
        if (!Revisoes.faltamLa(revisoes, remotas)) return false;
        return Pasta.gravarRevisoes(Revisoes.envelope(revisoes));
      })
      .then(function (r) { sincronizandoRevisoes = false; return r; })
      .catch(function (e) {
        sincronizandoRevisoes = false;
        /* O diário é desejável, não essencial: nunca derruba a gravação dos
           dados. E nada se perde aqui — as linhas já foram guardadas neste
           navegador antes desta tentativa (Revisoes.gravarLocais, acima), e
           a sincronização seguinte leva de novo o que faltar lá.
           `pasta.js` já tentou duas vezes; chegar aqui é a pasta ter
           recusado as duas. */
        Log.aviso('histórico', 'o histórico do texto não foi trocado com a pasta desta vez',
          Pasta.explicar(e) + ' As linhas continuam salvas neste navegador e vão na ' +
          'próxima sincronização — nada se perdeu.', { erro: e && e.name });
        return null;
      });
  }

  /**
   * Avisa quando o relógio daqui está atrasado em relação ao de quem gravou.
   *
   * Só essa direção é conclusiva: um carimbo no futuro não tem como ser
   * legítimo, enquanto um carimbo velho pode ser só alguém que não mexe no
   * arquivo desde ontem. E importa porque o relógio ainda é o desempate
   * quando duas pessoas escrevem no mesmo campo.
   */
  function conferirRelogio(dados) {
    if (avisouRelogio || !dados || !dados.updatedAt) return;
    var deles = Date.parse(dados.updatedAt);
    if (isNaN(deles)) return;
    var dif = deles - Date.now();
    if (dif < 5 * 60 * 1000) return;
    avisouRelogio = true;
    toast('O relógio deste computador está cerca de ' + Math.round(dif / 60000) +
      ' min atrasado em relação ao de quem gravou na pasta. ' +
      'Quando duas pessoas escrevem no mesmo campo, quem tem o relógio adiantado ganha — ' +
      'vale acertar a hora do Windows.', 10000);
  }

  /**
   * Uma rodada completa: lê a pasta, junta com o que está aqui, grava de
   * volta o resultado e guarda uma versão no histórico.
   *
   * Ler-juntar-gravar em vez de só gravar é o que evita apagar o trabalho de
   * quem salvou no meio do caminho. Não há trava de arquivo — a regra de
   * mesclagem converge sozinha, e o histórico cobre o resto.
   */
  function sincronizar(opts) {
    opts = opts || {};
    if (!Pasta.ligada() || sincronizando) {
      if (sincronizando) {
        gravarPendente = true;
        Log.detalhe('pasta', 'já tem uma sincronização em curso — esta fica na fila');
      }
      return Promise.resolve(null);
    }
    sincronizando = true;
    marcarPasta('sincronizando');
    var ciclo = Log.etapa('pasta', 'sincronizando com a pasta da equipe');

    /* Antes de qualquer coisa: o que foi escrito aqui desde a última vez vira
       linha de histórico enquanto ainda dá para saber que foi esta pessoa. */
    capturarRevisoes();

    /* Para saber se o item que está na tela mudou por fora — nesse caso a
       tela precisa ser redesenhada e a pessoa avisada, em vez de continuar
       mostrando um texto que já não é o que está gravado. */
    var abertoAntes = currentNcr();
    var assinaturaAntes = abertoAntes ? Store.signature(abertoAntes) : null;
    var idAberto = abertoAntes ? abertoAntes.id : null;

    /* Preenchido assim que a junção é aplicada na memória. Se a gravação
       falhar depois disso, o resultado ainda precisa ser salvo aqui e posto
       na tela: abandoná-lo deixaria o formulário mostrando um texto que já
       não é o do programa, e a tecla seguinte gravaria o velho por cima do
       que o colega escreveu. */
    var mesclado = null;

    /** Salva a junção neste navegador e põe na tela. */
    function adotar(resumo) {
      return Promise.all(state.projects.map(function (p) { return Store.save(p); }))
        .then(function () {
          opts.aberto = { id: idAberto, assinatura: assinaturaAntes };
          aplicarMudancasNaTela(resumo, opts);
        });
    }

    /* grava o resultado da junção, não só o que era meu */
    function gravarJuncao(resumo) {
      /* Página velha diante de dados novos: junta para ver o trabalho dos
         outros, mas não regrava — o que ela não entende seria apagado. */
      if (versaoDesatualizada) {
        Log.aviso('pasta', 'não vou gravar: esta página é mais antiga que os dados',
          'outra pessoa já está com uma versão mais nova do programa. Recarregue ' +
          'com Ctrl+F5. Até lá dá para ler e escrever aqui, mas nada vai para a pasta.');
        return Promise.resolve(resumo);
      }
      return externalizarImagens()
        .then(function () {
          Log.detalhe('pasta', 'gravando o arquivo de dados');
          return Pasta.gravar(montaPayload());
        })
        .then(function () {
          /* Gravou: o que está aqui é agora o que está na pasta, e passa a
             ser a base de comparação da próxima junção. */
          mesclaBase = Store.baseDe(state.projects);
          baseDiario = mesclaBase;
          return guardarBases();
        })
        .then(function () { return sincronizarRevisoes(); })
        .then(function () {
          /* além do retrato feito antes de cada junção, uma linha do tempo a
             cada dez minutos — sem transformar a pasta num depósito */
          if (Date.now() - ultimaVersao < 10 * 60 * 1000) return null;
          ultimaVersao = Date.now();
          return Pasta.versionar(montaPayload(), Store.getUser());
        })
        .then(function () { return limparImagensOrfas(); })
        .then(function () { return resumo; });
    }

    return Pasta.ler()
      .then(function (r) {
        var resumo = { entraram: 0, atualizados: 0, removidos: 0, novosRelatorios: 0 };
        if (!r.dados) {
          Log.passo('pasta', 'a pasta está vazia — vou gravar o que está aqui');
          mesclado = resumo;
          return gravarJuncao(resumo);
        }
        Log.detalhe('pasta', 'arquivo lido', {
          relatorios: (r.dados.projects || []).length,
          mexidoPorOutraPessoa: r.externo
        });
        if (r.externo) {
          Log.passo('pasta', 'alguém gravou depois de mim — guardando o meu estado antes de juntar');
        }

        conferirRelogio(r.dados);

        if (typeof r.dados.caminho === 'string' && r.dados.caminho && r.dados.caminho !== pastaCaminho) {
          /* a pasta diz onde ela é; guardar isso é o que faz a próxima
             abertura já vir com o caminho certo, sem ninguém digitar */
          pastaCaminho = r.dados.caminho;
          Store.setDbFolder(pastaCaminho);
          renderPastaNotice();
        }

        /* Alguém gravou depois de mim: guarda o MEU estado antes de juntar.
           É o que garante poder recuperar um texto que a regra "vale quem
           editou por último" vá substituir daqui a um instante. */
        var antes = r.externo
          ? Pasta.versionar(montaPayload(), (Store.getUser() || 'sem-nome') + '-antes')
          : Promise.resolve();

        /* Guarda de versão: se o arquivo veio de uma página mais nova do que
           esta, tudo o que ela não conhece sumiria na regravação. */
        if (!versaoDesatualizada && ehMaisNovoQueEu(r.dados)) {
          versaoDesatualizada = true;
          toast('Estes dados foram gravados por uma versão mais nova do programa. ' +
            'Recarregue a página (Ctrl+F5) para voltar a gravar — por ora, só leitura.', 9000);
        }

        return antes
          .then(function () { return hidratarImagens(r.dados); })
          .then(function () {
            resumo = Store.mergeListas(state.projects, r.dados.projects || [],
                                       r.dados.relatoriosExcluidos, mesclaBase);
            registrarConflitos(resumo);
            relatarMesclagem(resumo);
            /* o que chegou dos outros já está aqui: não é edição minha, e o
               diário não deve contá-la como se fosse */
            baseDiario = Store.baseDe(state.projects);
            mesclado = resumo;
            return gravarJuncao(resumo);
          });
      })
      .then(function (resumo) {
        pastaEstado = 'on';
        ultimoSucesso = Date.now();
        /* salva localmente o que veio, para funcionar mesmo sem a pasta */
        return adotar(resumo).then(function () {
          sincronizando = false;
          marcarPasta('on');
          ciclo.fim('sincronizado', resumo ? {
            recebidos: resumo.entraram, atualizados: resumo.atualizados,
            removidos: resumo.removidos, relatoriosNovos: resumo.novosRelatorios
          } : null);
          return resumo;
        });
      })
      .catch(function (e) {
        pastaEstado = (e && e.name === 'NotAllowedError') ? 'permissao' : 'erro';
        ciclo.falhou('a sincronização com a pasta não completou', e,
          Pasta.explicar(e) + ' O seu trabalho continua salvo neste navegador e a ' +
          'próxima tentativa leva tudo junto — nada se perdeu aqui. Se isto se ' +
          'repetir, confira se o G: está acessível e mande Derrogacao.copiar().');
        /* A junção já está na memória: deixá-la sem salvar e sem redesenhar
           seria pior do que a falha em si — ver o comentário de `mesclado`. */
        var fim = mesclado
          ? adotar(mesclado).catch(function (e2) {
              Log.erro('pasta', 'a junção não pôde nem ser salva aqui', e2,
                'isto é sério: recarregue a página (Ctrl+F5) antes de continuar ' +
                'escrevendo, para a tela voltar a mostrar o que está gravado.');
            })
          : Promise.resolve();
        return fim.then(function () {
          sincronizando = false;
          marcarPasta(pastaEstado);
          if (!opts.silencioso) {
            toast(pastaEstado === 'permissao'
              ? 'A pasta precisa da sua permissão — clique em “Pasta” na barra de cima.'
              : 'Não foi possível gravar na pasta de dados. O trabalho segue salvo neste navegador.');
          }
          return null;
        });
      })
      .then(function (r) {
        if (gravarPendente) { gravarPendente = false; setTimeout(sincronizar, 50); }
        return r;
      });
  }

  /** Redesenha só o necessário, para não estragar o que está sendo digitado. */
  function aplicarMudancasNaTela(resumo, opts) {
    guardarMudancas(resumo);
    var mudou = resumo && (resumo.entraram || resumo.atualizados || resumo.removidos ||
                           resumo.novosRelatorios || resumo.relatoriosRemovidos);
    /* alguém excluiu o último relatório: o programa nunca fica sem nenhum */
    if (!state.projects.length) {
      var vazio = Store.newProject('');
      state.projects.push(vazio);
      Store.save(vazio).then(function () { loadProject(vazio); });
      return;
    }
    /* o relatório aberto pode ter sido substituído pela cópia mesclada — ou
       excluído por outra pessoa */
    var sumiu = false;
    if (state.project) {
      var atual = state.projects.filter(function (p) { return p.id === state.project.id; })[0];
      if (!atual) { atual = state.projects[0]; sumiu = true; }
      state.project = atual;
    }
    if (sumiu) {
      loadProject(state.project);
      if (!opts.silencioso) toast('O relatório que estava aberto foi excluído por outra pessoa.');
      return;
    }
    if (!mudou) return;
    var avisoDoItem = '';

    refreshProjectSelect();
    refreshSuggestions();
    renderTabs();
    renderNcrList();
    renderUser();
    if (isResumo()) renderSummary();
    if (isFluxos()) renderFluxos(true);
    if (isTabela()) renderTabela(true);

    if (!telaCheia()) {
      var agora = currentNcr();
      if (!agora) {
        /* o item aberto foi excluído por outra pessoa */
        var lista = items();
        setSelectedId(lista.length ? lista[0].id : null);
        renderEditor();
        if (opts.aberto && opts.aberto.id) {
          toast('O item que estava aberto foi excluído por outra pessoa.');
        }
      } else if (opts.aberto && opts.aberto.id === agora.id &&
                 opts.aberto.assinatura !== null &&
                 opts.aberto.assinatura !== Store.signature(agora)) {
        /* Chegou uma versão mais nova do que está na tela. Redesenhar é
           obrigatório: deixar o texto antigo à vista faria a próxima tecla
           sobrescrever, em silêncio, o que a outra pessoa escreveu. */
        renderEditor();
        avisoDoItem = '“' + (agora.ncrId || 'este item') + '” foi atualizado por ' +
          (agora.editedBy || 'outra pessoa') + '. A tela já mostra a versão nova.';
      } else if (!opts.semRedesenhar) {
        renderEditor();
      }
    }

    if (avisoDoItem) { toast(avisoDoItem); return; }
    if (!opts.silencioso) {
      var partes = [];
      if (resumo.novosRelatorios) partes.push(resumo.novosRelatorios + ' relatório(s)');
      if (resumo.entraram) partes.push(resumo.entraram + ' item(ns) novo(s)');
      if (resumo.atualizados) partes.push(resumo.atualizados + ' atualizado(s)');
      if (resumo.removidos) partes.push(resumo.removidos + ' excluído(s) por outra pessoa');
      if (partes.length) toast('Da pasta: ' + partes.join(', ') + '.');
    }
  }

  /** Verificação barata, de tempos em tempos: alguém gravou lá fora? */
  function pollPasta() {
    if (!Pasta.ligada() || pastaEstado !== 'on' || sincronizando) return;
    if (Date.now() - ultimaTecla < 4000) return;   /* não mexe enquanto digita */
    if (document.querySelector('dialog[open]')) return;
    if (!$('#preview').hidden) return;
    Pasta.mudouLaFora().then(function (mudou) {
      if (mudou) sincronizar({ semRedesenhar: true });
    });
  }

  function agendarPoll() {
    clearInterval(pollTimer);
    if (Pasta.ligada()) pollTimer = setInterval(pollPasta, POLL_MS);
  }

  /* --- interface ---------------------------------------------------------- */

  /* Só para o diário: a última situação anunciada, para anunciar a troca e
     não a repetição — "sincronizando" passa por aqui a cada 20 segundos. */
  var pastaDita = '';

  function marcarPasta(estado) {
    /* Trocar de situação é a notícia. Em especial a volta ao normal: sem uma
       linha dizendo isso, quem viu o vermelho fica sem saber se voltou. */
    /* "sincronizando" passa por aqui a cada 20 segundos e "off" é só "ainda
       não escolheram pasta" — nenhum dos dois é notícia. */
    if (estado !== 'sincronizando' && estado !== 'off') {
      if (estado !== pastaDita) {
        if (estado === 'on') {
          Log.ok('pasta', pastaDita === 'permissao' || pastaDita === 'erro'
            ? 'a pasta voltou a responder — o que ficou para trás vai agora'
            : 'pasta funcionando normalmente');
        } else {
          Log.aviso('pasta', estado === 'permissao'
            ? 'a pasta está pedindo permissão — clique em “Pasta” na barra de cima'
            : 'a pasta parou de responder',
            'enquanto isso durar, o que você escrever fica só neste navegador — e vai ' +
            'inteiro para a equipe assim que a pasta voltar. Nada se perde.');
        }
      }
      pastaDita = estado;
    }
    var chip = $('#pastaChip');
    var item = $('#pastaBtn');
    if (item) item.hidden = !Pasta.suportado();
    renderPastaNotice();
    if (!chip) return;
    /* a etiqueta só existe quando há pasta: sem ela não há nada a mostrar */
    chip.hidden = !Pasta.suportado() || !Pasta.ligada();
    if (chip.hidden) return;
    chip.dataset.estado = estado;
    var rotulos = {
      on: '📁 ' + Pasta.nome(),
      sincronizando: '📁 sincronizando…',
      permissao: '📁 permitir acesso',
      erro: '📁 sem acesso'
    };
    $('#pastaChipLabel').textContent = rotulos[estado] || ('📁 ' + Pasta.nome());
    chip.title = estado === 'on'
      ? 'Banco de dados na pasta "' + Pasta.nome() + '"' + (pastaCaminho ? ' (' + pastaCaminho + ')' : '') +
        '\nTudo o que você edita vai para lá e chega aos outros.'
      : estado === 'permissao'
        ? 'O navegador precisa da sua permissão para abrir a pasta. Clique aqui.'
        : 'Clique para ver a pasta de dados.';
    $('#pastaBtnSub').textContent = estado === 'permissao'
      ? 'precisa de permissão — clique'
      : 'ligado a "' + Pasta.nome() + '"';
  }

  /** Liga (ou reata) a pasta e faz a primeira rodada. Vem sempre de um clique. */
  function conectarPasta(handleNovo) {
    /* dois pedidos ao mesmo tempo abrem duas janelas de permissão: o clique
       no aviso e o clique solto que arma o pedido chegam quase juntos */
    if (pedidoEmVoo) return pedidoEmVoo;
    var passo = handleNovo ? Promise.resolve('granted') : Pasta.pedirPermissao();
    pedidoEmVoo = passo.then(function (perm) {
      if (perm !== 'granted') {
        pastaEstado = 'permissao';
        marcarPasta('permissao');
        Log.aviso('pasta', 'a permissão da pasta não foi concedida',
          'sem ela o programa trabalha só neste navegador: nada vai para a equipe e ' +
          'nada vem dela. Clique em “Pasta” na barra de cima e confirme na janela ' +
          'do Windows.');
        toast('Sem permissão para abrir a pasta.');
        return null;
      }
      Log.ok('pasta', 'pasta ligada', { nome: Pasta.nome() });
      pastaEstado = 'on';
      agendarPoll();
      sincronizarConversas({});
      return sincronizar({}).then(function (r) {
        /* a janela costuma continuar aberta depois de escolher a pasta:
           o histórico e o tamanho só aparecem se forem redesenhados aqui */
        if ($('#pastaDialog').open) {
          renderTamanhosPasta();
          renderHistoricoPasta();
        }
        return r;
      });
    });
    var solta = function () { pedidoEmVoo = null; };
    pedidoEmVoo.then(solta, solta);
    return pedidoEmVoo;
  }

  /**
   * O aviso de cima: onde fica o banco de dados e o que falta para ligá-lo.
   *
   * Existe porque a permissão da pasta é a única coisa que o navegador não
   * deixa o programa resolver sozinho — e um aviso escondido no menu vira
   * "o programa está vazio hoje".
   */
  /** Há quanto tempo a pasta não responde, em palavras. */
  function desdeUltimaTroca() {
    if (!ultimoSucesso) return '';
    var min = Math.floor((Date.now() - ultimoSucesso) / 60000);
    if (min < 2) return '';
    if (min < 60) return 'há ' + min + ' minutos';
    var h = Math.floor(min / 60);
    return 'há ' + h + (h === 1 ? ' hora' : ' horas');
  }

  function renderPastaNotice() {
    var box = $('#pastaNotice');
    if (!box) return;
    var ligada = Pasta.ligada();
    var desligada = ligada && (pastaEstado === 'erro' || pastaEstado === 'permissao');
    /* "Agora não" cala o convite para escolher a pasta — nunca o alarme de
       que ela parou de responder. Trabalhar horas sem saber que ninguém está
       vendo o que você escreve é exatamente o que dá errado depois. */
    if (!Pasta.suportado() || (ligada && pastaEstado === 'on') ||
        (pastaNoticeFechado && !desligada)) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.classList.toggle('notice--parada', !!desligada);
    var tempo = desdeUltimaTroca();
    $('#pastaNoticeText').textContent = desligada
      ? 'O programa não está trocando dados com a pasta da equipe' +
        (tempo ? ' ' + tempo : '') + '. O seu trabalho continua salvo neste ' +
        'computador, mas ninguém mais o está vendo — e quanto mais tempo assim, ' +
        'maior a chance de alguém escrever no mesmo campo que você.'
      : 'O banco de dados da equipe fica nesta pasta. Escolha-a uma vez: ' +
        'daí em diante o programa reabre sozinho, sem perguntar o caminho de novo.';
    $('#pastaNoticePath').textContent = desligada ? '' : (pastaCaminho || Store.CAMINHO_PADRAO);
    $('#pastaNoticePath').hidden = desligada;
    $('#pastaNoticeCopy').hidden = desligada;
    $('#pastaNoticeDismiss').hidden = desligada;
    $('#pastaNoticeBtn').textContent = desligada ? 'Religar a pasta agora' : 'Escolher a pasta…';
  }

  /**
   * A permissão só pode ser pedida dentro de um gesto do usuário. Em vez de
   * deixar o aviso esperando um clique no lugar certo, o primeiro clique em
   * qualquer lugar serve — é o que faz a pasta voltar sozinha ao abrir.
   *
   * Vale por pouco tempo e uma vez só: passar do tempo é sinal de que a
   * pessoa já está trabalhando, e aí a janela do navegador roubando o foco
   * atrapalharia mais do que ajudaria. O aviso continua no alto.
   */
  var JANELA_PEDIDO = 120000;
  function pedirPermissaoNoPrimeiroGesto() {
    var ate = Date.now() + JANELA_PEDIDO;
    function tentar() {
      document.removeEventListener('click', tentar, true);
      if (pastaEstado === 'on' || !Pasta.ligada()) return;
      if (Date.now() > ate) return;
      conectarPasta().then(function () {
        if (pastaEstado === 'on') toast('Pasta de dados aberta. Sincronizando…', 3000);
      });
    }
    document.addEventListener('click', tentar, true);
  }

  /**
   * A janela do Windows. É o único caminho: nenhum navegador abre uma pasta
   * por texto, nem com o caminho na mão — a escolha tem de ser da pessoa.
   * O caminho combinado fica à vista (e copiável) para ela colar lá.
   */
  function escolherPasta() {
    return Pasta.escolher().then(function () {
      pastaEstado = 'on';
      marcarPasta('on');
      agendarPoll();
      return sincronizar({});
    }).then(function (r) {
      if (r === null) return;
      if ($('#pastaDialog').open) $('#pastaDialog').close();
      toast('Pasta ligada: "' + Pasta.nome() + '". A partir de agora tudo vai e vem de lá.');
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;      /* desistiu na janela */
      markError(e);
      toast(e.message || 'Não foi possível abrir a pasta.');
    });
  }

  function abrirPastaDialog() {
    var dlg = $('#pastaDialog');
    $('#pastaNomeAtual').textContent = Pasta.ligada() ? Pasta.nome() : '—';
    $('#pastaCaminhoInput').value = pastaCaminho;
    $('#pastaDesligarBtn').hidden = !Pasta.ligada();
    $('#pastaPermitirBtn').hidden = !(Pasta.ligada() && pastaEstado !== 'on');
    $('#pastaEstadoLinha').textContent = !Pasta.suportado()
      ? 'Este navegador não abre pastas. Use o Microsoft Edge ou o Google Chrome.'
      : !Pasta.ligada()
        ? 'Nenhuma pasta escolhida — os relatórios estão só neste navegador.'
        : pastaEstado === 'on'
          ? 'Ligado. O que você edita vai para a pasta e chega aos outros.'
          : 'A pasta está escolhida, mas o navegador ainda não liberou o acesso nesta sessão.';
    $('#pastaEstadoLinha').dataset.estado = Pasta.ligada() ? pastaEstado : 'off';
    $('#pastaEscolherBtn').textContent = Pasta.ligada() ? 'Trocar de pasta…' : 'Escolher a pasta…';
    $('#pastaEscolherBtn').disabled = !Pasta.suportado();
    renderTamanhosPasta();
    renderHistoricoPasta();
    dlg.showModal();
  }

  function mb(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* Quanto a pasta está ocupando. Saber disso antes é melhor do que
     descobrir quando a rede começar a arrastar. */
  function renderTamanhosPasta() {
    var linha = $('#pastaTamanhos');
    if (!Pasta.ligada() || pastaEstado !== 'on') { linha.hidden = true; return; }
    linha.hidden = false;
    linha.textContent = 'Somando os arquivos…';
    Pasta.tamanhos().then(function (t) {
      if (!t) { linha.hidden = true; return; }
      linha.textContent = 'Ocupando ' + mb(t.total) + ' na pasta: ' +
        mb(t.dados) + ' de dados, ' +
        mb(t.imagens) + ' em ' + t.fotos + ' imagem(ns), ' +
        mb(t.historico) + ' em ' + t.versoes + ' versão(ões) do histórico.' +
        (versaoDesatualizada
          ? ' Só leitura: os dados foram gravados por uma versão mais nova do programa.'
          : '');
    }).catch(function () { linha.hidden = true; });
  }

  function renderHistoricoPasta() {
    var box = $('#pastaHistorico');
    box.innerHTML = '';
    if (!Pasta.ligada() || pastaEstado !== 'on') { box.hidden = true; return; }
    box.hidden = false;
    box.appendChild(el('div', 'hist-carregando', 'Lendo o histórico…'));
    Pasta.listarHistorico().then(function (lista) {
      box.innerHTML = '';
      if (!lista.length) {
        box.appendChild(el('p', 'hint', 'Ainda não há versões guardadas.'));
        return;
      }
      box.appendChild(el('div', 'hist-titulo',
        lista.length + ' versão(ões) guardada(s) em ' + Pasta.HISTORICO + '\\'));
      lista.slice(0, 12).forEach(function (v) {
        var linha = el('div', 'hist-linha');
        linha.appendChild(el('span', 'hist-quando', v.quando));
        linha.appendChild(el('span', 'hist-quem', v.quem || '—'));
        var b = el('button', 'btn btn--sm', 'Restaurar');
        b.type = 'button';
        b.addEventListener('click', function () { restaurarVersao(v); });
        linha.appendChild(b);
        box.appendChild(linha);
      });
    });
  }

  /* Restaurar não apaga nada: traz a versão antiga e deixa a mesclagem
     decidir, do mesmo jeito que um arquivo de colega. */
  function restaurarVersao(v) {
    if (!confirm('Trazer de volta os itens da versão de ' + v.quando + '?\n\n' +
      'Só volta o que não existe mais aqui. Nada do que está em uso agora é ' +
      'apagado nem substituído.')) return;
    Pasta.lerHistorico(v.arquivo).then(function (dados) {
      /* a versão guarda só o nome das imagens: o conteúdo vem dos arquivos */
      return hidratarImagens(dados);
    }).then(function (dados) {
      return Store.saveSnapshot(state.projects, 'antes de restaurar ' + v.quando)
        .then(function () {
          var resumo = Store.reviver(state.projects, dados.projects || []);
          return Promise.all(state.projects.map(function (p) { return Store.save(p); }))
            .then(function () { return resumo; });
        });
    }).then(function (resumo) {
      $('#pastaDialog').close();
      refreshUndo();
      aplicarMudancasNaTela({ entraram: resumo.voltaram, novosRelatorios: resumo.relatorios },
        { silencioso: true });
      toast(resumo.voltaram
        ? resumo.voltaram + ' item(ns) de volta, da versão de ' + v.quando + '.'
        : 'Nada a restaurar: essa versão não tem nenhum item que falte aqui.');
      return sincronizar({ silencioso: true });
    }).catch(function (e) {
      markError(e);
      alert('Não foi possível ler essa versão.');
    });
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

    var abas = $$('.tab');
    abas.forEach(function (t, i) {
      t.addEventListener('click', function () { switchKind(t.dataset.kind); });
      t.addEventListener('keydown', function (e) {
        var passo = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
        if (!passo) return;
        e.preventDefault();
        var prox = abas[(i + passo + abas.length) % abas.length];
        switchKind(prox.dataset.kind);
        prox.focus();
      });
    });
    $('#projectSelect').addEventListener('change', function () {
      var sel = this.value;
      flushSave().then(function () {
        var p = state.projects.filter(function (x) { return x.id === sel; })[0];
        if (p) loadProject(p);
      });
    });

    $('#newProjectTopBtn').addEventListener('click', function () {
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
      /* sem a lápide o relatório voltaria na sincronização seguinte, vindo do
         computador de quem ainda não soube */
      Store.tombstoneProjeto(state.project);
      Store.remove(id).then(function () {
        state.projects = state.projects.filter(function (p) { return p.id !== id; });
        if (!state.projects.length) {
          var p = Store.newProject('');
          return Store.save(p).then(function () { state.projects = [p]; loadProject(p); });
        }
        loadProject(state.projects[0]);
      }).then(function () {
        toast('Relatório excluído.');
        agendarGravacaoPasta();
      }).catch(markError);
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
    /* fechar pelo Esc ou pelo "Agora não" desiste também do que estava a caminho */
    $('#userDialog').addEventListener('close', function () { aposNome = null; });
    $('#userSaveBtn').addEventListener('click', function () {
      var seguir = aposNome;
      aposNome = null;
      Store.setUser($('#userNameInput').value);
      $('#userDialog').close();
      renderUser();
      flushSave();
      toast(Store.getUser() ? 'Nome registrado: ' + Store.getUser() : 'Nome removido.');
      /* o canal direto é a dupla de nomes: trocar o meu troca as chaves */
      renderConversaBadge();
      if (isConversa()) abrirCanal(Chat.GERAL);
      /* segue de onde parou — o clique original já vale como gesto do usuário,
         então o download não é bloqueado pelo navegador */
      if (seguir && Store.getUser()) seguir();
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

    $('#ordemSelect').addEventListener('change', function () {
      state.project.ordem = Store.ordemInfo(this.value).id;
      renderOrdem();
      renderNcrList();
      scheduleSave();
      toast('Ordem: ' + Store.ordemInfo(this.value).nome + '. Vale também no PDF.');
    });
    $('#ordemFixarBtn').addEventListener('click', function () { fixarOrdem(false); });

    /* histórico de alterações */
    $('#mergeCancelBtn').addEventListener('click', function () {
      var faltavam = (pendingMerge ? 1 : 0) + filaMerge.length;
      $('#mergeDialog').close();
      pendingMerge = null;
      filaMerge = [];
      if (faltavam > 1) {
        toast('Mesclagem cancelada. ' + faltavam + ' marcos do arquivo ficaram sem comparar — ' +
          'abra o arquivo de novo quando quiser retomar.');
      }
    });
    $('#mergeApplyBtn').addEventListener('click', applyMerge);
    $('#undoMergeBtn').addEventListener('click', undoMerge);

    $('#mergeLocalBtn').addEventListener('click', function () {
      var dup = duplicadoDoMarco();
      if (!dup) return;
      var plan = diffBoth(state.project, dup, true);
      plan.localOrigem = dup;
      openMergeDialog(plan,
        'Outro relatório de "' + (dup.marco || dup.name) + '" que já está neste navegador.');
    });

    /* a coluna do item ao lado */
    $('#ladoTrocarBtn').addEventListener('click', abrirEscolhaDoLado);
    $('#ladoAbrirBtn').addEventListener('click', abrirODoLado);
    $('#ladoFecharBtn').addEventListener('click', function () {
      soltarAoLado();
      toast('Coluna fechada. O item continua onde estava.');
    });
    $('#ladoEscolhaCancelBtn').addEventListener('click', function () { $('#ladoDialog').close(); });

    $('#sessionsBtn').addEventListener('click', openSessions);
    $('#sessionInfoBtn').addEventListener('click', openSessions);
    $('#sessionsCloseBtn').addEventListener('click', function () { $('#sessionsDialog').close(); });
    $('#sessionsCopyBtn').addEventListener('click', function () {
      var txt = sessionSummaryText();
      if (!txt) { toast('Nada alterado nesta sessão.'); return; }
      copiarTexto(txt,
        function () { toast('Resumo da sessão copiado.'); },
        function () { toast('Não foi possível copiar.'); });
    });

    /* lembrete da pasta de backup */
    $('#backupFolderInput').addEventListener('input', function () {
      Store.setFolder(this.value);
      $('#backupCopyPathBtn').disabled = !this.value.trim();
    });
    $('#backupCopyPathBtn').addEventListener('click', function () {
      var caminho = Store.getFolder();
      if (!caminho) return;
      copiarTexto(caminho,
        function () { toast('Caminho copiado — cole na barra do explorador de arquivos.'); },
        function () { toast('Não foi possível copiar.'); });
    });
    $('#backupDoneBtn').addEventListener('click', function () { $('#backupDoneDialog').close(); });

    /* pasta compartilhada */
    document.addEventListener('input', function () { ultimaTecla = Date.now(); }, true);
    document.addEventListener('keydown', function () { ultimaTecla = Date.now(); }, true);

    $('#pastaNoticeBtn').addEventListener('click', function () {
      if (Pasta.ligada() && pastaEstado !== 'on') { conectarPasta(); return; }
      escolherPasta();
    });
    $('#pastaNoticeCopy').addEventListener('click', function () {
      copiarTexto(pastaCaminho || Store.CAMINHO_PADRAO,
        function () { toast('Caminho copiado. Cole na barra de endereço da janela do Windows.', 5000); },
        function () { toast('Não foi possível copiar aqui. Selecione o texto e use Ctrl+C.'); });
    });
    $('#pastaNoticeDismiss').addEventListener('click', function () {
      pastaNoticeFechado = true;
      renderPastaNotice();
      toast('Some por enquanto. A pasta continua em “⋯ Mais → Pasta da rede”.', 4500);
    });

    $('#pastaBtn').addEventListener('click', abrirPastaDialog);
    $('#pastaChip').addEventListener('click', function () {
      if (pastaEstado !== 'on') { conectarPasta(); return; }
      abrirPastaDialog();
    });
    $('#pastaFecharBtn').addEventListener('click', function () { $('#pastaDialog').close(); });
    $('#pastaPermitirBtn').addEventListener('click', function () {
      conectarPasta().then(function () {
        $('#pastaDialog').close();
      });
    });
    $('#pastaCaminhoInput').addEventListener('input', function () {
      pastaCaminho = this.value.trim();
      Store.setDbFolder(pastaCaminho);
      renderPastaNotice();     /* o aviso do alto mostra este mesmo caminho */
      agendarGravacaoPasta();
    });
    $('#pastaPadraoBtn').addEventListener('click', function () {
      pastaCaminho = Store.CAMINHO_PADRAO;
      Store.setDbFolder(pastaCaminho);
      $('#pastaCaminhoInput').value = pastaCaminho;
      renderPastaNotice();
      agendarGravacaoPasta();
      toast('Caminho de volta ao combinado pela equipe.');
    });
    $('#pastaCaminhoCopiarBtn').addEventListener('click', function () {
      copiarTexto(pastaCaminho || Store.CAMINHO_PADRAO,
        function () { toast('Caminho copiado. Cole na barra de endereço da janela do Windows.', 5000); },
        function () { toast('Não foi possível copiar aqui. Selecione o texto e use Ctrl+C.'); });
    });
    $('#pastaEscolherBtn').addEventListener('click', escolherPasta);
    $('#pastaDesligarBtn').addEventListener('click', function () {
      if (!confirm('Parar de usar a pasta como banco de dados?\n\n' +
        'Os relatórios continuam neste navegador. A pasta não é apagada.')) return;
      Pasta.esquecer().then(function () {
        pastaEstado = 'off';
        clearInterval(pollTimer);
        clearInterval(conversaTimer);
        marcarPasta('off');
        $('#pastaDialog').close();
        toast('Pasta desligada. O trabalho segue salvo neste navegador.');
      });
    });

    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsCloseBtn').addEventListener('click', function () { $('#settingsDialog').close(); });
    $('#copyNcrBtn').addEventListener('click', openCopyDialog);
    $('#dupNcrBtn').addEventListener('click', duplicarNcr);
    $('#difCloseBtn').addEventListener('click', function () { $('#difDialog').close(); });
    $('#revCloseBtn').addEventListener('click', function () { $('#revDialog').close(); });
    $('#revBusca').addEventListener('input', function () {
      revEstado.busca = this.value;
      renderHistorico();
    });
    $('#fluxoCloseBtn').addEventListener('click', function () { $('#fluxoDialog').close(); });
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
      /* item aceito está travado: a área de soltar imagens fica desligada,
         e colar não pode ser a porta dos fundos */
      if (travado(ncr)) { toast('Item aceito e travado — use “Editar mesmo assim” antes de colar.'); return; }
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

  /* A publicação carimba os assets com o SHA do commit. Mostrar essa marca
     permite conferir, em segundos, se o navegador está com a versão certa —
     um index.html novo servido junto de um app.js velho do cache já causou
     erros difíceis de entender. */
  function renderVersion() {
    /* no site, a versão vem do carimbo no src; no arquivo único, da meta */
    var tag = document.querySelector('script[src*="app.js"]');
    var m = /[?&]v=([^&]+)/.exec((tag && tag.getAttribute('src')) || '');
    var meta = document.querySelector('meta[name="app-version"]');
    var v = m ? m[1] : (meta ? meta.getAttribute('content') : '');

    $('#menuVersion').textContent = v ? 'versão ' + v : 'versão não identificada';
    if (v) $('#menuBtn').title = 'Mais ações — versão ' + v;

    /* o link para baixar o arquivo único só faz sentido servido pela web */
    var link = $('#standaloneLink');
    if (link) link.hidden = location.protocol === 'file:';
  }

  /**
   * Registra o service worker. Serve a duas coisas: abrir sem rede e fazer o
   * Edge oferecer a instalação como aplicativo — que é o que faz o navegador
   * guardar a permissão da pasta entre sessões.
   *
   * Só no site publicado: de file:// não existe service worker, e a versão de
   * arquivo único não precisa de nenhum.
   */
  function registrarServiceWorker() {
    if (!navigator.serviceWorker) return;
    var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol !== 'https:' && !local) return;
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      Log.detalhe('instalação', 'service worker não registrado', { erro: e && e.name });
    });
  }

  /* O que o diagnóstico conta quando a pessoa pede. Cada fonte responde uma
     pergunta que eu faria por e-mail se algo estivesse estranho. */
  function registrarFontes() {
    Log.fonte('relatórios', function () {
      var itens = 0, aceitos = 0;
      state.projects.forEach(function (p) {
        ['ncrs', 'devs'].forEach(function (k) {
          (p[k] || []).forEach(function (n) { itens++; if (n.done) aceitos++; });
        });
      });
      return { quantos: state.projects.length, itens: itens, aceitos: aceitos,
               aberto: state.project ? (state.project.marco || state.project.name) : '(nenhum)',
               aba: state.kind };
    });
    Log.fonte('pasta', function () {
      return { ligada: Pasta.ligada(), estado: pastaEstado,
               nome: Pasta.nome() || '(nenhuma)',
               ultimoSucesso: ultimoSucesso ? desdeUltimaTroca() : 'nunca nesta sessão',
               soLeitura: versaoDesatualizada };
    });
    Log.fonte('histórico do texto', function () {
      return { linhas: (revisoes || []).length,
               base: mesclaBase ? 'guardada' : 'ainda não',
               diario: baseDiario ? 'guardado' : 'ainda não' };
    });
    Log.fonte('quem', function () { return { nome: Store.getUser() || '(sem nome)' }; });
  }

  function boot() {
    Log.passo('abertura', 'Waiver Request — diário do console ligado. ' +
      'Digite Derrogacao.ajuda() para ver o que dá para fazer aqui.');
    Log.detalhe('abertura', 'onde estou', {
      origem: location.protocol === 'file:' ? 'arquivo no disco (file://)' : location.protocol,
      pastaSuportada: Pasta.suportado()
    });
    Log.vigiar();
    registrarFontes();
    wire();
    aoLado = lerAoLado();
    registrarServiceWorker();
    requestPersistentStorage();
    refreshUndo();
    renderVersion();
    var abrindo = Log.etapa('abertura', 'lendo o que está guardado neste navegador');
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
    }).then(function () {
      var itens = 0;
      state.projects.forEach(function (p) {
        itens += (p.ncrs || []).length + (p.devs || []).length;
      });
      abrindo.fim('relatórios abertos', { relatorios: state.projects.length, itens: itens });
      revisoes = Revisoes.locais();
      return Store.getBase().then(function (b) {
        mesclaBase = b ? b.base : null;
        baseDiario = b ? b.diario : null;
        if (!baseDiario) return capturarRevisoes();   /* só semeia o retrato */
      });
    }).then(function () {
      Log.detalhe('abertura', 'histórico do texto carregado', { linhas: (revisoes || []).length });
      iniciarConversa();
      return iniciarPasta();
    }).catch(function (e) {
      abrindo.falhou('não consegui ler o armazenamento deste navegador', e,
        'o programa vai começar com um relatório em branco. NÃO grave nada por cima ' +
        'até entender: se você já tinha relatórios aqui, abra um backup .json antes.');
      markError(e);
      var p = Store.newProject('');
      state.projects = [p];
      loadProject(p);
      toast('Não foi possível ler o armazenamento local; começando do zero.');
    });
  }

  /**
   * Reata a pasta guardada. Nunca pede permissão sozinho: o navegador só
   * atende dentro de um clique, então aqui só descobrimos em que pé está e
   * deixamos o aviso na barra.
   */
  function iniciarPasta() {
    pastaCaminho = Store.getDbFolder();
    marcarPasta('off');
    if (!Pasta.suportado()) return Promise.resolve();
    return Pasta.retomar().then(function (h) {
      if (!h) { pastaEstado = 'off'; marcarPasta('off'); return; }
      return Pasta.estadoPermissao().then(function (perm) {
        if (perm === 'granted') {
          pastaEstado = 'on';
          agendarPoll();
          return sincronizar({}).then(function () {
            agendarPoll();
            return sincronizarConversas({});
          });
        }
        pastaEstado = 'permissao';
        marcarPasta('permissao');
        pedirPermissaoNoPrimeiroGesto();
      });
    }).catch(function (e) {
      Log.aviso('pasta', 'não consegui reabrir a pasta guardada deste navegador',
        Pasta.explicar(e) + ' Clique em “Pasta” na barra de cima para escolher de novo.',
        { erro: e && e.name });
      pastaEstado = 'erro';
      marcarPasta('erro');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
