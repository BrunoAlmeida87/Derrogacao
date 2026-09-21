/* ==========================================================================
   painel.js — o painel de um marco: tudo o que está indo para ele
   --------------------------------------------------------------------------
   A aba Fluxos responde "por onde passou". Esta é a pergunta do outro lado
   do balcão, e é a que se leva para a reunião: **o que está chegando no
   J09?** Quantos itens, vindos de onde, em que pé estão, e quais são.

   O recorte é uma regra só: entra no painel o item cujo Waiver Historic tem
   uma seta que **termina** no marco escolhido (`Fluxo.chegaEm`). Passar pelo
   marco no meio do caminho não conta — quem já saiu do J08 não está indo
   para o J08 —, e é isso que faz o painel do J09 ser o J09 e não "tudo o que
   um dia encostou no J09".

   Os itens vêm de **todos os relatórios deste navegador**, porque é disso
   que a pergunta trata: o que chega no J09 vem do J08, do J06, do RANAE.
   Olhar só o relatório aberto responderia a pergunta errada.

   O desenho é SVG escrito à mão, como o resto do programa: sem biblioteca,
   imprime em vetor e funciona com o arquivo aberto direto do disco. E a
   folha usa a paginação do relatório (`Report.paginar`), então uma lista de
   quarenta itens atravessa as folhas com o cabeçalho repetido, em vez de
   terminar colada na borda do papel.
   ========================================================================== */

(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function texto(v) { return (v == null ? '' : String(v)).trim(); }
  function pct(n, total) { return total ? Math.round((n / total) * 100) + '%' : '0%'; }

  /* ---------------------------------------------------------------------- */
  /* apuração                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Todos os itens deste navegador, com o fluxo já lido uma vez.
   *
   * Existe para o `Fluxo.analisar` de cada item rodar **uma vez** por
   * desenho: o seletor de marcos pergunta por todos os destinos, e refazer a
   * leitura do texto a cada pergunta seria o mesmo trabalho N vezes.
   */
  function base(projects) {
    var out = [];
    (projects || []).forEach(function (p) {
      ['ncr', 'dev'].forEach(function (kind) {
        var marco = Report.marcoOf(p, kind) || p.name || 'sem marco';
        var daqui = Fluxo.marco(marco);
        Store.ordenar(p, kind).forEach(function (item) {
          out.push({
            projeto: p, projetoId: p.id, marco: marco, kind: kind, item: item,
            fluxo: Fluxo.analisar(item.historic),
            daqui: daqui
          });
        });
      });
    });
    return out;
  }

  /**
   * Os marcos que aparecem como **destino** de alguma seta escrita, com
   * quantos itens o painel de cada um mostraria. A contagem sai da mesma
   * função que monta a lista (descontando as repetições), senão o seletor
   * diria "J09 (7)" e a folha abaixo mostraria seis.
   */
  function marcosDeDestino(projects) {
    var b = base(projects);
    var vistos = {};
    var lista = [];
    b.forEach(function (r) {
      if (r.fluxo.vazio) return;
      r.fluxo.arestas.forEach(function (a) {
        var no = null;
        r.fluxo.nos.forEach(function (n) { if (n.chave === a.para) no = n; });
        if (!no || vistos[no.chave]) return;
        vistos[no.chave] = { chave: no.chave, rotulo: no.rotulo, pos: no.pos, n: 0 };
        lista.push(vistos[no.chave]);
      });
    });
    lista.forEach(function (m) { m.n = daBase(b, m.chave).length; });
    lista.sort(function (a, b2) { return (a.pos - b2.pos) || Store.cmpTexto(a.rotulo, b2.rotulo); });
    return lista;
  }

  /**
   * As linhas do painel: um item por linha, de qualquer relatório, cujo
   * fluxo tenha uma seta terminando no marco escolhido.
   *
   * Uma NCR que já foi levada adiante existe duas vezes neste navegador — a
   * do marco anterior, aceita, e a cópia que chegou aqui, em preenchimento —
   * e as duas dizem "vou para o J09". No painel elas são **uma linha só**:
   * a cópia que já está no marco, porque é ela que ainda dá trabalho. O
   * pareamento é o de sempre: o número, dentro do tipo. A que sobrou guarda
   * `jaChegou`, que é o que separa "já está aqui" de "ainda tenho de trazer".
   */
  function linhas(projects, chave) {
    return daBase(base(projects), chave);
  }

  function daBase(b, chave) {
    var out = [];
    if (!chave) return out;
    b.forEach(function (r) {
      var chega = Fluxo.chegaEm(r.fluxo, chave);
      if (!chega) return;
      out.push({
        projeto: r.projeto, projetoId: r.projetoId, marco: r.marco, kind: r.kind,
        item: r.item, fluxo: r.fluxo, veioDe: chega.de,
        /* o item mora no relatório do próprio marco do painel? */
        jaChegou: !!(r.daqui && r.daqui.chave === chave)
      });
    });
    out = semRepetir(out);
    /* de onde vem primeiro, e dentro disso pelo número: a lista é lida
       procurando "o que o J08 está me mandando" */
    out.sort(function (a, b) {
      return Store.cmpTexto(a.veioDe, b.veioDe) ||
        Store.cmpTexto(texto(a.item.ncrId), texto(b.item.ncrId));
    });
    return out;
  }

  /** Uma linha por número: a que já está no marco ganha da que ainda vem. */
  function semRepetir(rows) {
    var por = {};
    var ordem = [];
    rows.forEach(function (r) {
      var k = r.kind + '\u0000' + Store.numeroChave(r.item);
      if (!Store.numeroChave(r.item)) { ordem.push(r); return; }  /* sem número, sem par */
      var tem = por[k];
      if (!tem) { por[k] = r; ordem.push(r); return; }
      if (r.jaChegou && !tem.jaChegou) {
        /* fica a cópia que chegou, mas lembrando de onde ela veio */
        r.veioDe = r.veioDe || tem.veioDe;
        ordem[ordem.indexOf(tem)] = r;
        por[k] = r;
      }
    });
    return ordem;
  }

  /** Os números da folha. */
  function apurar(rows, chave) {
    var st = {
      total: rows.length, ncr: 0, dev: 0, aceitos: 0, parados: 0, herdados: 0,
      jaChegaram: 0, aTrazer: 0,
      porSituacao: {}, porOrigem: {}, porSistema: {}, origens: 0
    };
    Store.STATUS.forEach(function (o) { st.porSituacao[o.nome] = 0; });
    rows.forEach(function (r) {
      if (r.kind === 'dev') st.dev++; else st.ncr++;
      if (r.item.done) st.aceitos++;
      if (Summary.estaParado(r.item)) st.parados++;
      if (texto(r.item.herdadoDe)) st.herdados++;
      if (r.jaChegou) st.jaChegaram++;
      /* aceito no marco anterior e ainda não copiado para cá: é a lista de
         tarefas do marco — o que falta trazer, um por um */
      else if (r.item.done) st.aTrazer++;
      st.porSituacao[Summary.situacao(r.item)]++;
      var o = texto(r.veioDe) || '(início do caminho)';
      st.porOrigem[o] = (st.porOrigem[o] || 0) + 1;
      Summary.sistemas(r.item).forEach(function (x) {
        st.porSistema[x] = (st.porSistema[x] || 0) + 1;
      });
    });
    st.origens = Object.keys(st.porOrigem).length;
    st.pendentes = st.total - st.aceitos;
    st.chave = chave;
    return st;
  }

  /* ---------------------------------------------------------------------- */
  /* desenho                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Rosca da situação. Por que rosca e não mais uma barra: a folha já tem
   * duas barras horizontais, e a parte-todo de quatro fatias é a única coisa
   * do painel que se lê de longe, do outro lado da mesa de reunião.
   * Cada fatia leva o próprio número ao lado, na legenda — anel sem rótulo
   * obriga a medir ângulo a olho, e isso não é leitura.
   */
  function rosca(st) {
    var R = 54, r = 34, CX = 70, CY = 70;
    var fatias = Store.STATUS.map(function (o) {
      return { nome: o.nome, cor: o.cor, valor: st.porSituacao[o.nome] || 0 };
    }).filter(function (f) { return f.valor > 0; });

    var wrap = el('div', 'pn-rosca');
    var svg = sv('svg', {
      viewBox: '0 0 140 140', width: '140', height: '140',
      role: 'img', class: 'pn-rosca-svg'
    });
    svg.appendChild(sv('title', {})).textContent = 'Situação dos itens que vão para ' +
      (st.chave || 'o marco');

    if (!st.total) {
      svg.appendChild(sv('circle', { cx: CX, cy: CY, r: (R + r) / 2, fill: 'none',
        stroke: Summary.NEUTRO, 'stroke-width': R - r }));
    } else if (fatias.length === 1) {
      /* um arco de 360° não fecha com path: vira círculo */
      svg.appendChild(sv('circle', { cx: CX, cy: CY, r: (R + r) / 2, fill: 'none',
        stroke: fatias[0].cor, 'stroke-width': R - r }));
    } else {
      var ini = -Math.PI / 2;
      fatias.forEach(function (f) {
        var ang = (f.valor / st.total) * Math.PI * 2;
        svg.appendChild(arco(CX, CY, R, r, ini, ini + ang, f.cor, f.nome + ': ' + f.valor));
        ini += ang;
      });
    }

    var centro = sv('text', { x: CX, y: CY - 2, 'text-anchor': 'middle', class: 'pn-rosca-num' });
    centro.textContent = String(st.total);
    svg.appendChild(centro);
    var sob = sv('text', { x: CX, y: CY + 16, 'text-anchor': 'middle', class: 'pn-rosca-sub' });
    sob.textContent = st.total === 1 ? 'item' : 'itens';
    svg.appendChild(sob);
    wrap.appendChild(svg);

    var leg = el('ul', 'pn-leg');
    Store.STATUS.forEach(function (o) {
      var v = st.porSituacao[o.nome] || 0;
      var li = el('li', 'pn-leg-item' + (v ? '' : ' is-zero'));
      var dot = el('span', 'pn-leg-dot');
      dot.style.background = o.cor;
      li.appendChild(dot);
      li.appendChild(el('span', 'pn-leg-nome', o.nome));
      li.appendChild(el('strong', 'pn-leg-n', String(v)));
      li.appendChild(el('span', 'pn-leg-pct', pct(v, st.total)));
      leg.appendChild(li);
    });
    wrap.appendChild(leg);
    return wrap;
  }

  /** Um pedaço do anel, entre dois ângulos. */
  function arco(cx, cy, R, r, a0, a1, cor, titulo) {
    var grande = (a1 - a0) > Math.PI ? 1 : 0;
    /* 1,5° de folga entre fatias: sem a fresta, duas cores vizinhas de
       luminância parecida viram uma mancha só na impressão em cinza */
    var folga = Math.min(0.026, (a1 - a0) / 4);
    var b0 = a0 + folga, b1 = a1 - folga;
    var p = function (raio, ang) {
      return (cx + raio * Math.cos(ang)).toFixed(2) + ' ' + (cy + raio * Math.sin(ang)).toFixed(2);
    };
    var d = 'M ' + p(R, b0) +
      ' A ' + R + ' ' + R + ' 0 ' + grande + ' 1 ' + p(R, b1) +
      ' L ' + p(r, b1) +
      ' A ' + r + ' ' + r + ' 0 ' + grande + ' 0 ' + p(r, b0) + ' Z';
    var path = sv('path', { d: d, fill: cor });
    var t = sv('title', {});
    t.textContent = titulo;
    path.appendChild(t);
    return path;
  }

  function kpis(st, rotulo) {
    var row = el('div', 'pn-kpis');
    [
      ['Itens indo para ' + rotulo, st.total, st.ncr + ' NCR · ' + st.dev + ' DEV'],
      ['Vindos de', st.origens, st.origens === 1 ? 'marco' : 'marcos diferentes'],
      ['Waiver accepted', st.aceitos, pct(st.aceitos, st.total) + ' do recorte'],
      /* seis quadros, e não sete: na folha eles saem em três colunas, e o
         sétimo ficaria sozinho numa linha. "Em andamento" saiu porque é o
         complemento do aceito e já está na rosca ao lado. */
      ['Parados há ' + Summary.DIAS_PARADO + '+ dias', st.parados, 'pendentes sem ninguém mexer'],
      ['Já no relatório de ' + rotulo, st.jaChegaram, pct(st.jaChegaram, st.total) + ' do recorte'],
      ['Aceitos, falta trazer', st.aTrazer, 'aceitos lá e ainda sem cópia aqui']
    ].forEach(function (k) {
      var t = el('div', 'pn-kpi');
      t.appendChild(el('span', 'pn-kpi-label', k[0]));
      t.appendChild(el('strong', 'pn-kpi-value', String(k[1])));
      t.appendChild(el('span', 'pn-kpi-sub', k[2]));
      row.appendChild(t);
    });
    return row;
  }

  function porOrdem(obj) {
    return Object.keys(obj).sort(function (a, b) {
      return (obj[b] - obj[a]) || Store.cmpTexto(a, b);
    }).map(function (k) { return { rotulo: k, valor: obj[k] }; });
  }

  /* ---------------------------------------------------------------------- */
  /* a folha                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Monta o painel dentro de `host`.
   *
   * `opts.impressao` marca os blocos como `data-fluido`, que é o que a
   * paginação do relatório usa para levá-los à folha seguinte; `opts.abrir`
   * recebe a linha quando alguém clica no número (na tela só).
   *
   * `opts.parte` separa a folha em duas, e só a impressão usa isso:
   *   'painel' — capa, números e gráficos;
   *   'lista'  — os itens.
   * Juntos numa folha só sobrava lugar para duas linhas da lista, e o
   * cabeçalho que ficava para trás empurrava o gráfico inteiro para a folha
   * seguinte — meia folha em branco e a lista apertada logo depois. Separados,
   * cada um enche a sua: os números de um lado, a lista do outro.
   */
  function montar(host, projects, marco, opts) {
    opts = opts || {};
    var rotulo = (marco && marco.rotulo) || (marco && marco.chave) || '—';
    var rows = linhas(projects, marco && marco.chave);
    var st = apurar(rows, rotulo);
    var fluido = function (n) { if (opts.impressao) n.setAttribute('data-fluido', ''); return n; };
    var parte = opts.parte || 'tudo';
    var querPainel = parte === 'tudo' || parte === 'painel';
    var querLista = parte === 'tudo' || parte === 'lista';
    /* O viewBox estreito é só para o papel: na tela a coluna tem 600 px e o
       padrão de 720 sai no tamanho certo; na folha ela tem 110 mm, e aí o
       mesmo 720 encolhe o rótulo para menos de meio milímetro (§6). */
    var estreito = function (larg, rot) {
      return opts.impressao ? { larg: larg, rotulo: rot } : {};
    };

    if (!querPainel) {
      if (st.total) host.appendChild(listaDe(rows, st, rotulo, opts));
      return { st: st, rows: rows };
    }

    /* --- cabeçalho --- */
    var capa = el('header', 'pn-capa');
    capa.appendChild(el('p', 'pn-capa-sobre', 'Painel do marco'));
    capa.appendChild(el('h2', 'pn-capa-marco', rotulo));
    capa.appendChild(el('p', 'pn-capa-linha',
      st.total + (st.total === 1 ? ' item vai' : ' itens vão') + ' para ' + rotulo +
      ', vindo' + (st.total === 1 ? '' : 's') + ' de ' + st.origens +
      (st.origens === 1 ? ' marco' : ' marcos') + '.'));
    capa.appendChild(el('p', 'pn-capa-pe',
      'Gerado em ' + new Date().toLocaleString('pt-BR') +
      (Store.getUser() ? ' por ' + Store.getUser() : '') +
      ' · lidos do Waiver Historic de ' + (projects || []).length + ' relatório(s) deste navegador.'));
    host.appendChild(fluido(capa));

    if (!st.total) {
      host.appendChild(fluido(el('p', 'pn-vazio',
        'Nenhum item com uma seta escrita terminando em ' + rotulo + '. ' +
        'O painel lê o campo “Waiver Historic”: enquanto ninguém escrever ' +
        '“… To: ' + rotulo + '”, não há o que chegar aqui.')));
      return { st: st, rows: rows };
    }

    host.appendChild(fluido(kpis(st, rotulo)));

    /* --- os dois gráficos, lado a lado --- */
    var duplo = el('div', 'pn-duplo');
    var c1 = el('section', 'sm-card pn-card');
    var h1 = el('header', 'sm-card-head');
    h1.appendChild(el('h3', null, 'Em que pé estão'));
    h1.appendChild(el('p', null, 'Situação de acompanhamento dos itens que vão para ' + rotulo + '.'));
    c1.appendChild(h1);
    c1.appendChild(rosca(st));
    duplo.appendChild(c1);

    var c2 = el('section', 'sm-card pn-card');
    var h2 = el('header', 'sm-card-head');
    h2.appendChild(el('h3', null, 'De onde vêm'));
    h2.appendChild(el('p', null, 'O marco de onde parte a seta que chega em ' + rotulo + '.'));
    c2.appendChild(h2);
    var o2 = estreito(380, 90);
    o2.vazio = 'Sem origem escrita.';
    c2.appendChild(Summary.barras(porOrdem(st.porOrigem), o2));
    duplo.appendChild(c2);
    host.appendChild(fluido(duplo));

    var sis = porOrdem(st.porSistema).slice(0, 12);
    if (sis.length) {
      var c3 = el('section', 'sm-card pn-card');
      var h3 = el('header', 'sm-card-head');
      h3.appendChild(el('h3', null, 'Sistemas mais atingidos'));
      h3.appendChild(el('p', null, 'Um item pode citar vários sistemas; ' +
        (Object.keys(st.porSistema).length > 12 ? 'os doze mais frequentes.' : 'todos os citados.')));
      c3.appendChild(h3);
      c3.appendChild(Summary.barras(sis, estreito(520, 110)));
      host.appendChild(fluido(c3));
    }

    /* --- a lista --- */
    if (querLista) host.appendChild(listaDe(rows, st, rotulo, opts));

    return { st: st, rows: rows };
  }

  function listaDe(rows, st, rotulo, opts) {
    var cols = [
      { titulo: 'Número', larg: 16, valor: function (r) {
        return opts.abrir ? link(r, opts.abrir) : texto(r.item.ncrId) || '(sem número)';
      } },
      { titulo: 'Está no', larg: 14, valor: function (r) {
        return r.marco + (r.jaChegou ? ' ✓' : '');
      } },
      { titulo: 'Caminho', larg: 15, valor: function (r) {
        var s = Fluxo.ultimoSalto(r.fluxo);
        return s ? s.texto : '';
      } },
      { titulo: 'Sistemas', larg: 13, valor: function (r) { return texto(r.item.systems); } },
      { titulo: 'Função / descrição', larg: 25, valor: function (r) { return texto(r.item.func); } },
      { titulo: 'Situação', larg: 18, valor: function (r) { return Summary.situacao(r.item); } }
    ];
    return SummaryView.blocoLista(
      'Os ' + st.total + ' item(ns) que vão para ' + rotulo,
      'Ordenados pelo marco de origem. “Está no” é o relatório em que o item ' +
      'mora hoje; o ✓ marca o que já foi trazido para ' + rotulo + '. Uma NCR ' +
      'que já foi levada adiante aparece uma vez só, na cópia que chegou.',
      cols, rows, 'Nada a listar.');
  }

  function link(r, abrir) {
    var a = el('a', 'sm-link', texto(r.item.ncrId) || '(sem número)');
    a.href = '#';
    a.title = 'Abrir este item';
    a.addEventListener('click', function (e) { e.preventDefault(); abrir(r); });
    return a;
  }

  global.Painel = {
    marcosDeDestino: marcosDeDestino,
    base: base,
    linhas: linhas,
    apurar: apurar,
    montar: montar
  };
})(window);
