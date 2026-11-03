/* ==========================================================================
   chat.js — a conversa da equipe, dentro da pasta que já é o banco
   --------------------------------------------------------------------------
   Não há servidor aqui, e não vai haver: a conversa é um arquivo
   (conversas.json) ao lado do derrogacao-dados.json, na mesma pasta da rede.
   Cada pessoa escreve no seu navegador, a mensagem vai para o arquivo na
   sincronização seguinte, e a de todo mundo volta na mesma leitura. Vale
   para o recado da equipe, não para conversa ao vivo: o intervalo é o mesmo
   dos dados, 20 segundos.

   Três coisas que precisam ficar ditas, porque mudam o que se pode esperar:

   - **Sem a pasta não há conversa.** Sem ela, o que você escrever fica só
     neste navegador e ninguém vê.
   - **A conversa direta não é secreta.** Ela é um canal entre dois nomes
     dentro do mesmo arquivo: quem abre a pasta lê tudo, inclusive o que não
     é endereçado a ele. Serve para organizar o assunto, não para esconder.
   - **O nome é o que a pessoa digitou**, como no resto do programa. Não há
     senha nem login, então não há como provar que quem assinou foi quem
     escreveu.

   O arquivo da conversa fica fora do arquivo de dados de propósito: os dados
   são reescritos a cada gravação e copiados inteiros em cada versão do
   histórico, e o papo do dia não tem por que engordar isso. Pelo mesmo
   motivo a conversa não entra no backup nem em nenhuma página do PDF.
   ========================================================================== */

(function (global) {
  'use strict';

  var CHAVE_LIGADO = 'derrogacao:conversa';
  var CHAVE_MSGS = 'derrogacao:conversas';
  var CHAVE_LIDAS = 'derrogacao:conversas-lidas';

  var GERAL = 'geral';
  var MAX_MSGS = 1000;        // o arquivo não cresce para sempre
  var DIAS_GUARDA = 90;       // e o que é muito velho sai
  var MAX_TEXTO = 2000;       // por mensagem

  function str(v) { return (v == null ? '' : String(v)); }
  function agora() { return new Date().toISOString(); }

  function uid() {
    if (global.Store && Store.uid) return Store.uid();
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* --- ligado ou desligado ----------------------------------------------
     Vale para este navegador, como o nome de quem usa: cada pessoa liga a
     sua conversa. Ligar aqui não liga a dos outros. */

  function ligado() {
    try { return global.localStorage.getItem(CHAVE_LIGADO) === '1'; } catch (e) { return false; }
  }

  function ligar(valor) {
    try { global.localStorage.setItem(CHAVE_LIGADO, valor ? '1' : '0'); } catch (e) { /* ignora */ }
  }

  /* --- canais ------------------------------------------------------------ */

  /** "Bruno  ALMEIDA" e "bruno almeida" são a mesma pessoa. */
  function chaveNome(nome) {
    return str(nome).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /* O canal de duas pessoas não depende de quem abriu: os dois nomes entram
     em ordem, então os dois lados escrevem no mesmo lugar. */
  function canalDireto(a, b) {
    var x = chaveNome(a), y = chaveNome(b);
    return 'd:' + (x < y ? x + '|' + y : y + '|' + x);
  }

  function ehDireto(canal) { return str(canal).slice(0, 2) === 'd:'; }

  /** Com quem eu falo neste canal — vazio quando é o geral. */
  function outroLado(canal, eu) {
    if (!ehDireto(canal)) return '';
    var lados = str(canal).slice(2).split('|');
    var meu = chaveNome(eu);
    return lados[0] === meu ? lados[1] : lados[0];
  }

  /* --- mensagens --------------------------------------------------------- */

  function nova(canal, texto, de) {
    return {
      id: uid(),
      canal: str(canal) || GERAL,
      de: str(de),
      texto: str(texto).slice(0, MAX_TEXTO),
      em: agora()
    };
  }

  function normalizar(m) {
    if (!m || typeof m !== 'object' || !m.id) return null;
    var out = {
      id: str(m.id),
      canal: str(m.canal) || GERAL,
      de: str(m.de),
      texto: str(m.texto).slice(0, MAX_TEXTO),
      em: str(m.em) || agora()
    };
    if (m.apagada) { out.apagada = true; out.texto = ''; }
    return out;
  }

  function porTempo(a, b) {
    return String(a.em).localeCompare(String(b.em)) || String(a.id).localeCompare(String(b.id));
  }

  /**
   * Junta dois conjuntos de mensagens: união pelo id.
   *
   * Aqui não existe "vale a mais recente" — mensagem não se edita. O que
   * viaja é o apagar: uma vez apagada, fica apagada nos dois lados, senão
   * ela voltaria pela sincronização de quem ainda não soube (é a mesma
   * lápide que o resto do programa usa para os itens excluídos).
   */
  function juntar(a, b) {
    var porId = {};
    var ordem = [];
    [a || [], b || []].forEach(function (lista) {
      lista.forEach(function (bruta) {
        var m = normalizar(bruta);
        if (!m) return;
        var tem = porId[m.id];
        if (!tem) { porId[m.id] = m; ordem.push(m.id); return; }
        if (m.apagada) { tem.apagada = true; tem.texto = ''; }
      });
    });
    return podar(ordem.map(function (id) { return porId[id]; }).sort(porTempo));
  }

  /* O arquivo é lido e reescrito inteiro a cada sincronização: sem um teto
     ele viraria o maior arquivo da pasta em poucos meses. */
  function podar(lista) {
    var corte = new Date(Date.now() - DIAS_GUARDA * 86400000).toISOString();
    var viva = lista.filter(function (m) { return String(m.em) >= corte; });
    /* nunca esvazia a tela: se tudo for velho, ficam as últimas mesmo assim */
    if (!viva.length) viva = lista.slice(-50);
    return viva.length > MAX_MSGS ? viva.slice(-MAX_MSGS) : viva;
  }

  /** Tem aqui alguma coisa que o arquivo da pasta ainda não tem? */
  function faltamLa(minhas, remotas) {
    var la = {};
    (remotas || []).forEach(function (m) { if (m && m.id) la[m.id] = m; });
    return (minhas || []).some(function (m) {
      var outra = la[m.id];
      if (!outra) return true;
      return !!m.apagada !== !!outra.apagada;
    });
  }

  function doCanal(lista, canal) {
    return (lista || []).filter(function (m) { return m.canal === canal; });
  }

  /* --- lidas e não lidas -------------------------------------------------- */

  function lidas() {
    try { return JSON.parse(global.localStorage.getItem(CHAVE_LIDAS) || '{}') || {}; }
    catch (e) { return {}; }
  }

  /**
   * Marca o canal como lido até `quando` (o carimbo da mensagem mais nova
   * que está à vista) — ou até agora, o que for maior.
   *
   * O maior dos dois, e não simplesmente agora, porque o carimbo é do relógio
   * de quem escreveu: um computador adiantado produziria mensagens com data
   * no futuro, que nunca sairiam de "não lidas".
   */
  function marcarLido(canal, quando) {
    var l = lidas();
    var q = str(quando);
    var n = agora();
    l[canal] = q > n ? q : n;
    try { global.localStorage.setItem(CHAVE_LIDAS, JSON.stringify(l)); } catch (e) { /* ignora */ }
  }

  /** Quantas mensagens de outra pessoa chegaram depois da última leitura. */
  function naoLidas(lista, eu) {
    var l = lidas();
    var meu = chaveNome(eu);
    var conta = { total: 0, canais: {} };
    (lista || []).forEach(function (m) {
      if (m.apagada) return;
      if (chaveNome(m.de) === meu) return;          /* o que eu escrevi, eu li */
      if (String(m.em) <= String(l[m.canal] || '')) return;
      conta.canais[m.canal] = (conta.canais[m.canal] || 0) + 1;
      conta.total++;
    });
    return conta;
  }

  /* --- quem está por aí --------------------------------------------------- */

  /**
   * As pessoas com quem dá para falar: quem já escreveu na conversa e quem
   * assinou alguma coisa nos relatórios. Não há cadastro de usuários no
   * programa — esta lista é o mais perto disso que existe.
   */
  function pessoas(projects, mensagens, eu) {
    var vistos = {};
    var meu = chaveNome(eu);

    function anota(nome) {
      var k = chaveNome(nome);
      if (!k || k === meu) return;
      if (!vistos[k]) vistos[k] = str(nome).trim();
    }

    (projects || []).forEach(function (p) {
      anota(p.lastEditedBy);
      (p.sessions || []).forEach(function (s) { anota(s.user); });
      ['ncrs', 'devs'].forEach(function (key) {
        (p[key] || []).forEach(function (n) { anota(n.editedBy); });
      });
      (p.deleted || []).forEach(function (t) { anota(t.by); });
    });
    (mensagens || []).forEach(function (m) {
      anota(m.de);
      if (ehDireto(m.canal)) {
        /* o outro lado de uma conversa direta também é alguém conhecido */
        var lados = String(m.canal).slice(2).split('|');
        lados.forEach(function (x) { if (x !== meu) anota(x); });
      }
    });

    return Object.keys(vistos).sort().map(function (k) {
      return { chave: k, nome: vistos[k] };
    });
  }

  /* --- cópia local -------------------------------------------------------- */

  /* Guardada aqui para a conversa abrir antes de a pasta responder — e para
     o que você escreveu não se perder se a pasta estiver fora do ar. */

  function locais() {
    try {
      var cru = global.localStorage.getItem(CHAVE_MSGS);
      var lista = cru ? JSON.parse(cru) : [];
      return Array.isArray(lista) ? juntar(lista, []) : [];
    } catch (e) { return []; }
  }

  function gravarLocais(lista) {
    try { global.localStorage.setItem(CHAVE_MSGS, JSON.stringify(lista || [])); }
    catch (e) { /* cheio: a pasta continua sendo a cópia que vale */ }
  }

  /** O que vai para o arquivo da pasta. */
  function envelope(lista) {
    return {
      format: 'derrogacao-conversas',
      schema: 1,
      atualizadoEm: agora(),
      mensagens: lista || []
    };
  }

  global.Chat = {
    GERAL: GERAL,
    MAX_TEXTO: MAX_TEXTO,
    DIAS_GUARDA: DIAS_GUARDA,
    ligado: ligado,
    ligar: ligar,
    chaveNome: chaveNome,
    canalDireto: canalDireto,
    ehDireto: ehDireto,
    outroLado: outroLado,
    nova: nova,
    juntar: juntar,
    faltamLa: faltamLa,
    doCanal: doCanal,
    naoLidas: naoLidas,
    marcarLido: marcarLido,
    lidas: lidas,
    pessoas: pessoas,
    locais: locais,
    gravarLocais: gravarLocais,
    envelope: envelope
  };
})(window);
