/* ==========================================================================
   produtosview.js — a aba Produtos, a ficha do produto e o bloco "produtos"
   da ficha da NCR
   --------------------------------------------------------------------------
   Os dados e o casamento com a NCR são do produtos.js; aqui só se desenha.

   A aba tem duas vistas do mesmo recorte (busca + filtros):

     Tabela  um produto por linha — Product Mark, Functional Mark,
             Designation, sistema, marcos de segurança, funções vitais e
             quantas NCRs o citam. Clicar abre a ficha do produto.
     Mapa    o que a tabela não mostra: a matriz marco × função vital (quantos
             produtos há em cada cruzamento) e a divisão por sistema. Clicar
             numa célula ou numa barra leva à tabela já filtrada.

   Produto sem marco e sem função vital aparece como N/A, em todo lugar.

   Os filtros não são guardados entre aberturas (a mesma regra da Tabela e
   do Banco NCR: filtro guardado esconde linhas sem dizer por quê); a vista e
   o painel recolhido são preferência de quem está sentado ali.
   ========================================================================== */
(function (global) {
  'use strict';

  var PREF = 'derrogacao:produtos';
  var FILTROS = ['sistema', 'marco', 'funcao', 'situacao', 'ncr'];
  var NOMES_FILTRO = {
    sistema: 'Sistema (bigrama)', marco: 'Marco de segurança', funcao: 'Função vital',
    situacao: 'Marco e função vital', ncr: 'Citado em NCR'
  };
  var ROTULOS_FIXOS = {
    situacao: { ambos: 'Com marco e função vital', soMarco: 'Só com marco', soFuncao: 'Só com função vital',
      na: 'N/A — sem marco e sem função vital' },
    ncr: { sim: 'Citado em alguma NCR', nao: 'Sem NCR' }
  };
  var NIVEIS = {
    exato: { rot: 'exato', dica: 'A mesma marca está no banco de produtos.' },
    variacao: { rot: 'variação', dica: 'A NCR escreve a marca do banco com caracteres a mais no fim.' },
    parecido: { rot: 'parecido — conferir', dica: 'Mesma base da marca, sufixo diferente: confira antes de usar.' }
  };

  /* A tabela mostra os primeiros produtos e deixa pedir mais: montar de uma vez
     as 2.400 linhas custava mais de um segundo só para o navegador medi-las. */
  var LOTE = 300;

  var host = null, ctx = null;
  var st = { busca: '', filtros: vazios(), ordem: { col: 'produto', dir: 1 }, limite: LOTE };
  var cacheLinhas = null;
  var detalheAberto = null;

  function vazios() {
    var f = {};
    FILTROS.forEach(function (k) { f[k] = []; });
    return f;
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
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function str(v) { return v == null ? '' : String(v); }
  function leitura() { return !!(ctx && ctx.leitura); }

  function lerPref() {
    try { return JSON.parse(global.localStorage.getItem(PREF) || '{}') || {}; } catch (e) { return {}; }
  }
  function gravarPref(p) {
    try { global.localStorage.setItem(PREF, JSON.stringify(p)); } catch (e) { /* sem armazenamento: vale até fechar */ }
  }
  function pref(chave, padrao) {
    var p = lerPref();
    return p[chave] === undefined ? padrao : p[chave];
  }
  function setPref(chave, valor) {
    var p = lerPref();
    p[chave] = valor;
    gravarPref(p);
  }

  /* --- peças que as outras telas também usam ------------------------------- */

  function chipMarco(m) {
    var c = el('span', 'pr-chip pr-chip--marco', m);
    c.title = 'Marco de segurança ' + m;
    return c;
  }
  function chipFuncao(f) {
    var c = el('span', 'pr-chip pr-chip--fv', 'FV ' + f);
    var nomes = Produtos.nomesDaFuncao(f);
    c.title = nomes.length ? 'Função vital ' + f + ' — ' + nomes.join(' · ') : 'Função vital ' + f;
    return c;
  }
  function naTag(oQue) {
    var n = el('span', 'pr-na', Produtos.NA);
    n.title = 'Não se aplica: este produto não está atrelado a nenhum ' + oQue + '.';
    return n;
  }

  function chipsMarcos(it) {
    var w = el('span', 'pr-chips');
    if (!it.marcos.length) w.appendChild(naTag('marco de segurança'));
    it.marcos.forEach(function (m) { w.appendChild(chipMarco(m)); });
    return w;
  }
  function chipsFuncoes(it) {
    var w = el('span', 'pr-chips');
    if (!it.funcoes.length) w.appendChild(naTag('função vital'));
    it.funcoes.forEach(function (f) { w.appendChild(chipFuncao(f)); });
    return w;
  }

  function etiquetaNivel(nivel, dica) {
    var n = NIVEIS[nivel];
    var e = el('span', 'pr-nivel pr-nivel--' + nivel, n.rot);
    e.title = dica || n.dica;
    return e;
  }

  /** O número do produto como botão que abre a ficha dele. */
  function linkProduto(it, abrir) {
    var b = el('button', 'nb2-num pr-num', it.produto || it.marca);
    b.type = 'button';
    b.title = 'Abrir a ficha do produto';
    b.addEventListener('click', function (e) { e.stopPropagation(); abrir(it.id); });
    return b;
  }

  /* --- as linhas e os filtros ----------------------------------------------- */

  function linhas() {
    var mapa = Produtos.mapaNcrs();
    var v = Produtos.versao();
    if (cacheLinhas && cacheLinhas.mapa === mapa && cacheLinhas.v === v) return cacheLinhas.ls;
    var ls = Produtos.lista().map(function (it) {
      var ns = mapa[it.id] || [];
      var certas = ns.filter(function (x) { return x.nivel !== 'parecido'; });
      var l = { it: it, sistema: Produtos.sistemaDe(it), ncrs: certas, possiveis: ns.length - certas.length };
      l.busca = Ncrs.norm([it.produto, it.marca, it.descricao, it.marcos.join(' '),
        it.funcoes.join(' '), it.funcoes.map(function (f) { return 'fv ' + f; }).join(' '), l.sistema,
        certas.map(function (x) { return x.rec.numero; }).join(' ')].join(' '));
      /* as marcas sem separador: "BH-00004" na busca acha "BH00004" */
      l.compacto = Produtos.nrm(it.produto + ' ' + it.marca);
      /* o que a tabela mostra como N/A: sem marca, sem marco ou sem função vital */
      l.temNA = !it.marca || !it.marcos.length || !it.funcoes.length;
      return l;
    });
    cacheLinhas = { mapa: mapa, v: v, ls: ls };
    return ls;
  }

  var VALORES = {
    sistema: function (l) { return [l.sistema || '__na']; },
    marco: function (l) { return l.it.marcos.length ? l.it.marcos : ['__na']; },
    funcao: function (l) { return l.it.funcoes.length ? l.it.funcoes : ['__na']; },
    situacao: function (l) {
      var m = l.it.marcos.length > 0, f = l.it.funcoes.length > 0;
      return [m && f ? 'ambos' : (m ? 'soMarco' : (f ? 'soFuncao' : 'na'))];
    },
    ncr: function (l) { return [l.ncrs.length ? 'sim' : 'nao']; }
  };

  function nomeValor(chave, v) {
    if (v === '__na') return Produtos.NA;
    if (ROTULOS_FIXOS[chave]) return ROTULOS_FIXOS[chave][v] || v;
    if (chave === 'funcao') return Produtos.rotuloFuncao(v);
    return v;
  }

  /** Cada palavra da busca tem de aparecer; "n/a" acha o que a tabela mostra como N/A. */
  function casaBusca(l) {
    return String(st.busca).trim().split(/\s+/).every(function (palavra) {
      if (!palavra) return true;
      if (palavra.toLowerCase() === 'n/a') return l.temNA;
      var n = Ncrs.norm(palavra), c = Produtos.nrm(palavra);
      return (n && l.busca.indexOf(n) >= 0) || (c.length >= 3 && l.compacto.indexOf(c) >= 0);
    });
  }

  function passa(l, ignorar) {
    if (st.busca && !casaBusca(l)) return false;
    for (var i = 0; i < FILTROS.length; i++) {
      var k = FILTROS[i];
      if (k === ignorar) continue;
      var esc = st.filtros[k];
      if (!esc.length) continue;
      if (!VALORES[k](l).some(function (v) { return esc.indexOf(v) >= 0; })) return false;
    }
    return true;
  }

  function algumFiltro() {
    return !!st.busca || FILTROS.some(function (k) { return st.filtros[k].length; });
  }

  function descricaoDoFiltro() {
    var p = [];
    if (st.busca) p.push('busca: “' + st.busca + '”');
    FILTROS.forEach(function (k) {
      if (st.filtros[k].length) p.push(NOMES_FILTRO[k] + ': ' + st.filtros[k].map(function (v) { return nomeValor(k, v); }).join(' ou '));
    });
    return p.join(' · ');
  }

  function posicaoMarco(l) { return l.it.marcos.length ? l.it.marcos[0] : null; }
  function primeiraFuncao(l) { return l.it.funcoes.length ? l.it.funcoes[0] : null; }

  var COLUNAS = [
    { id: 'produto', nome: 'Product Mark', cmp: function (a, b) { return Store.cmpTexto(a.it.produto, b.it.produto); } },
    { id: 'marca', nome: 'Functional Mark', cmp: function (a, b) { return Store.cmpTexto(a.it.marca, b.it.marca); } },
    { id: 'descricao', nome: 'Designation', cmp: function (a, b) { return Store.cmpTexto(a.it.descricao, b.it.descricao); } },
    { id: 'sistema', nome: 'Sistema', cmp: function (a, b) { return Store.cmpTexto(a.sistema, b.sistema); } },
    { id: 'marcos', nome: 'Marcos de segurança', cmp: function (a, b) {
      var x = posicaoMarco(a), y = posicaoMarco(b);
      if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);
      return Fluxo.cmpMarco(x, y);
    } },
    { id: 'funcoes', nome: 'Funções vitais', cmp: function (a, b) {
      var x = primeiraFuncao(a), y = primeiraFuncao(b);
      if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);
      return Produtos.cmpFuncao(x, y);
    } },
    { id: 'ncrs', nome: 'NCRs', cmp: function (a, b) { return a.ncrs.length - b.ncrs.length; } }
  ];

  function aVista() {
    var c = COLUNAS.filter(function (x) { return x.id === st.ordem.col; })[0] || COLUNAS[0];
    var ls = linhas().filter(function (l) { return passa(l); });
    /* a ordem é estável: o desempate é o Product Mark, e depois a posição na planilha */
    var pos = {};
    ls.forEach(function (l, i) { pos[l.it.id] = i; });
    return ls.sort(function (a, b) {
      return (c.cmp(a, b) * st.ordem.dir) || Store.cmpTexto(a.it.produto, b.it.produto) || (pos[a.it.id] - pos[b.it.id]);
    });
  }

  /* --- a tela --------------------------------------------------------------- */

  function render(h, c) {
    host = h; ctx = c;
    host.innerHTML = '';
    var raiz = el('div', 'nb2 pr2');
    var total = Produtos.total();

    raiz.appendChild(barra(total));
    var painel = el('div', 'nb2-painel');
    painel.id = 'pr2Painel';
    /* com o banco vazio o painel abre sozinho: é nele que está o botão de importar */
    painel.hidden = total ? !pref('painel', false) : false;
    painel.appendChild(acoes(total));
    if (total) {
      painel.appendChild(kpis());
      painel.appendChild(filtrosBox());
    }
    raiz.appendChild(painel);

    if (!total) {
      raiz.appendChild(vazio());
      host.appendChild(raiz);
      return;
    }
    var recorte = el('div', 'nb2-recorte pr2-recorte');
    recorte.id = 'pr2Recorte';
    raiz.appendChild(recorte);
    var conteudo = el('div', 'pr2-conteudo');
    conteudo.id = 'pr2Conteudo';
    raiz.appendChild(conteudo);
    host.appendChild(raiz);
    renderConteudo();
  }

  function barra(total) {
    var b = el('div', 'nb2-barra');
    var tit = el('div', 'nb2-titulo');
    tit.appendChild(el('strong', null, 'Produtos — marcos e funções vitais'));
    var conta = el('span', 'nb2-conta');
    conta.id = 'pr2Conta';
    conta.textContent = total ? total + ' produtos' : 'banco vazio';
    tit.appendChild(conta);
    b.appendChild(tit);

    if (total) {
      var busca = el('input', 'nb2-busca');
      busca.type = 'search';
      busca.id = 'pr2Busca';
      busca.placeholder = 'Buscar: Product Mark, Functional Mark, descrição, marco, FV, NCR…';
      busca.setAttribute('aria-label', 'Buscar nos produtos');
      busca.value = st.busca;
      var tm = null;
      busca.addEventListener('input', function () {
        clearTimeout(tm);
        tm = setTimeout(function () { st.busca = busca.value; mudouRecorte(); }, 200);
      });
      b.appendChild(busca);

      var vistas = el('div', 'pr2-vistas');
      vistas.setAttribute('role', 'group');
      vistas.setAttribute('aria-label', 'Vista');
      [['tabela', 'Tabela', 'Um produto por linha'],
       ['mapa', 'Mapa', 'Marcos × funções vitais e a divisão por sistema']].forEach(function (v) {
        var on = pref('vista', 'tabela') === v[0];
        var bt = botao(v[1], 'btn--sm nb2-toggle' + (on ? ' is-on' : ''), function () {
          setPref('vista', v[0]);
          st.limite = LOTE;
          Array.prototype.forEach.call(vistas.children, function (x) {
            var ativo = x.dataset.vista === v[0];
            x.classList.toggle('is-on', ativo);
            x.setAttribute('aria-pressed', ativo ? 'true' : 'false');
          });
          renderConteudo();
        }, v[2]);
        bt.dataset.vista = v[0];
        bt.setAttribute('aria-pressed', on ? 'true' : 'false');
        vistas.appendChild(bt);
      });
      b.appendChild(vistas);

      var ex = el('div', 'nb2-exporta');
      ex.appendChild(botao('⤓ Excel', 'btn--sm', function () { exportar('xlsx'); },
        'Planilha com os produtos à vista (com o filtro aplicado) e uma aba dizendo qual foi o recorte'));
      ex.appendChild(botao('CSV', 'btn--sm', function () { exportar('csv'); }, 'Os produtos à vista, em CSV'));
      b.appendChild(ex);
    }

    var aberto = total ? pref('painel', false) : true;
    var bp = botao(aberto ? '▲ Recolher painel' : '▼ Mostrar painel', 'btn--sm nb2-painel-btn', function () {
      var p = document.getElementById('pr2Painel');
      var agora = p.hidden;
      p.hidden = !agora;
      setPref('painel', agora);
      bp.textContent = agora ? '▲ Recolher painel' : '▼ Mostrar painel';
      bp.setAttribute('aria-expanded', agora ? 'true' : 'false');
    }, 'Recolhe ou mostra a importação, os números e os filtros');
    bp.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    bp.setAttribute('aria-controls', 'pr2Painel');
    b.appendChild(bp);
    return b;
  }

  function acoes(total) {
    var box = el('div', 'nb2-acoes');
    var m = Produtos.meta();
    var ult = m.importadoEm
      ? 'Banco de produtos atualizado em ' + Ncrs.data(m.importadoEm) + (m.importadoPor ? ' por ' + m.importadoPor : '') +
        (m.arquivo && !leitura() ? ' · ' + m.arquivo : '')
      : (total ? '' : 'O banco de produtos ainda não foi importado.');
    if (!leitura()) {
      var g = el('div', 'nb2-grupo');
      g.appendChild(el('span', 'nb2-grupo-rot', 'Importar'));
      g.appendChild(botao(total ? 'Atualizar com uma planilha…' : 'Importar planilha de produtos…',
        total ? 'btn--sm' : 'btn--sm btn--primary', function () { ctx.importar(); },
        'A planilha com Product Mark, Functional Mark, Designation, Safety Milestones e Vital Functions #. ' +
        'Entra o que é novo e se atualiza o que mudou; nada é apagado.'));
      box.appendChild(g);
    }
    if (ult) box.appendChild(el('span', 'nb2-ultima', ult));
    return box;
  }

  function vazio() {
    var c = el('div', 'nb2-vazio');
    if (leitura()) {
      c.appendChild(el('h3', null, 'O banco de produtos não veio nesta publicação'));
      c.appendChild(el('p', 'nb2-mini', 'Quem publica é o editor: o banco de produtos entra na próxima publicação, depois de importado lá.'));
      return c;
    }
    c.appendChild(el('h3', null, 'Nenhum produto no banco ainda'));
    var p = el('p');
    p.appendChild(document.createTextNode('Use '));
    p.appendChild(el('strong', null, 'Importar planilha de produtos…'));
    p.appendChild(document.createTextNode(', acima, e escolha a planilha com as colunas Product Mark, Functional Mark, ' +
      'Designation, Safety Milestones e Vital Functions #. Vários marcos ou funções na mesma célula ficam separados por “;”.'));
    c.appendChild(p);
    return c;
  }

  /* --- números e filtros ------------------------------------------------------ */

  var KPI_DEFS = [
    ['Produtos', function (c) { return c.total; }, function () { return 'no banco'; }, null],
    ['Com marco', function (c) { return c.comMarco; }, function () { return 'marco de segurança'; }, ['situacao', ['ambos', 'soMarco']]],
    ['Com função vital', function (c) { return c.comFuncao; }, function () { return 'ao menos uma'; }, ['situacao', ['ambos', 'soFuncao']]],
    ['N/A', function (c) { return c.semNada; }, function () { return 'sem marco e sem função vital'; }, ['situacao', ['na']]],
    ['Citados em NCR', function (c) { return c.citados; }, function () { return 'aparecem em alguma NCR'; }, ['ncr', ['sim']]]
  ];

  function numeros() {
    var c = Produtos.contagens();
    c.citados = linhas().filter(function (l) { return l.ncrs.length; }).length;
    return c;
  }

  function kpis() {
    var row = el('div', 'sm-kpis nb2-kpis');
    var c = numeros();
    KPI_DEFS.forEach(function (k) {
      var t = el('button', 'sm-kpi nb2-kpi');
      t.type = 'button';
      t.title = k[3] ? 'Filtrar por este grupo' : 'Limpar os filtros';
      t.appendChild(el('span', 'sm-kpi-label', k[0]));
      t.appendChild(el('strong', 'sm-kpi-value', String(k[1](c))));
      t.appendChild(el('span', 'sm-kpi-sub', k[2]()));
      t.addEventListener('click', function () {
        st.busca = '';
        st.filtros = vazios();
        if (k[3]) st.filtros[k[3][0]] = k[3][1].slice();
        render(host, ctx);
      });
      row.appendChild(t);
    });
    return row;
  }

  function opcoesDe(chave) {
    var cont = {};
    /* a contagem de cada opção respeita os OUTROS filtros, não o dela mesma */
    linhas().forEach(function (l) {
      if (!passa(l, chave)) return;
      VALORES[chave](l).forEach(function (v) { cont[v] = (cont[v] || 0) + 1; });
    });
    var ks;
    if (ROTULOS_FIXOS[chave]) ks = Object.keys(ROTULOS_FIXOS[chave]);
    else {
      /* todos os valores que existem, mesmo os que o recorte esconde (n = 0) */
      var todos = {};
      linhas().forEach(function (l) { VALORES[chave](l).forEach(function (v) { todos[v] = 1; }); });
      ks = Object.keys(todos);
      ks.sort(function (a, b) {
        if (a === '__na') return 1;
        if (b === '__na') return -1;
        if (chave === 'marco') return Fluxo.cmpMarco(a, b);
        if (chave === 'funcao') return Produtos.cmpFuncao(a, b);
        return Store.cmpTexto(a, b);
      });
    }
    return ks.map(function (v) { return { valor: v, nome: nomeValor(chave, v), n: cont[v] || 0 }; });
  }

  function filtrosBox() {
    var box = el('div', 'nb2-filtros');
    FILTROS.forEach(function (k) { box.appendChild(multi(k)); });
    var limpa = botao('Limpar filtros', 'btn--sm nb2-limpar', function () {
      st.busca = '';
      st.filtros = vazios();
      render(host, ctx);
    });
    limpa.id = 'pr2Limpar';
    box.appendChild(limpa);
    return box;
  }

  var popAberto = null;
  function fecharPop() {
    if (popAberto) { popAberto.hidden = true; popAberto.previousSibling.setAttribute('aria-expanded', 'false'); popAberto = null; }
  }
  document.addEventListener('mousedown', function (e) {
    if (popAberto && !popAberto.parentNode.contains(e.target)) fecharPop();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popAberto) fecharPop(); });

  function resumoBotao(chave) {
    var esc = st.filtros[chave];
    if (!esc.length) return 'Todos';
    if (esc.length <= 2) return esc.map(function (v) { return nomeValor(chave, v); }).join(', ');
    return esc.length + ' escolhidos';
  }

  function multi(chave) {
    var opcoes = opcoesDe(chave);
    var w = el('div', 'nb2-ms');
    w.appendChild(el('span', 'nb2-ms-rot', NOMES_FILTRO[chave]));
    var corpo = el('div', 'nb2-ms-corpo');
    var btn = el('button', 'nb2-ms-btn' + (st.filtros[chave].length ? ' is-on' : ''));
    btn.type = 'button';
    btn.id = 'prF-' + chave;
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
    function aoMudar() {
      txt.textContent = resumoBotao(chave);
      btn.classList.toggle('is-on', st.filtros[chave].length > 0);
      mudouRecorte();
    }
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
        aoMudar();
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
    pe.appendChild(botao('Marcar todos', 'btn--sm nb2-ms-todos', function () {
      var sel = st.filtros[chave].slice();
      Array.prototype.forEach.call(lista.children, function (r) {
        if (r.hidden) return;
        var c = r.querySelector('input');
        c.checked = true;
        if (sel.indexOf(c.value) < 0) sel.push(c.value);
      });
      st.filtros[chave] = sel;
      aoMudar();
    }));
    pe.appendChild(botao('Limpar', 'btn--sm', function () {
      st.filtros[chave] = [];
      Array.prototype.forEach.call(lista.querySelectorAll('input[type="checkbox"]'), function (c) { c.checked = false; });
      aoMudar();
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

  /* --- o conteúdo: tabela ou mapa --------------------------------------------- */

  /** A busca, um filtro ou a ordem mudaram: a lista recomeça do alto. */
  function mudouRecorte() {
    st.limite = LOTE;
    renderConteudo();
  }

  function renderConteudo() {
    var box = document.getElementById('pr2Conteudo');
    if (!box) return;
    var topo = host ? host.scrollTop : 0;
    box.innerHTML = '';
    var ls = aVista();
    var total = Produtos.total();
    var vista = pref('vista', 'tabela');
    if (vista === 'mapa') desenharMapa(box, ls);
    else desenharTabela(box, ls);
    atualizarContagem(ls, total);
    atualizarRecorte();
    if (host) host.scrollTop = topo;
  }

  function atualizarContagem(ls, total) {
    var c = document.getElementById('pr2Conta');
    if (!c) return;
    var f = algumFiltro();
    c.textContent = f ? ls.length + ' de ' + total + ' produtos à vista' : total + ' produtos';
    c.classList.toggle('is-on', f);
  }

  function atualizarRecorte() {
    var box = document.getElementById('pr2Recorte');
    if (!box) return;
    box.innerHTML = '';
    box.hidden = !algumFiltro();
    if (!algumFiltro()) return;
    box.appendChild(el('span', null, 'Recorte: ' + descricaoDoFiltro()));
    box.appendChild(botao('Limpar', 'btn--sm btn--quiet', function () {
      st.busca = '';
      st.filtros = vazios();
      render(host, ctx);
    }));
  }

  function desenharTabela(box, ls) {
    var caixa = el('div', 'nb2-tabela');
    var t = el('table', 'nb2-table pr2-table');
    t.id = 'pr2Table';
    var thead = el('thead');
    var trh = el('tr');
    COLUNAS.forEach(function (c) {
      var th = el('th');
      var b = el('button', 'nb2-sort', c.nome);
      b.type = 'button';
      if (st.ordem.col === c.id) b.appendChild(el('span', 'nb2-seta', st.ordem.dir > 0 ? ' ▲' : ' ▼'));
      b.title = 'Clique para ordenar';
      b.addEventListener('click', function () {
        if (st.ordem.col === c.id) st.ordem.dir = -st.ordem.dir;
        else { st.ordem.col = c.id; st.ordem.dir = 1; }
        mudouRecorte();
      });
      th.appendChild(b);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tb = el('tbody');
    ls.slice(0, st.limite).forEach(function (l) { tb.appendChild(linhaTabela(l)); });
    t.appendChild(tb);
    caixa.appendChild(t);
    box.appendChild(caixa);
    if (!ls.length) caixa.appendChild(el('p', 'nb2-nada', 'Nenhum produto com esse recorte.'));
    if (ls.length > st.limite) {
      var mais = el('div', 'pr2-mais');
      mais.id = 'pr2Mais';
      mais.appendChild(el('span', null, 'Mostrando ' + st.limite + ' de ' + ls.length + ' produtos'));
      mais.appendChild(botao('Mostrar mais ' + LOTE, 'btn--sm', function () { st.limite += LOTE; renderConteudo(); }));
      mais.appendChild(botao('Mostrar todos (' + ls.length + ')', 'btn--sm', function () { st.limite = ls.length; renderConteudo(); }));
      box.appendChild(mais);
    }
  }

  function linhaTabela(l) {
    var it = l.it;
    var tr = el('tr', 'pr2-linha' + (!it.marcos.length && !it.funcoes.length ? ' is-na' : ''));
    tr.dataset.id = it.id;
    var td = el('td');
    td.appendChild(linkProduto(it, abrirDetalhe));
    tr.appendChild(td);
    tr.appendChild(el('td', 'pr-marca', it.marca || Produtos.NA));
    tr.appendChild(el('td', 'is-longo', it.descricao));
    tr.appendChild(el('td', 'pr-sist', l.sistema || '—'));
    var tm = el('td'); tm.appendChild(chipsMarcos(it)); tr.appendChild(tm);
    var tf = el('td'); tf.appendChild(chipsFuncoes(it)); tr.appendChild(tf);
    var tn = el('td', 'pr-nncr');
    if (l.ncrs.length) {
      var bn = el('button', 'pr-contador', String(l.ncrs.length));
      bn.type = 'button';
      bn.title = l.ncrs.length + ' NCR(s) citam este produto' + (l.possiveis ? ' (mais ' + l.possiveis + ' possível(is))' : '') + ' — abrir a ficha';
      bn.addEventListener('click', function (e) { e.stopPropagation(); abrirDetalhe(it.id); });
      tn.appendChild(bn);
    } else tn.appendChild(el('span', 'pr-zero', l.possiveis ? '(' + l.possiveis + ')' : '—'));
    tr.appendChild(tn);
    tr.addEventListener('click', function () { abrirDetalhe(it.id); });
    return tr;
  }

  /* --- o mapa ------------------------------------------------------------------ */

  function irParaTabela(filtros) {
    FILTROS.forEach(function (k) { if (filtros[k]) st.filtros[k] = filtros[k]; });
    setPref('vista', 'tabela');
    st.limite = LOTE;
    render(host, ctx);
  }

  function desenharMapa(box, ls) {
    if (!ls.length) { box.appendChild(el('p', 'nb2-nada', 'Nenhum produto com esse recorte.')); return; }
    box.appendChild(mapaMatriz(ls));
    box.appendChild(mapaSistemas(ls));
  }

  function mapaMatriz(ls) {
    var sec = el('section', 'nb-sec pr-sec');
    sec.appendChild(el('h4', null, 'Marcos de segurança × funções vitais'));
    sec.appendChild(el('p', 'nb-sec-sub', 'Quantos produtos há em cada cruzamento. Clique numa célula, num marco ou numa função para ver os produtos na tabela.'));
    var marcos = [], fvs = [];
    var seenM = {}, seenF = {};
    var semMarco = 0, semFuncao = 0;
    ls.forEach(function (l) {
      if (!l.it.marcos.length) semMarco++;
      if (!l.it.funcoes.length) semFuncao++;
      l.it.marcos.forEach(function (m) { if (!seenM[m]) { seenM[m] = 1; marcos.push(m); } });
      l.it.funcoes.forEach(function (f) { if (!seenF[f]) { seenF[f] = 1; fvs.push(f); } });
    });
    marcos.sort(function (a, b) { return Fluxo.cmpMarco(a, b); });
    fvs.sort(Produtos.cmpFuncao);
    var linhasM = marcos.concat(semMarco ? ['__na'] : []);
    var colunasF = fvs.concat(semFuncao ? ['__na'] : []);
    var cel = {}, totM = {}, totF = {}, max = 0;
    ls.forEach(function (l) {
      var ms = l.it.marcos.length ? l.it.marcos : ['__na'];
      var fs = l.it.funcoes.length ? l.it.funcoes : ['__na'];
      ms.forEach(function (m) {
        totM[m] = (totM[m] || 0) + 1;
        fs.forEach(function (f) {
          var k = m + '\u0001' + f;
          cel[k] = (cel[k] || 0) + 1;
          if (cel[k] > max) max = cel[k];
        });
      });
      fs.forEach(function (f) { totF[f] = (totF[f] || 0) + 1; });
    });
    var caixa = el('div', 'pr-matriz-caixa');
    var t = el('table', 'pr-matriz');
    t.id = 'pr2Matriz';
    var th = el('thead');
    var trh = el('tr');
    trh.appendChild(el('th', 'pr-mz-canto', 'Marco \\ Função'));
    colunasF.forEach(function (f) {
      var c = el('th', 'pr-mz-col');
      var b = el('button', 'pr-mz-cab', f === '__na' ? Produtos.NA : 'FV ' + f);
      b.type = 'button';
      b.title = f === '__na' ? 'Produtos sem função vital' : Produtos.rotuloFuncao(f) + ' — ver os produtos';
      b.addEventListener('click', function () { irParaTabela({ funcao: [f] }); });
      c.appendChild(b);
      trh.appendChild(c);
    });
    trh.appendChild(el('th', 'pr-mz-tot', 'Total'));
    th.appendChild(trh);
    t.appendChild(th);
    var tb = el('tbody');
    linhasM.forEach(function (m) {
      var tr = el('tr');
      var rh = el('th', 'pr-mz-lin');
      var b = el('button', 'pr-mz-cab', m === '__na' ? Produtos.NA : m);
      b.type = 'button';
      b.title = m === '__na' ? 'Produtos sem marco de segurança' : 'Marco ' + m + ' — ver os produtos';
      b.addEventListener('click', function () { irParaTabela({ marco: [m] }); });
      rh.appendChild(b);
      tr.appendChild(rh);
      colunasF.forEach(function (f) {
        var n = cel[m + '\u0001' + f] || 0;
        var td = el('td', 'pr-mz-cel' + (n ? '' : ' is-zero'));
        if (n) {
          var a = 0.12 + 0.78 * (n / max);
          td.style.background = 'rgba(107, 122, 10, ' + a.toFixed(2) + ')';
          if (a > 0.5) td.style.color = '#fff';
          var bc = el('button', 'pr-mz-n', String(n));
          bc.type = 'button';
          bc.title = n + ' produto(s): ' + (m === '__na' ? 'sem marco' : 'marco ' + m) + ' e ' + (f === '__na' ? 'sem função vital' : 'FV ' + f);
          bc.addEventListener('click', function () { irParaTabela({ marco: [m], funcao: [f] }); });
          td.appendChild(bc);
        } else td.textContent = '·';
        tr.appendChild(td);
      });
      tr.appendChild(el('td', 'pr-mz-tot', String(totM[m] || 0)));
      tb.appendChild(tr);
    });
    var rodape = el('tr', 'pr-mz-rodape');
    rodape.appendChild(el('th', 'pr-mz-lin', 'Total'));
    colunasF.forEach(function (f) { rodape.appendChild(el('td', 'pr-mz-tot', String(totF[f] || 0))); });
    rodape.appendChild(el('td', 'pr-mz-tot', String(ls.length)));
    tb.appendChild(rodape);
    t.appendChild(tb);
    caixa.appendChild(t);
    sec.appendChild(caixa);
    sec.appendChild(el('p', 'nb2-mini', 'Um produto com vários marcos ou funções conta em cada cruzamento; o total de cada linha e de cada coluna conta o produto uma vez.'));
    return sec;
  }

  function mapaSistemas(ls) {
    var sec = el('section', 'nb-sec pr-sec');
    sec.appendChild(el('h4', null, 'Por sistema'));
    sec.appendChild(el('p', 'nb-sec-sub', 'As duas primeiras letras da Functional Mark. Clique numa barra para ver os produtos.'));
    var por = {};
    ls.forEach(function (l) {
      var k = l.sistema || '__na';
      var o = por[k] = por[k] || { k: k, n: 0, com: 0 };
      o.n++;
      if (l.it.marcos.length || l.it.funcoes.length) o.com++;
    });
    var ordem = Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) {
      /* do maior para o menor; no empate, por nome, e "sem sistema" por último */
      return (b.n - a.n) || ((a.k === '__na') - (b.k === '__na')) || Store.cmpTexto(a.k, b.k);
    });
    var max = ordem.length ? ordem[0].n : 1;
    var lista = el('div', 'pr-sist-lista');
    ordem.forEach(function (o) {
      var l = el('button', 'pr-sist-linha');
      l.type = 'button';
      l.title = o.n + ' produto(s); ' + o.com + ' com marco ou função vital, ' + (o.n - o.com) + ' N/A — ver na tabela';
      l.appendChild(el('span', 'pr-sist-nome', o.k === '__na' ? 'sem sistema' : o.k));
      var barra = el('span', 'pr-sist-barra');
      var b1 = el('span', 'pr-sist-com');
      b1.style.width = (100 * o.com / max).toFixed(1) + '%';
      var b2 = el('span', 'pr-sist-na');
      b2.style.width = (100 * (o.n - o.com) / max).toFixed(1) + '%';
      barra.appendChild(b1);
      barra.appendChild(b2);
      l.appendChild(barra);
      l.appendChild(el('span', 'pr-sist-n', String(o.n)));
      l.addEventListener('click', function () { irParaTabela({ sistema: [o.k] }); });
      lista.appendChild(l);
    });
    sec.appendChild(lista);
    var leg = el('p', 'pr-sist-leg');
    leg.appendChild(el('span', 'pr-sist-chave pr-sist-com'));
    leg.appendChild(document.createTextNode(' com marco ou função vital   '));
    leg.appendChild(el('span', 'pr-sist-chave pr-sist-na'));
    leg.appendChild(document.createTextNode(' N/A'));
    sec.appendChild(leg);
    return sec;
  }

  /* --- exportar ------------------------------------------------------------------ */

  function exportar(tipo) {
    var ls = aVista();
    var linhasX = ls.map(function (l) {
      var it = l.it;
      return [it.produto, it.marca, it.descricao, l.sistema,
        it.marcos.length ? it.marcos.join('; ') : Produtos.NA,
        it.funcoes.length ? it.funcoes.join('; ') : Produtos.NA,
        l.ncrs.map(function (x) { return x.rec.numero; }).join('; ')];
    });
    ctx.exportar(tipo, {
      colunas: [
        { titulo: 'Product Mark', larg: 14 }, { titulo: 'Functional Mark', larg: 16 },
        { titulo: 'Designation', larg: 52 }, { titulo: 'Sistema', larg: 9 },
        { titulo: 'Safety Milestones', larg: 20 }, { titulo: 'Vital Functions #', larg: 18 },
        { titulo: 'NCRs que citam', larg: 44 }
      ],
      linhas: linhasX, total: Produtos.total(), recorte: descricaoDoFiltro()
    });
  }

  /* --- a ficha do produto -------------------------------------------------------- */

  function abrirDetalhe(id) {
    var it = Produtos.get(id);
    var dlg = document.getElementById('prodDialog');
    if (!it || !dlg) return;
    detalheAberto = id;
    desenharDetalhe();
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.nb-ficha-corpo').scrollTop = 0;
    dlg.onclose = function () { detalheAberto = null; };
  }

  function campoDl(dl, rotulo, valor, copiavel) {
    dl.appendChild(el('dt', null, rotulo));
    var dd = el('dd');
    dd.appendChild(document.createTextNode(valor || Produtos.NA));
    if (copiavel && valor && ctx && ctx.copiar) {
      var b = botao('copiar', 'btn--sm btn--quiet pr-copiar', function () { ctx.copiar(valor); }, 'Copiar ' + rotulo);
      dd.appendChild(b);
    }
    dl.appendChild(dd);
  }

  function desenharDetalhe() {
    var it = detalheAberto ? Produtos.get(detalheAberto) : null;
    var dlg = document.getElementById('prodDialog');
    if (!it || !dlg) return;
    var cab = dlg.querySelector('.nb-ficha-cab');
    cab.innerHTML = '';
    var t1 = el('div', 'nb-ficha-tit');
    t1.appendChild(el('h3', null, it.produto || it.marca));
    var tags = el('div', 'nb-ficha-tags');
    var sis = Produtos.sistemaDe(it);
    if (it.marca) tags.appendChild(el('span', 'nb-chip', it.marca));
    if (sis) tags.appendChild(el('span', 'nb-chip nb-chip--sbr', 'sistema ' + sis));
    if (!it.marcos.length && !it.funcoes.length) tags.appendChild(el('span', 'nb-chip nb-chip--aviso', Produtos.NA));
    t1.appendChild(tags);
    cab.appendChild(t1);
    cab.appendChild(botao('Fechar ✕', 'btn--sm', function () { dlg.close(); }));

    var body = dlg.querySelector('.nb-ficha-corpo');
    var rolagem = body.scrollTop;
    body.innerHTML = '';
    if (it.descricao) body.appendChild(el('p', 'nb-ficha-titulo', it.descricao));

    var grade = el('div', 'nb-ficha-grade');
    var esq = el('div', 'nb-ficha-col');
    var dir = el('div', 'nb-ficha-col');
    grade.appendChild(esq);
    grade.appendChild(dir);
    body.appendChild(grade);

    var s1 = secao(esq, 'Identificação');
    var dl = el('dl', 'nb-campos');
    campoDl(dl, 'Product Mark', it.produto, true);
    campoDl(dl, 'Functional Mark', it.marca, true);
    campoDl(dl, 'Designation', it.descricao);
    campoDl(dl, 'Sistema (bigrama)', sis);
    s1.appendChild(dl);

    var s2 = secao(esq, 'Marcos de segurança e funções vitais');
    var lm = el('div', 'pr-bloco');
    lm.appendChild(el('span', 'nb-rot', 'Safety Milestones'));
    lm.appendChild(chipsMarcos(it));
    s2.appendChild(lm);
    var lf = el('div', 'pr-bloco');
    lf.appendChild(el('span', 'nb-rot', 'Vital Functions #'));
    lf.appendChild(chipsFuncoes(it));
    s2.appendChild(lf);
    if (it.funcoes.length) {
      var ul = el('ul', 'pr-fv-nomes');
      it.funcoes.forEach(function (f) {
        var nomes = Produtos.nomesDaFuncao(f);
        ul.appendChild(el('li', null, 'FV ' + f + (nomes.length ? ' — ' + nomes.join(' · ') : '')));
      });
      s2.appendChild(ul);
    }

    var ncrs = Produtos.ncrsDoProduto(it.id, false);
    var s3 = secao(dir, 'NCRs que citam este produto');
    s3.appendChild(tabelaNcrs(ncrs, function (key) { dlg.close(); ctx.abrirFicha(key); }));

    var fam = Produtos.familiaDe(it);
    if (fam.length) {
      var s4 = secao(body, 'Mesma família da Functional Mark');
      s4.querySelector('.nb-sec-sub').textContent = 'Produtos do banco com a mesma base (' + (/^[A-Z]{2}\d{5}/.exec(Produtos.nrm(it.marca)) || [''])[0] + ') e outro sufixo. ' + fam.length + ' produto(s).';
      s4.appendChild(tabelaProdutos(fam, function (id) { abrirDetalhe(id); }));
    }
    body.scrollTop = rolagem;
  }

  function secao(pai, titulo) {
    var s = el('section', 'nb-sec');
    s.appendChild(el('h4', null, titulo));
    s.appendChild(el('p', 'nb-sec-sub', ''));
    pai.appendChild(s);
    return s;
  }

  function tabelaNcrs(ncrs, abrirNcr) {
    var certas = ncrs.filter(function (x) { return x.nivel !== 'parecido'; });
    var poss = ncrs.filter(function (x) { return x.nivel === 'parecido'; });
    var w = el('div');
    function tabela(lista) {
      var t = el('table', 'nb-hist');
      var hr = el('tr');
      ['NCR', 'Status', 'Correspondência', 'Escrito na NCR', 'Onde'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
      var th = el('thead'); th.appendChild(hr); t.appendChild(th);
      var tb = el('tbody');
      lista.forEach(function (x) {
        var tr = el('tr');
        var a = el('td');
        var b = el('button', 'nb2-num', x.rec.numero);
        b.type = 'button';
        b.title = 'Abrir a ficha da NCR';
        b.addEventListener('click', function () { abrirNcr(x.rec.key); });
        a.appendChild(b);
        tr.appendChild(a);
        var f = Ncrs.fonte(x.rec);
        var s = el('td', 'pr-nowrap');
        s.appendChild(el('span', 'nb-chip' + (Ncrs.fechada(x.rec) ? ' nb-chip--fechada' : ''), f.status || (Ncrs.fechada(x.rec) ? 'fechada' : 'sem status')));
        tr.appendChild(s);
        var n = el('td', 'pr-nowrap');
        n.appendChild(etiquetaNivel(x.nivel));
        tr.appendChild(n);
        tr.appendChild(el('td', 'pr-nowrap pr-marca', x.tokens.join(', ')));
        tr.appendChild(el('td', null, x.onde));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      return t;
    }
    if (certas.length) w.appendChild(tabela(certas));
    else w.appendChild(el('p', 'nb2-mini', 'Nenhuma NCR do banco cita este produto.'));
    if (poss.length) {
      var d = document.createElement('details');
      d.className = 'pr-possiveis';
      var sm = document.createElement('summary');
      sm.textContent = 'Possíveis, a conferir (' + poss.length + ')';
      d.appendChild(sm);
      d.appendChild(tabela(poss));
      w.appendChild(d);
    }
    return w;
  }

  function tabelaProdutos(lista, abrir) {
    var caixa = el('div', 'nb-det-caixa');
    var t = el('table', 'nb-hist');
    var hr = el('tr');
    ['Product Mark', 'Functional Mark', 'Designation', 'Marcos', 'Funções vitais'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    lista.forEach(function (it) {
      var tr = el('tr');
      var a = el('td'); a.appendChild(linkProduto(it, abrir)); tr.appendChild(a);
      tr.appendChild(el('td', 'pr-marca', it.marca));
      tr.appendChild(el('td', null, it.descricao));
      var m = el('td'); m.appendChild(chipsMarcos(it)); tr.appendChild(m);
      var f = el('td'); f.appendChild(chipsFuncoes(it)); tr.appendChild(f);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    caixa.appendChild(t);
    return caixa;
  }

  /* --- o bloco da ficha da NCR ------------------------------------------------------ */

  /**
   * "Produtos, marcos de segurança e funções vitais" da ficha da NCR: os
   * produtos do banco que a NCR cita (pela marca funcional ou pelo Product
   * Mark, com tolerância — ver produtos.js), cada um com o nível do
   * casamento. Devolve null quando não há banco de produtos.
   */
  function blocoDaNcr(rec, opts) {
    if (!Produtos.total()) return null;
    opts = opts || {};
    var achados = Produtos.deNcr(rec);
    var certos = achados.filter(function (a) { return a.nivel !== 'parecido'; });
    var poss = achados.filter(function (a) { return a.nivel === 'parecido'; });
    var sec = el('section', 'nb-sec nb-sec--produtos');
    sec.appendChild(el('h4', null, 'Produtos, marcos de segurança e funções vitais'));
    sec.appendChild(el('p', 'nb-sec-sub', certos.length
      ? certos.length + ' produto(s) do banco de produtos citado(s) nesta NCR.'
      : 'Nenhum produto do banco de produtos foi encontrado nos dados desta NCR.'));
    if (certos.length) {
      var r = Produtos.resumoDe(certos);
      var linha = el('div', 'pr-resumo');
      linha.appendChild(el('span', 'nb-rot', 'Marcos'));
      var cm = el('span', 'pr-chips');
      if (!r.marcos.length) cm.appendChild(naTag('marco de segurança'));
      r.marcos.forEach(function (m) { cm.appendChild(chipMarco(m)); });
      linha.appendChild(cm);
      linha.appendChild(el('span', 'nb-rot', 'Funções vitais'));
      var cf = el('span', 'pr-chips');
      if (!r.funcoes.length) cf.appendChild(naTag('função vital'));
      r.funcoes.forEach(function (f) { cf.appendChild(chipFuncao(f)); });
      linha.appendChild(cf);
      sec.appendChild(linha);
      sec.appendChild(tabelaDaNcr(certos, opts));
    }
    if (poss.length) {
      var d = document.createElement('details');
      d.className = 'pr-possiveis';
      var sm = document.createElement('summary');
      sm.textContent = 'Parecidos, a conferir (' + poss.length + ')';
      d.appendChild(sm);
      d.appendChild(tabelaDaNcr(poss, opts));
      sec.appendChild(d);
    }
    return sec;
  }

  function tabelaDaNcr(achados, opts) {
    var caixa = el('div', 'nb-det-caixa');
    var t = el('table', 'nb-hist nb-det pr-tab-ncr');
    var hr = el('tr');
    ['Product Mark', 'Functional Mark', 'Designation', 'Marcos de segurança', 'Funções vitais', 'Correspondência']
      .forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    achados.forEach(function (a) {
      var it = a.item;
      var tr = el('tr');
      var p = el('td');
      if (opts.abrirProduto) p.appendChild(linkProduto(it, opts.abrirProduto));
      else p.appendChild(document.createTextNode(it.produto || '—'));
      tr.appendChild(p);
      tr.appendChild(el('td', 'pr-marca', it.marca || Produtos.NA));
      tr.appendChild(el('td', null, it.descricao));
      var m = el('td'); m.appendChild(chipsMarcos(it)); tr.appendChild(m);
      var f = el('td'); f.appendChild(chipsFuncoes(it)); tr.appendChild(f);
      var c = el('td');
      var dica = a.nivel === 'variacao'
        ? 'A NCR escreve “' + a.tokens.join(', ') + '”; o banco de produtos tem “' + (it.marca || it.produto) + '”.'
        : (a.nivel === 'parecido'
          ? 'A NCR cita “' + a.tokens.join(', ') + '”; o banco tem “' + (it.marca || it.produto) + '” — a mesma base, outro sufixo.'
          : null);
      c.appendChild(etiquetaNivel(a.nivel, dica));
      c.appendChild(el('span', 'nb2-mini', 'achado por ' + a.vias.map(function (v) { return v === 'produto' ? 'Product Mark' : 'Functional Mark'; }).join(' e ') +
        (a.tokens.length && a.nivel !== 'exato' ? ' · NCR: ' + a.tokens.join(', ') : '') + ' · em: ' + a.onde));
      tr.appendChild(c);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    caixa.appendChild(t);
    return caixa;
  }

  /** O que muda por fora (pasta, importação): a tela e a ficha aberta se refazem. */
  function redesenhar() {
    if (host && host.offsetParent !== null) render(host, ctx);
    if (detalheAberto) desenharDetalhe();
  }

  function abrirProdutoPorId(id) {
    abrirDetalhe(id);
  }

  global.ProdView = {
    render: render,
    redesenhar: redesenhar,
    abrirDetalhe: abrirProdutoPorId,
    blocoDaNcr: blocoDaNcr,
    chipsMarcos: chipsMarcos,
    chipsFuncoes: chipsFuncoes,
    descricaoDoFiltro: descricaoDoFiltro,
    /* os testes mexem direto no recorte */
    filtros: function () { return st; }
  };
})(window);
