/* ==========================================================================
   config.js — as preferências do programa que mudam com o tempo
   --------------------------------------------------------------------------
   Um lugar só para o que hoje vale e amanhã será outro — o marco da vez, o
   ritmo da atualização automática, os marcos que geram comunicados. Mudou o marco prioritário? É aqui, e em
   nenhum outro arquivo.

   Carrega logo depois do log.js e não usa ninguém: só guarda valores e as
   funções que os comparam.
   ========================================================================== */
(function (global) {
  'use strict';

  /* O marco que abre primeiro: o relatório dele vem selecionado na abertura
     (editor e visualizador), e o Resumo nasce detalhando-o. Pedido do Bruno:
     "priorizar o Marco 9". Quando o marco da vez mudar, troque só esta linha. */
  var MARCO_INICIAL = 'J09';

  /* De quanto em quanto tempo os dados de fora são conferidos sozinhos: a
     pasta da equipe no editor, a publicação no visualizador. */
  var INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

  /* Os marcos cujos acontecimentos podem virar comunicado para o
     visualizador (comunicados.js): um waiver novo, uma NCR nova, um waiver
     aceito. Para acompanhar outro marco, acrescente-o aqui — ['J09', 'J10'].
     A comparação é a de `ehMarco`: "J09 Ind" não é o J09. */
  var MARCOS_COMUNICADOS = ['J09'];

  function str(v) { return v == null ? '' : String(v); }

  /**
   * A chave de comparação de um marco: sem diferença de maiúsculas, sem
   * espaços e sem zero à esquerda no número ("j 9" = "J09"). Nada além disso:
   * "J09 Ind" (o industrial), "J09Cer" e "J19" continuam sendo outros marcos.
   */
  function chaveMarco(t) {
    return str(t).toUpperCase().replace(/\s+/g, '').replace(/^J0*(\d)/, 'J$1');
  }

  /**
   * O texto é este marco? Aceita também o prefixo "RANAE", que é como a
   * equipe chama os relatórios ("RANAE J06" é o J06) — e só esse prefixo.
   * Devolve 2 para igual, 1 para "RANAE <marco>", 0 para outro marco.
   */
  function ehMarco(texto, alvo) {
    var a = chaveMarco(alvo);
    if (!a) return 0;
    var t = str(texto).replace(/\s+/g, '');
    if (chaveMarco(t) === a) return 2;
    var m = /^RANAE(J.*)$/i.exec(t);
    return m && chaveMarco(m[1]) === a ? 1 : 0;
  }

  /**
   * O relatório do marco inicial, entre os que existem — ou null. Nunca cria
   * nada: sem o marco, quem chamou segue a regra de antes (o mais recente).
   * Com dois relatórios do mesmo marco, vale o escrito igual e depois o
   * mexido por último.
   */
  function relatorioInicial(projects) {
    var melhor = null, nota = 0;
    (projects || []).forEach(function (p) {
      var n = ehMarco(p && p.marco, MARCO_INICIAL);
      if (!n) return;
      if (n > nota || (n === nota && str(p.updatedAt) > str(melhor.updatedAt))) {
        melhor = p;
        nota = n;
      }
    });
    return melhor;
  }

  global.Config = {
    MARCO_INICIAL: MARCO_INICIAL,
    INTERVALO_ATUALIZACAO_MS: INTERVALO_ATUALIZACAO_MS,
    MARCOS_COMUNICADOS: MARCOS_COMUNICADOS,
    chaveMarco: chaveMarco,
    ehMarco: ehMarco,
    relatorioInicial: relatorioInicial
  };
})(window);
