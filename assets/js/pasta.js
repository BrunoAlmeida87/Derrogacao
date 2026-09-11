/* ==========================================================================
   pasta.js — a pasta da rede como banco de dados
   --------------------------------------------------------------------------
   O navegador não abre uma pasta por caminho: quem escolhe é a pessoa, uma
   vez, e o que sobra é um "crachá" (FileSystemDirectoryHandle) que o próprio
   navegador guarda e sabe reabrir. Daí as consequências que aparecem aqui:

   - o crachá é de quem escolheu, naquele navegador: não viaja no HTML nem no
     arquivo de dados, então cada pessoa passa por isso uma vez;
   - ao reabrir, a permissão costuma voltar como "prompt" e precisa de um
     clique — por isso pedirPermissao() só funciona dentro de um gesto;
   - o programa nunca sabe o caminho completo, só o nome da pasta. O caminho
     que aparece na tela é um texto guardado junto com os dados, para a
     próxima pessoa saber onde apontar.

   Só Chrome e Edge têm essa API; o resto do programa continua funcionando
   sem ela, com o armazenamento local de sempre.
   ========================================================================== */
(function (global) {
  'use strict';

  var ARQUIVO = 'derrogacao-dados.json';
  var HISTORICO = 'historico';
  var MAX_HISTORICO = 40;

  var handle = null;          // pasta escolhida
  var ultimaLeitura = 0;      // lastModified do arquivo na última leitura

  function suportado() {
    return typeof global.showDirectoryPicker === 'function';
  }

  function nome() { return handle ? handle.name : ''; }
  function ligada() { return !!handle; }

  /* --- permissão ---------------------------------------------------------- */

  function estadoPermissao() {
    if (!handle) return Promise.resolve('sem-pasta');
    if (!handle.queryPermission) return Promise.resolve('granted');
    return handle.queryPermission({ mode: 'readwrite' })
      .catch(function () { return 'prompt'; });
  }

  /** Precisa vir de um clique: o navegador ignora o pedido fora de um gesto. */
  function pedirPermissao() {
    if (!handle) return Promise.resolve('sem-pasta');
    if (!handle.requestPermission) return Promise.resolve('granted');
    return handle.requestPermission({ mode: 'readwrite' })
      .catch(function () { return 'denied'; });
  }

  /* --- escolher, lembrar, esquecer ---------------------------------------- */

  function escolher() {
    if (!suportado()) return Promise.reject(new Error('Este navegador não abre pastas. Use o Chrome ou o Edge.'));
    return global.showDirectoryPicker({ mode: 'readwrite', id: 'derrogacao' })
      .then(function (h) {
        handle = h;
        ultimaLeitura = 0;
        return Store.putHandle(h).then(function () { return h; });
      });
  }

  /** Reabre a pasta guardada, se houver. Não pede permissão: só verifica. */
  function retomar() {
    if (!suportado()) return Promise.resolve(null);
    return Store.getHandle().then(function (h) {
      handle = h || null;
      ultimaLeitura = 0;
      return handle;
    });
  }

  function esquecer() {
    handle = null;
    ultimaLeitura = 0;
    return Store.clearHandle();
  }

  /* --- leitura e escrita --------------------------------------------------- */

  function arquivoDados(criar) {
    return handle.getFileHandle(ARQUIVO, { create: !!criar });
  }

  /** Devolve { dados, lastModified } ou { dados: null } se a pasta está vazia. */
  function ler() {
    if (!handle) return Promise.reject(new Error('Nenhuma pasta escolhida.'));
    return arquivoDados(false)
      .then(function (fh) { return fh.getFile(); })
      .then(function (file) {
        return file.text().then(function (txt) {
          /* "externo" = mudou depois da minha última gravação, ou seja: foi
             outra pessoa. É o gatilho para guardar uma versão antes de juntar. */
          var externo = ultimaLeitura > 0 && file.lastModified > ultimaLeitura;
          ultimaLeitura = file.lastModified;
          return {
            dados: txt ? JSON.parse(txt) : null,
            lastModified: file.lastModified,
            externo: externo
          };
        });
      })
      .catch(function (e) {
        /* pasta ainda sem o arquivo: é o primeiro uso, não é erro */
        if (e && (e.name === 'NotFoundError' || e.name === 'NotFound')) {
          return { dados: null, lastModified: 0, externo: false };
        }
        throw e;
      });
  }

  /** O arquivo mudou desde a última leitura? Barato: só olha a data. */
  function mudouLaFora() {
    if (!handle) return Promise.resolve(false);
    return arquivoDados(false)
      .then(function (fh) { return fh.getFile(); })
      .then(function (file) { return file.lastModified > ultimaLeitura; })
      .catch(function () { return false; });
  }

  function gravar(payload) {
    if (!handle) return Promise.reject(new Error('Nenhuma pasta escolhida.'));
    var texto = JSON.stringify(payload, null, 2);
    return arquivoDados(true)
      .then(function (fh) {
        return fh.createWritable().then(function (w) {
          return w.write(texto).then(function () { return w.close(); });
        }).then(function () { return fh.getFile(); });
      })
      .then(function (file) { ultimaLeitura = file.lastModified; return true; });
  }

  /* --- histórico automático ------------------------------------------------ */

  function carimbo(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      '_' + p(d.getHours()) + 'h' + p(d.getMinutes());
  }

  /**
   * Guarda uma versão datada em historico/. É a rede de proteção da regra
   * "vale quem editou por último": qualquer estrago tem para onde voltar,
   * sem ninguém precisar lembrar de fazer backup.
   */
  function versionar(payload, quem) {
    if (!handle) return Promise.resolve(false);
    var nomeArq = carimbo(new Date()) + '_' +
      ((quem || 'sem-nome').replace(/[^\w\-]+/g, '-').toLowerCase()) + '.json';
    return handle.getDirectoryHandle(HISTORICO, { create: true })
      .then(function (dir) {
        return dir.getFileHandle(nomeArq, { create: true })
          .then(function (fh) { return fh.createWritable(); })
          .then(function (w) {
            return w.write(JSON.stringify(payload)).then(function () { return w.close(); });
          })
          .then(function () { return podar(dir); });
      })
      .then(function () { return true; })
      .catch(function (e) {
        /* histórico é desejável, não essencial: nunca derruba a gravação */
        console.warn('Não foi possível gravar o histórico:', e);
        return false;
      });
  }

  function podar(dir) {
    var nomes = [];
    var it = dir.keys();
    function proximo() {
      return it.next().then(function (r) {
        if (r.done) return nomes;
        if (/\.json$/i.test(r.value)) nomes.push(r.value);
        return proximo();
      });
    }
    return proximo().then(function (lista) {
      if (lista.length <= MAX_HISTORICO) return;
      lista.sort();
      return Promise.all(lista.slice(0, lista.length - MAX_HISTORICO).map(function (n) {
        return dir.removeEntry(n).catch(function () { /* alguém já removeu */ });
      }));
    });
  }

  /** Versões guardadas, da mais nova para a mais antiga. */
  function listarHistorico() {
    if (!handle) return Promise.resolve([]);
    return handle.getDirectoryHandle(HISTORICO)
      .then(function (dir) {
        var nomes = [];
        var it = dir.keys();
        function proximo() {
          return it.next().then(function (r) {
            if (r.done) return nomes;
            if (/\.json$/i.test(r.value)) nomes.push(r.value);
            return proximo();
          });
        }
        return proximo().then(function (lista) {
          return lista.sort().reverse().map(function (n) {
            var m = /^(\d{4}-\d{2}-\d{2})_(\d{2})h(\d{2})_(.+)\.json$/.exec(n);
            var quem = m ? m[4] : '';
            var antes = /-antes$/.test(quem);
            return {
              arquivo: n,
              quando: m ? m[1].split('-').reverse().join('/') + ' ' + m[2] + ':' + m[3] : n,
              quem: antes ? quem.replace(/-antes$/, '') + ' (antes de juntar)' : quem,
              antesDeJuntar: antes
            };
          });
        });
      })
      .catch(function () { return []; });
  }

  function lerHistorico(arquivo) {
    return handle.getDirectoryHandle(HISTORICO)
      .then(function (dir) { return dir.getFileHandle(arquivo); })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (t) { return JSON.parse(t); });
  }

  global.Pasta = {
    suportado: suportado,
    ligada: ligada,
    nome: nome,
    escolher: escolher,
    retomar: retomar,
    esquecer: esquecer,
    estadoPermissao: estadoPermissao,
    pedirPermissao: pedirPermissao,
    ler: ler,
    gravar: gravar,
    mudouLaFora: mudouLaFora,
    versionar: versionar,
    listarHistorico: listarHistorico,
    lerHistorico: lerHistorico,
    ARQUIVO: ARQUIVO,
    HISTORICO: HISTORICO
  };
})(window);
