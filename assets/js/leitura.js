/* ==========================================================================
   leitura.js — o programa em modo leitura (o visualizador)
   --------------------------------------------------------------------------
   O visualizador não é outro programa: é este mesmo, gerado como
   `derrogacao-visualizador.html` com uma marca que o põe em modo leitura.
   Assim ele tem todas as abas e exportações do editor, e toda melhoria do
   editor chega a ele sozinha.

   Neste modo:
   - os dados vêm da publicação do editor (publicacao.js), nunca do
     IndexedDB nem da pasta do banco;
   - nada é gravado. `blindar()` troca por "não faz nada" cada função que
     grava — no navegador ou numa pasta. Os controles de edição também somem
     da tela (app.js e app.css), mas a blindagem é a garantia: um controle
     esquecido mexe só na memória, e some ao recarregar.

   O que liga o modo:
     <meta name="derrogacao-modo" content="leitura">   (posto pelo gerador)
     ou ?modo=leitura na URL (para conferir a versão com os arquivos soltos).

   A pasta dos dados — onde está o visualizador-dados.js — vem, nesta ordem,
   do que a pessoa informou neste navegador e do padrão gravado no próprio
   arquivo (<meta name="derrogacao-pasta-dados">). Sem nenhum dos dois, o
   visualizador procura o arquivo ao lado dele.

   Carrega logo depois do log.js e não usa ninguém ao carregar: `blindar()`
   é chamada pelo app.js no início do boot, quando os módulos já existem.
   ========================================================================== */
(function (global) {
  'use strict';

  var CHAVE_PASTA = 'derrogacao-visualizador:pastaDados';

  function meta(nome) {
    var m = document.querySelector('meta[name="' + nome + '"]');
    return m ? (m.getAttribute('content') || '').trim() : '';
  }

  var ativo = meta('derrogacao-modo') === 'leitura' ||
    /[?&]modo=leitura(&|$)/.test(global.location.search || '');

  /* a gravada no próprio arquivo pelo gerador, senão a do config.js */
  function pastaDoArquivo() {
    return meta('derrogacao-pasta-dados') ||
      String((global.Config && Config.PASTA_VISUALIZADOR) || '').trim();
  }

  function pastaDoNavegador() {
    try { return (global.localStorage.getItem(CHAVE_PASTA) || '').trim(); } catch (e) { return ''; }
  }

  /** Grava (ou apaga, com texto vazio ou igual ao padrão) a pasta deste navegador. */
  function setPastaDoNavegador(valor) {
    valor = (valor || '').trim();
    try {
      if (!valor || valor === pastaDoArquivo()) global.localStorage.removeItem(CHAVE_PASTA);
      else global.localStorage.setItem(CHAVE_PASTA, valor);
    } catch (e) { /* sem armazenamento: vale só até fechar */ }
  }

  /** A pasta que vale agora: { caminho, doNavegador }. */
  function pastaDados() {
    var nav = pastaDoNavegador();
    return { caminho: nav || pastaDoArquivo(), doNavegador: !!nav };
  }

  var nada = function () { return Promise.resolve(null); };

  /**
   * Troca por "não faz nada" tudo o que grava. Só age em modo leitura.
   * A lista é de propósito explícita: quem acrescentar uma função que grava
   * num destes módulos deve acrescentá-la aqui também.
   */
  function blindar() {
    if (!ativo) return;
    var barrado = function (onde) {
      return function () {
        if (global.Log) Log.detalhe('leitura', 'modo leitura: não gravo (' + onde + ')');
        return Promise.resolve(null);
      };
    };
    if (global.Store) {
      ['save', 'remove', 'putHandle', 'clearHandle', 'saveSnapshot', 'clearSnapshot',
       'ncrPutMany', 'ncrMetaPut', 'saveBase'].forEach(function (f) {
        if (Store[f]) Store[f] = barrado('Store.' + f);
      });
      ['setUser', 'setFolder', 'setDbFolder', 'setLastBackupAt'].forEach(function (f) {
        if (Store[f]) Store[f] = function () {};
      });
      /* sem IndexedDB: o banco NCR e os relatórios vêm só da publicação */
      if (Store.ncrAll) Store.ncrAll = function () { return Promise.resolve([]); };
      if (Store.ncrMetaGet) Store.ncrMetaGet = nada;
      if (Store.getBase) Store.getBase = nada;
      if (Store.getSnapshot) Store.getSnapshot = nada;
    }
    if (global.Pasta) {
      ['gravar', 'versionar', 'gravarConversas', 'gravarRevisoes', 'gravarImagem',
       'podarImagens', 'gravarArquivo', 'guardarCopia', 'escolher', 'esquecer'].forEach(function (f) {
        if (Pasta[f]) Pasta[f] = barrado('Pasta.' + f);
      });
      /* a pasta do banco nunca é aberta aqui */
      Pasta.retomar = nada;
      Pasta.ligada = function () { return false; };
      if (Pasta.publicacao) {
        ['escolher', 'gravarTexto', 'esquecer'].forEach(function (f) {
          Pasta.publicacao[f] = barrado('Pasta.publicacao.' + f);
        });
        Pasta.publicacao.retomar = nada;
      }
    }
    if (global.Revisoes && Revisoes.gravarLocais) Revisoes.gravarLocais = function () {};
    if (global.Chat && Chat.gravarLocais) Chat.gravarLocais = function () {};
    if (global.Chat && Chat.ligado) Chat.ligado = function () { return false; };
    /* o visualizador recebe comunicados, nunca cria: a cópia local é do
       editor. O que ele guarda é só quais já leu (Comunicados.marcarLidos). */
    if (global.Comunicados && Comunicados.gravarLocais) Comunicados.gravarLocais = function () {};
  }

  global.Leitura = {
    ativo: function () { return ativo; },
    pastaDados: pastaDados,
    pastaDoArquivo: pastaDoArquivo,
    pastaDoNavegador: pastaDoNavegador,
    setPastaDoNavegador: setPastaDoNavegador,
    blindar: blindar,
    CHAVE_PASTA: CHAVE_PASTA
  };
})(window);
