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

   Marco casa com relatório pelo texto igual (Ncrs.marcoChave), a mesma
   regra do Banco NCR: "J06 Ind" não é o "J06".

   Só desenha e repassa: gravar, abrir o item e adicionar ao relatório é
   com o app.js (recebido em `ctx`). O PDF do relatório não é tocado.
   ========================================================================== */
(function (global) {
  'use strict';

  var FORA = 'fora';

  var st = {
    marco: '',          // o marco escolhido (texto, como está no relatório)
    busca: '',
    soAlertas: false,
    caminho: true       // mostrar os que vêm de outros marcos
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

  /* --- quem está em cada marco -------------------------------------------- */

  /** Os marcos que têm quadro: relatórios com NCR e Marco Atual do banco. */
  function marcos(projects) {
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
  }

  /** A NCR do banco que é este item (pelo vínculo gravado ou pelo número). */
  function recDoItem(item) {
    return (item.ncrKey && Ncrs.get(item.ncrKey)) || Ncrs.get(item.ncrId) || null;
  }

  /**
   * Os cartões do quadro de um marco.
   * { coluna, tipo: 'item'|'banco'|'caminho', project, item, rec, chave, alerta }
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
        var chave = rec ? rec.key : Ncrs.chave(it.ncrId);
        if (chave) jaTem[chave] = 1;
        out.push({ coluna: Store.statusInfo(it.status).id, tipo: 'item', project: p, item: it, rec: rec, chave: chave });
      });
    });

    Ncrs.lista().forEach(function (rec) {
      if (Ncrs.marcoChave(rec.waiver.marcoAtual) !== k || jaTem[rec.key]) return;
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
          if (av.estado !== 'aLevar' && av.estado !== 'semRelatorio') return;
          var rec = recDoItem(it);
          var chave = rec ? rec.key : Ncrs.chave(it.ncrId);
          if (chave && jaTem[chave]) return;
          if (chave) jaTem[chave] = 1;
          out.push({ coluna: FORA, tipo: 'caminho', project: p, item: it, rec: rec, chave: chave, aprovado: av.aprovado });
        });
      });
    }

    out.forEach(function (c) {
      c.fechada = c.rec ? Ncrs.fechada(c.rec) : false;
      c.alerta = c.fechada && c.tipo === 'item' && c.coluna !== Store.STATUS_CONCLUIDO;
    });
    return out;
  }

  function numeroDe(c) { return c.item ? (c.item.ncrId || '(sem número)') : c.rec.numero; }

  function textoBusca(c) {
    var partes = [numeroDe(c)];
    if (c.item) {
      partes.push(c.item.systems, c.item.func, c.item.description, c.item.nota, c.item.observation, c.item.historic);
    }
    if (c.rec) {
      partes.push(c.rec.fonte.descricao, c.rec.fonte.status, c.rec.fonte.sistema, c.rec.waiver.funcaoVital, c.rec.waiver.observacao);
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
      var inicial = ctx.marcoInicial();
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

    var todos = cartoes(st.marco, projects);
    var vis = todos.filter(passa);

    raiz.appendChild(cabecalho(lista, projects, todos));
    raiz.appendChild(resumo(todos));
    raiz.appendChild(quadro(vis, todos));
    host.scrollTop = topo;
    if (buscando) {
      var b = document.getElementById('kbBusca');
      if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }
  }

  function cabecalho(lista, projects, todos) {
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
    return cab;
  }

  /** A faixa de progresso: quantos em cada situação, com as mesmas cores. */
  function resumo(todos) {
    var box = el('div', 'kb-resumo');
    var total = todos.length;
    var noRel = todos.filter(function (c) { return c.tipo === 'item'; });
    var aceitos = noRel.filter(function (c) { return c.coluna === Store.STATUS_CONCLUIDO; }).length;
    var nums = el('div', 'kb-resumo-nums');
    [[String(total), 'NCRs neste marco'],
     [String(noRel.length), 'no relatório'],
     [noRel.length ? Math.round(aceitos * 100 / noRel.length) + '%' : '—', 'aceitas (do relatório)'],
     [String(todos.filter(function (c) { return c.coluna === FORA && !c.fechada; }).length), 'to be closed (ainda abertas)'],
     [String(todos.filter(function (c) { return c.alerta; }).length), 'fechadas com waiver pendente']
    ].forEach(function (p, i) {
      var d = el('div', 'kb-num' + (i === 4 && p[0] !== '0' ? ' is-alerta' : ''));
      d.appendChild(el('strong', null, p[0]));
      d.appendChild(el('span', null, p[1]));
      nums.appendChild(d);
    });
    box.appendChild(nums);

    if (total) {
      var barra = el('div', 'kb-barra');
      barra.setAttribute('role', 'img');
      var partes = [];
      colunasDef().forEach(function (col) {
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

  function colunasDef() {
    return [{ id: FORA, nome: 'NCR to be closed',
      ajuda: 'NCRs deste marco que não estão no Waiver dele: sem waiver, precisam ser fechadas até o marco' }]
      .concat(Store.STATUS.map(function (s) { return { id: s.id, nome: s.nome, ajuda: s.ajuda }; }));
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
      if (col.id === FORA && nTot) {
        var nFech = todos.filter(function (c) { return c.coluna === FORA && c.fechada; }).length;
        var sub = el('div', 'kb-col-sub', nFech + ' de ' + nTot + ' já fechada' + (nTot > 1 ? 's' : '') +
          ' · ' + (nTot - nFech) + ' a fechar');
        ch.appendChild(sub);
      }
      if (!cs.length) corpo.appendChild(el('p', 'kb-col-vazia', col.id === FORA ? 'Nenhuma NCR fora do Waiver.' : 'Nenhuma NCR aqui.'));
      cs.forEach(function (c) { corpo.appendChild(cartao(c)); });
      coluna.appendChild(corpo);
      if (col.id !== FORA) soltarEm(coluna, col.id);
      q.appendChild(coluna);
    });
    return q;
  }

  /* --- o cartão ---------------------------------------------------------------- */

  function cartao(c) {
    var card = el('article', 'kb-card' + (c.alerta ? ' is-alerta' : '') + (c.tipo !== 'item' ? ' is-fora' : ''));
    card.dataset.tipo = c.tipo;
    var arrasta = c.tipo === 'item' || (c.tipo === 'banco' && c.relatorio);
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

    /* cabeça: número e status da NCR no banco */
    var topo = el('div', 'kb-card-topo');
    var num = el('button', 'kb-card-num', numeroDe(c));
    num.type = 'button';
    num.title = c.tipo === 'banco' ? 'Abrir a ficha da NCR' : 'Abrir o item no relatório ' + marcoRel(c.project) + ' Waiver';
    num.addEventListener('click', function () {
      if (c.tipo === 'banco') ctx.abrirFicha(c.rec.key);
      else ctx.abrir(c.project, c.item);
    });
    topo.appendChild(num);
    if (c.rec && c.rec.fonte.status && c.coluna === FORA) {
      /* aqui a meta é fechar: fechada é o verde, aberta é o que falta */
      var chip = el('span', 'kb-st-ncr ' + (c.fechada ? 'is-ok' : 'is-falta'),
        (c.fechada ? '✓ ' : '') + curto(c.rec.fonte.status, 26));
      chip.title = c.fechada ? 'NCR já fechada no banco NCR' : 'NCR ainda aberta: precisa ser fechada (não está no Waiver deste marco)';
      topo.appendChild(chip);
    } else if (c.rec && c.rec.fonte.status) {
      topo.appendChild(el('span', 'kb-st-ncr' + (c.fechada ? ' is-fechada' : ''), curto(c.rec.fonte.status, 26)));
    } else if (!c.rec) {
      var sb = el('span', 'kb-st-ncr is-sem', 'fora do banco');
      sb.title = 'Este item não corresponde a nenhuma NCR importada do banco NCR (SBR4)';
      topo.appendChild(sb);
    }
    card.appendChild(topo);

    if (c.alerta) {
      var al = el('div', 'kb-alerta');
      al.appendChild(el('strong', null, '⚠ NCR fechada'));
      al.appendChild(document.createTextNode(' e o waiver ainda em “' + Store.statusInfo(c.coluna).nome + '”'));
      card.appendChild(al);
    }

    if (c.tipo === 'banco') {
      var outros = Ncrs.vinculos(c.rec, ctx.projects()).map(function (v) { return marcoRel(v.project); });
      card.appendChild(el('div', 'kb-origem', 'No banco: Marco Atual ' + c.rec.waiver.marcoAtual +
        (outros.length ? ' · no Waiver de ' + outros.sort(Fluxo.cmpMarco).join(', ') : ' · em nenhum Waiver')));
    }
    if (c.tipo === 'caminho') {
      card.appendChild(el('div', 'kb-origem kb-origem--caminho', 'Vem do ' + marcoRel(c.project) + ' — ' +
        Store.statusInfo(c.item.status).nome + (c.aprovado ? ' (Approved Expiry)' : ' (Request Expiry)')));
    }

    var fv = (c.item && c.item.func) || (c.rec && c.rec.waiver.funcaoVital) || '';
    if (fv) {
      var f = el('div', 'kb-fv', curto(fv, 60));
      f.title = fv;
      card.appendChild(f);
    }

    var desc = (c.item && c.item.description) || (c.rec && c.rec.fonte.descricao) || '';
    if (desc) {
      var d = el('p', 'kb-desc', curto(desc, 220));
      if (desc.length > 220) d.title = curto(desc, 1200);
      card.appendChild(d);
    }

    var pe = el('div', 'kb-card-pe');
    var caminho = caminhoDe(c);
    if (caminho) pe.appendChild(el('span', 'kb-caminho', caminho));
    var sis = (c.item && c.item.systems) || (c.rec && c.rec.fonte.sistema) || '';
    if (sis) pe.appendChild(el('span', 'kb-sis', curto(sis, 24)));
    if (c.item && c.item.nota) {
      var nt = el('span', 'kb-nota', '📝');
      nt.title = 'Anotação: ' + curto(c.item.nota, 300);
      nt.setAttribute('aria-label', 'Tem anotação');
      pe.appendChild(nt);
    }
    if (c.item && c.item.herdadoDe) {
      var hd = el('span', 'kb-nota', '⤵');
      hd.title = 'Veio do ' + c.item.herdadoDe;
      hd.setAttribute('aria-label', hd.title);
      pe.appendChild(hd);
    }
    card.appendChild(pe);

    var acoes = el('div', 'kb-card-acoes');
    if (c.tipo === 'item') {
      acoes.appendChild(seletorSituacao(c));
      if (c.item.editedAt) acoes.appendChild(el('span', 'kb-quem', (c.item.editedBy || 'sem nome') + ' · ' + Ncrs.data(c.item.editedAt).slice(0, 10)));
    } else if (c.tipo === 'banco') {
      if (c.relatorio) {
        acoes.appendChild(botao('+ ' + marcoRel(c.relatorio) + ' Waiver', 'btn--sm', function () {
          ctx.adicionar(c.rec, c.relatorio).then(function () { render(host, ctx); });
        }, 'Adicionar esta NCR ao relatório ' + marcoRel(c.relatorio) + ' Waiver (entra em "Em preenchimento")'));
      } else {
        acoes.appendChild(el('span', 'kb-quem', 'crie o relatório ' + st.marco + ' para adicionar'));
      }
    } else if (c.tipo === 'caminho') {
      acoes.appendChild(botao('Abrir no ' + marcoRel(c.project), 'btn--sm', function () { ctx.abrir(c.project, c.item); },
        'Abre o item no relatório de origem; o botão “⤵ Levar para o marco seguinte” fica na barra de situação'));
    }
    if (c.rec && c.tipo !== 'banco') {
      acoes.appendChild(botao('Ficha', 'btn--sm btn--quiet', function () { ctx.abrirFicha(c.rec.key); }, 'Abrir a ficha da NCR no Banco NCR'));
    }
    card.appendChild(acoes);
    return card;
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

  global.Kanban = {
    render: render,
    cartoes: cartoes,
    marcos: marcos
  };
})(window);
