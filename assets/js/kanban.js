/* ==========================================================================
   kanban.js — aba "Kanban": as NCRs de um marco em cartões, por situação
   --------------------------------------------------------------------------
   Pedido do Bruno: "para o marco J09, mostrar todas as NCRs vinculadas a
   esse marco e o status do Waiver dela". O painel da aba Fluxos responde o
   que está chegando num marco em números; o Kanban mostra cada NCR, e deixa
   mudar a situação arrastando o cartão.

   Quem entra no quadro do J09:
   - os itens NCR do relatório do J09 — uma coluna por situação
     (Store.STATUS, com as mesmas cores do resto do programa);
   - as NCRs do banco com Marco Atual = J09 que ainda não estão no relatório;
   - os itens de outros marcos cujo waiver vale até o J09 (Approved Expiry,
     ou o Request Expiry na falta — Herdar.avanco) e ainda não foram levados.
   As duas últimas ficam na primeira coluna, "NCR to be closed" (pedido do
   Bruno): a NCR do marco que não está no Waiver dele não tem waiver, então
   precisa ser fechada até o marco. Nessa coluna, fechada é o resultado bom
   (verde); aberta é o que ainda falta.

   As que já estão em "CEDOC Closure" no banco NCR saíram dessa coluna (pedido
   do Bruno): estão encerradas, e misturadas às que ainda faltam fechar só
   atrapalhavam a leitura. Ficam numa área própria, abaixo do quadro,
   recolhível — com a quantidade sempre à vista.

   O cartão nasce recolhido: número, status da NCR, função, sistema e as
   ações, quase uma linha de lista. O "+" mostra a descrição e o resto; abrir
   ou fechar um cartão é só tela — não grava nada nem muda a coluna dele.

   Marco casa com relatório pelo texto igual (Ncrs.marcoChave), a mesma
   regra do Banco NCR: "J06 Ind" não é o "J06".

   Duas exportações, as duas do que está à vista (marco e filtros): a visual,
   para imprimir (A4 ou A3, retrato ou paisagem, pela janela de impressão do
   navegador — o mesmo caminho do PDF do relatório), e a planilha .xlsx com
   uma linha por NCR.

   Só desenha e repassa: gravar, abrir o item, adicionar ao relatório,
   imprimir e baixar é com o app.js (recebido em `ctx`). O PDF do relatório
   não é tocado.
   ========================================================================== */
(function (global) {
  'use strict';

  var FORA = 'fora';
  var ENCERRADA = 'encerrada';
  var CHAVE_ENCERRADAS = 'derrogacao:kanbanEncerradas';   /* a área aberta ou recolhida */
  var CHAVE_IMPRESSAO = 'derrogacao:kanbanImpressao';     /* papel, orientação, escala */

  var st = {
    marco: '',          // o marco escolhido (texto, como está no relatório)
    busca: '',
    soAlertas: false,
    caminho: true,      // mostrar os que vêm de outros marcos
    ind: false,         // mostrar os marcos industriais ("J09 Ind")
    abertos: {}         // cartões com a descrição à vista — só tela, nunca gravado
  };
  var ctx = null;
  var host = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function str(v) { return v == null ? '' : String(v); }
  function curto(t, n) {
    t = str(t).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }
  function botao(texto, cls, fn, titulo) {
    var b = el('button', 'btn ' + (cls || ''), texto);
    b.type = 'button';
    if (titulo) b.title = titulo;
    b.addEventListener('click', fn);
    return b;
  }
  function marcoRel(p) { return p.marco || p.name || ''; }
  /* Modo leitura (o visualizador): o quadro mostra, mas não arrasta, não
     troca situação e não adiciona NCR a relatório. Exportar, pode. */
  function leitura() { return !!(ctx && ctx.leitura); }

  function lerPref(chave, padrao) {
    try { var v = global.localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function gravarPref(chave, v) {
    try { global.localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* só preferência */ }
  }

  /* "J09 Ind" é o marco industrial: para o Bruno, de pouca relevância. Ele
     nunca entra no quadro do J09 (o marco casa pelo texto igual) e o seletor
     só o oferece quando pedido. */
  function ehInd(t) { return /\bind\b/i.test(str(t)); }

  /* A NCR já encerrada no CEDOC ("CEDOC Closure", e o "Unfounded" dela). Só
     estas saem da coluna "NCR to be closed"; uma "Closed" ainda sem o CEDOC
     continua lá, verde, como antes. */
  function emCedoc(rec) {
    return !!(rec && /\bcedoc closure\b/.test(Ncrs.norm(Ncrs.fonte(rec).status)));
  }

  /* --- quem está em cada marco -------------------------------------------- */

  /** Os marcos que têm quadro: relatórios com NCR e Marco Atual do banco. */
  function marcos(projects) {
    return marcos.todos(projects).filter(function (m) { return st.ind || !ehInd(m); });
  }
  marcos.todos = function (projects) {
    var vistos = {};
    var out = [];
    function add(t) {
      var k = Ncrs.marcoChave(t);
      if (!k || vistos[k]) return;
      vistos[k] = 1;
      out.push(t);
    }
    projects.forEach(function (p) { if (p.marco) add(p.marco); });
    Ncrs.lista().forEach(function (r) { if (r.waiver.marcoAtual) add(r.waiver.marcoAtual); });
    return out.sort(Fluxo.cmpMarco);
  };

  /** A NCR do banco que responde por este item (pelo vínculo gravado, pelo
      número — e, se o número é de uma temporária substituída, a definitiva). */
  function recDoItem(item) {
    return Ncrs.recDoItem(item);
  }

  /** A chave do caso: a temporária e a definitiva que a substituiu são um cartão só. */
  function chaveDoCaso(rec, item) {
    if (rec) return rec.key;
    var k = Ncrs.chave(item && item.ncrId);
    return k ? Ncrs.definitiva(k) : '';
  }

  /**
   * Os cartões do quadro de um marco.
   * { coluna, tipo: 'item'|'banco'|'caminho', project, item, rec, chave, alerta }
   * A coluna é uma das de colunasDef() — ou ENCERRADA, a área de baixo.
   */
  function cartoes(marco, projects) {
    var k = Ncrs.marcoChave(marco);
    var alvo = Fluxo.marco(marco);
    var daqui = projects.filter(function (p) { return Ncrs.marcoChave(p.marco) === k; });
    var out = [];
    var jaTem = {};

    daqui.forEach(function (p) {
      (p.ncrs || []).forEach(function (it) {
        var rec = recDoItem(it);
        var chave = chaveDoCaso(rec, it);
        if (chave) jaTem[chave] = 1;
        out.push({ coluna: Store.statusInfo(it.status).id, tipo: 'item', project: p, item: it, rec: rec, chave: chave });
      });
    });

    Ncrs.lista().forEach(function (rec) {
      if (Ncrs.marcoChave(rec.waiver.marcoAtual) !== k || jaTem[rec.key]) return;
      /* temporária já substituída: quem continua o caso é a definitiva */
      if (Ncrs.substituidaPor(rec)) return;
      jaTem[rec.key] = 1;
      out.push({ coluna: FORA, tipo: 'banco', project: null, item: null, rec: rec, chave: rec.key,
        relatorio: daqui[0] || null });
    });

    if (st.caminho && alvo) {
      projects.forEach(function (p) {
        if (Ncrs.marcoChave(p.marco) === k) return;
        (p.ncrs || []).forEach(function (it) {
          var av = Herdar.avanco(p, it, 'ncr', projects);
          if (!av.destino || !Fluxo.mesmoMarco(av.destino, alvo)) return;
          /* Fluxo.marco não distingue "J09 Ind" de "J09": quem decide é o texto */
          if (ehInd(av.aprovado ? it.approvedExpiry : it.requestExpiry) !== ehInd(marco)) return;
          if (av.estado !== 'aLevar' && av.estado !== 'semRelatorio') return;
          var rec = recDoItem(it);
          var chave = chaveDoCaso(rec, it);
          if (chave && jaTem[chave]) return;
          if (chave) jaTem[chave] = 1;
          out.push({ coluna: FORA, tipo: 'caminho', project: p, item: it, rec: rec, chave: chave, aprovado: av.aprovado });
        });
      });
    }

    out.forEach(function (c) {
      c.fechada = c.rec ? Ncrs.fechada(c.rec) : false;
      c.alerta = c.fechada && c.tipo === 'item' && c.coluna !== Store.STATUS_CONCLUIDO;
      /* encerrada no CEDOC: sai de "to be closed" para a área de baixo */
      if (c.coluna === FORA && emCedoc(c.rec)) c.coluna = ENCERRADA;
      c.id = c.item ? c.tipo + ':' + (c.project ? c.project.id : '') + ':' + c.item.id : 'banco:' + c.rec.key;
    });
    return out;
  }

  function numeroDe(c) { return c.item ? (c.item.ncrId || '(sem número)') : c.rec.numero; }
  function descricaoDe(c) { return (c.item && c.item.description) || (c.rec && Ncrs.fonte(c.rec).descricao) || ''; }
  function funcaoDe(c) { return (c.item && c.item.func) || (c.rec && c.rec.waiver.funcaoVital) || ''; }
  function sistemaDe(c) { return (c.item && c.item.systems) || (c.rec && Ncrs.fonte(c.rec).sistema) || ''; }
  /** O status da NCR no banco, com a correção do administrador se houver. */
  function statusDe(c) { return c.rec ? str(Ncrs.fonte(c.rec).status) : ''; }

  /**
   * A função vital em poucas letras, para o cartão recolhido: "FV03 - EMERGENCY
   * SHUT-OFF…" e "03 - Emergency shut-off…" viram "FV03". O texto inteiro fica
   * na dica e no cartão aberto.
   */
  function funcaoCurta(fv) {
    var m = /^\s*(?:fv\s*)?(?:n\s*[°º]\s*)?(\d{1,3})\b/i.exec(str(fv));
    return m ? 'FV' + (m[1].length < 2 ? '0' : '') + m[1] : curto(fv, 14);
  }

  function textoBusca(c) {
    var partes = [numeroDe(c)];
    if (c.item) {
      partes.push(c.item.systems, c.item.func, c.item.description, c.item.nota, c.item.observation, c.item.obsShipManager, c.item.historic);
    }
    if (c.rec) {
      var f = Ncrs.fonte(c.rec);
      partes.push(f.descricao, f.status, f.sistema, c.rec.waiver.funcaoVital, c.rec.waiver.observacao, c.rec.waiver.obsShipManager);
    }
    return Ncrs.norm(partes.join(' '));
  }

  function passa(c) {
    if (st.soAlertas && !c.alerta) return false;
    if (!st.busca) return true;
    var hay = textoBusca(c);
    return Ncrs.norm(st.busca).split(' ').filter(Boolean).every(function (t) { return hay.indexOf(t) >= 0; });
  }

  function ordenar(cs) {
    return cs.slice().sort(function (a, b) {
      if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
      /* em "NCR to be closed", as que ainda faltam fechar vêm primeiro */
      if (a.coluna === FORA && a.fechada !== b.fechada) return a.fechada ? 1 : -1;
      return Store.cmpTexto(numeroDe(a), numeroDe(b));
    });
  }

  function colunasDef() {
    return [{ id: FORA, nome: 'NCR to be closed',
      ajuda: 'NCRs deste marco que não estão no Waiver dele: sem waiver, precisam ser fechadas até o marco' }]
      .concat(Store.STATUS.map(function (s) { return { id: s.id, nome: s.nome, ajuda: s.ajuda }; }));
  }

  var AREA_ENCERRADAS = { id: ENCERRADA, nome: 'Encerradas — CEDOC Closure',
    ajuda: 'NCRs deste marco fora do Waiver que já estão em “CEDOC Closure” no banco NCR: encerradas, nada mais a fechar' };

  /** O quadro montado: o marco, os cartões e os que passam nos filtros. */
  function estado(projects) {
    var lista = marcos(projects);
    var todos = st.marco ? cartoes(st.marco, projects) : [];
    return { lista: lista, todos: todos, vis: todos.filter(passa) };
  }

  /* --- desenho ---------------------------------------------------------------- */

  function render(h, c) {
    host = h; ctx = c;
    var topo = host.scrollTop;
    var buscando = document.activeElement && document.activeElement.id === 'kbBusca';
    host.innerHTML = '';
    var projects = ctx.projects();
    var lista = marcos(projects);
    var achou = lista.some(function (m) { return Ncrs.marcoChave(m) === Ncrs.marcoChave(st.marco); });
    if (!achou) {
      /* o relatório aberto é um "Ind" escondido: abre no marco dele sem o Ind */
      var semInd = function (t) { return str(t).replace(/\s*\bind\b/i, ''); };
      var inicial = st.marco ? semInd(st.marco) : (st.ind ? ctx.marcoInicial() : semInd(ctx.marcoInicial()));
      st.marco = lista.filter(function (m) { return Ncrs.marcoChave(m) === Ncrs.marcoChave(inicial); })[0] || lista[0] || '';
    }

    var raiz = el('div', 'kb');
    host.appendChild(raiz);
    if (!lista.length) {
      var v = el('div', 'kb-vazio');
      v.appendChild(el('h3', null, 'Nenhum marco ainda'));
      v.appendChild(el('p', null, 'O quadro aparece quando houver um relatório com NCRs ou NCRs do banco com Marco Atual preenchido.'));
      raiz.appendChild(v);
      return;
    }

    var e = estado(projects);
    raiz.appendChild(cabecalho(e.lista, projects, e.todos, e.vis));
    raiz.appendChild(resumo(e.todos));
    raiz.appendChild(quadro(e.vis, e.todos));
    raiz.appendChild(areaEncerradas(e.vis, e.todos));
    host.scrollTop = topo;
    if (buscando) {
      var b = document.getElementById('kbBusca');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }
  }

  function cabecalho(lista, projects, todos, vis) {
    var cab = el('div', 'kb-cab');
    var tit = el('div', 'kb-tit');
    tit.appendChild(el('span', 'kb-sobre', 'Kanban do marco'));
    tit.appendChild(el('strong', 'kb-marco', st.marco));
    var rel = projects.filter(function (p) { return Ncrs.marcoChave(p.marco) === Ncrs.marcoChave(st.marco); })[0];
    tit.appendChild(el('span', 'kb-rel', rel ? 'Relatório: ' + (rel.marco || rel.name) + ' Waiver'
      : 'Ainda não há relatório de Waiver deste marco'));
    cab.appendChild(tit);

    var ferr = el('div', 'kb-ferr');
    var busca = el('input', 'kb-busca');
    busca.type = 'search';
    busca.id = 'kbBusca';
    busca.placeholder = 'Buscar no quadro: número, texto, função…';
    busca.setAttribute('aria-label', 'Buscar nos cartões do quadro');
    busca.value = st.busca;
    var tm = null;
    busca.addEventListener('input', function () {
      clearTimeout(tm);
      tm = setTimeout(function () { st.busca = busca.value; render(host, ctx); }, 200);
    });
    ferr.appendChild(busca);

    var nAlerta = todos.filter(function (c) { return c.alerta; }).length;
    var ba = botao('⚠ Só com alerta' + (nAlerta ? ' (' + nAlerta + ')' : ''), 'btn--sm kb-toggle kb-toggle--alerta' + (st.soAlertas ? ' is-on' : ''),
      function () { st.soAlertas = !st.soAlertas; render(host, ctx); },
      'Mostra só as NCRs fechadas no banco com o waiver ainda não aceito');
    ba.setAttribute('aria-pressed', st.soAlertas ? 'true' : 'false');
    ba.disabled = !nAlerta && !st.soAlertas;
    ferr.appendChild(ba);

    var bc = botao('Incluir as que vêm de outros marcos', 'btn--sm kb-toggle' + (st.caminho ? ' is-on' : ''),
      function () { st.caminho = !st.caminho; render(host, ctx); },
      'Itens de outros relatórios cujo waiver vale até este marco (Approved Expiry, ou Request Expiry) e ainda não foram levados');
    bc.setAttribute('aria-pressed', st.caminho ? 'true' : 'false');
    ferr.appendChild(bc);

    var nInd = marcos.todos(projects).filter(ehInd).length;
    if (nInd) {
      var bi = botao('Marcos industriais (Ind)', 'btn--sm kb-toggle' + (st.ind ? ' is-on' : ''),
        function () { st.ind = !st.ind; render(host, ctx); },
        (st.ind ? 'Esconder' : 'Mostrar') + ' os ' + nInd + ' marcos "Ind" no seletor. Eles nunca entram no quadro do marco sem "Ind".');
      bi.setAttribute('aria-pressed', st.ind ? 'true' : 'false');
      ferr.appendChild(bi);
    }
    cab.appendChild(ferr);

    /* os marcos, na fila combinada, como as pastilhas da aba Tabela */
    var fila = el('div', 'kb-marcos');
    fila.setAttribute('role', 'group');
    fila.setAttribute('aria-label', 'Marco do quadro');
    lista.forEach(function (m) {
      var n = cartoes(m, projects).length;
      var on = Ncrs.marcoChave(m) === Ncrs.marcoChave(st.marco);
      var b = el('button', 'tb-chip kb-chip' + (on ? ' is-on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.appendChild(document.createTextNode(m + ' '));
      b.appendChild(el('span', 'tb-chip-n', String(n)));
      b.addEventListener('click', function () {
        st.marco = m;
        render(host, ctx);
        var ch = host.querySelector('.kb-chip.is-on');
        if (ch) ch.focus();
      });
      fila.appendChild(b);
    });
    cab.appendChild(fila);

    /* ver e levar embora: abrir/recolher os cartões e as duas exportações */
    var acoes = el('div', 'kb-acoes');
    var todosAbertos = vis.length > 0 && vis.every(function (c) { return st.abertos[c.id]; });
    var bt = botao(todosAbertos ? '− Recolher os cartões' : '＋ Abrir todos os cartões', 'btn--sm', function () {
      if (todosAbertos) st.abertos = {};
      else vis.forEach(function (c) { st.abertos[c.id] = true; });
      render(host, ctx);
      var nb = host.querySelector('.kb-acoes .btn');
      if (nb) nb.focus();
    }, 'Mostra (ou recolhe) a descrição de todos os cartões à vista. Só muda a tela.');
    bt.setAttribute('aria-pressed', todosAbertos ? 'true' : 'false');
    acoes.appendChild(bt);
    var ex = el('div', 'kb-exporta');
    ex.appendChild(botao('🖨 Exportar visual para impressão…', 'btn--sm btn--primary', function () { abrirImpressao(); },
      'O quadro como está na tela (marco e filtros), em A4 ou A3, retrato ou paisagem — em PDF, pela janela de impressão'));
    ex.appendChild(botao('⤓ Excel', 'btn--sm', function () { exportarPlanilha(); },
      'Planilha .xlsx com uma linha por NCR do quadro à vista, e uma aba dizendo o recorte'));
    acoes.appendChild(ex);
    cab.appendChild(acoes);
    return cab;
  }

  /** A faixa de progresso: quantos em cada situação, com as mesmas cores. */
  function resumo(todos) {
    var box = el('div', 'kb-resumo');
    var total = todos.length;
    var nEnc = todos.filter(function (c) { return c.coluna === ENCERRADA; }).length;
    var nums = el('div', 'kb-resumo-nums');
    numerosDoResumo(todos).forEach(function (p) {
      var d = el('div', 'kb-num' + (p.alerta && p.n !== '0' ? ' is-alerta' : ''));
      d.appendChild(el('strong', null, p.n));
      d.appendChild(el('span', null, p.rot));
      nums.appendChild(d);
    });
    if (nEnc) {
      /* a área de baixo pode estar recolhida: daqui se chega nela */
      var ir = botao('ver as encerradas', 'btn--sm btn--quiet kb-ir-enc', function () { abrirEncerradas(true); },
        'Abre a área das NCRs encerradas (CEDOC Closure), abaixo do quadro');
      nums.appendChild(ir);
    }
    box.appendChild(nums);

    if (total) {
      var barra = el('div', 'kb-barra');
      barra.setAttribute('role', 'img');
      var partes = [];
      colunasDef().concat([AREA_ENCERRADAS]).forEach(function (col) {
        var n = todos.filter(function (c) { return c.coluna === col.id; }).length;
        if (!n) return;
        var s = el('span', 'kb-barra-seg st-cor--' + col.id);
        s.style.width = (n * 100 / total) + '%';
        s.title = col.nome + ': ' + n;
        barra.appendChild(s);
        partes.push(col.nome + ' ' + n);
      });
      barra.setAttribute('aria-label', partes.join(', '));
      box.appendChild(barra);
    }
    return box;
  }

  /** Os números da faixa — os mesmos na tela e na folha impressa. */
  function numerosDoResumo(todos) {
    var noRel = todos.filter(function (c) { return c.tipo === 'item'; });
    var aceitos = noRel.filter(function (c) { return c.coluna === Store.STATUS_CONCLUIDO; }).length;
    return [
      { n: String(todos.length), rot: 'NCRs neste marco' },
      { n: String(noRel.length), rot: 'no relatório' },
      { n: noRel.length ? Math.round(aceitos * 100 / noRel.length) + '%' : '—', rot: 'aceitas (do relatório)' },
      { n: String(todos.filter(function (c) { return c.coluna === FORA && !c.fechada; }).length), rot: 'to be closed (ainda abertas)' },
      { n: String(todos.filter(function (c) { return c.alerta; }).length), rot: 'fechadas com waiver pendente', alerta: true },
      { n: String(todos.filter(function (c) { return c.coluna === ENCERRADA; }).length), rot: 'encerradas (CEDOC Closure)' }
    ];
  }

  function quadro(vis, todos) {
    var q = el('div', 'kb-quadro');
    colunasDef().forEach(function (col) {
      var cs = ordenar(vis.filter(function (c) { return c.coluna === col.id; }));
      var nTot = todos.filter(function (c) { return c.coluna === col.id; }).length;
      var coluna = el('section', 'kb-col st-cor--' + col.id + (col.id === FORA ? ' kb-col--fora' : ''));
      coluna.dataset.coluna = col.id;
      coluna.setAttribute('aria-label', col.nome + ': ' + cs.length + ' NCR(s)');
      var ch = el('header', 'kb-col-cab');
      ch.appendChild(el('span', 'st-cor-ponto'));
      ch.appendChild(el('h3', null, col.nome));
      ch.appendChild(el('span', 'kb-col-n', cs.length === nTot ? String(nTot) : cs.length + '/' + nTot));
      ch.title = col.ajuda;
      coluna.appendChild(ch);
      var corpo = el('div', 'kb-col-corpo');
      if (col.id === FORA) {
        var nEnc = todos.filter(function (c) { return c.coluna === ENCERRADA; }).length;
        if (nTot) {
          var nFech = todos.filter(function (c) { return c.coluna === FORA && c.fechada; }).length;
          ch.appendChild(el('div', 'kb-col-sub', nFech + ' de ' + nTot + ' já fechada' + (nTot > 1 ? 's' : '') +
            ' · ' + (nTot - nFech) + ' a fechar'));
        }
        if (nEnc) {
          var enc = el('button', 'kb-col-sub kb-col-enc', '+ ' + nEnc + ' encerrada' + (nEnc > 1 ? 's' : '') +
            ' (CEDOC Closure) — abaixo do quadro');
          enc.type = 'button';
          enc.title = 'Já encerradas no banco NCR: estão na área própria, abaixo do quadro';
          enc.addEventListener('click', function () { abrirEncerradas(true); });
          ch.appendChild(enc);
        }
      }
      if (!cs.length) corpo.appendChild(el('p', 'kb-col-vazia', col.id === FORA ? 'Nenhuma NCR fora do Waiver.' : 'Nenhuma NCR aqui.'));
      cs.forEach(function (c) { corpo.appendChild(cartao(c)); });
      coluna.appendChild(corpo);
      if (col.id !== FORA && !leitura()) soltarEm(coluna, col.id);
      q.appendChild(coluna);
    });
    return q;
  }

  /**
   * As encerradas no CEDOC, numa área à parte: a mesma cara de cartão, em
   * grade, abaixo do quadro. Recolhível — a escolha fica neste navegador —,
   * mas o título, com a quantidade, está sempre à vista.
   */
  function areaEncerradas(vis, todos) {
    var cs = ordenar(vis.filter(function (c) { return c.coluna === ENCERRADA; }));
    var nTot = todos.filter(function (c) { return c.coluna === ENCERRADA; }).length;
    var aberta = !!lerPref(CHAVE_ENCERRADAS, false);
    var box = el('section', 'kb-enc st-cor--' + ENCERRADA);
    box.id = 'kbEncerradas';
    var h = el('h3', 'kb-enc-tit');
    var b = el('button', 'kb-enc-btn');
    b.type = 'button';
    b.id = 'kbEncBtn';
    b.setAttribute('aria-expanded', aberta ? 'true' : 'false');
    b.setAttribute('aria-controls', 'kbEncCorpo');
    b.appendChild(el('span', 'kb-enc-seta', aberta ? '▾' : '▸'));
    b.appendChild(el('span', 'kb-enc-nome', '✓ ' + AREA_ENCERRADAS.nome));
    b.appendChild(el('span', 'kb-col-n', cs.length === nTot ? String(nTot) : cs.length + '/' + nTot));
    b.appendChild(el('span', 'kb-enc-dica', nTot
      ? 'NCRs deste marco fora do Waiver, já encerradas no banco NCR — ' + (aberta ? 'clique para recolher' : 'clique para ver')
      : 'Nenhuma NCR deste marco em “CEDOC Closure”.'));
    b.addEventListener('click', function () { abrirEncerradas(!lerPref(CHAVE_ENCERRADAS, false)); });
    h.appendChild(b);
    box.appendChild(h);
    var corpo = el('div', 'kb-enc-corpo');
    corpo.id = 'kbEncCorpo';
    corpo.hidden = !aberta;
    if (!cs.length) corpo.appendChild(el('p', 'kb-col-vazia', nTot ? 'Nenhuma encerrada passa nos filtros.' : 'Nada aqui.'));
    cs.forEach(function (c) { corpo.appendChild(cartao(c)); });
    box.appendChild(corpo);
    return box;
  }

  function abrirEncerradas(abrir) {
    gravarPref(CHAVE_ENCERRADAS, !!abrir);
    render(host, ctx);
    var b = document.getElementById('kbEncBtn');
    if (b) {
      b.focus();
      if (abrir && b.scrollIntoView) b.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  /* --- o cartão ---------------------------------------------------------------- */

  function cartao(c) {
    var aberto = !!st.abertos[c.id];
    var card = el('article', 'kb-card' + (c.alerta ? ' is-alerta' : '') + (c.tipo !== 'item' ? ' is-fora' : '') +
      (aberto ? ' is-aberto' : ''));
    card.dataset.tipo = c.tipo;
    card.dataset.id = c.id;
    var arrasta = !leitura() && (c.tipo === 'item' || (c.tipo === 'banco' && c.relatorio));
    if (arrasta) {
      card.draggable = true;
      card.addEventListener('dragstart', function (e) {
        emArraste = c;
        card.classList.add('is-arrastando');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', numeroDe(c)); } catch (x) { /* ok */ }
      });
      card.addEventListener('dragend', function () {
        emArraste = null;
        card.classList.remove('is-arrastando');
        Array.prototype.forEach.call(document.querySelectorAll('.kb-col.is-alvo'), function (n) { n.classList.remove('is-alvo'); });
      });
    }

    /* linha 1: o número (inteiro — é ele que identifica), o alerta e o "+" */
    var topo = el('div', 'kb-card-topo');
    var num = el('button', 'kb-card-num', numeroDe(c));
    num.type = 'button';
    num.title = c.tipo === 'banco' ? 'Abrir a ficha da NCR' : 'Abrir o item no relatório ' + marcoRel(c.project) + ' Waiver';
    num.addEventListener('click', function () {
      if (c.tipo === 'banco') ctx.abrirFicha(c.rec.key);
      else ctx.abrir(c.project, c.item);
    });
    topo.appendChild(num);
    if (c.alerta) {
      var al = el('span', 'kb-alerta-ic', '⚠');
      al.title = 'NCR fechada no banco e o waiver ainda em “' + Store.statusInfo(c.coluna).nome + '”';
      al.setAttribute('role', 'img');
      al.setAttribute('aria-label', 'Alerta: ' + al.title);
      topo.appendChild(al);
    }
    var det = el('div', 'kb-card-det');
    det.id = 'kbd-' + c.id.replace(/[^\w-]/g, '_');
    var mais = el('button', 'kb-card-mais', aberto ? '−' : '+');
    mais.type = 'button';
    mais.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    mais.setAttribute('aria-controls', det.id);
    mais.setAttribute('aria-label', (aberto ? 'Recolher ' : 'Mostrar a descrição de ') + numeroDe(c));
    mais.title = aberto ? 'Recolher o cartão' : 'Mostrar a descrição e os detalhes';
    mais.addEventListener('click', function () {
      /* só a tela: o cartão não muda de coluna nem grava nada */
      if (st.abertos[c.id]) delete st.abertos[c.id]; else st.abertos[c.id] = true;
      var agora = !!st.abertos[c.id];
      card.classList.toggle('is-aberto', agora);
      det.hidden = !agora;
      mais.textContent = agora ? '−' : '+';
      mais.setAttribute('aria-expanded', agora ? 'true' : 'false');
      mais.setAttribute('aria-label', (agora ? 'Recolher ' : 'Mostrar a descrição de ') + numeroDe(c));
      mais.title = agora ? 'Recolher o cartão' : 'Mostrar a descrição e os detalhes';
    });
    topo.appendChild(mais);
    card.appendChild(topo);

    /* linha 2: o status da NCR no banco, a função em poucas letras, o
       sistema e o caminho — e as ações, que descem de linha se não couberem */
    var linha = el('div', 'kb-card-linha');
    var meta = el('div', 'kb-card-meta');
    var chip = chipStatus(c);
    if (chip) meta.appendChild(chip);
    var fv = funcaoDe(c);
    if (fv) {
      var f = el('span', 'kb-fv', funcaoCurta(fv));
      f.title = fv;
      meta.appendChild(f);
    }
    var sis = sistemaDe(c);
    if (sis) {
      var s = el('span', 'kb-sis', curto(sis, 14));
      s.title = 'Sistema(s): ' + sis;
      meta.appendChild(s);
    }
    var caminho = caminhoDe(c);
    if (caminho) {
      var cm = el('span', 'kb-caminho', caminho);
      cm.title = c.tipo === 'caminho'
        ? 'Vem do ' + marcoRel(c.project) + ' — ' + Store.statusInfo(c.item.status).nome + (c.aprovado ? ' (Approved Expiry)' : ' (Request Expiry)')
        : 'Caminho do waiver';
      meta.appendChild(cm);
    }
    if (c.item && c.item.nota) {
      var nt = el('span', 'kb-nota', '📝');
      nt.title = 'Anotação: ' + curto(c.item.nota, 300);
      nt.setAttribute('role', 'img');
      nt.setAttribute('aria-label', 'Tem anotação');
      meta.appendChild(nt);
    }
    if (c.item && c.item.herdadoDe) {
      var hd = el('span', 'kb-nota', '⤵');
      hd.title = 'Veio do ' + c.item.herdadoDe;
      hd.setAttribute('role', 'img');
      hd.setAttribute('aria-label', hd.title);
      meta.appendChild(hd);
    }
    linha.appendChild(meta);
    linha.appendChild(acoesDoCartao(c));
    card.appendChild(linha);

    /* aberto: o que dá contexto — o alerta por extenso, de onde vem, a
       descrição inteira e quem mexeu por último */
    det.hidden = !aberto;
    if (c.alerta) {
      var ala = el('div', 'kb-alerta');
      ala.appendChild(el('strong', null, '⚠ NCR fechada'));
      ala.appendChild(document.createTextNode(' e o waiver ainda em “' + Store.statusInfo(c.coluna).nome + '”'));
      det.appendChild(ala);
    }
    var origem = origemDe(c);
    if (origem) det.appendChild(el('div', 'kb-origem' + (c.tipo === 'caminho' ? ' kb-origem--caminho' : ''), origem));
    if (fv && funcaoCurta(fv) !== fv) det.appendChild(el('div', 'kb-fv-inteira', fv));
    var desc = descricaoDe(c);
    det.appendChild(desc ? el('p', 'kb-desc', desc) : el('p', 'kb-desc kb-desc--vazia', 'Sem descrição.'));
    var quem = quemDe(c);
    if (quem) det.appendChild(el('div', 'kb-quem', quem));
    card.appendChild(det);
    return card;
  }

  /** O status da NCR no banco, com a leitura certa para cada coluna. */
  function chipStatus(c) {
    var stNcr = statusDe(c);
    if (stNcr && (c.coluna === FORA || c.coluna === ENCERRADA)) {
      /* aqui a meta é fechar: fechada é o verde, aberta é o que falta */
      var chip = el('span', 'kb-st-ncr ' + (c.fechada ? 'is-ok' : 'is-falta'),
        (c.fechada ? '✓ ' : '') + curto(stNcr, 26));
      chip.title = (c.coluna === ENCERRADA ? 'NCR encerrada no banco NCR: ' : c.fechada ? 'NCR já fechada no banco NCR: '
        : 'NCR ainda aberta: precisa ser fechada (não está no Waiver deste marco). Status: ') + stNcr;
      return chip;
    }
    if (stNcr) {
      var ch = el('span', 'kb-st-ncr' + (c.fechada ? ' is-fechada' : ''), curto(stNcr, 26));
      ch.title = 'Status da NCR no banco NCR: ' + stNcr;
      return ch;
    }
    if (!c.rec) {
      var sb = el('span', 'kb-st-ncr is-sem', 'fora do banco');
      sb.title = 'Este item não corresponde a nenhuma NCR importada do banco NCR (SBR4)';
      return sb;
    }
    return null;
  }

  /** As ações de sempre, cada uma no seu tipo de cartão — nenhuma sumiu. */
  function acoesDoCartao(c) {
    var acoes = el('div', 'kb-card-acoes');
    if (c.tipo === 'item' && leitura()) {
      var stInfo = Store.statusInfo(c.coluna);
      acoes.appendChild(el('span', 'kb-sel kb-sel--so st-cor--' + c.coluna, stInfo.nome));
    } else if (c.tipo === 'item') {
      acoes.appendChild(seletorSituacao(c));
    } else if (c.tipo === 'banco' && leitura()) {
      /* no visualizador não se adiciona: fica só a ficha, abaixo */
    } else if (c.tipo === 'banco') {
      if (c.fechada) {
        /* NCR fechada não precisa de waiver: nada de convite a adicionar */
        var fw = el('span', 'kb-sem-rel', 'fechada — sem waiver');
        fw.title = 'A NCR já está fechada no banco NCR: não precisa de waiver neste marco';
        acoes.appendChild(fw);
      } else if (c.relatorio) {
        acoes.appendChild(botao('+ ' + marcoRel(c.relatorio) + ' Waiver', 'btn--sm', function () {
          ctx.adicionar(c.rec, c.relatorio).then(function () { render(host, ctx); });
        }, 'Adicionar esta NCR ao relatório ' + marcoRel(c.relatorio) + ' Waiver (entra em "Em preenchimento")'));
      } else {
        var sem = el('span', 'kb-sem-rel', 'sem relatório');
        sem.title = 'Crie o relatório ' + st.marco + ' para adicionar esta NCR a ele';
        acoes.appendChild(sem);
      }
    } else if (c.tipo === 'caminho') {
      acoes.appendChild(botao('Abrir no ' + marcoRel(c.project), 'btn--sm', function () { ctx.abrir(c.project, c.item); },
        'Abre o item no relatório de origem; o botão “⤵ Levar para o marco seguinte” fica na barra de situação'));
    }
    if (c.rec) {
      acoes.appendChild(botao('Ficha', 'btn--sm btn--quiet', function () { ctx.abrirFicha(c.rec.key); }, 'Abrir a ficha da NCR no Banco NCR'));
    }
    return acoes;
  }

  /** De onde a NCR vem, por extenso — o cartão aberto e a folha impressa. */
  function origemDe(c) {
    if (c.tipo === 'banco') {
      var outros = Ncrs.vinculos(c.rec, ctx.projects()).map(function (v) { return marcoRel(v.project); });
      return 'No banco: Marco Atual ' + c.rec.waiver.marcoAtual +
        (outros.length ? ' · no Waiver de ' + outros.sort(Fluxo.cmpMarco).join(', ') : ' · em nenhum Waiver');
    }
    if (c.tipo === 'caminho') {
      return 'Vem do ' + marcoRel(c.project) + ' — ' + Store.statusInfo(c.item.status).nome +
        (c.aprovado ? ' (Approved Expiry)' : ' (Request Expiry)');
    }
    return '';
  }

  function quemDe(c) {
    var w = c.item ? { por: c.item.editedBy, em: c.item.editedAt } : (c.rec ? { por: c.rec.waiver.editedBy, em: c.rec.waiver.editedAt } : null);
    if (!w || !w.em) return '';
    return 'Última alteração: ' + (w.por || 'sem nome') + ' · ' + Ncrs.data(w.em);
  }

  /** De onde veio → este marco → (para onde vai), como o "Caminho do waiver". */
  function caminhoDe(c) {
    if (!c.item) {
      var w = c.rec.waiver;
      return w.marcoOriginal && Ncrs.marcoChave(w.marcoOriginal) !== Ncrs.marcoChave(w.marcoAtual)
        ? w.marcoOriginal + ' → ' + w.marcoAtual : '';
    }
    var a = Fluxo.analisar(c.item.historic || '');
    var t = Fluxo.caminhoTexto(a);
    var alvo = Herdar.paraOnde(c.item);
    var aqui = Fluxo.marco(marcoRel(c.project));
    if (alvo && !(aqui && Fluxo.mesmoMarco(alvo.no, aqui))) t = (t || marcoRel(c.project)) + ' → (' + alvo.no.rotulo + ')';
    return t;
  }

  /** Mudar a situação sem arrastar (teclado, leitor de tela, WCAG 2.5.7). */
  function seletorSituacao(c) {
    var sel = el('select', 'kb-sel st-cor--' + c.coluna);
    sel.setAttribute('aria-label', 'Situação do waiver de ' + numeroDe(c));
    sel.title = 'Situação do waiver no relatório ' + marcoRel(c.project);
    Store.STATUS.forEach(function (s) {
      var o = el('option', null, s.nome);
      o.value = s.id;
      sel.appendChild(o);
    });
    sel.value = c.coluna;
    sel.addEventListener('change', function () {
      mover(c, sel.value, function () { sel.value = c.coluna; });
    });
    return sel;
  }

  /* --- arrastar entre as colunas ------------------------------------------------ */

  var emArraste = null;

  function soltarEm(coluna, id) {
    coluna.addEventListener('dragover', function (e) {
      if (!emArraste || emArraste.coluna === id) return;
      e.preventDefault();
      coluna.classList.add('is-alvo');
    });
    coluna.addEventListener('dragleave', function (e) {
      if (!coluna.contains(e.relatedTarget)) coluna.classList.remove('is-alvo');
    });
    coluna.addEventListener('drop', function (e) {
      e.preventDefault();
      coluna.classList.remove('is-alvo');
      var c = emArraste;
      emArraste = null;
      if (c) mover(c, id);
    });
  }

  function mover(c, id, desfazer) {
    if (c.tipo === 'banco') {
      /* do banco para o relatório: adicionar, e já na situação escolhida */
      ctx.adicionar(c.rec, c.relatorio, id).then(function () { render(host, ctx); });
      return;
    }
    if (c.tipo !== 'item' || c.coluna === id) return;
    if (c.coluna === Store.STATUS_CONCLUIDO &&
        !global.confirm('Tirar ' + numeroDe(c) + ' de “Waiver accepted”?\n\nO item aceito fica travado no editor; ' +
          'mudar a situação vale para toda a equipe na próxima sincronização.')) {
      if (desfazer) desfazer();
      return;
    }
    ctx.mudarSituacao(c.project, c.item, id).then(function () { render(host, ctx); });
  }

  /* ==========================================================================
     Exportações — sempre do que está à vista: o marco e os filtros da tela
     ========================================================================== */

  /** Os filtros ligados, em palavras: vão para a folha e para a planilha. */
  function descricaoDosFiltros() {
    var partes = [];
    if (st.busca) partes.push('busca: “' + st.busca + '”');
    if (st.soAlertas) partes.push('só com alerta (NCR fechada com waiver pendente)');
    partes.push(st.caminho ? 'com as que vêm de outros marcos' : 'sem as que vêm de outros marcos');
    return partes.join(' · ');
  }

  function nomeColuna(id) {
    if (id === ENCERRADA) return AREA_ENCERRADAS.nome;
    var d = colunasDef().filter(function (x) { return x.id === id; })[0];
    return d ? d.nome : id;
  }

  function origemCurta(c) {
    if (c.tipo === 'item') return 'No relatório ' + marcoRel(c.project) + ' Waiver';
    if (c.tipo === 'banco') return 'Só no banco NCR (fora do Waiver)';
    return 'Vem do ' + marcoRel(c.project) + (c.aprovado ? ' (Approved Expiry)' : ' (Request Expiry)');
  }

  function dataCurta(iso) {
    return iso ? Ncrs.data(iso) : '';
  }

  /**
   * A planilha: uma linha por NCR à vista (a área das encerradas incluída),
   * na ordem das colunas do quadro, e a aba "Recorte" dizendo de que marco e
   * de que filtro ela saiu — a regra das outras planilhas do programa.
   */
  function planilha() {
    var projects = ctx.projects();
    var e = estado(projects);
    var ordem = colunasDef().map(function (c) { return c.id; }).concat([ENCERRADA]);
    var linhas = [];
    ordem.forEach(function (id) {
      ordenar(e.vis.filter(function (c) { return c.coluna === id; })).forEach(function (c) {
        var edit = c.item ? { por: c.item.editedBy, em: c.item.editedAt } : { por: c.rec.waiver.editedBy, em: c.rec.waiver.editedAt };
        linhas.push([
          numeroDe(c),
          st.marco,
          nomeColuna(c.coluna),
          c.tipo === 'item' ? Store.statusInfo(c.item.status).nome : (c.tipo === 'caminho' ? Store.statusInfo(c.item.status).nome + ' (no ' + marcoRel(c.project) + ')' : ''),
          origemCurta(c),
          sistemaDe(c),
          funcaoDe(c),
          statusDe(c),
          c.rec ? (c.fechada ? 'sim' : 'não') : '',
          c.alerta ? 'NCR fechada com waiver pendente' : '',
          caminhoDe(c),
          descricaoDe(c),
          (c.rec && Ncrs.fonte(c.rec).responsavel) || '',
          edit.por || '',
          dataCurta(edit.em)
        ]);
      });
    });
    var colunas = [
      { titulo: 'Número da NCR', larg: 26 }, { titulo: 'Marco', larg: 10 }, { titulo: 'Coluna do Kanban', larg: 26 },
      { titulo: 'Situação do waiver', larg: 22 }, { titulo: 'Origem', larg: 30 }, { titulo: 'Sistema', larg: 12 },
      { titulo: 'Função / função vital', larg: 40 }, { titulo: 'Status da NCR (banco)', larg: 22 },
      { titulo: 'NCR fechada?', larg: 12 }, { titulo: 'Alerta', larg: 30 }, { titulo: 'Caminho do waiver', larg: 24 },
      { titulo: 'Descrição', larg: 80 }, { titulo: 'Responsável (banco)', larg: 20 },
      { titulo: 'Última alteração por', larg: 20 }, { titulo: 'Última alteração em', larg: 18 }
    ];
    var rel = projects.filter(function (p) { return Ncrs.marcoChave(p.marco) === Ncrs.marcoChave(st.marco); })[0];
    var recorte = [
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Gerado por', ctx.usuario ? (ctx.usuario() || '(sem nome)') : ''],
      ['Marco do quadro', st.marco],
      ['Relatório de Waiver', rel ? marcoRel(rel) + ' Waiver' : 'ainda não há relatório deste marco'],
      ['NCRs nesta planilha', linhas.length],
      ['NCRs no quadro (sem filtro)', e.todos.length],
      ['Filtros', descricaoDosFiltros()],
      ['Observação', 'Uma linha por NCR, na ordem das colunas do quadro. “Encerradas — CEDOC Closure” é a área ' +
        'abaixo do quadro. Situação do waiver: a do relatório (ou a do relatório de origem, para as que vêm de outro marco).']
    ];
    return { nome: 'Kanban_' + str(st.marco).replace(/[^\w-]+/g, '_'), colunas: colunas, linhas: linhas, recorte: recorte };
  }

  function exportarPlanilha() {
    if (!st.marco) return;
    ctx.exportarPlanilha(planilha());
  }

  /* --- a folha para impressão -------------------------------------------------- */

  var PAPEIS = {
    'A4': { nome: 'A4', retrato: [210, 297] },
    'A3': { nome: 'A3', retrato: [297, 420] }
  };
  /* Letra de saída de cada folha (pt): o que ainda se lê bem impresso com as
     cinco colunas lado a lado. A escala automática parte daqui. */
  var LETRA_BASE = { 'A4-retrato': 6.5, 'A4-paisagem': 7.5, 'A3-retrato': 8, 'A3-paisagem': 9.5 };
  var LETRA_MIN = 5.5;
  var CRESCE_ATE = 1.4;

  function prefsImpressao() {
    var p = lerPref(CHAVE_IMPRESSAO, null) || {};
    return {
      papel: PAPEIS[p.papel] ? p.papel : 'A3',
      orientacao: p.orientacao === 'retrato' ? 'retrato' : 'paisagem',
      escala: p.escala === 'uma' ? 'uma' : 'largura',
      descricao: !!p.descricao,
      encerradas: p.encerradas !== false
    };
  }

  function classesDaFolha(o) {
    return 'rep-page rep-page--kanban' + (o.papel === 'A3' ? ' rep-page--a3' : '') +
      (o.orientacao === 'paisagem' ? ' rep-page--landscape' : '');
  }

  /** Um cartão para o papel: só texto, sem botão nem lista. */
  function cartaoImpresso(c, comDescricao) {
    var k = el('div', 'kbp-card st-cor--' + c.coluna + (c.alerta ? ' is-alerta' : ''));
    k.appendChild(el('div', 'kbp-num', numeroDe(c)));
    /* a segunda linha é a mesma do cartão da tela: status da NCR, função,
       sistema e caminho */
    var l2 = el('div', 'kbp-l2');
    if (statusDe(c)) {
      l2.appendChild(el('span', 'kbp-st' + (c.fechada ? ' is-fechada' : ''),
        (c.fechada && (c.coluna === FORA || c.coluna === ENCERRADA) ? '✓ ' : '') + statusDe(c)));
    } else if (!c.rec) {
      l2.appendChild(el('span', 'kbp-st is-sem', 'fora do banco'));
    }
    var partes = [funcaoDe(c) ? funcaoCurta(funcaoDe(c)) : '', curto(sistemaDe(c), 18), caminhoDe(c)].filter(Boolean);
    if (partes.length) l2.appendChild(document.createTextNode((l2.childNodes.length ? ' · ' : '') + partes.join(' · ')));
    if (l2.childNodes.length) k.appendChild(l2);
    if (c.alerta) k.appendChild(el('div', 'kbp-alerta', '⚠ NCR fechada e o waiver ainda em “' + Store.statusInfo(c.coluna).nome + '”'));
    if (c.tipo !== 'item') k.appendChild(el('div', 'kbp-origem', origemCurta(c)));
    if (comDescricao) {
      if (funcaoDe(c) && funcaoCurta(funcaoDe(c)) !== funcaoDe(c)) k.appendChild(el('div', 'kbp-fv', funcaoDe(c)));
      var d = descricaoDe(c);
      if (d) k.appendChild(el('div', 'kbp-desc', d));
      var q = quemDe(c);
      if (q) k.appendChild(el('div', 'kbp-quem', q));
    }
    return k;
  }

  function cabecalhoImpresso(o, e, rel, cont) {
    var cab = el('header', 'kbp-cab');
    var t = el('div', 'kbp-tit');
    t.appendChild(document.createTextNode('Kanban do marco '));
    t.appendChild(el('strong', null, st.marco));
    if (cont) t.appendChild(el('span', 'kbp-cont', ' (cont.)'));
    cab.appendChild(t);
    if (cont) return cab;
    cab.appendChild(el('div', 'kbp-info', (rel ? 'Relatório: ' + marcoRel(rel) + ' Waiver' : 'Ainda não há relatório de Waiver deste marco') +
      ' · Gerado em ' + new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) +
      (ctx.usuario && ctx.usuario() ? ' por ' + ctx.usuario() : '')));
    var filtros = descricaoDosFiltros();
    var n = e.vis.length;
    cab.appendChild(el('div', 'kbp-info kbp-filtros', 'Filtros: ' + filtros + ' · ' + n + ' de ' + e.todos.length +
      ' NCR(s) à vista' + (o.encerradas ? '' : ' · sem a área das encerradas')));
    cab.appendChild(el('div', 'kbp-nums', numerosDoResumo(e.todos).map(function (p) { return p.n + ' ' + p.rot; }).join(' · ')));
    return cab;
  }

  /**
   * Monta as folhas no #printRoot (já com layout: abrirMedida) e devolve
   * { folhas, letra }. As cinco colunas dividem a largura da folha; os
   * cartões de cada coluna vão enchendo a folha até o pé e continuam na
   * seguinte, com o cabeçalho das colunas repetido. Nenhum cartão é partido.
   */
  function montarFolhas(root, o, letra) {
    root.innerHTML = '';
    var projects = ctx.projects();
    var e = estado(projects);
    var rel = projects.filter(function (p) { return Ncrs.marcoChave(p.marco) === Ncrs.marcoChave(st.marco); })[0];
    var defs = colunasDef();
    var porColuna = defs.map(function (d) {
      return { def: d, cs: ordenar(e.vis.filter(function (c) { return c.coluna === d.id; })) };
    });

    function novaFolha(cont) {
      var f = el('section', classesDaFolha(o));
      f.lang = 'pt-BR';
      f.style.setProperty('--kbp-fs', letra + 'pt');
      f.appendChild(cabecalhoImpresso(o, e, rel, cont));
      var q = el('div', 'kbp-quadro');
      defs.forEach(function (d) {
        var col = el('div', 'kbp-col st-cor--' + d.id);
        var ch = el('div', 'kbp-col-cab');
        ch.appendChild(el('span', 'kbp-col-nome', d.nome));
        col.appendChild(ch);
        col.appendChild(el('div', 'kbp-col-corpo'));
        q.appendChild(col);
      });
      f.appendChild(q);
      f.appendChild(pe());
      root.appendChild(f);
      return f;
    }

    /* o pé já nasce com texto: vazio ele mediria uma linha a menos, e a
       conta das folhas sairia curta (a numeração certa entra no fim) */
    function pe() { return el('footer', 'kbp-pe', 'Waiver Request · Kanban do marco ' + st.marco + ' · folha 1 de 1'); }

    /* quanto cabe de cartão numa folha: da borda de cima do corpo da coluna
       até o pé da folha, descontada a folga contra o arredondamento */
    function alturaUtil(f) {
      var corpo = f.querySelector('.kbp-col-corpo');
      var pe = f.querySelector('.kbp-pe');
      var r = f.getBoundingClientRect();
      var util = Report.limite(f) - (corpo.getBoundingClientRect().top - r.top) -
        pe.getBoundingClientRect().height - parseFloat(getComputedStyle(f).paddingBottom) - Report.mm(2);
      return Math.max(util, Report.mm(20));
    }

    var folhas = [novaFolha(false)];
    /* mede os cartões uma vez, na largura da coluna */
    var medidas = porColuna.map(function (pc, i) {
      var corpo = folhas[0].querySelectorAll('.kbp-col-corpo')[i];
      return pc.cs.map(function (c) {
        var k = cartaoImpresso(c, o.descricao);
        corpo.appendChild(k);
        var h = k.getBoundingClientRect().height;
        var mb = parseFloat(getComputedStyle(k).marginBottom) || 0;
        corpo.removeChild(k);
        return { c: c, h: h + mb };
      });
    });
    var utilPrimeira = alturaUtil(folhas[0]);
    var sonda = novaFolha(true);
    var utilDemais = alturaUtil(sonda);
    root.removeChild(sonda);

    /* distribui cada coluna pelas folhas */
    var paginas = porColuna.map(function (pc, i) {
      var pgs = [[]], usado = 0, p = 0;
      medidas[i].forEach(function (m) {
        var util = p === 0 ? utilPrimeira : utilDemais;
        if (usado + m.h > util && pgs[p].length) { pgs.push([]); p++; usado = 0; }
        pgs[p].push(m.c);
        usado += m.h;
      });
      return pgs;
    });
    var n = Math.max.apply(null, paginas.map(function (pgs) { return pgs.length; }));
    for (var k = 1; k < n; k++) folhas.push(novaFolha(true));
    folhas.forEach(function (f, fi) {
      var corpos = f.querySelectorAll('.kbp-col-corpo');
      var cabs = f.querySelectorAll('.kbp-col-cab');
      porColuna.forEach(function (pc, i) {
        var pgs = paginas[i];
        var aqui = pgs[fi] || [];
        /* a contagem vai na primeira folha; nas outras, "(cont.)" se a
           coluna continua ali, e um traço se ela já acabou antes */
        var rot = fi === 0 ? String(pc.cs.length) : (aqui.length ? '(cont.)' : '—');
        cabs[i].appendChild(el('span', 'kbp-col-n', rot));
        if (fi === 0 && !pc.cs.length) corpos[i].appendChild(el('div', 'kbp-vazia', 'Nenhuma NCR.'));
        aqui.forEach(function (c) { corpos[i].appendChild(cartaoImpresso(c, o.descricao)); });
      });
    });

    /* as encerradas: em lista, depois do quadro — a mesma paginação do
       relatório (Report.paginar) leva as linhas que não couberem */
    var enc = ordenar(e.vis.filter(function (c) { return c.coluna === ENCERRADA; }));
    if (o.encerradas && enc.length) {
      var ult = folhas[folhas.length - 1];
      var lista = el('div', 'kbp-enc');
      lista.setAttribute('data-fluido', '');
      lista.setAttribute('data-lista', '');
      var tl = el('div', 'kbp-enc-tit', '✓ ' + AREA_ENCERRADAS.nome + ' — ' + enc.length + ' NCR(s), já encerradas no banco NCR');
      tl.setAttribute('data-cabecalho', '');
      lista.appendChild(tl);
      enc.forEach(function (c) {
        var l = el('div', 'kbp-enc-linha');
        l.appendChild(el('span', 'kbp-num', numeroDe(c)));
        l.appendChild(el('span', 'kbp-enc-st', statusDe(c)));
        l.appendChild(el('span', 'kbp-enc-txt', [funcaoDe(c) ? funcaoCurta(funcaoDe(c)) : '', sistemaDe(c), caminhoDe(c), origemCurta(c)]
          .filter(Boolean).join(' · ') + (o.descricao && descricaoDe(c) ? ' — ' + curto(descricaoDe(c), 400) : '')));
        lista.appendChild(l);
      });
      var rodape = ult.querySelector('.kbp-pe');
      ult.insertBefore(lista, rodape);
      /* o pé entra na conta e é repetido em cada continuação */
      var mais = Report.paginar(ult, root, function () { return novaFolhaDeLista(); }, rodape);
      mais.slice(1).forEach(function (f) { folhas.push(f); });
    }

    function novaFolhaDeLista() {
      var f = el('section', classesDaFolha(o) + ' rep-page--cont');
      f.lang = 'pt-BR';
      f.style.setProperty('--kbp-fs', letra + 'pt');
      f.appendChild(cabecalhoImpresso(o, e, rel, true));
      return f;
    }

    var total = folhas.length;
    folhas.forEach(function (f, i) {
      var p = f.querySelector('.kbp-pe');
      if (p) p.textContent = 'Waiver Request · Kanban do marco ' + st.marco + ' · folha ' + (i + 1) + ' de ' + total;
    });
    return { folhas: folhas, letra: letra };
  }

  /**
   * Acha a letra que aproveita a folha. "largura": a letra de saída do papel;
   * se tudo couber numa folha só, cresce até 40% enquanto continuar cabendo.
   * "uma": a maior letra com que tudo cabe numa folha (até o mínimo de 5 pt;
   * nem assim coube, vai no mínimo em quantas folhas precisar).
   */
  function planejar(root, o) {
    var base = LETRA_BASE[o.papel + '-' + o.orientacao];
    var cabe = function (letra) { return montarFolhas(root, o, letra).folhas.length === 1; };
    /* a maior letra entre lo e hi com que tudo cabe numa folha (lo já cabe) */
    var procurar = function (lo, hi, voltas) {
      for (var i = 0; i < voltas; i++) {
        var meio = (lo + hi) / 2;
        if (cabe(meio)) lo = meio; else hi = meio;
      }
      return montarFolhas(root, o, Math.floor(lo * 10) / 10);
    };
    var r = montarFolhas(root, o, base);
    if (r.folhas.length === 1) return procurar(base, base * CRESCE_ATE, 7);
    /* passou um pouco de uma folha: vale diminuir a letra em até 15% para
       não imprimir uma segunda folha quase vazia */
    var quase = base * 0.85;
    if (cabe(quase)) return procurar(quase, base, 6);
    if (o.escala !== 'uma') return montarFolhas(root, o, base);
    /* "caber numa folha só": nem com a letra mínima? vai no mínimo, em várias */
    if (!cabe(LETRA_MIN)) return montarFolhas(root, o, LETRA_MIN);
    return procurar(LETRA_MIN, quase, 8);
  }

  /* --- a janela de escolhas ------------------------------------------------------ */

  function abrirImpressao() {
    if (!st.marco) return;
    var dlg = document.getElementById('kbExportDialog');
    if (!dlg) return;
    var o = prefsImpressao();
    var body = dlg.querySelector('.dlg-body');
    var ac = dlg.querySelector('.dlg-actions');
    body.innerHTML = '';
    ac.innerHTML = '';
    body.appendChild(el('h3', null, 'Exportar o Kanban para impressão'));
    body.appendChild(el('p', null, 'Sai o quadro do marco ' + st.marco + ' como está na tela — os mesmos filtros —, ' +
      'em PDF pela janela de impressão do navegador. Lá, escolha “Salvar como PDF” e, em Margens, “Nenhuma”: ' +
      'o tamanho do papel já vai certo.'));

    function grupo(rotulo, nome, opcoes, atual) {
      var fs = el('fieldset', 'kb-imp-grupo');
      fs.appendChild(el('legend', null, rotulo));
      opcoes.forEach(function (op) {
        var lab = el('label', 'kb-imp-op');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = nome;
        r.value = op[0];
        r.checked = op[0] === atual;
        r.addEventListener('change', atualizar);
        lab.appendChild(r);
        lab.appendChild(el('span', null, op[1]));
        fs.appendChild(lab);
      });
      return fs;
    }
    function caixa(nome, rotulo, marcado) {
      var lab = el('label', 'kb-imp-op');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = nome;
      cb.checked = marcado;
      cb.addEventListener('change', atualizar);
      lab.appendChild(cb);
      lab.appendChild(el('span', null, rotulo));
      return lab;
    }
    var grade = el('div', 'kb-imp-grade');
    grade.appendChild(grupo('Papel', 'kbPapel', [['A4', 'A4'], ['A3', 'A3']], o.papel));
    grade.appendChild(grupo('Orientação', 'kbOrient', [['paisagem', 'Paisagem (deitada)'], ['retrato', 'Retrato (em pé)']], o.orientacao));
    grade.appendChild(grupo('Escala', 'kbEscala', [['largura', 'Caber na largura — quantas folhas precisar'],
      ['uma', 'Caber numa folha só — a letra diminui']], o.escala));
    var cont = el('fieldset', 'kb-imp-grupo');
    cont.appendChild(el('legend', null, 'Conteúdo'));
    cont.appendChild(caixa('kbDesc', 'Descrição das NCRs nos cartões', o.descricao));
    cont.appendChild(caixa('kbEnc', 'Encerradas (CEDOC Closure), em lista no fim', o.encerradas));
    grade.appendChild(cont);
    body.appendChild(grade);
    var previa = el('p', 'kb-imp-previa');
    previa.id = 'kbImpPrevia';
    previa.setAttribute('role', 'status');
    body.appendChild(previa);

    function lidas() {
      var v = function (nome) { var x = body.querySelector('input[name="' + nome + '"]:checked'); return x ? x.value : ''; };
      return {
        papel: v('kbPapel') || 'A3', orientacao: v('kbOrient') || 'paisagem', escala: v('kbEscala') || 'largura',
        descricao: body.querySelector('input[name="kbDesc"]').checked,
        encerradas: body.querySelector('input[name="kbEnc"]').checked
      };
    }
    function atualizar() {
      var op = lidas();
      gravarPref(CHAVE_IMPRESSAO, op);
      var res = ctx.medirImpressao(function (root) { return planejar(root, op); });
      var n = res ? res.folhas.length : 0;
      previa.textContent = res
        ? 'Vai sair em ' + n + ' folha' + (n > 1 ? 's' : '') + ' ' + op.papel + ' ' + (op.orientacao === 'paisagem' ? 'paisagem' : 'retrato') +
          ', com letra de ' + String(res.letra).replace('.', ',') + ' pt' +
          (op.escala === 'uma' && n > 1 ? ' — não coube numa folha nem com a letra mínima.' : '.')
        : '';
    }

    ac.appendChild(botao('Cancelar', '', function () { dlg.close(); }));
    ac.appendChild(botao('Gerar PDF', 'btn--primary', function () {
      var op = lidas();
      gravarPref(CHAVE_IMPRESSAO, op);
      dlg.close();
      ctx.imprimir(function (root) { return planejar(root, op); }, 'Kanban_' + str(st.marco).replace(/[^\w-]+/g, '_'));
    }));
    dlg.showModal();
    atualizar();
  }

  global.Kanban = {
    render: render,
    cartoes: cartoes,
    marcos: marcos,
    planilha: planilha,
    funcaoCurta: funcaoCurta,
    emCedoc: emCedoc,
    FORA: FORA,
    ENCERRADA: ENCERRADA
  };
})(window);
