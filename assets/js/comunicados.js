/* ==========================================================================
   comunicados.js — os avisos do editor para quem usa o visualizador
   --------------------------------------------------------------------------
   Pedido do Bruno: alguns acontecimentos merecem chegar a quem só
   acompanha — um waiver novo no J09, uma NCR nova no J09, um waiver do J09
   aceito. Nem toda edição: quem decide é quem está editando, com um clique
   em "📣 Comunicar", depois de ver a prévia.

   Três regras que definem o resto:

   - **O comunicado só nasce do clique.** Nada aqui olha os dados para
     deduzir um acontecimento: mesclar, importar, abrir um backup ou
     normalizar um relatório nunca cria comunicado nenhum.
   - **Arquivo próprio na pasta da equipe** (`comunicados.json`), como a
     conversa e o diário: o `derrogacao-dados.json` é reescrito a cada
     gravação, e uma versão antiga do programa, ao regravá-lo, apagaria um
     campo que não conhece. A junção é união pelo id — comunicado não se
     edita.
   - **O visualizador só enxerga a publicação.** Por isso os comunicados
     vão também dentro do `visualizador-dados.js`, e chegam na mesma leitura
     dos dados — pelo ciclo único da atualização automática, sem um segundo
     relógio.

   O comunicado guarda o mínimo para ser lido e para achar o item: nada de
   imagem, nada de texto longo. Os marcos que podem ser comunicados estão em
   `Config.MARCOS_COMUNICADOS`.

   Não conhece a tela: o app.js monta a prévia, o pop-up e o histórico.
   ========================================================================== */
(function (global) {
  'use strict';

  var ARQUIVO = 'comunicados.json';
  var FORMATO = 'derrogacao-comunicados';
  var SCHEMA = 1;

  var CHAVE_LOCAIS = 'derrogacao:comunicados';
  var CHAVE_LIDOS = 'derrogacao-visualizador:comunicadosLidos';

  var MAX = 100;            /* guardados: os últimos 100 */
  var MAX_MENSAGEM = 280;   /* a mensagem opcional é um recado, não um texto */
  var MAX_RESUMO = 140;     /* o título curto do item */
  var MAX_LIDOS = 300;      /* bem acima dos 100 guardados: um id lido não volta */
  /* Quantos dias um comunicado conta como novidade (pop-up, etiqueta 📣 e a
     marca "novo" do histórico). O valor mora no Config.DIAS_COMUNICADO_NOVO. */
  function diasNovo() {
    var d = global.Config && Number(Config.DIAS_COMUNICADO_NOVO);
    return d > 0 ? d : 4;
  }

  /* Os tipos de acontecimento. `frase` recebe o comunicado e devolve o texto
     que se lê sem mais nada — a mensagem opcional é um acréscimo. */
  var TIPOS = {
    'novo-waiver': {
      rotulo: 'Novo waiver',
      frase: function (c) {
        return 'Um novo waiver foi adicionado ao marco ' + c.marco + ': ' + c.numero + '.';
      }
    },
    'nova-ncr': {
      rotulo: 'Nova NCR',
      frase: function (c) {
        return 'Uma nova NCR foi adicionada ao marco ' + c.marco + ': ' + c.numero + '.';
      }
    },
    'waiver-aceito': {
      rotulo: 'Waiver accepted',
      frase: function (c) {
        return 'O waiver da ' + c.numero + ', no marco ' + c.marco + ', foi aceito.';
      }
    }
  };
  var ORDEM_TIPOS = ['novo-waiver', 'nova-ncr', 'waiver-aceito'];

  function str(v) { return v == null ? '' : String(v); }
  function agora() { return new Date().toISOString(); }

  function uid() {
    if (global.Store && Store.uid) return 'c-' + Store.uid();
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function corta(t, max) {
    t = str(t).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
  }

  /* --- quais marcos --------------------------------------------------------- */

  function marcosMonitorados() {
    var l = global.Config && Config.MARCOS_COMUNICADOS;
    return Array.isArray(l) ? l : [];
  }

  /**
   * O marco monitorado que este texto é — ou ''. A comparação é a do
   * `Config.ehMarco`: caixa, espaço e zero à esquerda não importam, "RANAE
   * J09" é o J09; "J09 Ind", "J09Cer" e "J19" não são.
   */
  function monitorado(texto) {
    var l = marcosMonitorados();
    for (var i = 0; i < l.length; i++) {
      if (Config.ehMarco(texto, l[i])) return str(l[i]);
    }
    return '';
  }

  function marcoDoRelatorio(project, kind) {
    if (!project) return '';
    if (global.Report && Report.marcoOf) return str(Report.marcoOf(project, kind));
    return str(project.marco);
  }

  /* --- o que pode ser comunicado ------------------------------------------- */

  /** O marco monitorado deste relatório (na aba NCR ou DEV) — ou ''. */
  function doRelatorio(project, kind) {
    return monitorado(marcoDoRelatorio(project, kind));
  }

  /**
   * Os acontecimentos que este item permite comunicar, na ordem de TIPOS:
   * "novo waiver" para todo item com número num relatório de marco
   * monitorado, e "waiver accepted" quando ele está aceito (pelo valor
   * interno, `Store.STATUS_CONCLUIDO` — nunca pelo texto da tela).
   */
  function tiposDoItem(project, kind, item) {
    if (!item || !str(item.ncrId).trim()) return [];
    if (!monitorado(marcoDoRelatorio(project, kind))) return [];
    var l = ['novo-waiver'];
    if (item.status === Store.STATUS_CONCLUIDO) l.push('waiver-aceito');
    return l;
  }

  /**
   * A proposta de comunicado de um item de relatório — o que a prévia
   * mostra. `statusAntes` só é conhecido quando a proposta vem logo depois
   * da troca de situação.
   */
  function doItem(project, kind, item, tipo, statusAntes) {
    if (tiposDoItem(project, kind, item).indexOf(tipo) < 0) return null;
    var marco = monitorado(marcoDoRelatorio(project, kind));
    return {
      tipo: tipo,
      projetoId: str(project.id),
      marco: marco,
      kind: kind === 'dev' ? 'dev' : 'ncr',
      itemId: str(item.id),
      ncrKey: str(item.ncrKey),
      numero: str(item.ncrId).trim(),
      resumo: corta(item.description, MAX_RESUMO),
      statusAntes: tipo === 'waiver-aceito' ? str(statusAntes) : '',
      statusNovo: str(item.status)
    };
  }

  /** A NCR do banco com Marco Atual num marco monitorado: "nova NCR". */
  function daNcr(rec) {
    if (!rec || !rec.waiver) return null;
    var marco = monitorado(rec.waiver.marcoAtual);
    if (!marco) return null;
    var f = rec.fonte || {};
    return {
      tipo: 'nova-ncr',
      projetoId: '',
      marco: marco,
      kind: 'ncr',
      itemId: '',
      ncrKey: str(rec.key),
      numero: str(rec.numero),
      resumo: corta(f.titulo || f.descricao, MAX_RESUMO),
      statusAntes: '',
      statusNovo: ''
    };
  }

  /**
   * A chave do acontecimento: o mesmo waiver aceito no mesmo marco é o mesmo
   * acontecimento, venha de quem vier e com o id de item que tiver (a
   * mesclagem pareia itens pelo número). É ela que avisa "já comunicado" e
   * que faz o visualizador mostrar uma vez só.
   */
  function chave(c) {
    var num = str(c.numero).trim().toUpperCase().replace(/\s+/g, ' ');
    var partes = [c.tipo, Config.chaveMarco(c.marco), c.kind || 'ncr', num];
    if (c.tipo === 'waiver-aceito') partes.push(c.statusNovo);
    return partes.join('|');
  }

  /** O comunicado de verdade, a partir da proposta. Só o clique chama isto. */
  function criar(proposta, mensagem, autor) {
    var c = {};
    Object.keys(proposta).forEach(function (k) { c[k] = proposta[k]; });
    c.id = uid();
    c.mensagem = corta(mensagem, MAX_MENSAGEM);
    c.autor = str(autor);
    c.em = agora();
    c.chave = chave(c);
    return c;
  }

  function frase(c) {
    var t = TIPOS[c.tipo];
    return t ? t.frase(c) : 'Comunicado sobre o marco ' + (c.marco || '—') + ': ' + (c.numero || '—') + '.';
  }

  function rotulo(tipo) { return TIPOS[tipo] ? TIPOS[tipo].rotulo : 'Comunicado'; }

  /* --- a lista ------------------------------------------------------------- */

  var CAMPOS = ['id', 'tipo', 'projetoId', 'marco', 'kind', 'itemId', 'ncrKey', 'numero',
    'resumo', 'statusAntes', 'statusNovo', 'mensagem', 'autor', 'em', 'chave'];

  /**
   * Um comunicado lido de fora (pasta, publicação, backup). Campo que esta
   * versão não conhece passa intacto — a mesma regra dos itens: a página
   * antiga não apaga o que a nova escreveu. Tipo desconhecido também passa:
   * vira um comunicado genérico, em vez de sumir.
   */
  function normalizar(c) {
    if (!c || typeof c !== 'object' || !c.id) return null;
    var out = {};
    Object.keys(c).forEach(function (k) {
      if (CAMPOS.indexOf(k) < 0) out[k] = c[k];
    });
    CAMPOS.forEach(function (k) { out[k] = str(c[k]); });
    out.kind = out.kind === 'dev' ? 'dev' : 'ncr';
    out.mensagem = corta(out.mensagem, MAX_MENSAGEM);
    out.resumo = corta(out.resumo, MAX_RESUMO);
    if (!out.em) out.em = agora();
    if (!out.chave) out.chave = chave(out);
    return out;
  }

  function maisNovoPrimeiro(a, b) {
    return str(b.em).localeCompare(str(a.em)) || str(b.id).localeCompare(str(a.id));
  }

  /** Os últimos MAX, do mais novo para o mais velho. */
  function podar(lista) {
    return lista.slice().sort(maisNovoPrimeiro).slice(0, MAX);
  }

  /** União pelo id. Comunicado não se edita: havendo os dois, fica o daqui. */
  function juntar(a, b) {
    var porId = {};
    var out = [];
    [a || [], b || []].forEach(function (l) {
      l.forEach(function (c) {
        var n = normalizar(c);
        if (!n || porId[n.id]) return;
        porId[n.id] = true;
        out.push(n);
      });
    });
    return podar(out);
  }

  /** Há aqui algum que a pasta ainda não tem? (só então se grava) */
  function faltamLa(aqui, la) {
    var ids = {};
    (la || []).forEach(function (c) { if (c && c.id) ids[c.id] = true; });
    return (aqui || []).some(function (c) { return !ids[c.id]; });
  }

  function envelope(lista) {
    return { format: FORMATO, schema: SCHEMA, updatedAt: agora(), comunicados: podar(lista || []) };
  }

  /**
   * O que veio de um arquivo (envelope da pasta, backup ou publicação) —
   * sempre uma lista. Arquivo sem a coleção (os anteriores a ela) dá lista
   * vazia.
   */
  function deArquivo(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return [];
    return Array.isArray(d.comunicados) ? juntar(d.comunicados, []) : [];
  }

  /** O último comunicado deste acontecimento, ou null. */
  function jaComunicado(lista, c) {
    var k = chave(c);
    var achado = null;
    (lista || []).forEach(function (x) {
      if (x.chave === k && (!achado || str(x.em) > str(achado.em))) achado = x;
    });
    return achado;
  }

  /* --- a cópia deste navegador (editor) ------------------------------------
     Como a conversa: no localStorage, porque é pouco (100 comunicados, uns
     40 KB) e precisa estar à mão sem esperar o IndexedDB. A verdade da
     equipe é o arquivo da pasta. */

  function locais() {
    try {
      var raw = global.localStorage.getItem(CHAVE_LOCAIS);
      return raw ? juntar(JSON.parse(raw), []) : [];
    } catch (e) { return []; }
  }

  function gravarLocais(lista) {
    try { global.localStorage.setItem(CHAVE_LOCAIS, JSON.stringify(podar(lista || []))); }
    catch (e) { /* sem espaço: vale a pasta */ }
  }

  /* --- no visualizador: o que já foi visto -----------------------------------
     Por navegador, no localStorage: cada pessoa marca o que leu. É
     conveniência de quem está sentado ali, não dado do programa. */

  function lerLidos() {
    try {
      var r = JSON.parse(global.localStorage.getItem(CHAVE_LIDOS) || 'null');
      if (r && Array.isArray(r.ids)) return { desde: str(r.desde), ids: r.ids.map(str) };
    } catch (e) { /* ignora */ }
    return null;
  }

  function gravarLidos(reg) {
    try {
      global.localStorage.setItem(CHAVE_LIDOS, JSON.stringify({
        desde: reg.desde,
        ids: reg.ids.slice(-MAX_LIDOS)
      }));
    } catch (e) { /* sem armazenamento: o pop-up volta na próxima abertura */ }
  }

  /** O registro dos lidos deste navegador (vazio na primeira vez). */
  function lidos() {
    return lerLidos() || { desde: agora(), ids: [] };
  }

  function marcarLidos(ids) {
    var reg = lerLidos() || { desde: agora(), ids: [] };
    var ja = {};
    reg.ids.forEach(function (id) { ja[id] = true; });
    (ids || []).forEach(function (id) {
      if (id && !ja[id]) { reg.ids.push(id); ja[id] = true; }
    });
    gravarLidos(reg);
  }

  /**
   * O que o visualizador mostra: um por acontecimento (o mais novo — um
   * "comunicar de novo" substitui o anterior), do mais novo para o mais
   * velho.
   */
  function paraVer(lista) {
    var porChave = {};
    var out = [];
    podar(lista || []).forEach(function (c) {
      if (porChave[c.chave]) return;
      porChave[c.chave] = true;
      out.push(c);
    });
    return out;
  }

  /**
   * Os não lidos que ainda são novidade: um por acontecimento, e só dos
   * últimos `diasNovo()` dias — sempre, e não só na primeira abertura
   * (pedido do Bruno). Quem passa semanas sem abrir o visualizador não
   * recebe uma pilha de avisos velhos; eles continuam no histórico. Vale
   * também para um comunicado antigo trazido de volta por um backup.
   */
  function naoLidos(lista) {
    var ja = {};
    lidos().ids.forEach(function (id) { ja[id] = true; });
    var corte = new Date(Date.now() - diasNovo() * 86400000).toISOString();
    return paraVer(lista).filter(function (c) { return !ja[c.id] && str(c.em) >= corte; });
  }

  global.Comunicados = {
    ARQUIVO: ARQUIVO,
    FORMATO: FORMATO,
    SCHEMA: SCHEMA,
    MAX: MAX,
    MAX_MENSAGEM: MAX_MENSAGEM,
    diasNovo: diasNovo,
    TIPOS: TIPOS,
    ORDEM_TIPOS: ORDEM_TIPOS,
    CHAVE_LOCAIS: CHAVE_LOCAIS,
    CHAVE_LIDOS: CHAVE_LIDOS,
    marcosMonitorados: marcosMonitorados,
    monitorado: monitorado,
    doRelatorio: doRelatorio,
    tiposDoItem: tiposDoItem,
    doItem: doItem,
    daNcr: daNcr,
    chave: chave,
    criar: criar,
    frase: frase,
    rotulo: rotulo,
    normalizar: normalizar,
    podar: podar,
    juntar: juntar,
    faltamLa: faltamLa,
    envelope: envelope,
    deArquivo: deArquivo,
    jaComunicado: jaComunicado,
    locais: locais,
    gravarLocais: gravarLocais,
    lidos: lidos,
    marcarLidos: marcarLidos,
    paraVer: paraVer,
    naoLidos: naoLidos
  };
})(window);
