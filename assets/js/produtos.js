/* ==========================================================================
   produtos.js — o banco de produtos: marcas, marcos de segurança, funções vitais
   --------------------------------------------------------------------------
   Uma planilha (VF_product_list) diz, para cada produto, qual é a marca
   funcional dele ("Industrial Mark" / "Functional Mark"), quais marcos de
   segurança o alcançam e quais funções vitais dependem dele:

       Product Mark | Functional Mark | Designation | Safety Milestones | Vital Functions #
       P0104501     | BC22714F        | BATTERY …   | J05;J07           | 20

   Vários valores na mesma célula vêm separados por ";". Produto sem marco e
   sem função vital é produto igual aos outros: entra no banco e aparece como
   N/A (não se aplica) — ele existe, só não está atrelado a nenhum.

   O que este módulo faz, e por quê:

   - **Banco por importação.** A planilha é grande e quase não muda, então o
     banco nasce de um botão de importar (na aba Produtos), uma vez — e de
     novo, se um dia ela for atualizada. A importação ACRESCENTA e ATUALIZA
     (pela marca do produto); nunca apaga. O que está no banco e não está na
     planilha fica como está.
   - **Casamento com a NCR, com tolerância.** A NCR escreve a marca de um jeito
     e o banco de outro: BH00004M5 na NCR, BH00004M no banco. Por isso o
     casamento tem três níveis, e a tela diz qual foi:
         exato      a mesma marca (ou o mesmo Product Mark);
         variação   a NCR escreveu a marca do banco e mais 1 ou 2 caracteres
                    no fim (BH00004M5 → BH00004M);
         parecido   mesma base (2 letras + 5 dígitos), sufixo diferente — é
                    "conferir", nunca "é esse".
     E procura pelas duas portas: o Product Mark e a Functional Mark.
   - **A marca é procurada em todo o texto da NCR** (colunas, título,
     descrição e as tabelas de produtos e deliberações), porque não se sabe em
     que coluna cada export a põe. Só aparece o que o banco de produtos conhece:
     "BH00004" solto num texto que o banco não tem não vira resultado.

   Persistência, como o resto do banco NCR (§4 do CLAUDE.md): no IndexedDB, na
   prateleira `snapshots` (`ncrmeta:produtos`) — nenhuma versão nova do banco —;
   na pasta da rede, num arquivo próprio (`derrogacao-produtos.json`); dentro
   do backup de tudo e da publicação para o visualizador, em
   `ncrBase.produtos` (versões anteriores ignoram a chave).

   Não usa ninguém ao carregar: `Store`, `Ncrs`, `Correcoes` e `Fluxo` só são
   chamados na hora da chamada.
   ========================================================================== */
(function (global) {
  'use strict';

  var ARQUIVO = 'derrogacao-produtos.json';
  var FORMATO = 'derrogacao-produtos';
  var META_ID = 'produtos';
  var MAX_IMPORTACOES = 30;
  var NA = 'N/A';
  /* quantos caracteres a mais a NCR pode ter no fim da marca e ainda contar
     como "variação" (BH00004M5 tem 1 a mais que BH00004M) */
  var DIF_MAX = 2;
  var RANK = { exato: 3, variacao: 2, parecido: 1 };

  /* --- utilidades --------------------------------------------------------- */

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function limpo(v) { return str(v).replace(/\s+/g, ' ').trim(); }
  function nowIso() { return new Date().toISOString(); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function semAcento(s) {
    var t = str(s);
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t;
  }
  function maiusc(s) { return semAcento(s).toUpperCase(); }
  /** Só letras e números, em maiúsculas: "BH-00004 M5" e "bh00004m5" são a mesma marca. */
  function nrm(s) { return maiusc(s).replace(/[^A-Z0-9]+/g, ''); }

  /** O Product Mark sem os zeros à esquerda do número: P0104501 e P104501 são o mesmo produto. */
  function canonProduto(s) {
    var n = nrm(s);
    var m = /^P0*(\d+)$/.exec(n);
    return m ? 'P' + m[1] : n;
  }

  /** As duas letras e os cinco dígitos do começo da marca ("BH00004") — a "família". */
  function base7(k) {
    var m = /^[A-Z]{2}\d{5}/.exec(k);
    return m ? m[0] : '';
  }

  /** O que a planilha traz numa célula, como texto (20 vira "20", não "20.0"). */
  function celula(v) {
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    return limpo(v);
  }

  /** "J05;J07" → ["J05", "J07"]. Separa por ;  ,  | e quebra de linha. */
  function partir(v) {
    if (Array.isArray(v)) return v.map(limpo).filter(Boolean);
    return celula(v).split(/[;,|\n]+/).map(limpo).filter(Boolean);
  }

  function cmpMarco(a, b) {
    if (global.Fluxo && Fluxo.cmpMarco) return Fluxo.cmpMarco(a, b);
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function unicos(lista) {
    var vistos = {};
    return lista.filter(function (v) {
      if (vistos[v]) return false;
      vistos[v] = 1;
      return true;
    });
  }

  function normMarcos(lista) {
    return unicos(lista.map(function (m) { return limpo(m).toUpperCase(); }).filter(Boolean)).sort(cmpMarco);
  }

  /** A função vital como número ("FV 01", "01", 1 e "1 - Sea water" são o 1); o que não é número fica como texto. */
  function funcaoNum(t) {
    var s = limpo(t).toUpperCase();
    var m = /^[^\d]{0,4}(\d+)(?:\.0+)?(?:\s*[-–—].*)?$/.exec(s);
    return m ? String(parseInt(m[1], 10)) : s;
  }

  function cmpFuncao(a, b) {
    var x = parseInt(a, 10), y = parseInt(b, 10);
    if (!isNaN(x) && !isNaN(y)) return x - y;
    if (!isNaN(x)) return -1;
    if (!isNaN(y)) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  function normFuncoes(lista) {
    return unicos(lista.map(funcaoNum).filter(Boolean)).sort(cmpFuncao);
  }

  /* --- o item ------------------------------------------------------------- */

  /** A identidade do produto: o Product Mark; sem ele, a marca funcional. */
  function chaveDe(produto, marca) {
    var p = canonProduto(produto);
    if (p) return p;
    var m = nrm(marca);
    return m ? 'FM:' + m : '';
  }

  function normalizar(o) {
    if (!o || typeof o !== 'object') return null;
    var produto = limpo(o.produto).toUpperCase();
    var marca = limpo(o.marca).toUpperCase();
    var id = chaveDe(produto, marca);
    if (!id) return null;
    return {
      id: id, produto: produto, marca: marca, descricao: limpo(o.descricao),
      marcos: normMarcos(partir(o.marcos)),
      funcoes: normFuncoes(partir(o.funcoes)),
      em: str(o.em)
    };
  }

  function assinatura(it) {
    return [it.marca, it.descricao, it.marcos.join(';'), it.funcoes.join(';')].join('|');
  }

  /* --- estado ------------------------------------------------------------- */

  var itens = [];
  var porId = {};
  var meta = metaVazia();
  var versao = 0;           // sobe a cada mudança; a tela usa para saber se redesenha
  var ix = null;            // índices de procura, refeitos sob demanda
  var cacheNcrs = null;

  function metaVazia() {
    return { importadoEm: '', importadoPor: '', arquivo: '', importacoes: [] };
  }

  function normalizarMeta(m) {
    var b = metaVazia();
    if (!m || typeof m !== 'object') return b;
    b.importadoEm = str(m.importadoEm);
    b.importadoPor = str(m.importadoPor);
    b.arquivo = str(m.arquivo);
    b.importacoes = Array.isArray(m.importacoes) ? m.importacoes.filter(function (i) { return i && i.id; }) : [];
    return b;
  }

  function mudou() { versao++; ix = null; cacheNcrs = null; }

  function reconstruir(lista) {
    itens = [];
    porId = {};
    (lista || []).forEach(function (x) {
      var it = normalizar(x);
      if (it && !porId[it.id]) { itens.push(it); porId[it.id] = it; }
    });
    mudou();
  }

  function trocarItem(antigo, novo) {
    var i = itens.indexOf(antigo);
    if (i >= 0) itens[i] = novo; else itens.push(novo);
    delete porId[antigo.id];
    porId[novo.id] = novo;
  }

  function incluirItem(it) {
    itens.push(it);
    porId[it.id] = it;
  }

  /* --- persistência local ------------------------------------------------- */

  function carregar() {
    return Store.ncrMetaGet(META_ID).then(function (r) {
      reconstruir(r && r.itens);
      meta = normalizarMeta(r && r.meta);
      return itens.length;
    });
  }

  function salvar() {
    mudou();
    return Store.ncrMetaPut({ id: META_ID, schema: 1, itens: itens, meta: meta });
  }

  /* --- ler a planilha ----------------------------------------------------- */

  /* os nomes que o cabeçalho pode ter, sem acento nem pontuação */
  var ALIAS = {
    produto: ['product mark', 'produto', 'product', 'marca do produto', 'marca produto', 'product marker',
              'product number', 'product no', 'codigo do produto', 'cod produto', 'pm'],
    marca: ['functional mark', 'functional marker', 'industrial mark', 'industrial marker', 'marca funcional',
            'marca industrial', 'functional', 'industrial', 'fm'],
    descricao: ['designation', 'designacao', 'descricao', 'description', 'descritivo', 'denominacao', 'nome'],
    marcos: ['safety milestones', 'safety milestone', 'milestones', 'milestone', 'marcos de seguranca',
             'marco de seguranca', 'marcos', 'marco'],
    funcoes: ['vital functions', 'vital function', 'funcoes vitais', 'funcao vital', 'vital', 'fv']
  };
  var PAPEIS = ['produto', 'marca', 'descricao', 'marcos', 'funcoes'];
  var PADRAO_MARCA = /^[A-Z]{2}\d{5}[A-Z]?\d{0,2}$/;
  var PADRAO_PRODUTO = /^P\d{5,8}$/;

  function normCab(s) { return maiusc(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function acharColuna(cols, aliases, usados) {
    var n = cols.map(normCab);
    var i, k;
    for (k = 0; k < aliases.length; k++) {
      i = n.indexOf(aliases[k]);
      if (i >= 0 && !usados[i]) return i;
    }
    for (k = 0; k < aliases.length; k++) {
      for (i = 0; i < n.length; i++) {
        if (n[i] && !usados[i] && n[i].indexOf(aliases[k] + ' ') === 0) return i;
      }
    }
    return -1;
  }

  /** papel -> índice da coluna, só dos que o cabeçalho tem. */
  function mapear(cols) {
    var usados = {}, m = {};
    PAPEIS.forEach(function (p) {
      var i = acharColuna(cols, ALIAS[p], usados);
      if (i >= 0) { m[p] = i; usados[i] = 1; }
    });
    return m;
  }

  function temPapel(m, p) { return typeof m[p] === 'number'; }

  /** Cabeçalho sem nome conhecido: lê as colunas A–E, na ordem em que a planilha foi descrita. */
  function porPosicao(wb) {
    var melhor = null;
    (wb.sheets || []).forEach(function (s) {
      var rows = s.rows || [];
      var n = 0;
      for (var i = 0; i < Math.min(rows.length, 80); i++) {
        var r = rows[i] || [];
        if (PADRAO_PRODUTO.test(nrm(celula(r[0]))) && PADRAO_MARCA.test(nrm(celula(r[1])))) n++;
      }
      if (n >= 3 && (!melhor || n > melhor.n)) melhor = { sheet: s, n: n };
    });
    if (!melhor) return null;
    return { sheet: melhor.sheet, hi: -1, posicional: true,
      mapa: { produto: 0, marca: 1, descricao: 2, marcos: 3, funcoes: 4 } };
  }

  function acharPlanilha(wb) {
    var melhor = null;
    (wb.sheets || []).forEach(function (s) {
      var rows = s.rows || [];
      for (var i = 0; i < Math.min(rows.length, 15); i++) {
        var cols = (rows[i] || []).map(function (v) { return celula(v); });
        var m = mapear(cols);
        var n = Object.keys(m).length;
        if (n < 2 || !(temPapel(m, 'produto') || temPapel(m, 'marca'))) continue;
        var score = n * 10 + (rows.length > 50 ? 1 : 0);
        if (!melhor || score > melhor.score) melhor = { sheet: s, hi: i, mapa: m, score: score, posicional: false };
      }
    });
    return melhor || porPosicao(wb);
  }

  function colunasEncontradas(wb) {
    var out = [];
    (wb.sheets || []).forEach(function (s) {
      var linha = (s.rows && s.rows[0] || []).map(celula).filter(Boolean);
      out.push('aba "' + s.name + '": ' + (linha.join(', ') || '(sem cabeçalho)'));
    });
    return out.join(' · ');
  }

  /* --- importar ------------------------------------------------------------ */

  function resumoDoItem(it) {
    return [it.produto || '—', it.marca || '—'].join(' · ') + (it.descricao ? ' — ' + it.descricao : '');
  }

  function textoLista(l) { return l.length ? l.join(';') : NA; }

  function diferencas(antigo, novo) {
    var d = [];
    if (antigo.marca !== novo.marca) d.push('Functional Mark: ' + (antigo.marca || '—') + ' → ' + (novo.marca || '—'));
    if (antigo.descricao !== novo.descricao) d.push('Designation');
    if (antigo.marcos.join(';') !== novo.marcos.join(';')) d.push('marcos: ' + textoLista(antigo.marcos) + ' → ' + textoLista(novo.marcos));
    if (antigo.funcoes.join(';') !== novo.funcoes.join(';')) d.push('funções vitais: ' + textoLista(antigo.funcoes) + ' → ' + textoLista(novo.funcoes));
    return d;
  }

  /**
   * Lê a planilha e junta ao banco: o que não existe entra, o que existe e
   * mudou é atualizado pela planilha, o resto fica. Nada é apagado — produto
   * que sumiu da planilha continua aqui. Devolve { resumo, mudou }; quem
   * chama grava (`salvar`).
   */
  function importar(entrada, arquivo, quem) {
    if (!entrada || !entrada.sheets) {
      throw new Error('o banco de produtos é importado de uma planilha .xlsx com as colunas Product Mark, ' +
        'Functional Mark, Designation, Safety Milestones e Vital Functions #.');
    }
    var achado = acharPlanilha(entrada);
    if (!achado) {
      throw new Error('não encontrei as colunas Product Mark e Functional Mark nesta planilha. ' +
        'Colunas lidas — ' + colunasEncontradas(entrada) + '.');
    }
    var m = achado.mapa;
    var rows = achado.sheet.rows || [];
    var agora = nowIso();
    var res = { titulo: 'Banco de produtos importado', arquivo: str(arquivo), numeros: [], grupos: [],
      erros: [], avisos: [], semDesfazer: true };

    var col = function (row, papel) { return temPapel(m, papel) ? row[m[papel]] : undefined; };
    var doArquivo = {}, ordem = [], lidas = 0, ignoradas = [], repetidos = [];

    for (var r = achado.hi + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var produto = limpo(celula(col(row, 'produto'))).toUpperCase();
      var marca = limpo(celula(col(row, 'marca'))).toUpperCase();
      if (!produto && !marca) {
        if (row.some(function (v) { return celula(v) !== ''; })) ignoradas.push('Linha ' + (r + 1) + ': sem Product Mark nem Functional Mark.');
        continue;
      }
      /* a primeira linha de uma planilha lida por posição é o cabeçalho */
      if (achado.posicional && r === 0 && !PADRAO_PRODUTO.test(nrm(produto)) && !PADRAO_MARCA.test(nrm(marca))) continue;
      lidas++;
      var it = normalizar({
        produto: produto, marca: marca, descricao: celula(col(row, 'descricao')),
        marcos: partir(col(row, 'marcos')), funcoes: partir(col(row, 'funcoes'))
      });
      var jaLa = doArquivo[it.id];
      if (jaLa) {
        /* o mesmo produto em duas linhas: valem os dois conjuntos de marcos e funções */
        var antes = assinatura(jaLa);
        jaLa.marcos = normMarcos(jaLa.marcos.concat(it.marcos));
        jaLa.funcoes = normFuncoes(jaLa.funcoes.concat(it.funcoes));
        if (!jaLa.descricao) jaLa.descricao = it.descricao;
        if (!jaLa.marca) jaLa.marca = it.marca;
        repetidos.push((it.produto || it.marca) + ' — linha ' + (r + 1) + (antes === assinatura(jaLa) ? ' (igual à anterior)' : ' (marcos e funções somados)'));
        continue;
      }
      doArquivo[it.id] = it;
      ordem.push(it.id);
    }
    if (!ordem.length) {
      throw new Error('a planilha não tem nenhuma linha com Product Mark ou Functional Mark.');
    }

    var novos = [], atualizados = [], iguais = 0;
    ordem.forEach(function (id) {
      var novo = doArquivo[id];
      var antigo = porId[id];
      /* o produto antes só era conhecido pela marca funcional: agora tem o Product Mark */
      if (!antigo && novo.produto && novo.marca && porId['FM:' + nrm(novo.marca)] && !porId['FM:' + nrm(novo.marca)].produto) {
        antigo = porId['FM:' + nrm(novo.marca)];
      }
      if (!antigo) {
        novo.em = agora;
        incluirItem(novo);
        novos.push(resumoDoItem(novo));
        return;
      }
      /* coluna que a planilha não tem não apaga o que já se sabe */
      if (!temPapel(m, 'marca')) novo.marca = antigo.marca;
      if (!temPapel(m, 'descricao')) novo.descricao = antigo.descricao;
      if (!temPapel(m, 'marcos')) novo.marcos = antigo.marcos;
      if (!temPapel(m, 'funcoes')) novo.funcoes = antigo.funcoes;
      var d = diferencas(antigo, novo);
      if (!d.length && antigo.id === novo.id) { iguais++; return; }
      novo.em = agora;
      trocarItem(antigo, novo);
      atualizados.push(resumoDoItem(novo) + (d.length ? ' — ' + d.join('; ') : ''));
    });

    var naPlanilha = {};
    ordem.forEach(function (id) { naPlanilha[id] = 1; });
    var mantidos = itens.filter(function (i) { return !naPlanilha[i.id] && !doArquivo[i.id]; }).length;
    if (novos.length || atualizados.length) mudou();

    meta.importadoEm = agora;
    meta.importadoPor = str(quem);
    meta.arquivo = str(arquivo);
    meta.importacoes.push({ id: Store.uid(), em: agora, por: str(quem), arquivo: str(arquivo),
      novos: novos.length, atualizados: atualizados.length, iguais: iguais, total: itens.length });
    if (meta.importacoes.length > MAX_IMPORTACOES) meta.importacoes = meta.importacoes.slice(-MAX_IMPORTACOES);

    var c = contagens();
    res.numeros = [
      ['Linhas lidas', lidas],
      ['Produtos na planilha', ordem.length],
      ['Novos no banco', novos.length, true],
      ['Atualizados', atualizados.length, true],
      ['Sem alteração', iguais],
      ['No banco, fora da planilha (mantidos)', mantidos],
      ['Produtos no banco agora', c.total, true],
      ['Com marco de segurança', c.comMarco],
      ['Com função vital', c.comFuncao],
      [NA + ' — sem marco e sem função vital', c.semNada],
      ['Erros', res.erros.length]
    ];
    var g = function (titulo, lista, explica) {
      if (lista.length) res.grupos.push({ titulo: titulo, explica: explica || '', itens: lista });
    };
    g('Produtos novos', novos);
    g('Produtos atualizados (o que mudou)', atualizados);
    g('Repetidos na planilha', repetidos, 'o mesmo Product Mark em mais de uma linha: os marcos e as funções vitais foram somados');
    g('Linhas ignoradas', ignoradas);
    res.avisos.push('Lido da aba "' + achado.sheet.name + '"' + (achado.posicional
      ? ', pelas colunas A a E (o cabeçalho não foi reconhecido).'
      : ', cabeçalho na linha ' + (achado.hi + 1) + '.'));
    if (achado.posicional) {
      /* sem cabeçalho conhecido, a ordem das colunas é a descrita pelo Bruno */
    } else {
      var faltam = PAPEIS.filter(function (p) { return !temPapel(m, p); });
      if (faltam.length) {
        res.avisos.push('Colunas que a planilha não tem (o que já está no banco foi mantido): ' + faltam.map(function (p) {
          return { produto: 'Product Mark', marca: 'Functional Mark', descricao: 'Designation',
            marcos: 'Safety Milestones', funcoes: 'Vital Functions #' }[p];
        }).join(', ') + '.');
      }
    }
    return { resumo: res, mudou: novos.length + atualizados.length > 0 };
  }

  /* --- pasta, backup e publicação ----------------------------------------- */

  function arquivo(quem) {
    return {
      format: FORMATO, schema: 1, updatedAt: nowIso(), updatedBy: str(quem),
      importadoEm: meta.importadoEm, importadoPor: meta.importadoPor, arquivo: meta.arquivo,
      importacoes: meta.importacoes, itens: itens
    };
  }

  /** O banco inteiro, para ir dentro do backup e da publicação (dentro de `ncrBase`). */
  function paraBackup() {
    if (!itens.length) return null;
    var a = arquivo('');
    delete a.updatedAt;
    delete a.updatedBy;
    return copia(a);
  }

  /**
   * Troca o banco inteiro, em memória, pelo que veio de uma publicação. Só o
   * visualizador usa: ali o banco de produtos é o retrato publicado.
   */
  function adotar(d) {
    reconstruir(d && d.itens);
    meta = normalizarMeta(d);
    return itens.length;
  }

  /**
   * Junta o que veio da pasta (ou de um backup): produto a produto, vale o
   * carimbo da importação que o escreveu por último; nada é apagado. Devolve
   * o que mudou aqui e se este lado tem algo que a pasta ainda não tem.
   */
  function juntar(d) {
    var res = { entraram: 0, atualizados: 0, localMaisNovo: false, mudou: false };
    if (!d || !Array.isArray(d.itens)) return res;
    var la = {};
    d.itens.forEach(function (x) {
      var it = normalizar(x);
      if (!it) return;
      la[it.id] = 1;
      var meu = porId[it.id];
      if (!meu) { incluirItem(it); res.entraram++; return; }
      if (it.em > meu.em) { trocarItem(meu, it); res.atualizados++; }
      else if (it.em < meu.em) res.localMaisNovo = true;
    });
    itens.forEach(function (i) { if (!la[i.id]) res.localMaisNovo = true; });
    var ids = {};
    meta.importacoes.forEach(function (i) { ids[i.id] = 1; });
    var laIds = {};
    var chegou = normalizarMeta(d);
    chegou.importacoes.forEach(function (i) {
      laIds[i.id] = 1;
      if (!ids[i.id]) { meta.importacoes.push(i); ids[i.id] = 1; res.mudou = true; }
    });
    if (meta.importacoes.some(function (i) { return !laIds[i.id]; })) res.localMaisNovo = true;
    meta.importacoes.sort(function (a, b) { return str(a.em).localeCompare(str(b.em)); });
    if (meta.importacoes.length > MAX_IMPORTACOES) meta.importacoes = meta.importacoes.slice(-MAX_IMPORTACOES);
    if (chegou.importadoEm > meta.importadoEm) {
      meta.importadoEm = chegou.importadoEm;
      meta.importadoPor = chegou.importadoPor;
      meta.arquivo = chegou.arquivo;
      res.mudou = true;
    } else if (chegou.importadoEm < meta.importadoEm) res.localMaisNovo = true;
    if (res.entraram || res.atualizados) { res.mudou = true; mudou(); }
    return res;
  }

  /* --- consultas ----------------------------------------------------------- */

  /** As duas primeiras letras da marca funcional — o bigrama do sistema (BH, DA, BC…). */
  function sistemaDe(it) {
    var m = /^([A-Z]{2})\d/.exec(nrm(it.marca));
    return m ? m[1] : '';
  }

  function contagens() {
    var c = { total: itens.length, comMarco: 0, comFuncao: 0, semNada: 0, comAmbos: 0 };
    itens.forEach(function (i) {
      var m = i.marcos.length > 0, f = i.funcoes.length > 0;
      if (m) c.comMarco++;
      if (f) c.comFuncao++;
      if (m && f) c.comAmbos++;
      if (!m && !f) c.semNada++;
    });
    return c;
  }

  /** [{valor, n}] dos marcos que aparecem no banco, na ordem da fila. */
  function marcosUsados() {
    var cont = {};
    itens.forEach(function (i) { i.marcos.forEach(function (m) { cont[m] = (cont[m] || 0) + 1; }); });
    return Object.keys(cont).sort(cmpMarco).map(function (v) { return { valor: v, n: cont[v] }; });
  }

  function funcoesUsadas() {
    var cont = {};
    itens.forEach(function (i) { i.funcoes.forEach(function (f) { cont[f] = (cont[f] || 0) + 1; }); });
    return Object.keys(cont).sort(cmpFuncao).map(function (v) { return { valor: v, n: cont[v] }; });
  }

  /** Os nomes das funções vitais com este número, vindos da lista do banco NCR ("01 - Sea water circuit integrity"). */
  var nomesPorFuncao = null, nomesDaLista = null;
  function nomesDaFuncao(num) {
    var lista = (global.Ncrs && Ncrs.listas && Ncrs.listas().funcoes) || [];
    /* a tabela pergunta por cada chip de cada linha: o mapa número → nomes é
       refeito só quando a lista de funções (a das Listas do banco NCR) muda */
    if (nomesDaLista !== lista || !nomesPorFuncao) {
      nomesPorFuncao = {};
      nomesDaLista = lista;
      lista.forEach(function (f) {
        var m = /^[^\d]{0,4}(\d+)\s*[-–—]\s*(.+)$/.exec(limpo(f));
        if (!m) return;
        var n = String(parseInt(m[1], 10));
        var l = nomesPorFuncao[n] = nomesPorFuncao[n] || [];
        if (l.indexOf(m[2]) < 0) l.push(m[2]);
      });
    }
    return (nomesPorFuncao[String(num)] || []).slice();
  }

  /** "FV 01 – Sea water circuit integrity"; com mais de um nome para o número (o 20), só "FV 20". */
  function rotuloFuncao(num) {
    var nomes = nomesDaFuncao(num);
    return 'FV ' + num + (nomes.length === 1 ? ' – ' + nomes[0] : '');
  }

  function get(id) { return porId[id] || null; }

  /** Os outros produtos da mesma "família" (mesmas duas letras e cinco dígitos da marca). */
  function familiaDe(it) {
    var b = base7(nrm(it.marca));
    if (!b) return [];
    return itens.filter(function (o) { return o !== it && base7(nrm(o.marca)) === b; });
  }

  /* --- casar com a NCR ------------------------------------------------------ */

  function indices() {
    if (ix) return ix;
    var porProduto = {}, porMarca = {}, familias = {};
    itens.forEach(function (it) {
      if (it.produto) porProduto[canonProduto(it.produto)] = it;
      if (it.marca) {
        var k = nrm(it.marca);
        (porMarca[k] = porMarca[k] || []).push(it);
        var b = base7(k);
        if (b) (familias[b] = familias[b] || []).push(it);
      }
    });
    ix = { porProduto: porProduto, porMarca: porMarca, familias: familias };
    return ix;
  }

  /**
   * Uma marca funcional escrita no texto contra as do banco. Exata, ou a do
   * banco com 1–2 caracteres a mais no fim (a variação: BH00004M5 → BH00004M,
   * a marca mais longa que couber), ou — só como "parecido", para conferir —
   * a mesma base com outro sufixo, ou uma marca do banco mais específica do
   * que a escrita.
   */
  function casarMarca(tok) {
    var i = indices();
    var exatos = i.porMarca[tok];
    if (exatos) return exatos.map(function (it) { return { item: it, nivel: 'exato' }; });
    var b = base7(tok);
    if (!b) return [];
    var fam = i.familias[b] || [];
    var melhorDif = 99, variantes = [], parecidos = [];
    fam.forEach(function (it) {
      var k = nrm(it.marca);
      var dif = tok.length - k.length;
      if (dif > 0 && dif <= DIF_MAX && tok.indexOf(k) === 0) {
        if (dif < melhorDif) { melhorDif = dif; variantes = [it]; }
        else if (dif === melhorDif) variantes.push(it);
      } else parecidos.push(it);
    });
    var out = variantes.map(function (it) { return { item: it, nivel: 'variacao' }; });
    if (out.length) return out;
    return parecidos.slice(0, 8).map(function (it) { return { item: it, nivel: 'parecido' }; });
  }

  function registrar(achados, item, nivel, via, token, onde) {
    var a = achados[item.id];
    if (!a) {
      achados[item.id] = { item: item, nivel: nivel, vias: [via], tokens: [token], onde: onde };
      return;
    }
    if (RANK[nivel] > RANK[a.nivel]) { a.nivel = nivel; a.tokens = [token]; a.onde = onde; }
    else if (RANK[nivel] === RANK[a.nivel] && a.tokens.indexOf(token) < 0) a.tokens.push(token);
    if (nivel !== 'parecido' && a.vias.indexOf(via) < 0) a.vias.push(via);
  }

  /* BH00004M5, BH-00004-M5, BH 00004M, bh00004m5 — duas letras, cinco dígitos, uma letra e até dois dígitos.
     Antes das duas letras tem de haver um limite (senão "NCR 12345" daria "CR12345"), e depois do fim
     também (senão uma palavra comprida seria cortada no meio). */
  var RE_MARCA = /(^|[^A-Z0-9])([A-Z]{2})[ \-_.]?(\d{5})(?:[\-_.]?([A-Z]))?(\d{0,2})(?![A-Z0-9])/g;
  var RE_PRODUTO = /(^|[^A-Z0-9])P[ \-_.]?(\d{5,8})(?![A-Z0-9])/g;

  function procurar(texto, onde, achados) {
    var T = maiusc(texto);
    if (T.length < 6) return;
    var i = indices();
    var m, tok;
    RE_MARCA.lastIndex = 0;
    while ((m = RE_MARCA.exec(T))) {
      tok = m[2] + m[3] + (m[4] || '') + (m[5] || '');
      casarMarca(tok).forEach(function (c) { registrar(achados, c.item, c.nivel, 'marca', tok, onde); });
    }
    RE_PRODUTO.lastIndex = 0;
    while ((m = RE_PRODUTO.exec(T))) {
      tok = 'P' + m[2];
      var p = i.porProduto[canonProduto(tok)];
      if (p) registrar(achados, p, nrm(p.produto) === tok ? 'exato' : 'variacao', 'produto', tok, onde);
    }
    /* marcas do banco que não seguem o desenho acima, mas aparecem como palavra inteira */
    T.split(/[^A-Z0-9]+/).forEach(function (w) {
      if (w.length < 6 || w.length > 16) return;
      if (i.porMarca[w]) i.porMarca[w].forEach(function (it) { registrar(achados, it, 'exato', 'marca', w, onde); });
      var pw = i.porProduto[canonProduto(w)];
      if (pw) registrar(achados, pw, nrm(pw.produto) === w ? 'exato' : 'variacao', 'produto', w, onde);
    });
  }

  /** Os textos da NCR onde a marca pode estar, com o nome de onde cada um veio. */
  function segmentos(rec) {
    var f = Ncrs.fonte(rec), out = [];
    var add = function (t, onde) { t = str(t); if (t) out.push([t, onde]); };
    Object.keys(f.campos || {}).forEach(function (k) { add(f.campos[k], k); });
    (f.detalhes || []).forEach(function (g) {
      g.linhas.forEach(function (l) {
        l.forEach(function (v, j) { add(v, g.titulo + (g.colunas[j] ? ' › ' + g.colunas[j] : '')); });
      });
    });
    add(f.titulo, 'Título');
    add(f.descricao, 'Descrição');
    return out;
  }

  /**
   * Os produtos do banco que a NCR cita, do mais certo ao menos certo.
   * [{ item, nivel: 'exato'|'variacao'|'parecido', vias: ['produto','marca'], tokens: [o que a NCR escreveu], onde }]
   */
  function deNcr(rec) {
    if (!itens.length || !rec) return [];
    var achados = {};
    segmentos(rec).forEach(function (s) { procurar(s[0], s[1], achados); });
    return Object.keys(achados).map(function (k) {
      var a = achados[k];
      /* sempre na mesma ordem: o Product Mark primeiro */
      a.vias = ['produto', 'marca'].filter(function (v) { return a.vias.indexOf(v) >= 0; });
      return a;
    }).sort(function (a, b) {
      return (RANK[b.nivel] - RANK[a.nivel]) || (a.item.marca < b.item.marca ? -1 : (a.item.marca > b.item.marca ? 1 : 0)) ||
        (a.item.produto < b.item.produto ? -1 : (a.item.produto > b.item.produto ? 1 : 0));
    });
  }

  /** Marcos e funções vitais do conjunto de produtos (só os casamentos que não são "parecido"). */
  function resumoDe(achados) {
    var marcos = [], funcoes = [];
    achados.forEach(function (a) {
      if (a.nivel === 'parecido') return;
      marcos = marcos.concat(a.item.marcos);
      funcoes = funcoes.concat(a.item.funcoes);
    });
    return { marcos: normMarcos(marcos), funcoes: normFuncoes(funcoes) };
  }

  /**
   * produto → NCRs que o citam, para a aba Produtos. Refeito só quando o
   * banco de produtos, as correções ou a fonte de alguma NCR mudou (uma
   * edição de campo do Waiver não conta: ela não mexe no que a NCR cita).
   */
  function mapaNcrs() {
    var recs = Ncrs.lista();
    /* a fonte de uma NCR só muda por uma importação (o carimbo dela muda) ou por
       uma correção do administrador (a versão das correções muda) */
    var sig = recs.length + '|' + versao + '|' + (global.Correcoes && Correcoes.versao ? Correcoes.versao() : 0) + '|' +
      recs.map(function (r) { return r.fonte.importadoEm; }).join(',');
    if (cacheNcrs && cacheNcrs.sig === sig) return cacheNcrs.mapa;
    var mapa = {};
    if (itens.length) {
      recs.forEach(function (rec) {
        deNcr(rec).forEach(function (a) {
          (mapa[a.item.id] = mapa[a.item.id] || []).push({ rec: rec, nivel: a.nivel, vias: a.vias, tokens: a.tokens, onde: a.onde });
        });
      });
    }
    cacheNcrs = { sig: sig, mapa: mapa };
    return mapa;
  }

  /** As NCRs de um produto; `soCertas` deixa de fora os "parecido". */
  function ncrsDoProduto(id, soCertas) {
    var l = mapaNcrs()[id] || [];
    return soCertas ? l.filter(function (x) { return x.nivel !== 'parecido'; }) : l;
  }

  global.Produtos = {
    ARQUIVO: ARQUIVO,
    FORMATO: FORMATO,
    NA: NA,
    carregar: carregar,
    salvar: salvar,
    importar: importar,
    lista: function () { return itens; },
    total: function () { return itens.length; },
    get: get,
    meta: function () { return meta; },
    versao: function () { return versao; },
    contagens: contagens,
    marcosUsados: marcosUsados,
    funcoesUsadas: funcoesUsadas,
    nomesDaFuncao: nomesDaFuncao,
    rotuloFuncao: rotuloFuncao,
    sistemaDe: sistemaDe,
    familiaDe: familiaDe,
    deNcr: deNcr,
    resumoDe: resumoDe,
    mapaNcrs: mapaNcrs,
    ncrsDoProduto: ncrsDoProduto,
    arquivo: arquivo,
    paraBackup: paraBackup,
    adotar: adotar,
    juntar: juntar,
    /* para os testes e para a tela: as peças do casamento */
    nrm: nrm,
    canonProduto: canonProduto,
    casarMarca: casarMarca,
    cmpFuncao: cmpFuncao
  };
})(window);
