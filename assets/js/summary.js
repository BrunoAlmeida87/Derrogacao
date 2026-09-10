/* ==========================================================================
   summary.js — aba de resumo: números, gráficos e tabelas por marco
   Os gráficos são SVG escrito à mão: sem biblioteca externa, imprimem bem e
   funcionam com o arquivo aberto direto do disco.
   ========================================================================== */

(function (global) {
  'use strict';

  /* Paleta categórica validada para fundo claro (ver README).
     Slots 1-3 passam em todos os pares, inclusive para daltonismo. */
  var C1 = '#2a78d6';   /* azul    */
  var C2 = '#eb6834';   /* laranja */
  var C3 = '#1baf7a';   /* verde-água */
  var NEUTRO = '#d4d7dd';
  var TINTA = '#1a1c20';
  var TINTA2 = '#6b7280';

  var SVGNS = 'http://www.w3.org/2000/svg';

  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clean(v) { return (v || '').trim(); }

  /* ---------------------------------------------------------------------- */
  /* apuração                                                                */
  /* ---------------------------------------------------------------------- */

  /** "WAIVER ACCEPTED" e variações viram três situações comparáveis. */
  function situacao(item) {
    var v = clean(item.archStatus).toUpperCase();
    if (!v) return 'Sem resposta';
    if (v.indexOf('ACCEPT') >= 0 || v.indexOf('ACEIT') >= 0) return 'Aceito';
    if (v.indexOf('REQUEST') >= 0 || v.indexOf('SOLICIT') >= 0) return 'Solicitado';
    return 'Outro';
  }
  var SITUACOES = ['Aceito', 'Solicitado', 'Sem resposta', 'Outro'];

  /** Um item pode citar vários sistemas ("BX,BQ,BD"). */
  function sistemas(item) {
    return clean(item.systems).split(/[,;/]+/).map(clean).filter(Boolean);
  }

  function statsDe(project) {
    var linhas = [];
    ['ncr', 'dev'].forEach(function (kind) {
      (project[kind === 'dev' ? 'devs' : 'ncrs'] || []).forEach(function (n) {
        linhas.push({ kind: kind, item: n });
      });
    });

    var st = {
      project: project,
      marco: clean(project.marco) || clean(project.name) || 'sem marco',
      ncr: (project.ncrs || []).length,
      dev: (project.devs || []).length,
      total: linhas.length,
      concluidos: 0,
      pendentes: 0,
      evidencias: 0,
      imagens: 0,
      porSistema: {},
      porSituacao: {},
      certificados: {},
      linhas: linhas
    };
    SITUACOES.forEach(function (s) { st.porSituacao[s] = 0; });

    linhas.forEach(function (r) {
      var n = r.item;
      if (n.done) st.concluidos++; else st.pendentes++;
      st.porSituacao[situacao(n)]++;
      sistemas(n).forEach(function (s) { st.porSistema[s] = (st.porSistema[s] || 0) + 1; });
      (n.certificates || []).forEach(function (c) {
        if (clean(c)) st.certificados[clean(c)] = (st.certificados[clean(c)] || 0) + 1;
      });
      (n.evidence || []).forEach(function (ev) {
        st.evidencias++;
        st.imagens += (ev.images || []).length;
      });
    });
    return st;
  }

  function compute(projects) {
    var porMarco = projects.map(statsDe);
    var geral = {
      marcos: porMarco.length,
      ncr: 0, dev: 0, total: 0, concluidos: 0, pendentes: 0, evidencias: 0, imagens: 0,
      porSistema: {}, porSituacao: {}
    };
    SITUACOES.forEach(function (s) { geral.porSituacao[s] = 0; });
    porMarco.forEach(function (m) {
      ['ncr', 'dev', 'total', 'concluidos', 'pendentes', 'evidencias', 'imagens'].forEach(function (k) {
        geral[k] += m[k];
      });
      Object.keys(m.porSistema).forEach(function (s) {
        geral.porSistema[s] = (geral.porSistema[s] || 0) + m.porSistema[s];
      });
      SITUACOES.forEach(function (s) { geral.porSituacao[s] += m.porSituacao[s]; });
    });
    return { porMarco: porMarco, geral: geral };
  }

  /* ---------------------------------------------------------------------- */
  /* gráficos                                                                */
  /* ---------------------------------------------------------------------- */

  var LARG = 720;          /* largura do viewBox */
  var ROTULO = 150;        /* faixa reservada ao rótulo da esquerda */
  var ALT_BARRA = 22;
  var ESPACO = 12;

  function eixoVazio(msg) {
    var p = el('p', 'sm-empty', msg);
    return p;
  }

  /**
   * Barras horizontais empilhadas: parte-todo por linha.
   * `series` = [{ nome, cor }]; `linhas` = [{ rotulo, valores: [] }].
   * Cada segmento leva rótulo direto e título nativo — é o alívio exigido
   * para as cores de contraste baixo sobre fundo claro.
   */
  function barrasEmpilhadas(linhas, series, opts) {
    opts = opts || {};
    var maxTotal = 0;
    linhas.forEach(function (l) {
      var t = l.valores.reduce(function (a, b) { return a + b; }, 0);
      if (t > maxTotal) maxTotal = t;
    });
    if (!maxTotal) return eixoVazio(opts.vazio || 'Sem dados para exibir.');

    var alt = linhas.length * (ALT_BARRA + ESPACO) + 6;
    var largBarra = LARG - ROTULO - 60;
    var svg = sv('svg', {
      viewBox: '0 0 ' + LARG + ' ' + alt,
      role: 'img',
      class: 'sm-svg'
    });

    linhas.forEach(function (l, i) {
      var y = i * (ALT_BARRA + ESPACO);
      var total = l.valores.reduce(function (a, b) { return a + b; }, 0);

      var rot = sv('text', {
        x: ROTULO - 10, y: y + ALT_BARRA / 2 + 4,
        'text-anchor': 'end', class: 'sm-axis-label'
      });
      rot.textContent = l.rotulo.length > 22 ? l.rotulo.slice(0, 21) + '…' : l.rotulo;
      if (l.rotulo.length > 22) {
        var tt = sv('title'); tt.textContent = l.rotulo; rot.appendChild(tt);
      }
      svg.appendChild(rot);

      var x = ROTULO;
      l.valores.forEach(function (v, k) {
        if (!v) return;
        var w = (v / maxTotal) * largBarra;
        /* 2px de folga entre segmentos, conforme a especificação de marcas */
        var wv = Math.max(w - 2, 1);
        var r = sv('rect', {
          x: x, y: y, width: wv, height: ALT_BARRA,
          rx: 3, fill: series[k].cor
        });
        var t = sv('title');
        t.textContent = l.rotulo + ' — ' + series[k].nome + ': ' + v;
        r.appendChild(t);
        svg.appendChild(r);

        /* rótulo direto dentro do segmento, quando couber */
        if (wv > 26) {
          var lab = sv('text', {
            x: x + wv / 2, y: y + ALT_BARRA / 2 + 4,
            'text-anchor': 'middle',
            class: 'sm-bar-label' + (series[k].claro ? ' sm-bar-label--dark' : '')
          });
          lab.textContent = v;
          svg.appendChild(lab);
        }
        x += w;
      });

      var tot = sv('text', {
        x: x + 8, y: y + ALT_BARRA / 2 + 4, class: 'sm-total-label'
      });
      tot.textContent = total;
      svg.appendChild(tot);
    });

    var wrap = el('div', 'sm-chart');
    wrap.appendChild(svg);
    wrap.appendChild(legenda(series));
    return wrap;
  }

  /** Barras horizontais de uma cor só: comparação de magnitude. */
  function barras(linhas, opts) {
    opts = opts || {};
    var max = 0;
    linhas.forEach(function (l) { if (l.valor > max) max = l.valor; });
    if (!max) return eixoVazio(opts.vazio || 'Sem dados para exibir.');

    var alt = linhas.length * (ALT_BARRA + ESPACO) + 6;
    var largBarra = LARG - ROTULO - 60;
    var svg = sv('svg', { viewBox: '0 0 ' + LARG + ' ' + alt, role: 'img', class: 'sm-svg' });

    linhas.forEach(function (l, i) {
      var y = i * (ALT_BARRA + ESPACO);
      var rot = sv('text', {
        x: ROTULO - 10, y: y + ALT_BARRA / 2 + 4,
        'text-anchor': 'end', class: 'sm-axis-label'
      });
      rot.textContent = l.rotulo.length > 22 ? l.rotulo.slice(0, 21) + '…' : l.rotulo;
      svg.appendChild(rot);

      var w = Math.max((l.valor / max) * largBarra, 2);
      var r = sv('rect', { x: ROTULO, y: y, width: w, height: ALT_BARRA, rx: 3, fill: C1 });
      var t = sv('title');
      t.textContent = l.rotulo + ': ' + l.valor;
      r.appendChild(t);
      svg.appendChild(r);

      var v = sv('text', { x: ROTULO + w + 8, y: y + ALT_BARRA / 2 + 4, class: 'sm-total-label' });
      v.textContent = l.valor;
      svg.appendChild(v);
    });

    var wrap = el('div', 'sm-chart');
    wrap.appendChild(svg);
    return wrap;
  }

  function legenda(series) {
    var box = el('div', 'sm-legend');
    series.forEach(function (s) {
      var it = el('span', 'sm-legend-item');
      var dot = el('span', 'sm-legend-dot');
      dot.style.background = s.cor;
      it.appendChild(dot);
      it.appendChild(document.createTextNode(s.nome));
      box.appendChild(it);
    });
    return box;
  }

  global.Summary = {
    C1: C1, C2: C2, C3: C3, NEUTRO: NEUTRO,
    SITUACOES: SITUACOES,
    situacao: situacao,
    sistemas: sistemas,
    compute: compute,
    statsDe: statsDe,
    barrasEmpilhadas: barrasEmpilhadas,
    barras: barras,
    legenda: legenda,
    el: el
  };
})(window);

/* ==========================================================================
   summary.view.js — montagem da aba de resumo
   ========================================================================== */

(function (global) {
  'use strict';

  var S = global.Summary;
  var el = S.el;

  function num(n) { return String(n); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }

  /* --- blocos ----------------------------------------------------------- */

  function bloco(titulo, sub) {
    var c = el('section', 'sm-card');
    var h = el('header', 'sm-card-head');
    h.appendChild(el('h3', null, titulo));
    if (sub) h.appendChild(el('p', null, sub));
    c.appendChild(h);
    return c;
  }

  function kpiRow(st) {
    var row = el('div', 'sm-kpis');
    [
      ['Itens em derrogação', st.total, st.ncr + ' NCR · ' + st.dev + ' DEV'],
      ['Concluídos', st.concluidos, pct(st.concluidos, st.total) + ' do total'],
      ['Pendentes', st.pendentes, pct(st.pendentes, st.total) + ' do total'],
      ['Páginas de evidência', st.evidencias, st.imagens + ' imagens']
    ].forEach(function (k) {
      var t = el('div', 'sm-kpi');
      t.appendChild(el('span', 'sm-kpi-label', k[0]));
      t.appendChild(el('strong', 'sm-kpi-value', num(k[1])));
      t.appendChild(el('span', 'sm-kpi-sub', k[2]));
      row.appendChild(t);
    });
    return row;
  }

  function tabela(colunas, linhas, opts) {
    opts = opts || {};
    var wrap = el('div', 'sm-table-wrap');
    var t = el('table', 'sm-table');
    var thead = el('thead');
    var tr = el('tr');
    colunas.forEach(function (c) {
      var th = el('th', c.num ? 'is-num' : null, c.titulo);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);

    var tb = el('tbody');
    linhas.forEach(function (l) {
      var r = el('tr');
      colunas.forEach(function (c) {
        var td = el('td', c.num ? 'is-num' : null);
        var v = c.valor(l);
        if (v instanceof Node) td.appendChild(v); else td.textContent = v;
        r.appendChild(td);
      });
      tb.appendChild(r);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    if (!linhas.length) wrap.appendChild(el('p', 'sm-empty', opts.vazio || 'Nada a listar.'));
    return wrap;
  }

  /* --- gráficos montados a partir das estatísticas ---------------------- */

  function graficoProgresso(marcos) {
    return S.barrasEmpilhadas(
      marcos.map(function (m) {
        return { rotulo: m.marco, valores: [m.concluidos, m.pendentes] };
      }),
      [{ nome: 'Concluídos', cor: S.C1 },
       { nome: 'Pendentes', cor: S.NEUTRO, claro: true }],
      { vazio: 'Nenhum item cadastrado ainda.' }
    );
  }

  function graficoSituacao(marcos) {
    return S.barrasEmpilhadas(
      marcos.map(function (m) {
        return {
          rotulo: m.marco,
          valores: [m.porSituacao['Aceito'],
                    m.porSituacao['Solicitado'],
                    m.porSituacao['Sem resposta'] + m.porSituacao['Outro']]
        };
      }),
      [{ nome: 'Aceito', cor: S.C3 },
       { nome: 'Solicitado', cor: S.C2 },
       { nome: 'Sem resposta', cor: S.NEUTRO, claro: true }],
      { vazio: 'Nenhuma situação registrada.' }
    );
  }

  function graficoSistemas(porSistema) {
    var linhas = Object.keys(porSistema)
      .map(function (s) { return { rotulo: s, valor: porSistema[s] }; })
      .sort(function (a, b) { return b.valor - a.valor; });

    /* além de dez sistemas a leitura piora; o excedente vira "Outros" */
    if (linhas.length > 10) {
      var resto = linhas.slice(10).reduce(function (a, l) { return a + l.valor; }, 0);
      linhas = linhas.slice(0, 10);
      linhas.push({ rotulo: 'Outros', valor: resto });
    }
    return S.barras(linhas, { vazio: 'Nenhum sistema informado nos itens.' });
  }

  /* --- exportação ------------------------------------------------------- */

  function csvCampo(v) {
    v = (v == null ? '' : String(v)).replace(/"/g, '""');
    return '"' + v + '"';
  }

  /** Planilha com uma linha por NCR/DEV, para abrir no Excel. */
  function toCsv(project) {
    var st = S.statsDe(project);
    var cab = ['Marco', 'Tipo', 'Numero', 'Sistemas', 'Funcao/Descricao', 'Situacao',
               'Arch Status', 'Request Expiry', 'Approved Expiry', 'Concluido',
               'Certificados', 'Anexos', 'Imagens', 'Alterado por', 'Alterado em'];
    var linhas = st.linhas.map(function (r) {
      var n = r.item;
      var imgs = (n.evidence || []).reduce(function (a, e) { return a + (e.images || []).length; }, 0);
      return [
        st.marco,
        r.kind === 'dev' ? 'DEV' : 'NCR',
        n.ncrId, n.systems, n.func,
        S.situacao(n), n.archStatus, n.requestExpiry, n.approvedExpiry,
        n.done ? 'Sim' : 'Nao',
        (n.certificates || []).join(' | '),
        (n.evidence || []).length, imgs,
        n.editedBy, n.editedAt
      ].map(csvCampo).join(';');
    });
    /* BOM para o Excel reconhecer os acentos */
    return '﻿' + cab.map(csvCampo).join(';') + '\n' + linhas.join('\n');
  }

  /* --- a aba inteira ---------------------------------------------------- */

  /**
   * @param host    elemento onde a aba é desenhada
   * @param projects todos os relatórios
   * @param filtro  id do relatório a detalhar, ou '' para o panorama geral
   * @param acoes   { onFiltro, onCsv, onPdf, onBackup }
   */
  function render(host, projects, filtro, acoes) {
    host.innerHTML = '';
    var dados = S.compute(projects);
    var alvo = filtro ? dados.porMarco.filter(function (m) { return m.project.id === filtro; })[0] : null;
    var escopo = alvo ? [alvo] : dados.porMarco;

    /* barra de escolha do marco + exportações */
    var barra = el('div', 'sm-bar');
    var campo = el('div', 'sm-bar-field');
    campo.appendChild(el('label', null, 'Marco'));
    var sel = document.createElement('select');
    var todos = document.createElement('option');
    todos.value = ''; todos.textContent = 'Todos os marcos (' + dados.porMarco.length + ')';
    sel.appendChild(todos);
    dados.porMarco.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.project.id;
      o.textContent = m.marco + ' — ' + m.total + ' itens';
      sel.appendChild(o);
    });
    sel.value = filtro || '';
    sel.addEventListener('change', function () { acoes.onFiltro(sel.value); });
    campo.appendChild(sel);
    barra.appendChild(campo);

    var acoesBox = el('div', 'sm-bar-actions');
    if (alvo) {
      [['Resumo em PDF', function () { acoes.onPdf(alvo.project); }, 'btn--primary'],
       ['Planilha (CSV)', function () { acoes.onCsv(alvo.project); }, ''],
       ['Backup deste marco', function () { acoes.onBackup(alvo.project); }, '']
      ].forEach(function (a) {
        var b = el('button', 'btn btn--sm ' + a[2], a[0]);
        b.type = 'button';
        b.addEventListener('click', a[1]);
        acoesBox.appendChild(b);
      });
    } else {
      acoesBox.appendChild(el('span', 'sm-hint',
        'Escolha um marco acima para exportar o resumo dele.'));
      var bt = el('button', 'btn btn--sm btn--primary', 'Resumo geral em PDF');
      bt.type = 'button';
      bt.addEventListener('click', function () { acoes.onPdf(null); });
      acoesBox.appendChild(bt);
    }
    barra.appendChild(acoesBox);
    host.appendChild(barra);

    /* números do escopo */
    var st = alvo || dados.geral;
    if (!alvo) {
      st = dados.geral;
      st.marco = 'Todos os marcos';
    }
    host.appendChild(kpiRow(st));

    /* progresso por marco (ou do marco escolhido) */
    var b1 = bloco(alvo ? 'Progresso de ' + alvo.marco : 'Progresso por marco',
      'Itens marcados como concluídos, sobre o total de NCRs e DEVs.');
    b1.appendChild(graficoProgresso(escopo));
    host.appendChild(b1);

    var b2 = bloco('Situação do waiver',
      'Conforme o campo Arch Status Waiver de cada item.');
    b2.appendChild(graficoSituacao(escopo));
    host.appendChild(b2);

    var b3 = bloco('Itens por sistema',
      'Um item que cita vários sistemas conta em cada um deles.');
    b3.appendChild(graficoSistemas(alvo ? alvo.porSistema : dados.geral.porSistema));
    host.appendChild(b3);

    /* tabelas */
    if (!alvo) {
      var b4 = bloco('Marcos', 'Clique em um marco para ver o detalhe e exportar.');
      b4.appendChild(tabela([
        { titulo: 'Marco', valor: function (m) {
            var a = el('a', 'sm-link', m.marco);
            a.href = '#';
            a.addEventListener('click', function (e) { e.preventDefault(); acoes.onFiltro(m.project.id); });
            return a;
          } },
        { titulo: 'NCR', num: true, valor: function (m) { return num(m.ncr); } },
        { titulo: 'DEV', num: true, valor: function (m) { return num(m.dev); } },
        { titulo: 'Total', num: true, valor: function (m) { return num(m.total); } },
        { titulo: 'Concluídos', num: true, valor: function (m) { return num(m.concluidos); } },
        { titulo: '%', num: true, valor: function (m) { return pct(m.concluidos, m.total); } },
        { titulo: 'Evidências', num: true, valor: function (m) { return num(m.evidencias); } },
        { titulo: 'Última edição', valor: function (m) {
            return m.project.lastEditedBy || '—';
          } }
      ], dados.porMarco, { vazio: 'Nenhum relatório neste navegador.' }));
      host.appendChild(b4);
    } else {
      var b5 = bloco('Itens de ' + alvo.marco, 'Todas as NCRs e DEVs deste marco.');
      b5.appendChild(tabela([
        { titulo: 'Tipo', valor: function (r) { return r.kind === 'dev' ? 'DEV' : 'NCR'; } },
        { titulo: 'Número', valor: function (r) { return r.item.ncrId || '(sem número)'; } },
        { titulo: 'Sistemas', valor: function (r) { return r.item.systems || '—'; } },
        { titulo: 'Função / descrição', valor: function (r) { return r.item.func || '—'; } },
        { titulo: 'Situação', valor: function (r) { return S.situacao(r.item); } },
        { titulo: 'Expiry', valor: function (r) { return r.item.requestExpiry || '—'; } },
        { titulo: 'Anexos', num: true, valor: function (r) { return num((r.item.evidence || []).length); } },
        { titulo: 'Concluído', valor: function (r) { return r.item.done ? 'Sim' : '—'; } }
      ], alvo.linhas, { vazio: 'Este marco ainda não tem itens.' }));
      host.appendChild(b5);

      var certs = Object.keys(alvo.certificados).sort();
      if (certs.length) {
        var b6 = bloco('Certificados impactados', 'Quantos itens citam cada certificado.');
        b6.appendChild(tabela([
          { titulo: 'Certificado', valor: function (c) { return c; } },
          { titulo: 'Itens', num: true, valor: function (c) { return num(alvo.certificados[c]); } }
        ], certs));
        host.appendChild(b6);
      }
    }
  }

  global.SummaryView = {
    render: render,
    toCsv: toCsv,
    kpiRow: kpiRow,
    tabela: tabela,
    bloco: bloco,
    graficoProgresso: graficoProgresso,
    graficoSituacao: graficoSituacao,
    graficoSistemas: graficoSistemas
  };
})(window);
