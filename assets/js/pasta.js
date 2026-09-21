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
  var CONVERSAS = 'conversas.json';
  var REVISOES = 'revisoes.json';
  var HISTORICO = 'historico';
  var IMAGENS = 'imagens';
  var MAX_HISTORICO = 40;
  var DIAS_ORFA = 7;          // um arquivo de imagem só é apagado depois disso

  var handle = null;          // pasta escolhida
  var ultimaLeitura = 0;      // lastModified do arquivo na última leitura

  function suportado() {
    return typeof global.showDirectoryPicker === 'function';
  }

  function nome() { return handle ? handle.name : ''; }
  /** lastModified da última leitura ou gravação feita por esta sessão. */
  function carimbo() { return ultimaLeitura; }
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

  /* --- leitura e escrita ---------------------------------------------------

     Numa pasta de rede, mexer num arquivo falha de vez em quando por motivo
     nenhum de código. O Chrome não grava por cima: ele escreve num arquivo
     temporário ao lado (`.crswap`) e o renomeia no fim, e esse vaivém no G:
     esbarra no antivírus, no próprio Windows e — principalmente — na outra
     pessoa da equipe gravando o mesmo arquivo no mesmo segundo. Quando isso
     acontece o navegador devolve:

       InvalidStateError  "An operation that depends on state cached in an
                           interface object was made but the state had changed
                           since it was read from disk."
       NoModificationAllowedError / AbortError / NotReadableError

     Foi esse InvalidStateError que apareceu no console do Bruno, subindo do
     diário de alterações. Nenhum deles quer dizer "não vai dar" — querem
     dizer "agora não". O crachá do arquivo guarda um retrato (tamanho e data)
     de quando foi pedido; se o arquivo mudou depois, o retrato vence e o
     navegador recusa. Pedir o crachá **de novo** e tentar mais uma vez, meio
     segundo depois, resolve o caso normal.

     Duas tentativas, não mais: se a segunda também falhar é porque tem outra
     coisa errada (a pasta caiu, a permissão saiu), e aí o erro tem de subir
     para quem chamou — que é quem sabe se aquilo era essencial (os dados) ou
     desejável (o diário, a conversa, o histórico). */

  var PASSAGEIROS = ['InvalidStateError', 'NoModificationAllowedError',
    'AbortError', 'NotReadableError'];

  function passageiro(e) {
    return !!e && PASSAGEIROS.indexOf(e.name) >= 0;
  }

  function daquiAPouco(ms) {
    return new Promise(function (ok) { setTimeout(ok, ms); });
  }

  /**
   * Roda `tarefa` e, se ela falhar por um desses tropeços, roda outra vez.
   * A tarefa tem de pedir o crachá do arquivo lá dentro — reaproveitar o de
   * fora repetiria o retrato velho, que é justamente o que o navegador
   * recusou.
   */
  function comSegundaChance(tarefa, oQue) {
    return tarefa().catch(function (e) {
      if (!passageiro(e)) throw e;
      /* Este aviso é o que faltava no console do Bruno: a pasta tropeçou,
         mas o programa vai tentar de novo. Ver dois destes seguidos no mesmo
         arquivo já é sinal de outra pessoa gravando no mesmo segundo — ou de
         antivírus no meio do caminho. */
      Log.aviso('pasta', 'a pasta recusou gravar ' + (oQue || 'um arquivo') +
        ' — tentando de novo em 0,6 s', explicar(e), { erro: e && e.name });
      return daquiAPouco(600).then(function () {
        return tarefa().then(function (r) {
          Log.ok('pasta', 'deu certo na segunda tentativa: ' + (oQue || 'arquivo'));
          return r;
        });
      });
    });
  }

  /**
   * O erro do navegador, em português, com o que ele quer dizer aqui.
   * Fica neste arquivo porque é aqui que esses erros nascem — e porque a
   * frase certa depende de a pasta ser de rede, que é o caso da equipe.
   */
  function explicar(e) {
    var n = (e && e.name) || '';
    if (n === 'InvalidStateError') {
      return 'o arquivo mudou no disco depois que o navegador o abriu — quase ' +
        'sempre outra pessoa da equipe gravando no mesmo segundo, ou o antivírus ' +
        'segurando o arquivo temporário da pasta de rede.';
    }
    if (n === 'NoModificationAllowedError') {
      return 'o arquivo está preso por outro programa (Excel aberto? antivírus?).';
    }
    if (n === 'NotAllowedError') {
      return 'a permissão da pasta não está valendo nesta sessão — clique em ' +
        '“Pasta” na barra de cima e confirme.';
    }
    if (n === 'NotFoundError') {
      return 'o arquivo ou a pasta não estão mais onde estavam (o G: caiu? a ' +
        'pasta foi movida?).';
    }
    if (n === 'NotReadableError' || n === 'AbortError') {
      return 'a leitura foi interrompida no meio — rede instável, na maioria das vezes.';
    }
    return 'o navegador não explicou o motivo.';
  }

  /** Escreve um JSON da pasta, com a segunda chance. */
  function escreverJson(nomeArq, payload, espaco) {
    if (!handle) return Promise.reject(new Error('Nenhuma pasta escolhida.'));
    var texto = JSON.stringify(payload, null, espaco || 1);
    return comSegundaChance(function () {
      return handle.getFileHandle(nomeArq, { create: true })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) {
          return w.write(texto).then(function () { return w.close(); });
        });
    }, nomeArq).then(function () {
      Log.detalhe('pasta', 'gravado ' + nomeArq, { bytes: texto.length });
      return true;
    });
  }

  function arquivoDados(criar) {
    return handle.getFileHandle(ARQUIVO, { create: !!criar });
  }

  /** Devolve { dados, lastModified } ou { dados: null } se a pasta está vazia. */
  function ler() {
    if (!handle) return Promise.reject(new Error('Nenhuma pasta escolhida.'));
    return comSegundaChance(function () {
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
      });
    }, ARQUIVO)
      .catch(function (e) {
        /* pasta ainda sem o arquivo: é o primeiro uso, não é erro */
        if (e && (e.name === 'NotFoundError' || e.name === 'NotFound')) {
          Log.passo('pasta', 'a pasta ainda não tem ' + ARQUIVO + ' — primeiro uso');
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
    return comSegundaChance(function () {
      return arquivoDados(true)
        .then(function (fh) {
          return fh.createWritable().then(function (w) {
            return w.write(texto).then(function () { return w.close(); });
          }).then(function () { return fh.getFile(); });
        });
    }, ARQUIVO)
      .then(function (file) {
        ultimaLeitura = file.lastModified;
        Log.detalhe('pasta', 'gravado ' + ARQUIVO, { bytes: texto.length });
        /* o carimbo da MINHA gravação: é com ele que a rodada seguinte sabe
           se o arquivo que está lá ainda é o meu (ver `sincronizar`) */
        return file.lastModified;
      });
  }

  /* --- imagens em arquivos próprios ----------------------------------------
     Antes cada foto ia em base64 dentro do JSON, e todo ciclo de gravação
     reescrevia os megabytes de todas elas — mais uma cópia inteira em cada
     versão do histórico. Agora a imagem é um arquivo ao lado, gravado uma
     vez, e o JSON guarda só o nome. O backup .json continua embutindo tudo:
     esse precisa viajar sozinho por e-mail. */

  function extensaoDe(dataUrl) {
    var m = /^data:image\/([a-z0-9.+-]+);/i.exec(dataUrl || '');
    var tipo = (m ? m[1] : 'jpeg').toLowerCase();
    if (tipo === 'jpeg' || tipo === 'jpg') return 'jpg';
    if (tipo === 'svg+xml') return 'svg';
    return tipo.replace(/[^a-z0-9]/g, '') || 'bin';
  }

  function tipoDe(nome) {
    var ext = (nome.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'svg') return 'image/svg+xml';
    return 'image/' + (ext || 'png');
  }

  /* data:...;base64,xxx -> bytes. Sem fetch(), que em file:// nem sempre
     aceita data URL. */
  function bytesDe(dataUrl) {
    var virgula = String(dataUrl).indexOf(',');
    if (virgula < 0) return null;
    var cabeca = String(dataUrl).slice(0, virgula);
    var cru = String(dataUrl).slice(virgula + 1);
    /* praticamente sempre base64 (é o que o canvas e o FileReader produzem);
       o outro caso existe só para não quebrar com uma imagem de origem rara */
    var bin = /;base64/i.test(cabeca)
      ? global.atob(cru)
      : unescape(encodeURIComponent(decodeURIComponent(cru)));
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  function base64De(buffer) {
    var bytes = new Uint8Array(buffer);
    var pedacos = [];
    var passo = 0x8000;         // btoa de uma vez só estoura a pilha
    for (var i = 0; i < bytes.length; i += passo) {
      pedacos.push(String.fromCharCode.apply(null, bytes.subarray(i, i + passo)));
    }
    return global.btoa(pedacos.join(''));
  }

  function soNome(caminho) {
    var partes = String(caminho || '').split('/');
    return partes[partes.length - 1];
  }

  function pastaImagens(criar) {
    if (!handle) return Promise.reject(new Error('Nenhuma pasta escolhida.'));
    return handle.getDirectoryHandle(IMAGENS, { create: !!criar });
  }

  /** Grava a imagem e devolve o caminho relativo dela dentro da pasta. */
  function gravarImagem(id, dataUrl) {
    var nome = id + '.' + extensaoDe(dataUrl);
    var bytes = bytesDe(dataUrl);
    if (!bytes) return Promise.reject(new Error('Imagem ilegível.'));
    return comSegundaChance(function () {
      return pastaImagens(true)
        .then(function (dir) { return dir.getFileHandle(nome, { create: true }); })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (w) { return w.write(bytes).then(function () { return w.close(); }); });
    }, 'a imagem ' + nome).then(function () {
      Log.detalhe('pasta', 'imagem gravada', { arquivo: nome, bytes: bytes.length });
      return IMAGENS + '/' + nome;
    });
  }

  /** Lê uma imagem gravada e devolve de volta em data URL. */
  function lerImagem(caminho) {
    var nome = soNome(caminho);
    return pastaImagens(false)
      .then(function (dir) { return dir.getFileHandle(nome); })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.arrayBuffer(); })
      .then(function (buf) { return 'data:' + tipoDe(nome) + ';base64,' + base64De(buf); });
  }

  /** Percorre um diretório e devolve [{nome, tamanho, quando}]. */
  function listarArquivos(dir, filtro) {
    var out = [];
    var it = dir.values();
    function proximo() {
      return it.next().then(function (r) {
        if (r.done) return out;
        if (r.value.kind === 'file' && (!filtro || filtro.test(r.value.name))) {
          return r.value.getFile().then(function (f) {
            out.push({ nome: r.value.name, tamanho: f.size, quando: f.lastModified });
            return proximo();
          });
        }
        return proximo();
      });
    }
    return proximo();
  }

  /**
   * Apaga imagens que nenhum item usa mais.
   *
   * O corte de sete dias é proposital: entre gravar o arquivo da imagem e
   * gravar o JSON que a cita existe um instante em que ela parece órfã para
   * quem estiver lendo a pasta. Esperar uma semana torna essa corrida
   * impossível de dar errado.
   */
  function podarImagens(usados) {
    if (!handle) return Promise.resolve(0);
    var vivos = {};
    (usados || []).forEach(function (c) { vivos[soNome(c)] = true; });
    var limite = Date.now() - DIAS_ORFA * 86400000;
    return pastaImagens(false)
      .then(function (dir) {
        return listarArquivos(dir).then(function (lista) {
          var mortos = lista.filter(function (f) {
            return !vivos[f.nome] && f.quando < limite;
          });
          return Promise.all(mortos.map(function (f) {
            return dir.removeEntry(f.nome).catch(function () { /* já foi */ });
          })).then(function () { return mortos.length; });
        });
      })
      .catch(function () { return 0; });
  }

  /** Quanto a pasta está ocupando, por parte. Em bytes. */
  function tamanhos() {
    if (!handle) return Promise.resolve(null);
    var res = { dados: 0, historico: 0, imagens: 0, versoes: 0, fotos: 0 };
    var passos = [
      arquivoDados(false).then(function (fh) { return fh.getFile(); })
        .then(function (f) { res.dados = f.size; })
        .catch(function () { }),
      handle.getDirectoryHandle(HISTORICO)
        .then(function (dir) { return listarArquivos(dir, /\.json$/i); })
        .then(function (lista) {
          res.versoes = lista.length;
          lista.forEach(function (f) { res.historico += f.tamanho; });
        })
        .catch(function () { }),
      pastaImagens(false)
        .then(function (dir) { return listarArquivos(dir); })
        .then(function (lista) {
          res.fotos = lista.length;
          lista.forEach(function (f) { res.imagens += f.tamanho; });
        })
        .catch(function () { })
    ];
    return Promise.all(passos).then(function () {
      res.total = res.dados + res.historico + res.imagens;
      return res;
    });
  }

  /* --- conversa da equipe --------------------------------------------------
     Arquivo próprio, ao lado dos dados. Fora do derrogacao-dados.json de
     propósito: aquele é reescrito a cada gravação e copiado inteiro em cada
     versão do histórico, e o papo do dia não tem por que engordar isso. */

  function lerConversas() {
    if (!handle) return Promise.resolve(null);
    return handle.getFileHandle(CONVERSAS, { create: false })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (t) { return t ? JSON.parse(t) : null; })
      .catch(function () { return null; });   /* ainda não existe: primeira conversa */
  }

  function gravarConversas(payload) {
    return escreverJson(CONVERSAS, payload, 1);
  }

  /* --- diário de alterações ------------------------------------------------
     Arquivo próprio, pela mesma razão da conversa: o arquivo de dados é
     reescrito e copiado inteiro a cada gravação, e um diário que só cresce
     não tem por que ser copiado junto. */

  function lerRevisoes() {
    if (!handle) return Promise.resolve(null);
    return handle.getFileHandle(REVISOES, { create: false })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (t) { return t ? JSON.parse(t) : null; })
      .catch(function () { return null; });   /* ainda não existe: primeira alteração */
  }

  function gravarRevisoes(payload) {
    return escreverJson(REVISOES, payload, 1);
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
    return comSegundaChance(function () {
      return handle.getDirectoryHandle(HISTORICO, { create: true })
        .then(function (dir) {
          return dir.getFileHandle(nomeArq, { create: true })
            .then(function (fh) { return fh.createWritable(); })
            .then(function (w) {
              return w.write(JSON.stringify(payload)).then(function () { return w.close(); });
            })
            .then(function () { return podar(dir); });
        });
    }, 'a versão ' + nomeArq)
      .then(function () {
        Log.passo('pasta', 'versão guardada em ' + HISTORICO + '/', { arquivo: nomeArq });
        return true;
      })
      .catch(function (e) {
        /* histórico é desejável, não essencial: nunca derruba a gravação */
        Log.erro('pasta', 'não consegui guardar a versão datada em ' + HISTORICO + '/',
          e, explicar(e) + ' Os dados foram gravados assim mesmo; o que falta é a ' +
          'cópia de segurança desta rodada.');
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
    lerConversas: lerConversas,
    gravarConversas: gravarConversas,
    explicar: explicar,
    carimbo: carimbo,
    lerRevisoes: lerRevisoes,
    gravarRevisoes: gravarRevisoes,
    CONVERSAS: CONVERSAS,
    REVISOES: REVISOES,
    gravarImagem: gravarImagem,
    lerImagem: lerImagem,
    podarImagens: podarImagens,
    tamanhos: tamanhos,
    ARQUIVO: ARQUIVO,
    HISTORICO: HISTORICO,
    IMAGENS: IMAGENS
  };
})(window);
