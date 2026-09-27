/* ==========================================================================
   publicacao.js — o arquivo que o visualizador lê
   --------------------------------------------------------------------------
   O visualizador é este mesmo programa em modo leitura (leitura.js), num
   arquivo único que fica numa pasta da rede e é aberto com dois cliques, ou
   seja, de file://. Dali o navegador não deixa a página ler um .json (fetch
   e XHR são bloqueados — e a CSP ainda tem connect-src 'none'), mas deixa
   carregar um <script src>, ao lado dela ou em outra pasta, por caminho.
   Por isso a publicação é um .js:

       window.DERROGACAO_VISUALIZADOR = { ...os dados... };

   O editor grava esse arquivo; o visualizador o carrega sem pedir nada.
   Quando o arquivo chega por outro caminho (aberto à mão), ele é lido como
   TEXTO e interpretado — nunca executado.

   Vai o que o relatório mostra, a situação interna, quem editou cada item e
   o banco NCR. Não vão as sessões de trabalho, as lápides de exclusão, os
   campos de controle da mesclagem nem a anotação interna do item (`nota`),
   que a tela promete ficar "só aqui e na pasta da equipe".
   ========================================================================== */
(function (global) {
  'use strict';

  var ARQUIVO = 'visualizador-dados.js';
  var GLOBAL = 'DERROGACAO_VISUALIZADOR';
  var FORMATO = 'derrogacao-visualizacao';

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

  /* O relatório em branco que o editor cria ao abrir ("Novo relatório",
     sem marco e sem itens) não é trabalho de ninguém: não vai. */
  function publicaveis(projects) {
    return (projects || []).filter(function (p) {
      return str(p.marco).trim() || (p.ncrs || []).length || (p.devs || []).length;
    });
  }

  /** Cópia do relatório só com o que interessa a quem visualiza. */
  function limpar(p) {
    var c = JSON.parse(JSON.stringify(p));
    delete c.sessions;
    delete c.deleted;
    delete c.lastBackupBy;
    delete c.lastBackupAt;
    ['ncrs', 'devs'].forEach(function (k) {
      (c[k] || []).forEach(function (n) {
        delete n.syncBase;
        delete n.nota;
        (n.evidence || []).forEach(function (ev) {
          (ev.images || []).forEach(function (im) {
            /* a imagem viaja embutida; o nome do arquivo na pasta do banco
               não serve a quem não enxerga aquela pasta */
            if (im.src) delete im.arquivo;
          });
        });
      });
    });
    return c;
  }

  /**
   * Os relatórios já limpos, em texto: serve para saber se algo mudou.
   * Ficam de fora os carimbos que toda gravação renova (updatedAt,
   * lastEditedAt) — senão cada salvamento sem mudança republicaria.
   */
  function conteudo(projects, ncrBase) {
    return JSON.stringify([publicaveis(projects).map(function (p) {
      var c = limpar(p);
      delete c.updatedAt;
      delete c.lastEditedAt;
      return c;
    }), ncrBase ? ncrBase.ncrs : null]);
  }

  /* Os metadados vêm antes dos dados: assim dá para ler quem publicou e
     quando só pelo começo do arquivo, sem trazer as imagens pela rede. */
  function montar(projects, quem, ncrBase) {
    return {
      format: FORMATO,
      schema: Store.SCHEMA,
      publishedAt: new Date().toISOString(),
      publishedBy: str(quem),
      projects: publicaveis(projects).map(limpar),
      ncrBase: ncrBase || null
    };
  }

  /** Quantas imagens ficaram sem o conteúdo (só com o nome do arquivo). */
  function imagensSemConteudo(payload) {
    var n = 0;
    (payload.projects || []).forEach(function (p) {
      ['ncrs', 'devs'].forEach(function (k) {
        (p[k] || []).forEach(function (it) {
          (it.evidence || []).forEach(function (ev) {
            (ev.images || []).forEach(function (im) { if (!im.src) n++; });
          });
        });
      });
    });
    return n;
  }

  function texto(payload) {
    /* U+2028/U+2029 são válidos em JSON mas quebravam scripts em motores
       antigos; escapados, o arquivo vale nos dois mundos */
    var json = JSON.stringify(payload)
      .replace(new RegExp('\u2028', 'g'), '\\u2028')
      .replace(new RegExp('\u2029', 'g'), '\\u2029');
    return '/* Publicação do gerador de derrogações para o visualizador.\n' +
      '   Gerado pelo editor — não edite à mão: a próxima publicação substitui. */\n' +
      'window.' + GLOBAL + ' = ' + json + ';\n';
  }

  /**
   * Transforma o que veio (objeto já carregado ou texto de arquivo) em
   * { projects, ncrBase, quando, quem, formato, schema, assinatura }.
   * Aceita a publicação, o banco da pasta (derrogacao-dados.json) e os
   * backups do editor (que trazem o banco NCR em `ncrBase`).
   */
  function deObjeto(d) {
    if (!d || typeof d !== 'object') throw new Error('Arquivo sem dados reconhecíveis.');
    var projects = Store.fromBackup(d);
    return {
      projects: projects,
      ncrBase: (d.ncrBase && typeof d.ncrBase === 'object') ? d.ncrBase : null,
      formato: str(d.format) || 'backup',
      schema: Number(d.schema) || 0,
      quando: str(d.publishedAt || d.updatedAt || d.exportedAt),
      quem: str(d.publishedBy || d.updatedBy || d.exportedBy),
      /* o conteúdo como veio, antes de normalizar (a normalização preenche
         carimbos ausentes com "agora"): é o que diz se a releitura mudou algo */
      assinatura: JSON.stringify([d.projects || d, d.ncrBase ? d.ncrBase.ncrs : null])
    };
  }

  function interpretar(txt) {
    txt = str(txt).replace(/^\uFEFF/, '');
    var t = txt.trim();
    /* o invólucro do .js: tudo do primeiro "{" depois do "=" até o último "}" */
    if (t.charAt(0) !== '{' && t.charAt(0) !== '[') {
      var ig = t.indexOf('=');
      var ini = ig >= 0 ? t.indexOf('{', ig) : -1;
      var fim = t.lastIndexOf('}');
      if (ini < 0 || fim < ini) throw new Error('O arquivo não contém dados de derrogação.');
      t = t.slice(ini, fim + 1);
    }
    var dados;
    try { dados = JSON.parse(t); }
    catch (e) { throw new Error('O arquivo não contém dados de derrogação.'); }
    return deObjeto(dados);
  }

  /** Quem publicou e quando, lido só do começo do arquivo. */
  function cabecalho(inicioTexto) {
    var s = str(inicioTexto);
    var q = /"publishedAt"\s*:\s*"([^"]*)"/.exec(s);
    var p = /"publishedBy"\s*:\s*"([^"]*)"/.exec(s);
    if (!q) return null;
    return { quando: q[1], quem: p ? p[1] : '' };
  }

  var scriptAtual = null;

  /**
   * Carrega um arquivo publicado pelo endereço dado (por padrão, o que está
   * ao lado desta página). O "?t=" faz o navegador ler o arquivo de novo em
   * vez de reaproveitar o da carga anterior. Resolve com os dados, ou null
   * se o arquivo não existe ou não pôde ser lido.
   *
   * De file:// o navegador carrega um <script> de QUALQUER pasta que a
   * pessoa enxergue — inclusive por caminho absoluto, noutra pasta da rede —
   * sem pedir permissão (conferido no Chromium, com a CSP desta página, com
   * e sem --allow-file-access-from-files). É o que deixa o visualizador
   * ficar num lugar e os dados noutro.
   */
  function carregarDe(url) {
    return new Promise(function (resolve) {
      if (scriptAtual && scriptAtual.parentNode) scriptAtual.parentNode.removeChild(scriptAtual);
      try { global[GLOBAL] = undefined; } catch (e) { /* ignora */ }
      var s = document.createElement('script');
      s.src = (url || ARQUIVO) + '?t=' + Date.now();
      s.onload = function () {
        var d = global[GLOBAL];
        try { global[GLOBAL] = undefined; } catch (e) { /* ignora */ }
        if (!d) { resolve(null); return; }
        try { resolve(deObjeto(d)); } catch (e) { resolve(null); }
      };
      s.onerror = function () { resolve(null); };
      scriptAtual = s;
      document.head.appendChild(s);
    });
  }

  function carregarAoLado() { return carregarDe(ARQUIVO); }

  /**
   * Transforma o caminho que a pessoa conhece no endereço que o navegador
   * entende. Aceita:
   *   \\servidor\projetos\Derrogacao   (pasta de rede)
   *   G:\DOP\...\Consulta              (unidade mapeada)
   *   /home/fulano/dados               (Linux/Mac)
   *   file:///..., http(s)://...       (já é endereço)
   * Pode ser a pasta (o nome do arquivo é acrescentado) ou o próprio .js.
   * Devolve '' para um caminho que não dá para usar (ex.: relativo).
   */
  function caminhoParaUrl(caminho) {
    var c = str(caminho).trim().replace(/^"+|"+$/g, '').trim();
    if (!c) return '';
    var url;
    if (/^(file|https?):\/\//i.test(c)) {
      url = c.replace(/\/+$/, '');
    } else {
      c = c.replace(/\\/g, '/').replace(/\/+$/, '');
      var prefixo;
      if (/^\/\/[^\/]/.test(c)) prefixo = 'file:';               /* //servidor/pasta */
      else if (/^[a-zA-Z]:(\/|$)/.test(c)) prefixo = 'file:///';  /* G:/pasta */
      else if (c.charAt(0) === '/') prefixo = 'file://';          /* /home/pasta */
      else return '';
      url = prefixo + c.split('/').map(function (seg) {
        return /^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg);
      }).join('/');
    }
    return /\.js$/i.test(url) ? url : url + '/' + ARQUIVO;
  }

  global.Publicacao = {
    ARQUIVO: ARQUIVO,
    GLOBAL: GLOBAL,
    FORMATO: FORMATO,
    /* republicação automática: no máximo uma a cada dois minutos */
    INTERVALO_MS: 120000,
    publicaveis: publicaveis,
    limpar: limpar,
    conteudo: conteudo,
    montar: montar,
    imagensSemConteudo: imagensSemConteudo,
    texto: texto,
    interpretar: interpretar,
    cabecalho: cabecalho,
    carregarDe: carregarDe,
    carregarAoLado: carregarAoLado,
    caminhoParaUrl: caminhoParaUrl
  };
})(window);
