/* ==========================================================================
   tabela.js — a aba Tabela: todos os itens, de todos os relatórios
   --------------------------------------------------------------------------
   As outras abas olham para o relatório aberto. Esta olha para o conjunto:
   uma linha por item de **todos os marcos** que estão neste navegador, para
   responder "onde está a NCR-018?" sem ter de abrir marco por marco.

   O que ela tem, e por quê:

   - **Busca geral** — varre todo o texto do item (Store.textoBusca), não só o
     número. Achar pelo certificado ou por um trecho do Arch Answer é o caso
     de uso real: quase nunca se lembra do número.
   - **Filtros** — os mesmos do Resumo (Summary.passa), mais o marco. Um filtro
     que existisse só aqui divergiria do que o resumo conta.
   - **Colunas escolhidas e reordenadas** — cada pessoa olha para uma coisa
     diferente, e a escolha fica no navegador de quem escolheu (é preferência
     de quem está sentado aqui, não do relatório: pelo mesmo motivo da
     Conversa e do item preso ao lado).
   - **Excel de verdade** (xlsx.js), com os filtros já armados e o cabeçalho
     congelado. O CSV continua ao lado para quem quiser o texto cru.

   Ordenar aqui **não mexe na ordem do PDF**: `project.ordem` continua sendo
   quem manda no relatório. Esta tabela é leitura.
   ========================================================================== */

(function (global) {
  'use strict';

  var CHAVE = 'derrogacao:tabela';     /* preferências de quem usa este navegador */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function txt(v) { return (v == null ? '' : String(v)).trim(); }

  function dataCurta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
  }

  /* Os anexos iam para a planilha só como número — "3 anexos, 5 imagens" —, e
     com isso o que estava escrito dentro deles (a referência, a observação, a
     legenda de cada foto) não saía em lugar nenhum. Quem exporta a tabela
     quer o waiver inteiro; a foto não vai, mas o texto dela pode ir. Cada
     anexo vira um pedaço separado por " | ", na ordem em que está no item. */
  function juntar(lista) {
    return (lista || []).map(txt).filter(Boolean).join(' | ');
  }

  function refsDeAnexo(item) {
    return juntar((item.evidence || []).map(function (e) { return e.ref; }));
  }

  function notasDeAnexo(item) {
    return juntar((item.evidence || []).map(function (e) { return e.note; }));
  }

  function legendasDeImagem(item) {
    var out = [];
    (item.evidence || []).forEach(function (e) {
      (e.images || []).forEach(function (im) { out.push(im.caption); });
    });
    return juntar(out);
  }

  function contarImagens(item) {
    return (item.evidence || []).reduce(function (a, e) {
      return a + ((e.images || []).length);
    }, 0);
  }

  /* ---------------------------------------------------------------------- */
  /* as colunas                                                             */
  /* ---------------------------------------------------------------------- */

  /* `larg` é a largura na planilha (em caracteres, como o Excel conta);
     `num` diz que a coluna é número — ordena como número e vai para a
     planilha como número, não como texto. */
  var COLUNAS = [
    { id: 'marco', titulo: 'Marco', larg: 18, valor: function (r) { return r.marco; } },
    { id: 'tipo', titulo: 'Tipo', larg: 7, valor: function (r) { return r.kind === 'dev' ? 'DEV' : 'NCR'; } },
    { id: 'ncrId', titulo: 'Número', larg: 18, valor: function (r) { return txt(r.item.ncrId); } },
    { id: 'systems', titulo: 'Sistemas', larg: 14, valor: function (r) { return txt(r.item.systems); } },
    { id: 'func', titulo: 'Função / descrição', larg: 34, valor: function (r) { return txt(r.item.func); } },
    { id: 'situacao', titulo: 'Situação (controle interno)', larg: 22, valor: function (r) { return Summary.situacao(r.item); } },
    { id: 'archStatus', titulo: 'Arch Status', larg: 22, valor: function (r) { return txt(r.item.archStatus); } },
    { id: 'requestExpiry', titulo: 'Request Expiry', larg: 16, valor: function (r) { return txt(r.item.requestExpiry); } },
    { id: 'approvedExpiry', titulo: 'Approved Expiry', larg: 16, valor: function (r) { return txt(r.item.approvedExpiry); } },
    { id: 'caminho', titulo: 'Caminho do waiver', larg: 30, valor: function (r) { return caminhoDe(r); } },
    /* As três colunas da trajetória. Lidas ao lado da coluna "Marco", elas
       dizem a linha inteira de um relance:

           Veio de   |  Marco  |  Vai para  |  Já levada?
             J06     |   J08   |    J09     |     não

       "Veio de" sai do Waiver Historic (a última seta do texto é sempre a
       chegada neste marco). "Vai para" sai do documento — Approved Expiry, e
       na falta dele o Request Expiry —, porque o histórico não sabe do
       futuro. Ver o comentário grande em herdar.js. */
    { id: 'salto', titulo: 'Veio de', larg: 14, valor: function (r) {
      var s = Fluxo.ultimoSalto(fluxoDe(r));
      return s ? s.de : '';
    } },
    { id: 'destino', titulo: 'Vai para', larg: 14, valor: function (r) {
      var a = avancoDe(r);
      return a.destino ? a.destino.rotulo : '';
    } },
    { id: 'levada', titulo: 'Já levada?', larg: 14, valor: function (r) {
      var a = avancoDe(r);
      if (a.estado === 'levada') return 'sim';
      /* "não" só quando já é hora: enquanto o waiver não foi aceito não há
         o que levar, e um "não" ali seria cobrança de uma coisa que ainda
         não venceu. */
      if (!r.item.done) return '';
      if (a.estado === 'aLevar') return 'não';
      if (a.estado === 'semRelatorio') return 'não — falta criar o relatório';
      return '';
    } },
    { id: 'herdadoDe', titulo: 'Herdada do marco', larg: 16, valor: function (r) { return txt(r.item.herdadoDe); } },
    { id: 'herdadoEm', titulo: 'Herdada em', larg: 14, valor: function (r) { return dataCurta(r.item.herdadoEm); },
      ordenar: function (r) { return txt(r.item.herdadoEm); } },
    { id: 'historic', titulo: 'Waiver Historic', larg: 30, longo: true, valor: function (r) { return txt(r.item.historic); } },
    { id: 'description', titulo: 'Description', larg: 46, longo: true, valor: function (r) { return txt(r.item.description); } },
    { id: 'currentSituation', titulo: 'Current Situation', larg: 46, longo: true, valor: function (r) { return txt(r.item.currentSituation); } },
    { id: 'whyNotPossible', titulo: 'Why not possible', larg: 46, longo: true, valor: function (r) { return txt(r.item.whyNotPossible); } },
    { id: 'arguments', titulo: 'Arguments', larg: 46, longo: true, valor: function (r) { return txt(r.item.arguments); } },
    { id: 'archAnswer', titulo: 'Arch Answer', larg: 46, longo: true, valor: function (r) { return txt(r.item.archAnswer); } },
    { id: 'nota', titulo: 'Observação interna', larg: 40, longo: true, valor: function (r) { return txt(r.item.nota); } },
    { id: 'certificates', titulo: 'Certificados', larg: 26, valor: function (r) { return (r.item.certificates || []).join(' | '); } },
    { id: 'evidencias', titulo: 'Anexos', larg: 9, num: true, valor: function (r) { return (r.item.evidence || []).length; } },
    { id: 'imagens', titulo: 'Imagens', larg: 9, num: true, valor: function (r) { return contarImagens(r.item); } },
    { id: 'evidRefs', titulo: 'Anexos (referência)', larg: 30, longo: true, valor: function (r) { return refsDeAnexo(r.item); } },
    { id: 'evidNotas', titulo: 'Anexos (observação)', larg: 40, longo: true, valor: function (r) { return notasDeAnexo(r.item); } },
    { id: 'legendas', titulo: 'Legendas das imagens', larg: 40, longo: true, valor: function (r) { return legendasDeImagem(r.item); } },
    { id: 'editedBy', titulo: 'Alterado por', larg: 18, valor: function (r) { return txt(r.item.editedBy); } },
    /* 17 e não 14: com 14 a data 16/09/2026 partia em duas linhas na folha */
    { id: 'editedAt', titulo: 'Alterado em', larg: 17, valor: function (r) { return dataCurta(r.item.editedAt); },
      /* a data ordena pelo ISO, senão 01/12 viria antes de 02/03 */
      ordenar: function (r) { return txt(r.item.editedAt); } },
    { id: 'dias', titulo: 'Dias sem edição', larg: 14, num: true, valor: function (r) {
      var d = Summary.diasSemMexer(r.item);
      return d === null ? '' : d;
    } }
  ];

  /* O que aparece de saída: o suficiente para achar um item e saber em que pé
     ele está. O resto está a um clique em "Colunas" — esconder é mais fácil
     de desfazer do que uma tabela que já nasce ilegível de tão larga. */
  var PADRAO = ['marco', 'tipo', 'ncrId', 'systems', 'func',
    'salto', 'destino', 'levada', 'situacao'];

  function colunaPorId(id) {
    return COLUNAS.filter(function (c) { return c.id === id; })[0] || null;
  }

  /** As colunas escolhidas, na ordem escolhida, sem ids que não existem mais. */
  function colunasDe(estado) {
    var ids = (estado && estado.colunas) || PADRAO;
    var out = [];
    ids.forEach(function (id) {
      var c = colunaPorId(id);
      if (c && out.indexOf(c) < 0) out.push(c);
    });
    return out.length ? out : PADRAO.map(colunaPorId);
  }

  function caminhoDe(r) {
    if (r.caminhoTxt == null) r.caminhoTxt = Fluxo.caminhoTexto(fluxoDe(r));
    return r.caminhoTxt;
  }

  function fluxoDe(r) {
    if (!r.fluxo) r.fluxo = Fluxo.analisar(r.item.historic);
    return r.fluxo;
  }

  /* Guardado na linha: três colunas perguntam a mesma coisa, e a conta varre
     todos os relatórios atrás da cópia. */
  function avancoDe(r) {
    if (!r.avanco) {
      r.avanco = Herdar.avanco(r.projeto, r.item, r.kind, r.todos || [r.projeto]);
    }
    return r.avanco;
  }

  /* ---------------------------------------------------------------------- */
  /* linhas, filtros e ordenação                                            */
  /* ---------------------------------------------------------------------- */

  /** Uma linha por item de cada relatório, na ordem do PDF de cada um. */
  function linhas(projects) {
    var out = [];
    (projects || []).forEach(function (p) {
      ['ncr', 'dev'].forEach(function (kind) {
        var marco = Report.marcoOf(p, kind) || p.name || 'sem marco';
        Store.ordenar(p, kind).forEach(function (item) {
          out.push({ projeto: p, projetoId: p.id, marco: marco, kind: kind,
                     item: item, todos: projects });
        });
      });
    });
    return out;
  }

  var VAZIO = { marco: '', tipo: '', situacao: '', sistema: '', archStatus: '',
                evidencia: '', busca: '', parados: false, comNota: false };

  function algumFiltro(f) {
    if (!f) return false;
    return !!(txt(f.marco) || txt(f.tipo) || txt(f.situacao) || txt(f.sistema) ||
      txt(f.archStatus) || txt(f.evidencia) || txt(f.busca) || f.parados || f.comNota);
  }

  function passa(r, f) {
    if (!f) return true;
    if (txt(f.marco) && r.projetoId !== f.marco) return false;
    if (f.parados && !Summary.estaParado(r.item)) return false;
    if (f.comNota && !txt(r.item.nota)) return false;
    /* os demais são exatamente os do Resumo: um filtro com o mesmo nome tem
       de recortar a mesma coisa nas duas abas */
    return Summary.passa(r, f);
  }

  function ordenar(lista, ordem) {
    if (!ordem || !ordem.id) return lista;
    var col = colunaPorId(ordem.id);
    if (!col) return lista;
    var dir = ordem.dir === 'desc' ? -1 : 1;
    var chave = col.ordenar || col.valor;
    /* cópia: a lista de origem é a ordem do PDF, e reordenar no lugar
       mudaria o que a outra aba mostra */
    return lista.slice().sort(function (a, b) {
      var va = chave(a), vb = chave(b);
      if (col.num) {
        var na = va === '' || va == null ? -1 : Number(va);
        var nb = vb === '' || vb == null ? -1 : Number(vb);
        return (na - nb) * dir;
      }
      return Store.cmpTexto(String(va == null ? '' : va), String(vb == null ? '' : vb)) * dir;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* preferências de quem usa este navegador                                */
  /* ---------------------------------------------------------------------- */

  function lerEstado() {
    var base = {
      colunas: PADRAO.slice(),
      ordem: { id: 'marco', dir: 'asc' },
      novas: ['salto', 'destino', 'levada'],
      filtros: {}
    };
    try {
      var cru = global.localStorage.getItem(CHAVE);
      if (!cru) return base;
      var o = JSON.parse(cru);
      if (o && Array.isArray(o.colunas) && o.colunas.length) {
        base.colunas = o.colunas.filter(colunaPorId);
        if (!base.colunas.length) base.colunas = PADRAO.slice();
      }
      if (o && o.ordem && colunaPorId(o.ordem.id)) base.ordem = o.ordem;
      /* Coluna nova numa versão nova: quem já tinha uma escolha guardada não
         a veria nunca, e reclamaria com razão que a coluna "não veio". Uma
         vez só, e anotado — quem tirar a coluna depois não a recebe de volta
         na abertura seguinte. */
      base.novas = (o && o.novas) || [];
      ['salto', 'destino', 'levada'].forEach(function (id) {
        if (base.novas.indexOf(id) >= 0) return;
        base.novas = base.novas.concat([id]);
        if (base.colunas.indexOf(id) >= 0) return;
        var onde = base.colunas.indexOf('situacao');
        base.colunas.splice(onde < 0 ? base.colunas.length : onde, 0, id);
      });
    } catch (e) { /* preferência ilegível não impede a aba de abrir */ }
    return base;
  }

  /* Só colunas e ordenação: o filtro é do momento, e reabrir o programa com
     uma busca velha aplicada esconderia itens sem a pessoa entender por quê. */
  function gravarEstado(estado) {
    try {
      global.localStorage.setItem(CHAVE, JSON.stringify({
        colunas: estado.colunas, ordem: estado.ordem, novas: estado.novas || []
      }));
    } catch (e) { /* sem espaço: a aba funciona igual, só não lembra */ }
  }

  /* ---------------------------------------------------------------------- */
  /* desenho                                                                */
  /* ---------------------------------------------------------------------- */

  function campoSelect(rotulo, valor, opcoes, aoMudar, largo) {
    var campo = el('div', 'sm-bar-field' + (largo ? '' : ' sm-bar-field--curto'));
    campo.appendChild(el('label', null, rotulo));
    var sel = document.createElement('select');
    opcoes.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.valor;
      op.textContent = o.nome;
      sel.appendChild(op);
    });
    sel.value = valor || '';
    /* o rótulo fica acima, sem `for`: o leitor de tela precisa ouvir o nome
       do campo junto com o valor */
    sel.setAttribute('aria-label', rotulo);
    sel.addEventListener('change', function () { aoMudar(sel.value); });
    campo.appendChild(sel);
    return campo;
  }

  /** O painel de colunas: o que aparece, e em que ordem. */
  function painelColunas(estado, mudou) {
    var box = el('details', 'tb-colunas');
    /* a aba se redesenha a cada clique daqui de dentro: sem lembrar que o
       painel estava aberto, ele fecharia na cara de quem acabou de usá-lo */
    box.open = !!estado.painelAberto;
    box.addEventListener('toggle', function () { estado.painelAberto = box.open; });
    var cab = el('summary', null, 'Colunas (' + estado.colunas.length + ' de ' + COLUNAS.length + ')');
    box.appendChild(cab);

    var dica = el('p', 'hint', 'Marque o que quer ver. As setas mudam a ordem das ' +
      'colunas — na tela, no Excel e no PDF. A escolha fica neste navegador. ' +
      '“Mostrar todas” leva o waiver inteiro para o Excel; no PDF, acima de ' +
      'umas dez colunas a folha fica apertada mesmo deitada.');
    box.appendChild(dica);

    var lista = el('div', 'tb-col-lista');

    /* primeiro as escolhidas, na ordem delas; depois o resto */
    var escolhidas = colunasDe(estado);
    var resto = COLUNAS.filter(function (c) { return escolhidas.indexOf(c) < 0; });

    escolhidas.forEach(function (c, i) {
      lista.appendChild(linhaDeColuna(c, true, i, escolhidas.length, estado, mudou));
    });
    resto.forEach(function (c) {
      lista.appendChild(linhaDeColuna(c, false, -1, escolhidas.length, estado, mudou));
    });
    box.appendChild(lista);

    var pe = el('div', 'tb-col-pe');
    var bp = el('button', 'btn btn--sm', 'Voltar ao padrão');
    bp.type = 'button';
    bp.addEventListener('click', function () {
      estado.colunas = PADRAO.slice();
      mudou(true);
    });
    pe.appendChild(bp);
    var bt = el('button', 'btn btn--sm', 'Mostrar todas');
    bt.type = 'button';
    bt.addEventListener('click', function () {
      estado.colunas = COLUNAS.map(function (c) { return c.id; });
      mudou(true);
    });
    pe.appendChild(bt);
    box.appendChild(pe);
    return box;
  }

  function linhaDeColuna(col, marcada, i, total, estado, mudou) {
    var linha = el('div', 'tb-col-item' + (marcada ? ' is-on' : ''));

    var lab = el('label', null);
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = marcada;
    cb.addEventListener('change', function () {
      if (cb.checked) {
        if (estado.colunas.indexOf(col.id) < 0) estado.colunas.push(col.id);
      } else {
        /* uma tabela sem coluna nenhuma não é tabela */
        if (estado.colunas.length <= 1) { cb.checked = true; return; }
        estado.colunas = estado.colunas.filter(function (id) { return id !== col.id; });
      }
      mudou(true);
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + col.titulo));
    linha.appendChild(lab);

    if (marcada) {
      var acoes = el('span', 'tb-col-setas');
      [['↑', -1, i > 0], ['↓', 1, i < total - 1]].forEach(function (a) {
        var b = el('button', 'btn btn--sm btn--quiet', a[0]);
        b.type = 'button';
        b.disabled = !a[2];
        b.title = (a[1] < 0 ? 'Mover para a esquerda' : 'Mover para a direita') +
          ' — ' + col.titulo;
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', function () {
          var ids = estado.colunas.slice();
          var de = ids.indexOf(col.id);
          var para = de + a[1];
          if (de < 0 || para < 0 || para >= ids.length) return;
          ids.splice(para, 0, ids.splice(de, 1)[0]);
          estado.colunas = ids;
          mudou(true);
        });
        acoes.appendChild(b);
      });
      linha.appendChild(acoes);
    }
    return linha;
  }

  /**
   * Desenha a aba inteira.
   *
   * @param host     onde desenhar
   * @param projects todos os relatórios deste navegador
   * @param estado   { colunas, ordem, filtros } — alterado no lugar
   * @param acoes    { onMudou, abrir, onXlsx, onCsv, onPdf }
   */
  function render(host, projects, estado, acoes) {
    host.innerHTML = '';
    acoes = acoes || {};
    estado.filtros = estado.filtros || {};
    var f = estado.filtros;

    var todas = linhas(projects);
    var visiveis = ordenar(todas.filter(function (r) { return passa(r, f); }), estado.ordem);
    var cols = colunasDe(estado);

    function mudou(gravar) {
      if (gravar) gravarEstado(estado);
      if (acoes.onMudou) acoes.onMudou();
    }

    /* --- barra: o que está à vista e como levar embora --- */
    var barra = el('div', 'sm-bar');
    var info = el('div', 'fx-info');
    info.appendChild(el('strong', null,
      visiveis.length + ' de ' + todas.length + ' item(ns) · ' +
      (projects || []).length + ' relatório(s)'));
    info.appendChild(el('span', null,
      'Todos os marcos deste navegador, NCR e DEV. Clique numa linha para abrir o item.'));
    barra.appendChild(info);

    var acs = el('div', 'sm-bar-actions');
    var bx = el('button', 'btn btn--sm btn--primary', '⤓ Exportar Excel');
    bx.type = 'button';
    bx.title = 'Planilha .xlsx com as colunas e o recorte que estão à vista';
    bx.addEventListener('click', function () {
      if (acoes.onXlsx) acoes.onXlsx(visiveis, cols, f);
    });
    acs.appendChild(bx);

    var bc = el('button', 'btn btn--sm', 'CSV');
    bc.type = 'button';
    bc.title = 'O mesmo recorte em texto separado por ponto e vírgula';
    bc.addEventListener('click', function () {
      if (acoes.onCsv) acoes.onCsv(visiveis, cols, f);
    });
    acs.appendChild(bc);

    var bp = el('button', 'btn btn--sm', 'PDF');
    bp.type = 'button';
    bp.title = 'A mesma tabela em folhas A4';
    bp.addEventListener('click', function () {
      if (acoes.onPdf) acoes.onPdf(visiveis, cols, f);
    });
    acs.appendChild(bp);
    barra.appendChild(acs);
    host.appendChild(barra);

    /* --- filtros --- */
    var fb = el('div', 'sm-filtros');

    var busca = el('div', 'sm-bar-field');
    busca.appendChild(el('label', null, 'Buscar em todos os relatórios'));
    var inp = document.createElement('input');
    inp.type = 'search';
    inp.id = 'tabelaBusca';
    inp.setAttribute('aria-label', 'Buscar em todos os relatórios');
    inp.value = f.busca || '';
    inp.placeholder = 'número, sistema, certificado, qualquer texto do item…';
    inp.addEventListener('input', function () {
      f.busca = inp.value;
      mudou(false);
    });
    busca.appendChild(inp);
    fb.appendChild(busca);

    var marcos = [{ valor: '', nome: 'todos os marcos' }].concat(
      (projects || []).map(function (p) {
        return {
          valor: p.id,
          nome: (p.marco || p.name || 'sem marco') +
            ' (' + (p.ncrs.length + p.devs.length) + ')'
        };
      }));
    fb.appendChild(campoSelect('Marco', f.marco, marcos, function (v) {
      f.marco = v; mudou(false);
    }, true));

    fb.appendChild(campoSelect('Tipo', f.tipo, [
      { valor: '', nome: 'NCR e DEV' },
      { valor: 'ncr', nome: 'só NCR' },
      { valor: 'dev', nome: 'só DEV' }
    ], function (v) { f.tipo = v; mudou(false); }));

    fb.appendChild(campoSelect('Situação', f.situacao,
      [{ valor: '', nome: 'todas' }].concat(Summary.SITUACOES.map(function (s) {
        return { valor: s, nome: s };
      })), function (v) { f.situacao = v; mudou(false); }));

    var op = Summary.opcoesDe(projects);
    fb.appendChild(campoSelect('Sistema', f.sistema,
      [{ valor: '', nome: 'todos' }].concat(op.sistemas.map(function (s) {
        return { valor: s.valor, nome: s.valor + ' (' + s.n + ')' };
      })), function (v) { f.sistema = v; mudou(false); }));

    fb.appendChild(campoSelect('Arch Status', f.archStatus,
      [{ valor: '', nome: 'todos' }].concat(op.archStatus.map(function (s) {
        return { valor: s.valor, nome: s.valor + ' (' + s.n + ')' };
      })), function (v) { f.archStatus = v; mudou(false); }));

    fb.appendChild(campoSelect('Evidência', f.evidencia, [
      { valor: '', nome: 'tanto faz' },
      { valor: 'com', nome: 'só com anexo' },
      { valor: 'sem', nome: 'só sem anexo' }
    ], function (v) { f.evidencia = v; mudou(false); }));

    var fim = el('div', 'sm-filtros-fim');
    var par = el('label', 'fx-check');
    var cbp = document.createElement('input');
    cbp.type = 'checkbox';
    cbp.checked = !!f.parados;
    cbp.addEventListener('change', function () { f.parados = cbp.checked; mudou(false); });
    par.appendChild(cbp);
    par.appendChild(document.createTextNode(' só parados (' + Summary.DIAS_PARADO + '+ dias)'));
    fim.appendChild(par);

    var nota = el('label', 'fx-check');
    var cbn = document.createElement('input');
    cbn.type = 'checkbox';
    cbn.checked = !!f.comNota;
    cbn.addEventListener('change', function () { f.comNota = cbn.checked; mudou(false); });
    nota.appendChild(cbn);
    nota.appendChild(document.createTextNode(' 📝 só com observação'));
    fim.appendChild(nota);

    if (algumFiltro(f)) {
      var limpar = el('button', 'btn btn--sm', 'Limpar filtros');
      limpar.type = 'button';
      limpar.addEventListener('click', function () {
        estado.filtros = {};
        mudou(false);
      });
      fim.appendChild(limpar);
    }
    fb.appendChild(fim);
    host.appendChild(fb);

    host.appendChild(painelColunas(estado, mudou));

    /* --- a tabela --- */
    var caixa = el('div', 'tb-caixa');
    var tab = el('table', 'tb-tabela');
    var thead = el('thead');
    var trh = el('tr');
    cols.forEach(function (c) {
      var th = el('th', c.num ? 'is-num' : null);
      var b = el('button', 'tb-ord', c.titulo);
      b.type = 'button';
      var ativa = estado.ordem && estado.ordem.id === c.id;
      var dir = ativa ? estado.ordem.dir : '';
      if (ativa) {
        b.appendChild(el('span', 'tb-ord-seta', dir === 'desc' ? ' ▼' : ' ▲'));
        th.setAttribute('aria-sort', dir === 'desc' ? 'descending' : 'ascending');
      }
      b.title = 'Ordenar por ' + c.titulo +
        '\nNão altera a ordem do relatório nem a do PDF.';
      b.addEventListener('click', function () {
        estado.ordem = { id: c.id, dir: (ativa && dir === 'asc') ? 'desc' : 'asc' };
        mudou(true);
      });
      th.appendChild(b);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    tab.appendChild(thead);

    var tbody = el('tbody');
    visiveis.forEach(function (r) {
      var tr = el('tr');
      tr.tabIndex = 0;
      tr.setAttribute('role', 'link');
      tr.title = 'Abrir ' + (r.item.ncrId || 'este item') + ' no relatório ' + r.marco;
      if (r.item.done) tr.className = 'is-aceito';
      cols.forEach(function (c) {
        var td = el('td', (c.num ? 'is-num' : '') + (c.longo ? ' is-longo' : ''));
        var v = c.valor(r);
        td.textContent = (v === '' || v == null) ? '—' : v;
        if (c.longo && v) td.title = v;
        tr.appendChild(td);
      });
      function abrir() { if (acoes.abrir) acoes.abrir(r); }
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
      });
      tbody.appendChild(tr);
    });
    tab.appendChild(tbody);
    caixa.appendChild(tab);

    if (!visiveis.length) {
      caixa.appendChild(el('p', 'sm-empty', todas.length
        ? 'Nenhum item passa neste recorte. Tente limpar os filtros.'
        : 'Nenhum item em nenhum relatório ainda.'));
    }
    host.appendChild(caixa);
  }

  /** O recorte em texto, para dizer no PDF e na planilha o que está ali. */
  function descricaoDoFiltro(f, projects) {
    if (!algumFiltro(f)) return '';
    var ditos = [];
    if (txt(f.marco)) {
      var p = (projects || []).filter(function (x) { return x.id === f.marco; })[0];
      ditos.push('marco: ' + (p ? (p.marco || p.name) : f.marco));
    }
    if (txt(f.tipo)) ditos.push('tipo: ' + (f.tipo === 'dev' ? 'DEV' : 'NCR'));
    if (txt(f.situacao)) ditos.push('situação: ' + f.situacao);
    if (txt(f.sistema)) ditos.push('sistema: ' + f.sistema);
    if (txt(f.archStatus)) ditos.push('arch status: ' + f.archStatus);
    if (txt(f.evidencia)) ditos.push(f.evidencia === 'com' ? 'só com anexo' : 'só sem anexo');
    if (f.parados) ditos.push('parados há ' + Summary.DIAS_PARADO + '+ dias');
    if (f.comNota) ditos.push('só com observação interna');
    if (txt(f.busca)) ditos.push('texto: “' + txt(f.busca) + '”');
    return ditos.join(' · ');
  }

  /**
   * O mesmo recorte em CSV. A proteção contra campo que começa por "=" é a
   * do resumo (SummaryView.csvCampo) — uma segunda cópia da regra é uma
   * cópia a menos de chance de ela continuar certa.
   */
  function toCsv(lista, cols) {
    var esc = SummaryView.csvCampo;
    var cab = cols.map(function (c) { return esc(c.titulo); }).join(';');
    var corpo = (lista || []).map(function (r) {
      return cols.map(function (c) {
        var v = c.valor(r);
        /* quebra de linha dentro da célula estoura a linha do CSV */
        return esc(String(v == null ? '' : v).replace(/\r?\n/g, ' / '));
      }).join(';');
    });
    /* BOM para o Excel reconhecer os acentos */
    return '\ufeff' + cab + '\n' + corpo.join('\n');
  }

  /** As linhas à vista viradas em matriz de valores, para a planilha. */
  function valores(lista, cols) {
    return (lista || []).map(function (r) {
      return cols.map(function (c) {
        var v = c.valor(r);
        if (c.num) return (v === '' || v == null) ? '' : Number(v);
        return v == null ? '' : String(v);
      });
    });
  }

  global.Tabela = {
    COLUNAS: COLUNAS,
    PADRAO: PADRAO,
    VAZIO: VAZIO,
    linhas: linhas,
    passa: passa,
    ordenar: ordenar,
    colunasDe: colunasDe,
    algumFiltro: algumFiltro,
    descricaoDoFiltro: descricaoDoFiltro,
    valores: valores,
    toCsv: toCsv,
    lerEstado: lerEstado,
    gravarEstado: gravarEstado,
    render: render,
    el: el
  };
})(window);
