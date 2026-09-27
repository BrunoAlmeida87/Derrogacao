/* ==========================================================================
   atualizacao.js — o ciclo da atualização automática, e o contador dele
   --------------------------------------------------------------------------
   Pedido do Bruno: os dados de fora (a pasta da equipe no editor, a
   publicação no visualizador) conferidos sozinhos a cada 5 minutos, com um
   contador à vista — "Próxima atualização em 04:32" —, sem recarregar a
   página e sem perder nada do que está aqui.

   Um relógio só para o programa inteiro: trocar de aba não cria outro, e
   ninguém mais agenda releitura por conta própria. Quem quiser saber de cada
   rodada (os comunicados do visualizador, quando existirem) se inscreve em
   `aoConcluir` — em vez de criar um segundo mecanismo concorrente.

   - Com a página em segundo plano o relógio para: nada é conferido nem
     redesenhado. Ao voltar, se a última rodada tiver mais de um minuto,
     confere na hora; senão, continua a contagem.
   - `podeAgora()` (de quem configurou) pode adiar a rodada — alguém
     digitando, uma janela aberta: tenta de novo em 15 s.
   - A rodada que falha não apaga nada: fica anotada ("falhou"), e o contador
     recomeça do mesmo jeito.
   - Um clique em "Atualizar" roda na hora e recomeça a contagem.

   Não conhece Store, Pasta nem app: recebe as funções em `iniciar`.
   ========================================================================== */
(function (global) {
  'use strict';

  var ADIA_MS = 15 * 1000;       /* adiada (digitando, janela aberta): tenta de novo em */
  var VOLTA_MS = 60 * 1000;      /* ao voltar para a janela, confere se passou disto */

  var cfg = null;         /* { intervalo, executar(origem) -> Promise, podeAgora() -> true|motivo, aoMudar(estado) } */
  var prazo = 0;          /* quando é a próxima rodada (Date.now) */
  var tique = null;       /* o setInterval de 1 s — só com a página à vista */
  var rodando = false;
  var adiado = '';        /* por que a rodada que venceu ainda não aconteceu */
  var ultima = { quando: 0, ok: true, erro: '' };
  var ouvintes = [];
  var ligadoVisibilidade = false;

  function agoraMs() { return Date.now(); }

  function avisar() {
    if (cfg && cfg.aoMudar) {
      try { cfg.aoMudar(estado()); } catch (e) { /* o contador nunca derruba o ciclo */ }
    }
  }

  function ligarTique() {
    if (document.hidden) { desligarTique(); return; }
    if (!tique) tique = setInterval(passo, 1000);
  }
  function desligarTique() {
    if (tique) { clearInterval(tique); tique = null; }
  }

  /** Um segundo passou: atualiza o contador e, vencido o prazo, roda. */
  function passo() {
    if (!cfg) return;
    if (rodando || agoraMs() < prazo) { avisar(); return; }
    var pode = cfg.podeAgora ? cfg.podeAgora() : true;
    if (pode !== true) {
      adiado = typeof pode === 'string' ? pode : 'aguardando';
      prazo = agoraMs() + ADIA_MS;
      avisar();
      return;
    }
    rodar('automatica');
  }

  /**
   * Roda uma rodada agora. `origem`: 'automatica', 'manual' ou 'volta'.
   * Resolve com o que `executar` devolveu (ou null, se falhou ou já havia
   * uma rodada em curso).
   */
  function rodar(origem) {
    if (!cfg || rodando) return Promise.resolve(null);
    rodando = true;
    adiado = '';
    avisar();
    var p;
    try { p = Promise.resolve(cfg.executar(origem)); } catch (e) { p = Promise.reject(e); }
    return p.then(function (r) {
      ultima = { quando: agoraMs(), ok: true, erro: '' };
      ouvintes.forEach(function (fn) {
        try { fn(r, origem); } catch (e) { /* um ouvinte com defeito não para os outros */ }
      });
      return r;
    }, function (e) {
      ultima = { quando: agoraMs(), ok: false, erro: (e && e.message) || String(e || 'falhou') };
      return null;
    }).then(function (r) {
      rodando = false;
      prazo = agoraMs() + cfg.intervalo;
      ligarTique();
      avisar();
      return r;
    });
  }

  function aoVisibilidade() {
    if (!cfg) return;
    if (document.hidden) { desligarTique(); avisar(); return; }
    ligarTique();
    /* voltou para a janela depois de um tempo: confere já, em vez de mostrar
       o que pode estar velho até o fim da contagem */
    if (!rodando && agoraMs() - ultima.quando > VOLTA_MS) {
      var pode = cfg.podeAgora ? cfg.podeAgora() : true;
      if (pode === true) { rodar('volta'); return; }
    }
    passo();
  }

  /**
   * Liga o ciclo. Chamar de novo troca a configuração — nunca cria um
   * segundo relógio.
   * @param c.intervalo  ms entre as rodadas
   * @param c.executar   function(origem) -> Promise; rejeitar = falhou
   * @param c.podeAgora  function() -> true, ou o motivo para adiar (texto)
   * @param c.aoMudar    function(estado) — desenha o contador
   * @param c.imediata   roda a primeira já (senão, só depois do intervalo)
   */
  function iniciar(c) {
    desligarTique();
    cfg = c;
    rodando = false;
    adiado = '';
    prazo = agoraMs() + cfg.intervalo;
    if (!ligadoVisibilidade) {
      document.addEventListener('visibilitychange', aoVisibilidade);
      ligadoVisibilidade = true;
    }
    ligarTique();
    avisar();
    if (c.imediata) rodar('automatica');
  }

  function parar() {
    desligarTique();
    cfg = null;
    rodando = false;
  }

  /**
   * Uma troca com a fonte aconteceu por outro caminho (a gravação do editor
   * lê a pasta antes de gravar): os dados à vista são de agora, e a
   * contagem recomeça — o contador diz quanto falta para a próxima
   * conferência se nada mais acontecer.
   */
  function marcarFeita(ok) {
    if (!cfg || rodando) return;
    ultima = { quando: agoraMs(), ok: ok !== false, erro: ok === false ? 'falhou' : '' };
    adiado = '';
    prazo = agoraMs() + cfg.intervalo;
    avisar();
  }

  function estado() {
    return {
      ligado: !!cfg,
      falta: cfg ? Math.max(0, prazo - agoraMs()) : 0,
      rodando: rodando,
      adiado: adiado,
      pausado: !!cfg && document.hidden,
      ultima: { quando: ultima.quando, ok: ultima.ok, erro: ultima.erro }
    };
  }

  /** 272000 → "04:32" */
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Quem quer saber de cada rodada concluída: fn(resultado, origem). */
  function aoConcluir(fn) { if (typeof fn === 'function') ouvintes.push(fn); }

  global.Atualizacao = {
    iniciar: iniciar,
    parar: parar,
    agora: function () { return rodar('manual'); },
    marcarFeita: marcarFeita,
    estado: estado,
    aoConcluir: aoConcluir,
    mmss: mmss,
    ADIA_MS: ADIA_MS,
    VOLTA_MS: VOLTA_MS
  };
})(window);
