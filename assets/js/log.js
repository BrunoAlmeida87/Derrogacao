/* ==========================================================================
   log.js — o diário do console: o que o programa está fazendo, ao vivo
   --------------------------------------------------------------------------
   Pedido do Bruno depois do InvalidStateError: ver o processamento acontecer,
   e ser avisado quando algo dá errado — em vez de descobrir por acaso numa
   linha vermelha que ninguém sabe ler.

   O que este arquivo é, e o que ele não é:

   - **É console, e só.** Nada é enviado, nada é gravado em arquivo, nada sai
     do computador (§2). As últimas linhas ficam numa lista na memória para a
     pessoa poder copiar e mandar por e-mail, e essa lista morre ao fechar a
     aba.
   - **Não registra o texto das NCRs.** Isto é material de programa de defesa:
     o console fica aberto ao lado de quem passa, e o Windows guarda o que se
     copia. Então aqui vão **nomes de campo, contagens, tamanhos e ids** —
     nunca o que está escrito dentro do campo. É regra, não preferência: se
     for preciso saber o conteúdo, ele está na tela, no item.
   - **Fala português e diz o que fazer.** Um erro do navegador sozinho
     ("InvalidStateError") não ajuda ninguém. Toda falha sai com três partes:
     o que falhou, o que isso significa, e o que a pessoa pode fazer.

   Três níveis, guardados neste navegador (`derrogacao:log`):

     silencio  só o que deu errado
     normal    (padrão) abertura, pasta, mesclagem, exportação, problemas
     tudo      mais o miúdo: cada gravação local, cada desenho, tempos

   Na primeira posição da ordem de carga, porque todo mundo usa — e por isso
   não pode usar ninguém: este arquivo não conhece Store, Pasta nem app.
   ========================================================================== */

(function (global) {
  'use strict';

  var CHAVE = 'derrogacao:log';
  var NIVEIS = ['silencio', 'normal', 'tudo'];
  var MAX_LINHAS = 500;      /* o suficiente para uma manhã de trabalho */

  var linhas = [];           /* as últimas, para copiar e mandar */
  var fontes = [];           /* quem sabe contar o estado, para o diagnóstico */
  var contas = { avisos: 0, erros: 0 };

  function lerNivel() {
    try {
      var v = global.localStorage.getItem(CHAVE);
      return NIVEIS.indexOf(v) >= 0 ? v : 'normal';
    } catch (e) { return 'normal'; }
  }

  var nivelAtual = lerNivel();

  function mostra(minimo) {
    return NIVEIS.indexOf(nivelAtual) >= NIVEIS.indexOf(minimo);
  }

  /* --- formatação --------------------------------------------------------- */

  function dd(n) { return (n < 10 ? '0' : '') + n; }

  function hora() {
    var d = new Date();
    var ms = String(d.getMilliseconds());
    while (ms.length < 3) ms = '0' + ms;
    return dd(d.getHours()) + ':' + dd(d.getMinutes()) + ':' + dd(d.getSeconds()) + '.' + ms;
  }

  /**
   * Um valor de apoio vira texto curto. Objeto vira "a=1 b=2", que se lê numa
   * linha só — o console dobra objeto de verdade num triângulo que ninguém
   * abre, e a linha some no meio das outras.
   */
  function resumir(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v);
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.length > 8 ? v.slice(0, 8).join(', ') + '… (' + v.length + ')' : v.join(', ');
    }
    var partes = [];
    for (var k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      var x = v[k];
      if (x == null || x === '' || x === false) continue;
      partes.push(k + '=' + (typeof x === 'object' ? resumir(x) : String(x)));
    }
    return partes.join(' · ');
  }

  var CORES = {
    passo:    'color:#2a78d6',
    ok:       'color:#1baf7a',
    aviso:    'color:#b8791f',
    erro:     'color:#c2402a;font-weight:700',
    detalhe:  'color:#8a909c'
  };

  function guardar(tipo, area, msg, extra) {
    linhas.push(hora() + '  [' + area + '] ' + msg + (extra ? '  ' + extra : ''));
    if (linhas.length > MAX_LINHAS) linhas.shift();
  }

  function escrever(tipo, area, msg, dados) {
    var extra = resumir(dados);
    guardar(tipo, area, msg, extra);
    if (tipo !== 'erro' && !mostra(tipo === 'detalhe' ? 'tudo' : 'normal')) return;
    var alvo = tipo === 'erro' ? 'error' : (tipo === 'aviso' ? 'warn' : 'log');
    /* Só o carimbo de hora e a área entram no texto de formato — eles são
       escritos no código. A mensagem vai como argumento à parte porque pode
       carregar coisa digitada pela pessoa (o número de uma NCR, o nome de um
       arquivo), e um "%s" perdido lá dentro faria o console comer a linha
       seguinte. */
    var corpo = msg + (extra ? '  ' + extra : '');
    try {
      global.console[alvo]('%c' + hora() + ' ' + area, CORES[tipo] || CORES.passo, corpo);
    } catch (e) {
      global.console.log(hora() + ' ' + area + ' ' + corpo);
    }
  }

  /* --- a interface que o resto do programa usa ---------------------------- */

  function passo(area, msg, dados) { escrever('passo', area, msg, dados); }
  function ok(area, msg, dados) { escrever('ok', area, msg, dados); }
  function detalhe(area, msg, dados) { escrever('detalhe', area, msg, dados); }

  /**
   * Algo não saiu como devia, mas o programa segue.
   * `porque` é a frase que explica, em português, o que aquilo significa.
   */
  function aviso(area, msg, porque, dados) {
    contas.avisos++;
    escrever('aviso', area, msg, dados);
    if (porque) escrever('aviso', area, '   ↳ ' + porque);
  }

  /**
   * Algo falhou. Sempre visível, em qualquer nível — inclusive no silêncio:
   * o nível existe para calar o que deu certo, nunca o que deu errado.
   * `oQueFazer` é o que a pessoa pode fazer agora; sem isso, um erro é só
   * susto.
   */
  function erro(area, msg, e, oQueFazer) {
    contas.erros++;
    var nome = (e && e.name) || '';
    var dito = (e && e.message) || (e ? String(e) : '');
    escrever('erro', area, msg, nome ? { erro: nome } : null);
    if (dito && dito !== nome) escrever('erro', area, '   ↳ ' + dito);
    if (oQueFazer) escrever('erro', area, '   ↳ o que fazer: ' + oQueFazer);
    /* a pilha só no nível "tudo": ela é útil para mim, não para quem usa */
    if (e && e.stack && mostra('tudo')) {
      try { global.console.groupCollapsed('pilha'); global.console.log(e.stack); global.console.groupEnd(); }
      catch (x) { /* console sem group: a linha acima já basta */ }
    }
  }

  /**
   * Marca o começo de uma etapa e devolve quem a fecha, com o tempo.
   * `fim(msg, dados)` escreve a linha de conclusão; `falhou(msg, e, oQue)`
   * fecha com erro. Sempre um dos dois — etapa que abre e não fecha é
   * exatamente o que se quer enxergar no console.
   */
  function etapa(area, msg, dados) {
    var t0 = (global.performance && global.performance.now) ? performance.now() : Date.now();
    passo(area, '▸ ' + msg, dados);
    function ms() {
      var t1 = (global.performance && global.performance.now) ? performance.now() : Date.now();
      return Math.round(t1 - t0) + ' ms';
    }
    return {
      fim: function (m, d) {
        var extra = resumir(d);
        ok(area, '✓ ' + (m || msg) + '  (' + ms() + ')' + (extra ? '  ' + extra : ''));
      },
      falhou: function (m, e, oQue) {
        erro(area, '✗ ' + (m || msg) + '  (' + ms() + ')', e, oQue);
      },
      nada: function (m) { detalhe(area, '· ' + (m || msg) + '  (' + ms() + ')'); }
    };
  }

  /* --- diagnóstico --------------------------------------------------------- */

  /** Quem sabe contar alguma coisa do estado se registra aqui. */
  function fonte(nome, fn) { fontes.push({ nome: nome, fn: fn }); }

  /**
   * O retrato de agora, para a pessoa colar num e-mail quando algo estiver
   * estranho. É o que eu pediria por escrito, montado sozinho.
   */
  function diagnostico() {
    var out = ['=== Derrogação — diagnóstico de ' + new Date().toLocaleString('pt-BR') + ' ==='];
    out.push('endereço: ' + String(global.location && global.location.href).slice(0, 160));
    out.push('navegador: ' + String(global.navigator && global.navigator.userAgent).slice(0, 160));
    out.push('nível do diário: ' + nivelAtual +
      ' · avisos nesta sessão: ' + contas.avisos + ' · erros: ' + contas.erros);
    fontes.forEach(function (f) {
      var v;
      try { v = f.fn(); } catch (e) { v = { falhou: (e && e.message) || 'erro' }; }
      out.push(f.nome + ': ' + resumir(v));
    });
    var texto = out.join('\n');
    /* sem %c aqui: o texto traz endereço e navegador, que podem ter % dentro */
    global.console.log(texto);
    return texto;
  }

  /** As últimas linhas, em texto, para copiar e mandar. */
  function historico() { return linhas.join('\n'); }

  function nivel(v) {
    if (v == null) return nivelAtual;
    if (NIVEIS.indexOf(v) < 0) {
      global.console.log('Níveis: ' + NIVEIS.join(', '));
      return nivelAtual;
    }
    nivelAtual = v;
    try { global.localStorage.setItem(CHAVE, v); } catch (e) { /* segue na memória */ }
    escrever('passo', 'diário', 'nível agora é "' + v + '"');
    return nivelAtual;
  }

  /* --- nada passa em branco ------------------------------------------------
     Qualquer erro solto do programa — inclusive de promessa sem catch — vira
     uma linha explicada, em vez da mancha vermelha crua do navegador. */

  function vigiar() {
    global.addEventListener('error', function (ev) {
      if (!ev) return;
      erro('programa', 'erro inesperado em ' +
        (String(ev.filename || '').split('/').pop() || 'algum lugar') +
        ':' + (ev.lineno || '?'), ev.error || { message: ev.message },
        'copie o diário com Derrogacao.copiar() e mande para quem cuida do programa; ' +
        'o seu trabalho continua salvo neste navegador.');
    });
    global.addEventListener('unhandledrejection', function (ev) {
      erro('programa', 'uma tarefa terminou em erro sem ninguém tratar',
        (ev && ev.reason) || null,
        'se isso se repetir, copie o diário com Derrogacao.copiar() e mande junto.');
    });
  }

  global.Log = {
    passo: passo,
    ok: ok,
    detalhe: detalhe,
    aviso: aviso,
    erro: erro,
    etapa: etapa,
    fonte: fonte,
    nivel: nivel,
    diagnostico: diagnostico,
    historico: historico,
    contas: function () { return { avisos: contas.avisos, erros: contas.erros }; },
    vigiar: vigiar,
    mostra: mostra,
    NIVEIS: NIVEIS
  };

  /* O que a pessoa digita no console. Nome fácil de lembrar e de escrever: é
     para o Bruno usar às 8 da manhã com a equipe esperando. */
  global.Derrogacao = {
    diagnostico: diagnostico,
    copiar: function () {
      var t = diagnostico() + '\n\n--- últimas ' + linhas.length + ' linhas ---\n' + historico();
      copiar(t);
      return 'Copiado. Cole num e-mail (' + linhas.length + ' linhas).';
    },
    diario: function () { global.console.log(historico()); return linhas.length + ' linha(s).'; },
    tudo: function () { return nivel('tudo'); },
    normal: function () { return nivel('normal'); },
    silencio: function () { return nivel('silencio'); },
    ajuda: ajuda
  };

  /* `navigator.clipboard` não existe em file:// — a reserva é a mesma do
     resto do programa, um textarea com execCommand (§6). */
  function copiar(texto) {
    try {
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) { /* cai na reserva */ }
    try {
      var ta = global.document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      global.document.body.appendChild(ta);
      ta.select();
      global.document.execCommand('copy');
      global.document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }

  function ajuda() {
    var t = [
      'Diário do console — o que dá para digitar aqui:',
      '',
      '  Derrogacao.tudo()        mostra também o miúdo (cada gravação, tempos)',
      '  Derrogacao.normal()      o padrão: abertura, pasta, mesclagem, problemas',
      '  Derrogacao.silencio()    só o que der errado',
      '',
      '  Derrogacao.diagnostico() retrato de agora: quantos relatórios, itens, pasta',
      '  Derrogacao.diario()      as últimas linhas, de uma vez',
      '  Derrogacao.copiar()      copia tudo isso para colar num e-mail',
      '',
      'A escolha do nível fica neste navegador. Nada daqui sai do computador,',
      'e o texto das NCRs nunca é registrado — só nomes de campo e contagens.'
    ].join('\n');
    global.console.log(t);
    return '';
  }

  global.Log.ajuda = ajuda;
})(window);
