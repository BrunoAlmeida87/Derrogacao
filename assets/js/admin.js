/* ==========================================================================
   admin.js — a área administrativa (Ajustes → Área administrativa)
   --------------------------------------------------------------------------
   Pedido do Bruno: corrigir à mão um dado do banco NCR (o status de uma NCR,
   por exemplo), com registro de auditoria — campo, valor anterior, valor
   novo, data e hora, quem —, e só para o administrador.

   O que fica aqui é a TELA. Os dados (ajustes, substituições, auditoria e
   a senha) são do correcoes.js; gravar, falar com a pasta e redesenhar as
   outras abas é do app.js, que passa isso em `iniciar(ctx)`.

   A senha esconde as funções de quem não é administrador. Não é controle
   de acesso, e a tela diz isso: o programa roda inteiro no navegador de quem
   o abre. Quem impede alguém de mexer nos dados é a permissão da pasta na
   rede (CLAUDE.md §6).

   Destravada, a área fica aberta até recarregar a página ou até "Sair".
   Não existe no visualizador (os Ajustes nem abrem lá).
   ========================================================================== */
(function (global) {
  'use strict';

  var ativo = false;
  var ctx = null;
  var st = { aba: 'corrigir', ncr: '', busca: '' };

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
  function campo(rotulo, input, dica) {
    var f = el('div', 'field adm-campo');
    var lab = el('label', null, rotulo);
    if (input.id) lab.htmlFor = input.id;
    f.appendChild(lab);
    f.appendChild(input);
    if (dica) f.appendChild(el('div', 'hint', dica));
    return f;
  }
  function entrada(id, tipo, ph) {
    var i = el('input');
    i.type = tipo || 'text';
    i.id = id;
    if (ph) i.placeholder = ph;
    i.autocomplete = 'off';
    return i;
  }
  function leitura() { return !!(global.Leitura && Leitura.ativo()); }

  function iniciar(c) { ctx = c; }
  function estaAtivo() { return ativo && !leitura(); }

  function sair() {
    ativo = false;
    if (global.Log) Log.ok('admin', 'área administrativa fechada');
    var d = document.getElementById('adminDialog');
    if (d && d.open) d.close();
    if (ctx) ctx.redesenhar();
  }

  /* --- o bloco dentro dos Ajustes ------------------------------------------- */

  function blocoAjustes() {
    var box = el('section', 'adm-ajuste');
    box.id = 'adminAjuste';
    box.appendChild(el('h4', null, '🔒 Área administrativa'));
    box.appendChild(el('p', 'hint', 'Correção manual dos dados do banco NCR (o status de uma NCR, por exemplo), ' +
      'o vínculo entre NCRs temporárias e definitivas e o registro de auditoria. Só para o administrador.'));
    var rot = estaAtivo() ? 'Abrir a área administrativa'
      : (global.Correcoes && Correcoes.temSenha() ? 'Entrar…' : 'Definir a senha do administrador…');
    var b = botao(rot, 'btn--sm', function () {
      var d = document.getElementById('settingsDialog');
      if (d && d.open) d.close();
      abrir();
    });
    b.id = 'adminEntrarBtn';
    box.appendChild(b);
    return box;
  }

  /* --- a janela --------------------------------------------------------------- */

  function dialogo() { return document.getElementById('adminDialog'); }

  /** Abre a janela: pede a senha, ou mostra o painel se já destravada. */
  function abrir(aba, ncr) {
    if (leitura() || !ctx) return;
    if (aba) st.aba = aba;
    if (ncr) st.ncr = ncr;
    var d = dialogo();
    desenhar();
    if (!d.open) d.showModal();
  }

  /** Da ficha da NCR: direto na correção daquela NCR. */
  function corrigir(key) { abrir('corrigir', key); }

  function desenhar() {
    var d = dialogo();
    var body = d.querySelector('.dlg-body');
    var ac = d.querySelector('.dlg-actions');
    body.innerHTML = '';
    ac.innerHTML = '';
    if (estaAtivo()) painel(body, ac);
    else portao(body, ac);
  }

  /** Sem a área aberta: pedir a senha, ou definir a primeira. */
  function portao(body, ac) {
    body.appendChild(el('h3', null, '🔒 Área administrativa'));
    var msg = el('p', 'adm-msg');
    msg.id = 'admMsg';
    msg.setAttribute('role', 'alert');
    var tem = Correcoes.temSenha();
    var s1 = entrada('admSenha', 'password', tem ? 'senha do administrador' : 'pelo menos 6 caracteres');
    var s2 = tem ? null : entrada('admSenha2', 'password', 'repita a senha');
    if (tem) {
      body.appendChild(el('p', null, 'Digite a senha do administrador para abrir as correções manuais e a auditoria.'));
      body.appendChild(campo('Senha', s1));
    } else {
      body.appendChild(el('p', null, 'Ainda não há senha de administrador. Quem definir agora passa a ser o administrador. ' +
        'Para trocá-la depois é preciso saber a atual.'));
      if (!ctx.pastaLigada()) {
        body.appendChild(el('p', 'adm-aviso', 'A pasta da equipe não está ligada neste navegador: a senha vale só aqui até ' +
          'ela ser ligada. Ligada a pasta, vale a senha que já estiver lá.'));
      }
      body.appendChild(campo('Nova senha', s1));
      body.appendChild(campo('Repita a senha', s2));
    }
    body.appendChild(msg);
    body.appendChild(el('p', 'adm-nota', 'A senha esconde estas funções de quem não é administrador. Ela não é controle de ' +
      'acesso: quem impede alguém de mexer nos dados é a permissão da pasta na rede.'));
    function ir() {
      if (tem) {
        if (!Correcoes.conferir(s1.value)) {
          msg.textContent = 'Senha incorreta.';
          s1.select();
          return;
        }
        ativo = true;
        if (global.Log) Log.ok('admin', 'área administrativa aberta');
        desenhar();
        ctx.redesenhar();
        return;
      }
      if (s1.value !== s2.value) { msg.textContent = 'As duas senhas não são iguais.'; return; }
      if (!ctx.usuario()) { msg.textContent = 'Defina primeiro o seu nome (⋯ Mais → Definir meu nome): ele vai na auditoria.'; return; }
      var r = Correcoes.definirSenha(s1.value, ctx.usuario());
      if (!r.ok) { msg.textContent = r.erro; return; }
      ctx.salvar([]).then(function () {
        ativo = true;
        ctx.toast('Senha do administrador definida.');
        desenhar();
        ctx.redesenhar();
      });
    }
    [s1, s2].forEach(function (i) {
      if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ir(); } });
    });
    ac.appendChild(botao('Cancelar', '', function () { dialogo().close(); }));
    ac.appendChild(botao(tem ? 'Entrar' : 'Definir a senha', 'btn--primary', ir));
    setTimeout(function () { s1.focus(); }, 30);
  }

  var ABAS = [
    ['corrigir', 'Corrigir dados de NCR'],
    ['temporarias', 'NCRs temporárias'],
    ['auditoria', 'Auditoria'],
    ['senha', 'Senha']
  ];

  function painel(body, ac) {
    body.appendChild(el('h3', null, '🔓 Área administrativa'));
    if (!ctx.usuario()) {
      body.appendChild(el('p', 'adm-aviso', 'Defina o seu nome (⋯ Mais → Definir meu nome) antes de corrigir: ' +
        'ele vai em cada linha da auditoria.'));
    }
    var nav = el('div', 'adm-abas');
    nav.setAttribute('role', 'tablist');
    ABAS.forEach(function (a) {
      var b = botao(a[1], 'btn--sm adm-aba' + (st.aba === a[0] ? ' is-on' : ''), function () { st.aba = a[0]; desenhar(); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', st.aba === a[0] ? 'true' : 'false');
      nav.appendChild(b);
    });
    body.appendChild(nav);
    var corpo = el('div', 'adm-corpo');
    body.appendChild(corpo);
    if (st.aba === 'corrigir') abaCorrigir(corpo);
    else if (st.aba === 'temporarias') abaTemporarias(corpo);
    else if (st.aba === 'auditoria') abaAuditoria(corpo);
    else abaSenha(corpo);
    ac.appendChild(botao('Sair da área administrativa', 'btn--quiet', sair));
    ac.appendChild(botao('Fechar', 'btn--primary', function () { dialogo().close(); }));
  }

  /* --- correção de dados ------------------------------------------------------- */

  function listaDoBanco() {
    var dl = document.getElementById('admNumeros');
    if (!dl) { dl = el('datalist'); dl.id = 'admNumeros'; document.body.appendChild(dl); }
    dl.innerHTML = '';
    Ncrs.lista().forEach(function (r) { var o = el('option'); o.value = r.numero; dl.appendChild(o); });
    return dl.id;
  }

  function listaDeStatus() {
    var dl = document.getElementById('admStatus');
    if (!dl) { dl = el('datalist'); dl.id = 'admStatus'; document.body.appendChild(dl); }
    dl.innerHTML = '';
    var vistos = {};
    ((global.Config && Config.STATUS_NCR_FECHADA) || []).concat(Ncrs.lista().map(function (r) { return r.fonte.status; }))
      .forEach(function (v) {
        if (!v || vistos[v]) return;
        vistos[v] = 1;
        var o = el('option'); o.value = v; dl.appendChild(o);
      });
    return dl.id;
  }

  function abaCorrigir(corpo) {
    corpo.appendChild(el('p', 'hint', 'A correção fica por cima do que o banco NCR importado diz — o dado importado não é ' +
      'apagado. Se uma importação futura trouxer outro valor naquele campo, o banco andou e a correção deixa de valer ' +
      'sozinha. Cada correção vai para a auditoria.'));
    var busca = entrada('admNcr', 'text', 'número da NCR');
    busca.setAttribute('list', listaDoBanco());
    var rec = st.ncr ? Ncrs.get(st.ncr) : null;
    if (rec) busca.value = rec.numero;
    var linha = el('div', 'adm-linha');
    linha.appendChild(busca);
    var abrirBtn = botao('Abrir', 'btn--sm', function () {
      var r = Ncrs.get(busca.value.trim());
      st.ncr = r ? r.key : '';
      if (!r) { ctx.toast('Não há NCR com esse número no banco NCR.'); return; }
      desenhar();
    });
    busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); abrirBtn.click(); } });
    linha.appendChild(abrirBtn);
    corpo.appendChild(campo('NCR', linha));

    if (rec) corpo.appendChild(formNcr(rec));

    var todos = Correcoes.todosAjustes();
    corpo.appendChild(el('h4', 'adm-tit', 'Correções em vigor (' + todos.length + ')'));
    if (!todos.length) {
      corpo.appendChild(el('p', 'hint', 'Nenhuma correção manual em vigor.'));
      return;
    }
    var t = el('table', 'nb-hist adm-tabela');
    var hr = el('tr');
    ['NCR', 'Campo', 'No banco NCR', 'Em uso', 'Quem', 'Quando', ''].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    todos.forEach(function (x) {
      var tr = el('tr');
      var bn = botao(x.rec.numero, 'nb-link', function () { st.ncr = x.rec.key; desenhar(); });
      var td0 = el('td'); td0.appendChild(bn); tr.appendChild(td0);
      [Correcoes.rotuloCampo(x.ajuste.campo), Correcoes.valorBanco(x.rec, x.ajuste.campo) || '—', x.ajuste.valor || '—',
        x.ajuste.por, Ncrs.data(x.ajuste.em)].forEach(function (v) { tr.appendChild(el('td', null, v)); });
      var td = el('td');
      td.appendChild(botao('Desfazer', 'btn--sm btn--quiet', function () { desfazer(x.rec, x.ajuste.campo); }));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    corpo.appendChild(t);
  }

  function formNcr(rec) {
    var box = el('div', 'adm-ncr');
    var f = Ncrs.fonte(rec);
    box.appendChild(el('h4', 'adm-tit', rec.numero + (Ncrs.fechada(rec) ? ' · fechada' : ' · aberta')));
    if (!rec.fonte.importadoEm) box.appendChild(el('p', 'adm-aviso', 'Esta NCR ainda não veio de nenhuma importação do banco.'));
    var motivo = entrada('admMotivo', 'text', 'ex.: status atualizado no sistema oficial em 28/09, export ainda não refletiu');
    box.appendChild(campo('Motivo da correção (vai para a auditoria)', motivo));

    var t = el('table', 'nb-hist adm-tabela');
    var hr = el('tr');
    ['Campo', 'No banco NCR', 'Em uso', 'Novo valor', ''].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    var campos = Correcoes.CAMPOS.map(function (c) { return c.id; });
    /* colunas do export já corrigidas também aparecem aqui */
    Object.keys(f.colunasAjustadas || {}).forEach(function (col) {
      var a = f.colunasAjustadas[col];
      if (campos.indexOf(a.campo) < 0) campos.push(a.campo);
    });
    campos.forEach(function (c) { tb.appendChild(linhaCampo(rec, c, motivo)); });
    t.appendChild(tb);
    box.appendChild(t);

    /* outra coluna do export */
    var cols = (Ncrs.meta().colunas || []).filter(function (c) {
      var pap = Ncrs.meta().papeis || {};
      return !Object.keys(pap).some(function (p) { return pap[p] === c && Correcoes.CAMPOS.some(function (x) { return x.id === p; }); });
    });
    if (cols.length) {
      var sel = el('select');
      sel.id = 'admOutraCol';
      var o0 = el('option', null, 'Corrigir outra coluna do export…');
      o0.value = '';
      sel.appendChild(o0);
      cols.forEach(function (c) { var o = el('option', null, c); o.value = c; sel.appendChild(o); });
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        var id = 'c:' + sel.value;
        if (campos.indexOf(id) < 0) { campos.push(id); tb.appendChild(linhaCampo(rec, id, motivo)); }
        sel.value = '';
      });
      box.appendChild(sel);
    }
    var sup = Correcoes.ajustesSuperados(rec);
    if (sup.length) {
      box.appendChild(el('p', 'adm-aviso', 'Correção que deixou de valer porque o banco NCR mudou o valor depois dela: ' +
        sup.map(function (a) { return Correcoes.rotuloCampo(a.campo) + ' ("' + a.valor + '", de ' + Ncrs.data(a.em) + ')'; }).join('; ') + '.'));
    }
    return box;
  }

  function linhaCampo(rec, c, motivo) {
    var tr = el('tr');
    var a = Correcoes.ajusteAtivo(rec, c);
    tr.appendChild(el('td', null, Correcoes.rotuloCampo(c)));
    tr.appendChild(el('td', null, Correcoes.valorBanco(rec, c) || '—'));
    var emUso = el('td', a ? 'adm-ajustado' : null, Correcoes.valorEmUso(rec, c) || '—');
    if (a) emUso.title = 'Corrigido por ' + (a.por || '?') + ' em ' + Ncrs.data(a.em) + (a.obs ? ' — ' + a.obs : '');
    tr.appendChild(emUso);
    var td = el('td');
    var inp = el('input');
    inp.type = 'text';
    inp.className = 'adm-novo';
    inp.dataset.campo = c;
    inp.setAttribute('aria-label', 'Novo valor para ' + Correcoes.rotuloCampo(c));
    if (c === 'status') inp.setAttribute('list', listaDeStatus());
    inp.value = Correcoes.valorEmUso(rec, c);
    td.appendChild(inp);
    tr.appendChild(td);
    var acoes = el('td', 'adm-acoes');
    var salvar = botao('Salvar', 'btn--sm btn--primary', function () {
      if (!ctx.usuario()) { ctx.toast('Defina o seu nome antes (⋯ Mais → Definir meu nome).'); return; }
      var r = Correcoes.ajustar(rec, c, inp.value, ctx.usuario(), motivo.value.trim());
      if (!r.ok) { ctx.toast(r.erro); return; }
      if (global.Log) Log.ok('admin', 'dado corrigido', { campo: Correcoes.rotuloCampo(c) });
      ctx.salvar([]).then(function () {
        ctx.toast('Correção salva: ' + Correcoes.rotuloCampo(c) + ' da ' + rec.numero + '.');
        desenhar();
        ctx.redesenhar();
      });
    });
    salvar.dataset.campo = c;
    acoes.appendChild(salvar);
    if (a) acoes.appendChild(botao('Desfazer correção', 'btn--sm btn--quiet', function () { desfazer(rec, c, motivo.value.trim()); }));
    tr.appendChild(acoes);
    return tr;
  }

  function desfazer(rec, c, motivo) {
    var r = Correcoes.desfazerAjuste(rec, c, ctx.usuario(), motivo || '');
    if (!r.ok) { ctx.toast(r.erro); return; }
    ctx.salvar([]).then(function () {
      ctx.toast('Correção desfeita: ' + Correcoes.rotuloCampo(c) + ' volta ao que o banco NCR diz.');
      desenhar();
      ctx.redesenhar();
    });
  }

  /* --- NCRs temporárias ---------------------------------------------------------- */

  function abaTemporarias(corpo) {
    corpo.appendChild(el('p', 'hint', 'Uma NCR temporária (aberta enquanto o sistema interno estava fora do ar) ligada à ' +
      'definitiva que a substituiu: as duas passam a ser o mesmo caso nos relatórios, no fluxo, no Kanban e nas contagens. ' +
      'Nenhum número é reescrito — os registros antigos continuam como estão. O mesmo pode ser feito na ficha de cada NCR.'));
    var de = entrada('admTemp', 'text', 'número da NCR temporária');
    var para = entrada('admDef', 'text', 'número da NCR definitiva');
    var lista = listaDoBanco();
    de.setAttribute('list', lista);
    para.setAttribute('list', lista);
    var motivo = entrada('admTempMotivo', 'text', 'opcional');
    var copiar = el('input');
    copiar.type = 'checkbox';
    copiar.checked = true;
    copiar.id = 'admTempCopiar';
    var grade = el('div', 'adm-grade');
    grade.appendChild(campo('NCR temporária', de));
    grade.appendChild(campo('Substituída pela definitiva', para));
    grade.appendChild(campo('Motivo (vai para a auditoria)', motivo));
    corpo.appendChild(grade);
    var lc = el('label', 'nb-cont-copiar');
    lc.appendChild(copiar);
    lc.appendChild(document.createTextNode(' Levar para a definitiva os dados do Waiver que ela ainda não tem'));
    corpo.appendChild(lc);
    corpo.appendChild(botao('Ligar', 'btn--sm btn--primary', function () {
      ctx.substituir(de.value.trim(), para.value.trim(), copiar.checked, motivo.value.trim()).then(function (ok) {
        if (ok) desenhar();
      });
    }));

    var subs = Correcoes.listaSubstituicoes();
    corpo.appendChild(el('h4', 'adm-tit', 'Ligações em vigor (' + subs.length + ')'));
    if (!subs.length) { corpo.appendChild(el('p', 'hint', 'Nenhuma NCR temporária ligada ainda.')); return; }
    var t = el('table', 'nb-hist adm-tabela');
    var hr = el('tr');
    ['NCR temporária', '→ definitiva', 'Quem', 'Quando', 'Motivo', ''].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    subs.forEach(function (s) {
      var tr = el('tr');
      [s.deNumero, s.paraNumero, s.por, Ncrs.data(s.em), s.obs].forEach(function (v) { tr.appendChild(el('td', null, v)); });
      var td = el('td');
      td.appendChild(botao('Desfazer', 'btn--sm btn--quiet', function () {
        ctx.desfazerSubstituicao(s.de).then(function () { desenhar(); });
      }));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    corpo.appendChild(t);
  }

  /* --- auditoria -------------------------------------------------------------------- */

  var ROTULO_TIPO = {
    ajuste: 'Correção', 'ajuste-desfeito': 'Correção desfeita', substituicao: 'Temporária → definitiva',
    'substituicao-desfeita': 'Ligação desfeita', senha: 'Senha'
  };

  function linhasAuditoria() {
    var q = Ncrs.norm(st.busca);
    return Correcoes.auditoria().filter(function (e) {
      if (!q) return true;
      return Ncrs.norm([e.ncr, e.campo, e.de, e.para, e.por, e.obs, ROTULO_TIPO[e.tipo]].join(' ')).indexOf(q) >= 0;
    });
  }

  function abaAuditoria(corpo) {
    corpo.appendChild(el('p', 'hint', 'Cada correção manual e cada ligação entre NCRs, feitas e desfeitas: campo, valor ' +
      'anterior, novo valor, data e hora, e quem fez (o nome definido em ⋯ Mais → Definir meu nome). O registro só cresce.'));
    var barra = el('div', 'adm-linha');
    var busca = entrada('admAudBusca', 'search', 'procurar por NCR, campo, valor ou nome');
    busca.value = st.busca;
    var caixa = el('div', 'adm-aud-caixa');
    function lista() {
      caixa.innerHTML = '';
      var ls = linhasAuditoria();
      if (!ls.length) { caixa.appendChild(el('p', 'hint', 'Nenhum registro.')); return; }
      caixa.appendChild(tabelaAud(ls));
    }
    busca.addEventListener('input', function () { st.busca = busca.value; lista(); });
    barra.appendChild(busca);
    barra.appendChild(botao('⤓ Excel', 'btn--sm', function () { exportar('xlsx'); }, 'A auditoria à vista, em planilha'));
    barra.appendChild(botao('CSV', 'btn--sm', function () { exportar('csv'); }));
    corpo.appendChild(barra);
    corpo.appendChild(caixa);
    lista();
  }

  function tabelaAud(ls) {
    var t = el('table', 'nb-hist adm-tabela nb-aud');
    var hr = el('tr');
    ['Data e hora', 'Quem', 'Tipo', 'NCR', 'Campo', 'Valor anterior', 'Novo valor', 'Motivo'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    ls.forEach(function (e) {
      var tr = el('tr');
      [Ncrs.data(e.em), e.por || '(sem nome)', ROTULO_TIPO[e.tipo] || e.tipo, e.ncr, e.campo, e.de || '—', e.para || '—', e.obs]
        .forEach(function (v) { tr.appendChild(el('td', null, v)); });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  function exportar(tipo) {
    var ls = linhasAuditoria();
    ctx.exportarAuditoria(tipo, {
      colunas: [
        { titulo: 'Data e hora', larg: 18 }, { titulo: 'Quem', larg: 18 }, { titulo: 'Tipo', larg: 20 },
        { titulo: 'NCR', larg: 26 }, { titulo: 'Campo', larg: 24 }, { titulo: 'Valor anterior', larg: 30 },
        { titulo: 'Novo valor', larg: 30 }, { titulo: 'Motivo', larg: 40 }
      ],
      linhas: ls.map(function (e) {
        return [Ncrs.data(e.em), e.por, ROTULO_TIPO[e.tipo] || e.tipo, e.ncr, e.campo, e.de, e.para, e.obs];
      }),
      recorte: st.busca ? 'busca: “' + st.busca + '”' : '',
      total: Correcoes.auditoria().length
    });
  }

  /* --- senha ------------------------------------------------------------------------- */

  function abaSenha(corpo) {
    var msg = el('p', 'adm-msg');
    msg.setAttribute('role', 'alert');
    var a = entrada('admSenhaAtual', 'password');
    var n1 = entrada('admSenhaNova', 'password', 'pelo menos 6 caracteres');
    var n2 = entrada('admSenhaNova2', 'password');
    corpo.appendChild(el('p', 'hint', 'A senha fica na pasta da equipe (no arquivo das correções, só o resumo ' +
      'criptográfico dela — nunca o texto). Esqueceu? Quem tem acesso à pasta apaga o bloco "senha" do arquivo ' +
      Correcoes.ARQUIVO + ', e a próxima pessoa a entrar aqui define outra.'));
    corpo.appendChild(campo('Senha atual', a));
    corpo.appendChild(campo('Nova senha', n1));
    corpo.appendChild(campo('Repita a nova senha', n2));
    corpo.appendChild(msg);
    corpo.appendChild(botao('Trocar a senha', 'btn--sm btn--primary', function () {
      if (n1.value !== n2.value) { msg.textContent = 'As duas senhas novas não são iguais.'; return; }
      var r = Correcoes.trocarSenha(a.value, n1.value, ctx.usuario());
      if (!r.ok) { msg.textContent = r.erro; return; }
      ctx.salvar([]).then(function () {
        ctx.toast('Senha trocada.');
        a.value = n1.value = n2.value = '';
        msg.textContent = '';
      });
    }));
  }

  global.Admin = {
    iniciar: iniciar,
    ativo: estaAtivo,
    abrir: abrir,
    corrigir: corrigir,
    sair: sair,
    blocoAjustes: blocoAjustes,
    redesenhar: function () { var d = dialogo(); if (d && d.open) desenhar(); }
  };
})(window);
