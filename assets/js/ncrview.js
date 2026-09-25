/* ==========================================================================
   ncrview.js — aba "Banco NCR": a tabela das NCRs do SBR4 e a ficha de cada uma
   --------------------------------------------------------------------------
   Só desenha e repassa as ações: quem grava, importa e mexe nos relatórios
   é o app.js (recebido em `ctx`). Assim a regra de negócio fica em ncrs.js e
   o vínculo com os relatórios passa pelos mesmos caminhos do editor —
   sessão, autoria, pasta compartilhada.

   Três decisões de tela, todas pedidas pelo Bruno depois de usar:
   - A tabela é a página inteira e mostra TODAS as NCRs, rolando para baixo
     (sem paginação e sem caixa com barra própria). O cabeçalho gruda no alto.
   - Editar uma célula redesenha SÓ aquela linha: a rolagem não volta ao
     topo, e a linha que deixou de atender ao filtro continua à vista
     (marcada) até o filtro mudar — sumir no meio da edição desorienta.
   - Os filtros são de múltipla escolha, e o painel de cima recolhe.
   ========================================================================== */
(function (global) {
  'use strict';

  var COLS_KEY = 'derrogacao:ncrColunas';
  var PAINEL_KEY = 'derrogacao:ncrPainel';
  var DESTAQUE_KEY = 'derrogacao:ncrDestacarFechadas';

  /* chave do filtro -> vazio. Cada filtro de escolha é uma LISTA: vazia = todos */
  var FILTROS = ['status', 'sistema', 'marcoOriginal', 'marcoAtual', 'funcaoVital', 'correlacao', 'waiver', 'presenca'];

  var st = {
    filtros: filtrosVazios(),
    soAbertas: false,
    ordem: { col: 'numero', dir: -1 },
    fixadas: {},          // chave -> true: editadas desde a última mudança de filtro
    aberto: null,         // chave da NCR na ficha
    abertoEm: '',         // waiver.editedAt quando a ficha foi desenhada
    modoFluxo: 'traj'
  };
  var ctx = null;
  var host = null;
  var cacheBusca = { versao: -1, mapa: {} };
  var cacheLinhas = null;  // { versao, projetos, mapa: chave -> linha apurada }

  function filtrosVazios() {
    var f = { busca: '' };
    FILTROS.forEach(function (k) { f[k] = []; });
    return f;
  }

  function lerPref(chave, padrao) {
    try { var v = global.localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function gravarPref(chave, v) {
    try { global.localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* só preferência */ }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function botao(texto, cls, fn, titulo) {
    var b = el('button', 'btn ' + (cls || ''), texto);
    b.type = 'button';
    if (titulo) b.title = titulo;
    b.addEventListener('click', fn);
    return b;
  }
  function str(v) { return v == null ? '' : String(v); }
  function curto(t, n) {
    t = str(t).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }
  function nomeRel(p) { return (p.marco || p.name || 'sem marco') + ' Waiver'; }

  /* --- colunas ------------------------------------------------------------- */

  function colunas() {
    var m = Ncrs.meta();
    var pap = m.papeis || {};
    var fonte = function (k) { return function (r) { return r.fonte[k]; }; };
    /* a ordem aqui é a ordem das colunas na tabela */
    var base = [
      { id: 'numero', nome: 'Número', valor: function (r) { return r.numero; }, ordem: ordemNumero, fixa: true, larg: 26 },
      { id: 'titulo', nome: pap.titulo || 'Título', valor: fonte('titulo'), largo: true, larg: 40 },
      { id: 'descricao', nome: pap.descricao || 'Descrição', valor: fonte('descricao'), largo: true, larg: 60 },
      { id: 'sistema', nome: pap.sistema || 'Sistema', valor: fonte('sistema'), larg: 12 },
      { id: 'status', nome: pap.status || 'Status', valor: fonte('status'), larg: 22 },
      { id: 'w:marcoOriginal', nome: 'Marco Original', waiver: true, editar: 'marcos', larg: 14 },
      { id: 'w:marcoAtual', nome: 'Marco Atual', waiver: true, editar: 'marcos', larg: 14 },
      { id: 'w:funcaoVital', nome: 'Função Vital', waiver: true, editar: 'funcoes', larg: 34 },
      { id: 'waiver', nome: 'Waiver', especial: true, larg: 18 },
      { id: 'w:observacao', nome: 'Observação', waiver: true, largo: true, larg: 60 },
      { id: 'w:waiverHistoric', nome: 'Waiver Historic', waiver: true, larg: 26 },
      { id: 'criadoEm', nome: pap.criadoEm || 'Criada em', valor: function (r) { return Ncrs.data(r.fonte.criadoEm); },
        ordem: fonte('criadoEm'), larg: 14 },
      { id: 'responsavel', nome: pap.responsavel || 'Responsável', valor: fonte('responsavel'), larg: 20 }
    ];
    base.forEach(function (c) {
      if (c.waiver) {
        var campo = c.id.slice(2);
        c.valor = function (r) { return r.waiver[campo]; };
        c.campo = campo;
      }
    });
    (m.colunas || []).forEach(function (nome) {
      base.push({ id: 'c:' + nome, nome: nome, origem: true, larg: 20,
        valor: function (r) { return Ncrs.data(r.fonte.campos[nome]); },
        ordem: function (r) { return r.fonte.campos[nome]; } });
    });
    return base;
  }

  function padraoVisiveis() {
    var pap = Ncrs.meta().papeis || {};
    return ['numero', pap.titulo ? 'titulo' : 'descricao', 'sistema', 'status',
      'w:marcoOriginal', 'w:marcoAtual', 'w:funcaoVital', 'waiver', 'w:observacao', 'criadoEm'];
  }

  function visiveis() {
    var todas = colunas();
    var acha = function (id) { return todas.filter(function (c) { return c.id === id; })[0]; };
    var ids = lerPref(COLS_KEY, null);
    if (!Array.isArray(ids) || !ids.length) ids = padraoVisiveis();
    if (ids.indexOf('numero') < 0) ids.unshift('numero');
    var out = ids.map(acha).filter(Boolean);
    return out.length > 1 ? out : padraoVisiveis().map(acha).filter(Boolean);
  }

  /* NCR-ICN-ESC-14-0832-2025: ordena pelo ano e pela sequência, não pelo
     prefixo — assim "mais novas primeiro" é mesmo o mais novo */
  function ordemNumero(r) {
    var m = /-(\d+)-(\d{4})$/.exec(r.key);
    return m ? m[2] + '-' + ('000000' + m[1]).slice(-6) + '-' + r.key : '0000-' + r.key;
  }

  /* --- apuração ------------------------------------------------------------- */

  /** A linha de uma NCR: vínculos, relatório do marco atual, situação. */
  function apurar(rec, mapaVinc, projects) {
    var vinc = mapaVinc[rec.key] || [];
    var rel = Ncrs.relatorioDoMarco(rec.waiver.marcoAtual, projects);
    var jaNoRel = rel ? vinc.some(function (v) { return v.project.id === rel.id; }) : false;
    return {
      rec: rec, vinculos: vinc, relAtual: rel, jaNoRel: jaNoRel,
      pronta: !!rel && !jaNoRel,
      semRel: !!rec.waiver.marcoAtual && !rel,
      correl: Ncrs.situacaoCorrelacao(rec),
      fechada: Ncrs.fechada(rec)
    };
  }

  function linhas() {
    var projects = ctx.projects();
    var mapaVinc = Ncrs.mapaVinculos(projects);
    return Ncrs.lista().map(function (rec) { return apurar(rec, mapaVinc, projects); });
  }

  function linhaDe(key) {
    var rec = Ncrs.get(key);
    if (!rec) return null;
    var projects = ctx.projects();
    return apurar(rec, Ncrs.mapaVinculos(projects), projects);
  }

  function textoBusca(rec) {
    if (cacheBusca.versao !== Ncrs.versao()) cacheBusca = { versao: Ncrs.versao(), mapa: {} };
    var t = cacheBusca.mapa[rec.key];
    if (t == null) {
      var partes = [rec.numero];
      Object.keys(rec.fonte.campos).forEach(function (k) { partes.push(rec.fonte.campos[k]); });
      Ncrs.CAMPOS_WAIVER.forEach(function (c) { partes.push(rec.waiver[c.id]); });
      t = cacheBusca.mapa[rec.key] = Ncrs.norm(partes.join(' '));
    }
    return t;
  }

  function sistemasDe(rec) {
    return str(rec.fonte.sistema).split(/[,;\/]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* valores de cada filtro para uma linha (uma linha pode ter vários sistemas) */
  var VALORES = {
    status: function (l) { return [l.rec.fonte.status || '__vazio']; },
    sistema: function (l) { var s = sistemasDe(l.rec); return s.length ? s : ['__vazio']; },
    marcoOriginal: function (l) { return [l.rec.waiver.marcoOriginal || '__vazio']; },
    marcoAtual: function (l) { return [l.rec.waiver.marcoAtual || '__vazio']; },
    funcaoVital: function (l) { return [l.rec.waiver.funcaoVital || '__vazio']; },
    correlacao: function (l) { return [l.correl]; },
    waiver: function (l) {
      var v = [l.vinculos.length ? 'vinculada' : 'nao'];
      if (l.pronta) v.push('pronta');
      if (l.semRel) v.push('semrel');
      return v;
    },
    presenca: function (l) { return [l.rec.fonte.presente ? 'presente' : 'ausente']; }
  };

  function passa(l) {
    var f = st.filtros;
    if (st.soAbertas && l.fechada) return false;
    for (var i = 0; i < FILTROS.length; i++) {
      var k = FILTROS[i], esc = f[k];
      if (!esc.length) continue;
      var vs = VALORES[k](l);
      if (!vs.some(function (v) { return esc.indexOf(v) >= 0; })) return false;
    }
    if (f.busca) {
      var termos = Ncrs.norm(f.busca).split(' ').filter(Boolean);
      var hay = textoBusca(l.rec);
      for (var j = 0; j < termos.length; j++) if (hay.indexOf(termos[j]) < 0) return false;
    }
    return true;
  }

  function algumFiltro() {
    return !!st.filtros.busca || st.soAbertas || FILTROS.some(function (k) { return st.filtros[k].length; });
  }

  /** Mudou o filtro: as linhas que estavam "presas" pela edição podem sair. */
  function filtroMudou() {
    st.fixadas = {};
    renderTabela();
    renderResumoFiltro();
  }

  function ordenar(ls) {
    var c = colunas().filter(function (x) { return x.id === st.ordem.col; })[0] || colunas()[0];
    var f = c.ordem || c.valor;
    if (c.especial) f = function (r, l) { return l.vinculos.map(function (v) { return v.project.marco; }).join(' ') || (l.pronta ? '~' : '~~'); };
    return ls.slice().sort(function (a, b) {
      return (Store.cmpTexto(f(a.rec, a), f(b.rec, b)) || Store.cmpTexto(ordemNumero(a.rec), ordemNumero(b.rec))) * st.ordem.dir;
    });
  }

  /** O que está à vista: filtradas + as presas pela edição, na ordem escolhida. */
  function aVista(todas) {
    return ordenar(todas.filter(function (l) { return passa(l) || st.fixadas[l.rec.key]; }));
  }

  /* --- desenho da aba -------------------------------------------------------- */

  function render(h, c) {
    host = h; ctx = c;
    host.innerHTML = '';
    var todas = linhas();
    var raiz = el('div', 'nb2');

    raiz.appendChild(barra(todas));

    var painel = el('div', 'nb2-painel');
    painel.id = 'nb2Painel';
    painel.hidden = !lerPref(PAINEL_KEY, true);
    painel.appendChild(acoes());
    if (todas.length) {
      painel.appendChild(kpis(todas));
      painel.appendChild(filtrosBox(todas));
    }
    raiz.appendChild(painel);

    if (!todas.length) {
      raiz.appendChild(vazio());
      host.appendChild(raiz);
      return;
    }
    var resumo = el('div', 'nb2-recorte');
    resumo.id = 'nb2Recorte';
    raiz.appendChild(resumo);

    var tab = el('div', 'nb2-tabela');
    tab.id = 'nb2Tabela';
    raiz.appendChild(tab);
    host.appendChild(raiz);
    renderTabela();
    renderResumoFiltro();
  }

  /** Redesenha a tabela inteira (filtro, ordem, colunas). Mantém a rolagem. */
  function renderTabela() {
    var box = document.getElementById('nb2Tabela');
    if (!box) return;
    var topo = host ? host.scrollTop : 0;
    box.innerHTML = '';
    var cols = visiveis();
    var todas = linhas();
    var ls = aVista(todas);

    var t = el('table', 'nb2-table' + (lerPref(DESTAQUE_KEY, false) ? ' is-destacando' : ''));
    t.id = 'nb2Table';
    var thead = el('thead');
    var trh = el('tr');
    cols.forEach(function (c) {
      var th = el('th', (c.waiver || c.especial) ? 'is-waiver' : '');
      var b = el('button', 'nb2-sort', c.nome);
      b.type = 'button';
      if (st.ordem.col === c.id) b.appendChild(el('span', 'nb2-seta', st.ordem.dir > 0 ? ' ▲' : ' ▼'));
      b.title = ((c.waiver || c.especial) ? 'Dado do Waiver (preenchido aqui). ' : 'Dado do banco NCR. ') + 'Clique para ordenar.';
      b.addEventListener('click', function () {
        if (st.ordem.col === c.id) st.ordem.dir = -st.ordem.dir;
        else { st.ordem.col = c.id; st.ordem.dir = 1; }
        renderTabela();
      });
      th.appendChild(b);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tb = el('tbody');
    ls.forEach(function (l) { tb.appendChild(linhaTabela(l, cols)); });
    t.appendChild(tb);
    box.appendChild(t);
    if (!ls.length) box.appendChild(el('p', 'nb2-nada', 'Nenhuma NCR com esses filtros.'));
    atualizarContagem(todas, ls);
    if (host) host.scrollTop = topo;
  }

  /** Troca só a linha desta NCR — a rolagem e o resto da tabela ficam. */
  function atualizarLinha(key) {
    var tr = document.querySelector('#nb2Table tr[data-key="' + cssEsc(key) + '"]');
    var l = linhaDe(key);
    if (tr && l) tr.parentNode.replaceChild(linhaTabela(l, visiveis()), tr);
    atualizarKpis();
    atualizarContagem();
  }
  function cssEsc(s) { return str(s).replace(/["\\]/g, '\\$&'); }

  function linhaTabela(l, cols) {
    var r = l.rec;
    var tr = el('tr');
    tr.dataset.key = r.key;
    if (l.fechada) tr.classList.add('is-fechada');
    if (!r.fonte.presente && r.fonte.importadoEm) tr.classList.add('is-ausente');
    var fora = st.fixadas[r.key] && !passa(l);
    if (fora) {
      tr.classList.add('is-fixada');
      tr.title = 'Esta NCR não atende mais ao filtro. Continua à vista até você mudar o filtro.';
    }
    cols.forEach(function (c) {
      var td = el('td', (c.waiver || c.especial) ? 'is-waiver' : '');
      if (c.id === 'numero') {
        var a = el('button', 'nb2-num', r.numero);
        a.type = 'button';
        a.title = 'Abrir a ficha da NCR';
        a.addEventListener('click', function () { abrirFicha(r.key); });
        td.appendChild(a);
        if (l.fechada) td.appendChild(el('span', 'nb2-tag-fechada', 'fechada'));
        if (!r.fonte.importadoEm) td.appendChild(el('span', 'nb2-mini', 'sem dados do banco'));
        else if (!r.fonte.presente) td.appendChild(el('span', 'nb2-mini', 'fora do último export'));
        if (fora) td.appendChild(el('span', 'nb2-mini nb2-fora', 'fora do filtro'));
      } else if (c.editar) {
        td.appendChild(celulaEditavel(r, c.campo, c.editar));
      } else if (c.especial) {
        celulaWaiver(td, l);
      } else {
        var v = str(c.valor(r));
        td.textContent = c.largo ? curto(v, 90) : v;
        if (c.largo) td.classList.add('is-longo');
        if (c.largo && v.length > 90) td.title = v;
      }
      tr.appendChild(td);
    });
    return tr;
  }

  /* A célula mostra o valor como um botão com cara de lista; o <select> só
     nasce quando alguém clica. Com 1.600 linhas e três listas de até 45
     opções, montar tudo de saída seriam ~200 mil elementos. */
  function celulaEditavel(rec, campo, lista) {
    var atual = rec.waiver[campo];
    var b = el('button', 'nb2-dd' + (atual ? '' : ' is-vazio'), atual || '—');
    b.type = 'button';
    b.title = (atual || 'não preenchido') + ' — clique para escolher';
    b.addEventListener('click', function () {
      var sel = seletor(rec, campo, lista, function () { atualizarLinha(rec.key); });
      sel.className = 'nb2-sel';
      b.parentNode.replaceChild(sel, b);
      sel.focus();
      try { if (sel.showPicker) sel.showPicker(); } catch (e) { /* o navegador abre no próximo clique */ }
      sel.addEventListener('blur', function () {
        /* saiu sem escolher: volta a ser botão */
        setTimeout(function () { if (sel.parentNode && !sel.dataset.mudou) atualizarLinha(rec.key); }, 150);
      });
    });
    return b;
  }

  /** Dropdown de marco ou de função vital, gravando na hora. */
  function seletor(rec, campo, lista, depois) {
    var sel = el('select');
    var atual = rec.waiver[campo];
    var ops = Ncrs.listas()[lista] || [];
    var o0 = el('option', null, '—');
    o0.value = '';
    sel.appendChild(o0);
    ops.forEach(function (v) {
      var o = el('option', null, v);
      o.value = v;
      sel.appendChild(o);
    });
    if (atual && ops.indexOf(atual) < 0) {
      var ox = el('option', null, atual + ' (fora da lista)');
      ox.value = atual;
      sel.appendChild(ox);
    }
    sel.value = atual;
    sel.addEventListener('change', function () {
      sel.dataset.mudou = '1';
      ctx.editar(rec, campo, sel.value).then(function () {
        /* a linha fica à vista mesmo que deixe de atender ao filtro */
        st.fixadas[rec.key] = true;
        if (depois) depois();
      });
    });
    return sel;
  }

  function celulaWaiver(td, l) {
    var box = el('div', 'nb2-waiver');
    if (l.vinculos.length) {
      l.vinculos.forEach(function (v) {
        var b = el('button', 'nb2-rel', v.project.marco || v.project.name || '?');
        b.type = 'button';
        b.title = 'Abrir ' + (v.item.ncrId || 'o item') + ' no relatório ' + nomeRel(v.project);
        b.addEventListener('click', function () { ctx.abrir(v.project, v.item); });
        box.appendChild(b);
      });
    } else {
      box.appendChild(el('span', 'nb2-mini', 'Não vinculada'));
    }
    if (l.pronta) {
      box.appendChild(botao('+ ' + nomeRel(l.relAtual), 'btn--sm btn--primary nb2-add', function () {
        ctx.adicionar(l.rec, l.relAtual).then(function () {
          st.fixadas[l.rec.key] = true;
          atualizarLinha(l.rec.key);
        });
      }, 'Adicionar esta NCR ao relatório ' + nomeRel(l.relAtual) + ' (Marco Atual)'));
    } else if (l.semRel) {
      var s = el('span', 'nb2-mini nb2-semrel', 'sem relatório ' + l.rec.waiver.marcoAtual);
      s.title = 'Não há relatório de Waiver com o marco "' + l.rec.waiver.marcoAtual +
        '". Crie o relatório ou use "Adicionar a outro relatório…" na ficha.';
      box.appendChild(s);
    }
    td.appendChild(box);
  }

  /* --- barra de cima (sempre à vista) ------------------------------------------ */

  function barra(todas) {
    var b = el('div', 'nb2-barra');
    var tit = el('div', 'nb2-titulo');
    tit.appendChild(el('strong', null, 'Banco NCR — ' + Ncrs.SBR_ALVO));
    var conta = el('span', 'nb2-conta');
    conta.id = 'nb2Conta';
    tit.appendChild(conta);
    b.appendChild(tit);

    if (todas.length) {
      var busca = el('input', 'nb2-busca');
      busca.type = 'search';
      busca.id = 'nbBusca';
      busca.placeholder = 'Buscar: número, texto, observação, qualquer campo…';
      busca.setAttribute('aria-label', 'Buscar nas NCRs');
      busca.value = st.filtros.busca;
      var tm = null;
      busca.addEventListener('input', function () {
        clearTimeout(tm);
        tm = setTimeout(function () { st.filtros.busca = busca.value; filtroMudou(); }, 200);
      });
      b.appendChild(busca);

      var dest = lerPref(DESTAQUE_KEY, false);
      var bd = botao('● Destacar fechadas', 'btn--sm nb2-toggle nb2-toggle--fechadas' + (dest ? ' is-on' : ''), function () {
        var on = !lerPref(DESTAQUE_KEY, false);
        gravarPref(DESTAQUE_KEY, on);
        bd.classList.toggle('is-on', on);
        bd.setAttribute('aria-pressed', on ? 'true' : 'false');
        var t = document.getElementById('nb2Table');
        if (t) t.classList.toggle('is-destacando', on);
      }, 'Pinta de vermelho as NCRs fechadas (status Closed / CEDOC Closure…)');
      bd.setAttribute('aria-pressed', dest ? 'true' : 'false');
      b.appendChild(bd);

      var ba = botao('Só abertas', 'btn--sm nb2-toggle' + (st.soAbertas ? ' is-on' : ''), function () {
        st.soAbertas = !st.soAbertas;
        ba.classList.toggle('is-on', st.soAbertas);
        ba.setAttribute('aria-pressed', st.soAbertas ? 'true' : 'false');
        filtroMudou();
      }, 'Mostra só as NCRs que ainda não foram fechadas');
      ba.setAttribute('aria-pressed', st.soAbertas ? 'true' : 'false');
      b.appendChild(ba);

      var ex = el('div', 'nb2-exporta');
      ex.appendChild(botao('Colunas…', 'btn--sm', escolherColunas, 'Escolher quais colunas aparecem'));
      ex.appendChild(botao('⤓ Excel', 'btn--sm', function () { exportar('xlsx'); },
        'Planilha com as NCRs à vista (com o filtro aplicado) e uma aba dizendo qual foi o recorte'));
      ex.appendChild(botao('CSV', 'btn--sm', function () { exportar('csv'); }, 'As NCRs à vista, em CSV'));
      b.appendChild(ex);
    }

    var aberto = lerPref(PAINEL_KEY, true);
    var bp = botao(aberto ? '▲ Recolher painel' : '▼ Mostrar painel', 'btn--sm nb2-painel-btn', function () {
      var p = document.getElementById('nb2Painel');
      var agora = p.hidden;
      p.hidden = !agora;
      gravarPref(PAINEL_KEY, agora);
      bp.textContent = agora ? '▲ Recolher painel' : '▼ Mostrar painel';
      bp.setAttribute('aria-expanded', agora ? 'true' : 'false');
    }, 'Recolhe ou mostra as importações, os números e os filtros');
    bp.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    bp.setAttribute('aria-controls', 'nb2Painel');
    b.appendChild(bp);
    return b;
  }

  function atualizarContagem(todas, ls) {
    var c = document.getElementById('nb2Conta');
    if (!c) return;
    if (!todas) {
      var nLinhas = document.querySelectorAll('#nb2Table tbody tr').length;
      todas = Ncrs.lista();
      c.textContent = algumFiltro() ? nLinhas + ' de ' + todas.length + ' NCRs à vista' : todas.length + ' NCRs';
      return;
    }
    c.textContent = algumFiltro() ? ls.length + ' de ' + todas.length + ' NCRs à vista' : todas.length + ' NCRs';
    c.classList.toggle('is-on', algumFiltro());
  }

  /* --- painel recolhível: ações, números e filtros ----------------------------- */

  function acoes() {
    var box = el('div', 'nb2-acoes');
    var g1 = el('div', 'nb2-grupo');
    g1.appendChild(el('span', 'nb2-grupo-rot', 'Importar'));
    g1.appendChild(botao('Importar / Atualizar Banco NCR', 'btn--sm btn--primary', function () { ctx.importar('banco'); },
      'Export do Excel (o mesmo do NCR Control) ou o ncr.json da pasta BD do NCR Control. Só o SBR4 entra.'));
    g1.appendChild(botao('Importar correlação', 'btn--sm', function () { ctx.importar('correlacao'); },
      'JSON de correlação ou a própria planilha (aba "Correlação NCR").'));
    g1.appendChild(botao('Importar histórico NCR', 'btn--sm', function () { ctx.importar('historico'); },
      'JSON de histórico (historico.json do NCR Control, ou gerado à parte).'));
    box.appendChild(g1);

    var g2 = el('div', 'nb2-grupo');
    g2.appendChild(el('span', 'nb2-grupo-rot', 'Segurança'));
    g2.appendChild(botao('Exportar backup', 'btn--sm btn--accent', ctx.backup,
      'Um arquivo com tudo: relatórios de Waiver e banco NCR.'));
    var desf = botao('Desfazer última importação', 'btn--sm', ctx.desfazer,
      'Volta os dados das NCRs ao estado de antes da última importação.');
    desf.id = 'nbDesfazer';
    desf.hidden = true;
    g2.appendChild(desf);
    g2.appendChild(botao('Restaurar de um backup…', 'btn--sm', function () { ctx.importar('restaurar'); },
      'Traz de volta o banco NCR guardado num backup.'));
    g2.appendChild(botao('Listas…', 'btn--sm', ctx.listas, 'Marcos e funções vitais oferecidos nos dropdowns.'));
    box.appendChild(g2);

    var ult = Ncrs.meta().importacoes.filter(function (i) { return i.tipo === 'banco'; }).slice(-1)[0];
    box.appendChild(el('span', 'nb2-ultima', ult
      ? 'Banco atualizado em ' + Ncrs.data(ult.em) + (ult.por ? ' por ' + ult.por : '') + (ult.arquivo ? ' · ' + ult.arquivo : '')
      : 'O banco ainda não foi importado.'));
    ctx.infoDesfazer(function (info) {
      var d = document.getElementById('nbDesfazer');
      if (!d || !info) return;
      d.hidden = false;
      d.title = 'Volta ao estado de antes de: ' + info;
    });
    return box;
  }

  function vazio() {
    var c = el('div', 'nb2-vazio');
    c.appendChild(el('h3', null, 'Nenhuma NCR no banco ainda'));
    var ol = el('ol');
    [
      ['Importar / Atualizar Banco NCR', ' — o export do Excel (o mesmo que o NCR Control lê) ou o ncr.json da pasta BD do NCR Control. Só as NCRs do SBR4 entram.'],
      ['Importar correlação', ' — o JSON de correlação inicial (ou a própria planilha, aba "Correlação NCR"). Preenche Marco Original, Marco Atual, Função Vital, Waiver Historic e Observação.'],
      ['Importar histórico NCR', ' — opcional: o historico.json do NCR Control. É dele que sai o desenho do fluxo na ficha.']
    ].forEach(function (p) {
      var li = el('li');
      li.appendChild(el('strong', null, p[0]));
      li.appendChild(document.createTextNode(p[1]));
      ol.appendChild(li);
    });
    c.appendChild(ol);
    var pend = Object.keys(Ncrs.meta().pendentes || {}).length;
    if (pend) c.appendChild(el('p', 'nb2-pend', pend + ' correlação(ões) já importada(s) aguardando o banco: entram sozinhas quando as NCRs chegarem.'));
    c.appendChild(el('p', 'nb2-mini', 'Os relatórios de Waiver não são tocados por nenhuma dessas importações.'));
    return c;
  }

  var KPI_DEFS = [
    ['NCRs ' + 'SBR4', function (ls) { return ls.length; }, function (ls) {
      return ls.filter(function (l) { return !l.fechada; }).length + ' abertas · ' + ls.filter(function (l) { return l.fechada; }).length + ' fechadas'; }, null],
    ['Correlação completa', function (ls) { return ls.filter(function (l) { return l.correl === 'completa'; }).length; },
      function () { return 'marcos e função vital'; }, ['correlacao', 'completa']],
    ['Sem correlação', function (ls) { return ls.filter(function (l) { return l.correl === 'vazia'; }).length; },
      function () { return 'a preencher'; }, ['correlacao', 'vazia']],
    ['Vinculadas a Waiver', function (ls) { return ls.filter(function (l) { return l.vinculos.length > 0; }).length; },
      function () { return 'em algum relatório'; }, ['waiver', 'vinculada']],
    ['Prontas para adicionar', function (ls) { return ls.filter(function (l) { return l.pronta; }).length; },
      function () { return 'marco atual tem relatório'; }, ['waiver', 'pronta']]
  ];

  function kpis(todas) {
    var row = el('div', 'sm-kpis nb2-kpis');
    row.id = 'nb2Kpis';
    KPI_DEFS.forEach(function (k, i) {
      var t = el('button', 'sm-kpi nb2-kpi');
      t.type = 'button';
      t.dataset.i = String(i);
      t.title = k[3] ? 'Filtrar a tabela por este grupo' : 'Limpar os filtros';
      t.appendChild(el('span', 'sm-kpi-label', k[0]));
      t.appendChild(el('strong', 'sm-kpi-value', String(k[1](todas))));
      t.appendChild(el('span', 'sm-kpi-sub', k[2](todas)));
      t.addEventListener('click', function () {
        st.filtros = filtrosVazios();
        st.soAbertas = false;
        if (k[3]) st.filtros[k[3][0]] = [k[3][1]];
        st.fixadas = {};
        render(host, ctx);
      });
      row.appendChild(t);
    });
    return row;
  }

  function atualizarKpis() {
    var row = document.getElementById('nb2Kpis');
    if (!row) return;
    var todas = linhas();
    Array.prototype.forEach.call(row.children, function (t) {
      var k = KPI_DEFS[+t.dataset.i];
      t.querySelector('.sm-kpi-value').textContent = String(k[1](todas));
      t.querySelector('.sm-kpi-sub').textContent = k[2](todas);
    });
  }

  /* --- filtros de múltipla escolha ---------------------------------------------- */

  var ROTULOS_FIXOS = {
    correlacao: { completa: 'Completa', parcial: 'Parcial', vazia: 'Sem correlação' },
    waiver: { vinculada: 'Vinculada a algum relatório', nao: 'Não vinculada',
      pronta: 'Pronta para adicionar', semrel: 'Marco atual sem relatório' },
    presenca: { presente: 'No último export', ausente: 'Fora do último export' }
  };
  var NOMES_FILTRO = {
    status: 'Status', sistema: 'Sistema', marcoOriginal: 'Marco Original', marcoAtual: 'Marco Atual',
    funcaoVital: 'Função Vital', correlacao: 'Correlação', waiver: 'Waiver', presenca: 'No export'
  };

  function nomeValor(chave, v) {
    if (v === '__vazio') return '(não preenchido)';
    return (ROTULOS_FIXOS[chave] && ROTULOS_FIXOS[chave][v]) || v;
  }

  function opcoesDe(chave, todas) {
    var cont = {};
    todas.forEach(function (l) { VALORES[chave](l).forEach(function (v) { cont[v] = (cont[v] || 0) + 1; }); });
    var ks = Object.keys(cont);
    if (ROTULOS_FIXOS[chave]) {
      ks = Object.keys(ROTULOS_FIXOS[chave]);
    } else {
      ks.sort(function (a, b) {
        if (a === '__vazio') return -1;
        if (b === '__vazio') return 1;
        return Store.cmpTexto(a, b);
      });
    }
    return ks.map(function (v) { return { valor: v, nome: nomeValor(chave, v), n: cont[v] || 0 }; });
  }

  function filtrosBox(todas) {
    var box = el('div', 'nb2-filtros');
    FILTROS.forEach(function (k) { box.appendChild(multi(k, opcoesDe(k, todas))); });
    var limpa = botao('Limpar filtros', 'btn--sm nb2-limpar', function () {
      st.filtros = filtrosVazios();
      st.soAbertas = false;
      st.fixadas = {};
      render(host, ctx);
    });
    limpa.id = 'nb2Limpar';
    box.appendChild(limpa);
    return box;
  }

  function resumoBotao(chave) {
    var esc = st.filtros[chave];
    if (!esc.length) return 'Todos';
    if (esc.length <= 2) return esc.map(function (v) { return nomeValor(chave, v); }).join(', ');
    return esc.length + ' escolhidos';
  }

  var popAberto = null;
  function fecharPop() {
    if (popAberto) { popAberto.hidden = true; popAberto.previousSibling.setAttribute('aria-expanded', 'false'); popAberto = null; }
  }
  document.addEventListener('mousedown', function (e) {
    if (popAberto && !popAberto.parentNode.contains(e.target)) fecharPop();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popAberto) fecharPop(); });

  function multi(chave, opcoes) {
    var w = el('div', 'nb2-ms');
    var lab = el('span', 'nb2-ms-rot', NOMES_FILTRO[chave]);
    w.appendChild(lab);
    var corpo = el('div', 'nb2-ms-corpo');
    var btn = el('button', 'nb2-ms-btn' + (st.filtros[chave].length ? ' is-on' : ''));
    btn.type = 'button';
    btn.id = 'nbF-' + chave;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    var txt = el('span', 'nb2-ms-txt', resumoBotao(chave));
    btn.appendChild(txt);
    btn.appendChild(el('span', 'nb2-ms-seta', '▾'));
    corpo.appendChild(btn);

    var pop = el('div', 'nb2-ms-pop');
    pop.hidden = true;
    var busca = null;
    if (opcoes.length > 8) {
      busca = el('input', 'nb2-ms-busca');
      busca.type = 'search';
      busca.placeholder = 'procurar…';
      pop.appendChild(busca);
    }
    var lista = el('div', 'nb2-ms-lista');
    opcoes.forEach(function (o) {
      var row = el('label', 'nb2-ms-op');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = o.valor;
      cb.checked = st.filtros[chave].indexOf(o.valor) >= 0;
      cb.addEventListener('change', function () {
        var sel = st.filtros[chave].filter(function (v) { return v !== o.valor; });
        if (cb.checked) sel.push(o.valor);
        st.filtros[chave] = sel;
        txt.textContent = resumoBotao(chave);
        btn.classList.toggle('is-on', sel.length > 0);
        filtroMudou();
      });
      row.appendChild(cb);
      row.appendChild(el('span', 'nb2-ms-nome', o.nome));
      row.appendChild(el('span', 'nb2-ms-n', String(o.n)));
      row.dataset.busca = Ncrs.norm(o.nome);
      lista.appendChild(row);
    });
    pop.appendChild(lista);
    if (busca) {
      busca.addEventListener('input', function () {
        var q = Ncrs.norm(busca.value);
        Array.prototype.forEach.call(lista.children, function (r) { r.hidden = !!q && r.dataset.busca.indexOf(q) < 0; });
      });
    }
    var pe = el('div', 'nb2-ms-pe');
    pe.appendChild(botao('Limpar', 'btn--sm', function () {
      st.filtros[chave] = [];
      Array.prototype.forEach.call(lista.querySelectorAll('input'), function (c) { c.checked = false; });
      txt.textContent = resumoBotao(chave);
      btn.classList.remove('is-on');
      filtroMudou();
    }));
    pe.appendChild(botao('Pronto', 'btn--sm btn--primary', fecharPop));
    pop.appendChild(pe);
    corpo.appendChild(pop);
    w.appendChild(corpo);

    btn.addEventListener('click', function () {
      if (popAberto === pop) { fecharPop(); return; }
      fecharPop();
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      popAberto = pop;
      if (busca) busca.focus();
    });
    return w;
  }

  /** A frase do recorte: vai na tela e na aba "Recorte" da planilha. */
  function descricaoDoFiltro() {
    var partes = [];
    if (st.filtros.busca) partes.push('busca: “' + st.filtros.busca + '”');
    if (st.soAbertas) partes.push('só abertas');
    FILTROS.forEach(function (k) {
      if (st.filtros[k].length) {
        partes.push(NOMES_FILTRO[k] + ': ' + st.filtros[k].map(function (v) { return nomeValor(k, v); }).join(' ou '));
      }
    });
    return partes.join(' · ');
  }

  function renderResumoFiltro() {
    var box = document.getElementById('nb2Recorte');
    if (!box) return;
    box.innerHTML = '';
    var d = descricaoDoFiltro();
    box.hidden = !d;
    if (!d) return;
    box.appendChild(el('span', null, 'Filtro: ' + d));
    box.appendChild(botao('Limpar', 'btn--sm btn--quiet', function () {
      st.filtros = filtrosVazios();
      st.soAbertas = false;
      st.fixadas = {};
      render(host, ctx);
    }));
  }

  /* --- colunas e exportação -------------------------------------------------------- */

  function escolherColunas() {
    var dlg = document.getElementById('nbColsDialog');
    var body = dlg.querySelector('.dlg-body');
    body.innerHTML = '';
    body.appendChild(el('h3', null, 'Colunas da tabela'));
    body.appendChild(el('p', null, 'As do Waiver são as que você preenche aqui; as do banco NCR vêm da importação.'));
    var marcadas = visiveis().map(function (c) { return c.id; });
    [
      ['Do Waiver', colunas().filter(function (c) { return c.waiver || c.especial; })],
      ['Principais do banco NCR', colunas().filter(function (c) { return !c.waiver && !c.especial && !c.origem; })],
      ['Todas as colunas do export', colunas().filter(function (c) { return c.origem; })]
    ].forEach(function (g) {
      if (!g[1].length) return;
      body.appendChild(el('div', 'nb-cols-tit', g[0]));
      var lista = el('div', 'nb-cols');
      g[1].forEach(function (c) {
        var lab = el('label', 'nb-col');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = c.id;
        cb.checked = marcadas.indexOf(c.id) >= 0;
        cb.disabled = !!c.fixa;
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + c.nome));
        lista.appendChild(lab);
      });
      body.appendChild(lista);
    });
    var ac = dlg.querySelector('.dlg-actions');
    ac.innerHTML = '';
    ac.appendChild(botao('Voltar ao padrão', '', function () { gravarPref(COLS_KEY, []); dlg.close(); renderTabela(); }));
    ac.appendChild(botao('Aplicar', 'btn--primary', function () {
      var ids = ['numero'];
      Array.prototype.forEach.call(body.querySelectorAll('input[type=checkbox]'), function (cb) {
        if (cb.checked && cb.value !== 'numero') ids.push(cb.value);
      });
      var ordem = colunas().map(function (c) { return c.id; });
      ids.sort(function (a, b) { return ordem.indexOf(a) - ordem.indexOf(b); });
      gravarPref(COLS_KEY, ids);
      dlg.close();
      renderTabela();
    }));
    dlg.showModal();
  }

  /** Exporta exatamente o que está à vista, com as colunas à vista. */
  function exportar(tipo) {
    var cols = visiveis();
    var ls = aVista(linhas());
    var valores = ls.map(function (l) {
      return cols.map(function (c) {
        if (c.especial) return l.vinculos.map(function (v) { return v.project.marco; }).join(' / ') || 'Não vinculada';
        return str(c.valor(l.rec));
      });
    });
    ctx.exportar(tipo, {
      colunas: cols.map(function (c) { return { titulo: c.nome, larg: c.larg || 16 }; }),
      linhas: valores,
      recorte: descricaoDoFiltro(),
      total: Ncrs.lista().length
    });
  }

  /* --- ficha da NCR ------------------------------------------------------------------ */

  function abrirFicha(key) {
    st.aberto = key;
    var dlg = document.getElementById('ncrDialog');
    desenharFicha();
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.nb-ficha-corpo').scrollTop = 0;
    dlg.onclose = function () { st.aberto = null; };
  }

  function desenharFicha() {
    var rec = st.aberto ? Ncrs.get(st.aberto) : null;
    var dlg = document.getElementById('ncrDialog');
    if (!rec || !dlg) return;
    st.abertoEm = rec.waiver.editedAt;
    var f = rec.fonte, w = rec.waiver;
    var fechada = Ncrs.fechada(rec);

    var cab = dlg.querySelector('.nb-ficha-cab');
    cab.innerHTML = '';
    var t1 = el('div', 'nb-ficha-tit');
    t1.appendChild(el('h3', null, rec.numero));
    var tags = el('div', 'nb-ficha-tags');
    if (f.status) tags.appendChild(el('span', 'nb-chip' + (fechada ? ' nb-chip--fechada' : ''), f.status));
    tags.appendChild(el('span', 'nb-chip ' + (fechada ? 'nb-chip--fechada' : 'nb-chip--aberta'), fechada ? 'fechada' : 'aberta'));
    if (f.sbr) tags.appendChild(el('span', 'nb-chip nb-chip--sbr', f.sbr + (f.sbrPor === 'numero' ? ' (pelo número)' : '')));
    if (f.importadoEm && !f.presente) tags.appendChild(el('span', 'nb-chip nb-chip--aviso', 'fora do último export'));
    if (!f.importadoEm) tags.appendChild(el('span', 'nb-chip nb-chip--aviso', 'sem dados do banco NCR'));
    t1.appendChild(tags);
    cab.appendChild(t1);
    var fechar = botao('Fechar ✕', 'btn--sm', function () { dlg.close(); });
    cab.appendChild(fechar);

    var body = dlg.querySelector('.nb-ficha-corpo');
    var rolagem = body.scrollTop;
    body.innerHTML = '';
    if (f.titulo) body.appendChild(el('p', 'nb-ficha-titulo', f.titulo));

    var grade = el('div', 'nb-ficha-grade');
    var esq = el('div', 'nb-ficha-col');
    var dir = el('div', 'nb-ficha-col');
    grade.appendChild(esq);
    grade.appendChild(dir);
    body.appendChild(grade);

    /* dados do Waiver */
    var sw = secao(esq, 'Dados do Waiver', 'Preenchidos aqui. Nenhuma importação do banco NCR altera estes campos.', 'nb-sec--waiver');
    var g3 = el('div', 'nb-ficha-campos3');
    [['marcoOriginal', 'Marco Original', 'marcos'], ['marcoAtual', 'Marco Atual', 'marcos'],
     ['funcaoVital', 'Função Vital', 'funcoes']].forEach(function (d) {
      var fl = el('div', 'field');
      var sel = seletor(rec, d[0], d[2], function () {
        atualizarLinha(rec.key);
        desenharFicha();
      });
      sel.id = 'nbFicha-' + d[0];
      var lab = el('label', null, d[1]);
      lab.htmlFor = sel.id;
      fl.appendChild(lab);
      fl.appendChild(sel);
      g3.appendChild(fl);
    });
    sw.appendChild(g3);
    sw.appendChild(areaTexto(rec, 'waiverHistoric', 'Waiver Historic', 3, 'J06Cer To: J06'));
    sw.appendChild(areaTexto(rec, 'observacao', 'Observação', 5, 'informação complementar para o Waiver'));
    var autor = el('p', 'nb-autor');
    autor.id = 'nbAutor';
    autor.textContent = w.editedAt ? 'Última edição: ' + (w.editedBy || 'sem nome') + ' · ' + Ncrs.data(w.editedAt) : 'Ainda não preenchido.';
    sw.appendChild(autor);

    /* relatórios de Waiver */
    var sr = secao(esq, 'Relatórios de Waiver', 'A NCR entra como um item novo do relatório: Description vem do banco NCR; Observation, da Observação acima.');
    var projects = ctx.projects();
    var vinc = Ncrs.vinculos(rec, projects);
    var lin = el('div', 'nb-vinc');
    if (vinc.length) {
      vinc.forEach(function (v) {
        var b = el('button', 'nb2-rel', nomeRel(v.project));
        b.type = 'button';
        b.title = 'Abrir o item no relatório';
        b.addEventListener('click', function () { dlg.close(); ctx.abrir(v.project, v.item); });
        lin.appendChild(b);
      });
    } else {
      lin.appendChild(el('span', 'nb2-mini', 'Não vinculada a nenhum relatório.'));
    }
    sr.appendChild(lin);
    var rel = Ncrs.relatorioDoMarco(w.marcoAtual, projects);
    var ac = el('div', 'nb-ficha-acoes');
    if (rel) {
      var ja = vinc.some(function (v) { return v.project.id === rel.id; });
      var b1 = botao(ja ? '✓ Já está no ' + nomeRel(rel) : 'Adicionar ao ' + nomeRel(rel), ja ? 'btn--sm' : 'btn--sm btn--primary', function () {
        ctx.adicionar(rec, rel).then(function () { atualizarLinha(rec.key); desenharFicha(); });
      });
      if (ja) b1.disabled = true;
      ac.appendChild(b1);
    } else if (w.marcoAtual) {
      ac.appendChild(el('span', 'nb2-mini nb2-semrel', 'Não há relatório com o marco "' + w.marcoAtual + '".'));
    } else {
      ac.appendChild(el('span', 'nb2-mini', 'Escolha o Marco Atual para ver o relatório correspondente.'));
    }
    var outros = projects.filter(function (p) { return !rel || p.id !== rel.id; });
    if (outros.length) {
      var sel = el('select', 'nb2-sel');
      var o0 = el('option', null, 'Adicionar a outro relatório…');
      o0.value = '';
      sel.appendChild(o0);
      outros.forEach(function (p) {
        var o = el('option', null, nomeRel(p) + ' (' + p.ncrs.length + ' NCR)');
        o.value = p.id;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        var p = projects.filter(function (x) { return x.id === sel.value; })[0];
        if (p) ctx.adicionar(rec, p).then(function () { atualizarLinha(rec.key); desenharFicha(); });
      });
      ac.appendChild(sel);
    }
    sr.appendChild(ac);
    if (w.adicoes.length) {
      var ul = el('ul', 'nb-adicoes');
      w.adicoes.slice().reverse().forEach(function (a) {
        ul.appendChild(el('li', null, 'Adicionada ao ' + (a.marco || '?') + ' Waiver · ' + Ncrs.data(a.em) + (a.por ? ' · ' + a.por : '')));
      });
      sr.appendChild(ul);
    }

    /* dados do banco NCR — inteiros, sem corte */
    var sb = secao(dir, 'Dados do banco NCR', f.importadoEm
      ? 'Somente leitura — substituídos a cada importação. Última: ' + Ncrs.data(f.importadoEm) + (f.arquivo ? ' · ' + f.arquivo : '') + '.'
      : 'Esta NCR ainda não veio de nenhuma importação do banco.', 'nb-sec--fonte');
    if (f.descricao) {
      sb.appendChild(el('div', 'nb-rot', 'Descrição'));
      sb.appendChild(el('p', 'nb-desc', f.descricao));
    }
    var chaves = Object.keys(f.campos);
    if (chaves.length) {
      var ordem = Ncrs.meta().colunas || [];
      chaves.sort(function (a, b) {
        var ia = ordem.indexOf(a), ib = ordem.indexOf(b);
        return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      });
      var dl = el('dl', 'nb-campos');
      chaves.forEach(function (k) {
        var dt = el('dt', null, k);
        var dd = el('dd', null, Ncrs.data(f.campos[k]));
        if (f.alterados.indexOf(k) >= 0) { dt.classList.add('is-novo'); dt.title = 'Mudou na última importação'; }
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      sb.appendChild(dl);
      if (f.alterados.length) sb.appendChild(el('p', 'nb2-mini', '● Campos que mudaram na última importação.'));
    }

    /* fluxo — o mesmo desenho do NCR Control, em largura total */
    var sf = secao(body, 'Fluxo da NCR', '', 'nb-sec--fluxo');
    var seq = NcrFluxo.sequencia(rec);
    var sub = sf.querySelector('.nb-sec-sub');
    if (!rec.historico.length) {
      sub.textContent = seq.length
        ? 'Sem histórico importado: o desenho mostra só o status atual. Use "Importar histórico NCR" (o historico.json do NCR Control) para ver o caminho inteiro.'
        : 'Sem histórico nem status para desenhar.';
    } else {
      sub.textContent = seq.length + ' passo(s), lidos do histórico importado. Passe o mouse nas caixas e nas setas para ver datas e detalhes.';
    }
    if (seq.length) {
      var modos = el('div', 'nb-fluxo-modos');
      [['traj', 'Trajetória', 'Um passo por linha, na ordem em que aconteceram'],
       ['mapa', 'Mapa do fluxo', 'Todas as etapas, inclusive as não percorridas']].forEach(function (m) {
        var b = botao(m[1], 'btn--sm nb-fluxo-modo' + (st.modoFluxo === m[0] ? ' is-on' : ''), function () {
          st.modoFluxo = m[0];
          desenharFicha();
        }, m[2]);
        b.setAttribute('aria-pressed', st.modoFluxo === m[0] ? 'true' : 'false');
        modos.appendChild(b);
      });
      sf.appendChild(modos);
      var caixa = el('div', 'nb-fluxo-caixa');
      caixa.innerHTML = st.modoFluxo === 'mapa' ? NcrFluxo.mapa(rec) : NcrFluxo.trajetoria(rec);
      sf.appendChild(caixa);
      var leg = el('div');
      leg.innerHTML = NcrFluxo.legenda();
      sf.appendChild(leg.firstChild);
    }

    /* histórico — texto inteiro, sem corte */
    var sh = secao(body, 'Histórico da NCR', rec.historico.length
      ? rec.historico.length + ' evento(s) importado(s), do mais novo para o mais antigo.'
      : 'Nenhum histórico importado.');
    if (rec.historico.length) {
      var t = el('table', 'nb-hist');
      var hr = el('tr');
      ['Data', 'Movimento', 'Campo', 'De', 'Para', 'Obs. / responsável'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
      var th = el('thead'); th.appendChild(hr); t.appendChild(th);
      var tb = el('tbody');
      rec.historico.slice().reverse().forEach(function (e) {
        var tr = el('tr');
        var mov = NcrFluxo.LABEL[str(e.cls).toUpperCase()] || e.tipo;
        [Ncrs.data(e.data) + (e.estimado ? ' (estimada)' : ''), mov, e.campo, e.de, e.para,
         [e.obs, e.responsavel].filter(Boolean).join(' · ')]
          .forEach(function (v) { tr.appendChild(el('td', null, v)); });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      sh.appendChild(t);
    }
    body.scrollTop = rolagem;
  }

  function secao(pai, titulo, sub, cls) {
    var s = el('section', 'nb-sec ' + (cls || ''));
    s.appendChild(el('h4', null, titulo));
    s.appendChild(el('p', 'nb-sec-sub', sub || ''));
    pai.appendChild(s);
    return s;
  }

  function areaTexto(rec, campo, rotulo, linhasN, ph) {
    var fl = el('div', 'field');
    var id = 'nbFicha-' + campo;
    var lab = el('label', null, rotulo);
    lab.htmlFor = id;
    fl.appendChild(lab);
    var ta = el('textarea');
    ta.id = id;
    ta.rows = linhasN;
    ta.value = rec.waiver[campo];
    ta.placeholder = 'ex.: ' + ph;
    var tm = null;
    ta.addEventListener('input', function () {
      clearTimeout(tm);
      tm = setTimeout(function () {
        ctx.editar(rec, campo, ta.value).then(function () {
          st.abertoEm = rec.waiver.editedAt;
          st.fixadas[rec.key] = true;
          var a = document.getElementById('nbAutor');
          if (a) a.textContent = 'Última edição: ' + (rec.waiver.editedBy || 'sem nome') + ' · ' + Ncrs.data(rec.waiver.editedAt);
        });
      }, 400);
    });
    /* ao sair do campo, a linha da tabela reflete o texto novo */
    ta.addEventListener('change', function () { atualizarLinha(rec.key); });
    fl.appendChild(ta);
    return fl;
  }

  /**
   * Chamado depois de uma sincronização que trouxe mudanças. Se a ficha
   * aberta mudou por fora, redesenha — senão a próxima tecla gravaria por
   * cima, em silêncio, o que o colega escreveu.
   */
  function aposMudancaExterna() {
    var dlg = document.getElementById('ncrDialog');
    if (dlg && dlg.open && st.aberto) {
      var rec = Ncrs.get(st.aberto);
      if (rec && rec.waiver.editedAt !== st.abertoEm) {
        desenharFicha();
        return rec;
      }
    }
    return null;
  }

  global.NcrView = {
    render: render,
    renderTabela: renderTabela,
    atualizarLinha: atualizarLinha,
    abrirFicha: abrirFicha,
    aposMudancaExterna: aposMudancaExterna,
    descricaoDoFiltro: descricaoDoFiltro
  };
})(window);
