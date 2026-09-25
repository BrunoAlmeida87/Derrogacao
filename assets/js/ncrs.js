/* ==========================================================================
   ncrs.js — o banco de NCRs dentro do Waiver Request
   --------------------------------------------------------------------------
   Cada NCR é um registro com três partes, guardadas separadas de propósito:

     fonte     o que vem do banco NCR (export do Excel ou ncr.json do NCR
               Control). É SUBSTITUÍDA a cada importação — é cópia de algo que
               mora fora daqui.
     waiver    o que só existe aqui: Marco Original, Marco Atual, Função
               Vital, Waiver Historic, Observação e o registro das vezes em que
               a NCR foi levada para um relatório. NENHUMA importação do banco
               NCR escreve nesta parte.
     historico eventos importados de um JSON gerado fora (NCR Control). Só se
               acrescenta; nunca se apaga.

   A chave é o número da NCR normalizado (NCR-ICN-ESC-14-0832-2025): é o que
   o banco NCR, a planilha de correlação e os relatórios de Waiver têm em
   comum. O mesmo critério do NCR Control (maiúsculas, sem espaços).

   Os relatórios de Waiver continuam no store "projects", intocados. O vínculo
   NCR ↔ relatório é lido dos próprios relatórios (o item com aquele número),
   e por isso nunca fica dessincronizado: excluir o item desfaz o vínculo.
   ========================================================================== */
(function (global) {
  'use strict';

  var SBR_ALVO = 'SBR4';     // por enquanto, só as NCRs do SBR4 entram
  var MAX_IMPORTACOES = 60;

  /* Possibilidades da máscara (aba "Possibilidades da Mascara"). Servem de
     ponto de partida: a importação da correlação pode acrescentar valores, e
     a tela "Listas" permite editar. */
  var LISTAS_PADRAO = {
    marcos: [
      'J01 & J03', 'J01 & J03 Ind', 'J02 & J04', 'J02 & J04 Ind',
      'J05', 'J05 (J06Cer)', 'J05 Ind', 'J06', 'J06 Ind', 'J06Cer',
      'J07', 'J07 Ind', 'J08', 'J08 Ind', 'J09', 'J09 Ind',
      'J10', 'J10 Ind', 'J11', 'J11 Ind', 'J12', 'J12 Ind', 'RANAE J06'
    ],
    funcoes: [
      '00 - Industrial',
      '01 - Sea water circuit integrity',
      '02 - Detect a flooding',
      '03 - Emergency shut-off sea water systems',
      '04 - Emergency ballast tank blowing',
      '05 - Propel the ship in emergency',
      '06 - Steer the ship in emergency mode',
      '07 - Lighten the submarine',
      '08 - HP air supply',
      '09 - Coordinate damage control',
      '10 - Control ship weight',
      '11 - Emergency lighting',
      '13 - Confine the hazardous areas',
      '14 - Fight the fire',
      '15 - Breathing air network',
      '16 - Detect an anomaly in atmosphere composition',
      '18 - Mooring and towing means',
      '19 - HP hydraulic supply – Alert network',
      '20 - 28V emergency network',
      '20 - Electric supply',
      '20 - Electric supply – 115V network',
      '20 - Electric supply – 360V network',
      '20 - Electric supply – Main battery',
      'n°21 - Snorting alert',
      'n°22 - Nil',
      '23 - Emergency stop of the DG system',
      '24 - Ventilate the ship',
      '25 - Detect hydrogen anomaly',
      '27 - Be detectable, ship on surface',
      '28 - Detect an obstacle, ship on-surface',
      '29 - Locate ship, ship on-surface',
      '31 - Have the steering parameters available',
      '32 - Communicate with outside',
      '33 - Be detectable, ship in diving conditions',
      '34 - Detect an obstacle, ship in diving conditions',
      '36 - Pressure hull integrity',
      '37 - Signal and locate the disabled submarine',
      '38 - Communicate with the rescue team',
      '39 - Ensure the crew survival',
      '40 - Escape the disabled submarine',
      '41 - Embark a weapon',
      '42 - Handle and store a weapon',
      '43 - Lauch a weapon',
      '44 - Pressure hull resistance',
      '99 - Several'
    ]
  };

  /* Campos internos do Waiver, na ordem em que aparecem na tela. */
  var CAMPOS_WAIVER = [
    { id: 'marcoOriginal',  nome: 'Marco Original' },
    { id: 'marcoAtual',     nome: 'Marco Atual' },
    { id: 'funcaoVital',    nome: 'Função Vital' },
    { id: 'waiverHistoric', nome: 'Waiver Historic' },
    { id: 'observacao',     nome: 'Observação' }
  ];

  /* --- utilidades --------------------------------------------------------- */

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function limpo(v) { return str(v).replace(/\r\n?/g, '\n').trim(); }
  function nowIso() { return new Date().toISOString(); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function uid() { return Store.uid(); }

  /** Texto sem acento, minúsculo, só letras e números — para casar cabeçalhos. */
  function norm(s) {
    var t = str(s);
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /** Chave da NCR: o mesmo critério do NCR Control, e "/" vale como "-". */
  function chave(s) {
    return str(s).toUpperCase().replace(/\s+/g, '').replace(/[·]/g, '').replace(/[\/_]/g, '-');
  }

  /** Marco para comparação: "RANAE  j06" e "ranae j06" são o mesmo marco. */
  function marcoChave(s) { return str(s).trim().toUpperCase().replace(/\s+/g, ' '); }

  function maior(a, b) { return str(a) >= str(b) ? str(a) : str(b); }

  /* --- reconhecimento de colunas (mesma lógica do NCR Control) -------------- */

  var ALIAS = {
    ncr: ['numero ncr', 'n ncr', 'no ncr', 'num ncr', 'numero da ncr', 'ncr', 'id ncr', 'ncr id',
          'numero', 'ncr number', 'number', 'identificador'],
    status: ['status', 'situacao', 'situacao atual', 'etapa atual', 'status atual', 'estado', 'fase',
             'current status', 'ncr status', 'status da ncr', 'state', 'current state', 'stage', 'current stage', 'phase'],
    titulo: ['titulo', 'title', 'titulo da ncr', 'assunto', 'subject', 'resumo', 'summary', 'objeto'],
    descricao: ['descricao', 'description', 'descricao da anomalia', 'descricao da nao conformidade', 'texto'],
    sistema: ['bigramas', 'bigrama', 'sistema', 'sistemas', 'system', 'systems'],
    sbr: ['sbr', 'sbr sby', 'casco', 'hull', 'embarcacao', 'navio', 'submarino'],
    criadoEm: ['data criacao', 'data de criacao', 'data da criacao', 'data abertura', 'data de abertura', 'criado em',
               'creation date', 'created date', 'created', 'date created', 'open date', 'opening date', 'data'],
    responsavel: ['responsavel', 'responsavel atual', 'owner', 'autor', 'author', 'criado por', 'emitente'],
    fechamento: ['cedoc closure data', 'data fechamento', 'data de fechamento', 'closure date', 'closing date',
                 'data encerramento', 'date closed']
  };

  /* colunas que denunciam a planilha de correlação, e não o banco NCR */
  var ALIAS_CORR = {
    numero: ['numero', 'ncr', 'numero ncr', 'n ncr', 'ncr number', 'number'],
    marcoOriginal: ['original jx', 'marco original', 'original'],
    marcoAtual: ['actual jx', 'marco atual', 'atual jx', 'actual', 'marco actual'],
    funcaoVital: ['funcao vital', 'vital function', 'fv', 'funcao'],
    waiverHistoric: ['waiver historic', 'historico waiver', 'historic', 'waiver historico'],
    observacao: ['observacao gto', 'observacao', 'observacoes', 'observation', 'obs']
  };

  function acharCabecalho(rows) {
    var best = -1, bestScore = 0;
    var lim = Math.min(rows.length, 12);
    for (var i = 0; i < lim; i++) {
      var r = rows[i] || [];
      var n = 0, txt = 0;
      for (var j = 0; j < r.length; j++) {
        var v = r[j];
        if (v === undefined || v === null || v === '') continue;
        n++;
        if (typeof v === 'string' && v.trim().length && v.trim().length < 90) txt++;
      }
      var score = txt * 2 + n;
      if (n >= 2 && score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function nomesColunas(row) {
    var out = [], usados = {};
    for (var j = 0; j < row.length; j++) {
      var v = row[j];
      var name = (v === undefined || v === null) ? '' : String(v).replace(/\s+/g, ' ').trim();
      if (!name) { out.push(null); continue; }
      if (usados[name]) { usados[name]++; name = name + ' (' + usados[name] + ')'; } else usados[name] = 1;
      out.push(name);
    }
    return out;
  }

  /** Índice da coluna: primeiro o nome exato, depois o que começa pelo alias. */
  function acharCol(cols, aliases) {
    var n = cols.map(function (c) { return c ? norm(c) : ''; });
    var i, k;
    for (k = 0; k < aliases.length; k++) {
      i = n.indexOf(norm(aliases[k]));
      if (i >= 0) return i;
    }
    for (k = 0; k < aliases.length; k++) {
      var a = norm(aliases[k]);
      for (i = 0; i < n.length; i++) if (n[i] && n[i].indexOf(a) === 0) return i;
    }
    return -1;
  }

  function valorCampo(v) {
    if (v === undefined || v === null) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    return limpo(v);
  }

  /* --- SBR ------------------------------------------------------------------ */

  /** "SBR 4", "sbr-04" e "4" caem no mesmo grupo (critério do NCR Control). */
  function grupoSbr(v) {
    var n = norm(v);
    if (!n) return '';
    if (/\b(all|todos|todas|geral|comum|common)\b/.test(n)) return 'SBRall';
    var m = /\bsbr\s*0*(\d{1,2})\b/.exec(n);
    if (!m) m = /^0*(\d{1,2})$/.exec(n);
    return m ? 'SBR' + (+m[1]) : '';
  }

  /** NCR-ICN-ESC-14-0832-2025: o "14" é o casco — SBR4. */
  function sbrPeloNumero(numero) {
    var m = /^NCR-[A-Z0-9]+-[A-Z0-9]+-1(\d)-\d+-\d{4}$/.exec(chave(numero));
    return m ? 'SBR' + m[1] : '';
  }

  /** A coluna SBR vale; se vier vazia (ou sem valor reconhecível), o número. */
  function sbrDe(valorColuna, numero) {
    var g = grupoSbr(valorColuna);
    if (g) return { sbr: g, por: 'coluna' };
    var n = sbrPeloNumero(numero);
    return n ? { sbr: n, por: 'numero' } : { sbr: '', por: '' };
  }

  /* --- estado ----------------------------------------------------------------- */

  var base = {};          // chave -> registro
  var meta = metaVazia();
  var versao = 0;         // sobe a cada mudança; a tela usa para saber se redesenha

  function metaVazia() {
    return {
      id: 'meta',
      listas: { marcos: LISTAS_PADRAO.marcos.slice(), funcoes: LISTAS_PADRAO.funcoes.slice(), editedAt: '', editedBy: '' },
      pendentes: {},       // correlações de NCRs que ainda não estão no banco
      importacoes: [],     // registro das importações feitas
      colunas: [],         // colunas do último banco importado, na ordem do arquivo
      papeis: {},          // papel -> nome da coluna (titulo: "Título", …)
      colunasEm: ''
    };
  }

  function fonteVazia() {
    return {
      campos: {}, titulo: '', descricao: '', status: '', sistema: '', sbr: '', sbrPor: '',
      criadoEm: '', responsavel: '', fechamento: '',
      arquivo: '', importadoEm: '', presente: false, alterados: []
    };
  }

  function waiverVazio() {
    return {
      marcoOriginal: '', marcoAtual: '', funcaoVital: '', waiverHistoric: '', observacao: '',
      editedBy: '', editedAt: '', adicoes: []
    };
  }

  function recVazio(key, numero) {
    return { key: key, numero: str(numero) || key, fonte: fonteVazia(), waiver: waiverVazio(), historico: [] };
  }

  function normalizarFonte(f) {
    var b = fonteVazia();
    if (!f || typeof f !== 'object') return b;
    Object.keys(b).forEach(function (k) {
      if (k === 'campos') b.campos = (f.campos && typeof f.campos === 'object') ? f.campos : {};
      else if (k === 'presente') b.presente = f.presente === true;
      else if (k === 'alterados') b.alterados = Array.isArray(f.alterados) ? f.alterados.map(str) : [];
      else b[k] = str(f[k]);
    });
    return b;
  }

  function normalizarAdicao(a) {
    return {
      projectId: str(a && a.projectId), marco: str(a && a.marco), itemId: str(a && a.itemId),
      em: str(a && a.em), por: str(a && a.por)
    };
  }

  function normalizarWaiver(w) {
    var b = waiverVazio();
    if (!w || typeof w !== 'object') return b;
    Object.keys(b).forEach(function (k) {
      if (k === 'adicoes') b.adicoes = Array.isArray(w.adicoes) ? w.adicoes.map(normalizarAdicao) : [];
      else b[k] = limpoOuStr(w[k], k);
    });
    return b;
  }
  /* datas e autoria sem trim; textos com a quebra de linha normalizada */
  function limpoOuStr(v, k) { return (k === 'editedAt' || k === 'editedBy') ? str(v) : limpo(v); }

  function normalizarEvento(e) {
    return {
      id: str(e && e.id) || uid(),
      data: str(e && (e.data || e.date || e.em || e.quando)),
      tipo: str(e && (e.tipo || e.type || e.evento || e.cls)),
      campo: str(e && (e.campo || e.field)),
      de: str(e && (e.de != null ? e.de : e.from)),
      para: str(e && (e.para != null ? e.para : e.to)),
      obs: str(e && (e.obs || e.observacao || e.comentario || e.comment)),
      responsavel: str(e && (e.responsavel || e.usuario || e.user || e.por)),
      arquivo: str(e && e.arquivo),
      /* a classificação do NCR Control (AVANCO, RETORNO…), quando vier: é o
         que colore as setas do desenho do fluxo na ficha */
      cls: str(e && e.cls),
      estimado: !!(e && e.estimado)
    };
  }

  function assinaturaEvento(e) {
    return [e.data, e.tipo, e.campo, e.de, e.para].join('|');
  }

  function normalizarRec(r) {
    var key = chave((r && r.key) || (r && r.numero));
    var rec = recVazio(key, r && r.numero);
    rec.fonte = normalizarFonte(r && r.fonte);
    rec.waiver = normalizarWaiver(r && r.waiver);
    rec.historico = Array.isArray(r && r.historico) ? r.historico.map(normalizarEvento) : [];
    return rec;
  }

  function normalizarMeta(m) {
    var b = metaVazia();
    if (!m || typeof m !== 'object') return b;
    if (m.listas && Array.isArray(m.listas.marcos) && Array.isArray(m.listas.funcoes)) {
      b.listas = {
        marcos: m.listas.marcos.map(str).filter(Boolean),
        funcoes: m.listas.funcoes.map(str).filter(Boolean),
        editedAt: str(m.listas.editedAt), editedBy: str(m.listas.editedBy)
      };
    }
    b.pendentes = (m.pendentes && typeof m.pendentes === 'object') ? m.pendentes : {};
    b.importacoes = Array.isArray(m.importacoes) ? m.importacoes : [];
    b.colunas = Array.isArray(m.colunas) ? m.colunas.map(str) : [];
    b.papeis = (m.papeis && typeof m.papeis === 'object') ? m.papeis : {};
    b.colunasEm = str(m.colunasEm);
    return b;
  }

  function mudou() { versao++; }

  /* --- persistência --------------------------------------------------------- */

  function carregar() {
    return Promise.all([Store.ncrAll(), Store.ncrMetaGet('meta')]).then(function (r) {
      base = {};
      (r[0] || []).forEach(function (x) {
        var rec = normalizarRec(x);
        if (rec.key) base[rec.key] = rec;
      });
      meta = normalizarMeta(r[1]);
      mudou();
      return lista().length;
    });
  }

  function salvar(recs) {
    mudou();
    return Store.ncrPutMany(recs || lista());
  }

  function salvarMeta() {
    mudou();
    return Store.ncrMetaPut(meta);
  }

  function lista() { return Object.keys(base).map(function (k) { return base[k]; }); }
  function get(key) { return base[chave(key)] || null; }

  /* --- listas dos dropdowns ------------------------------------------------- */

  function listas() { return meta.listas; }

  function setListas(marcos, funcoes, quem) {
    var limpa = function (l) {
      var vistos = {};
      return l.map(limpo).filter(function (v) {
        if (!v || vistos[v]) return false;
        vistos[v] = 1; return true;
      });
    };
    meta.listas = {
      marcos: limpa(marcos), funcoes: limpa(funcoes),
      editedAt: Store.depoisDe(meta.listas.editedAt), editedBy: str(quem)
    };
    return salvarMeta();
  }

  /** Acrescenta ao fim o que ainda não está na lista. Devolve quantos entraram. */
  function unirLista(destino, novos) {
    var tem = {}, n = 0;
    destino.forEach(function (v) { tem[v] = 1; });
    (novos || []).forEach(function (v) {
      v = limpo(v);
      if (v && !tem[v]) { destino.push(v); tem[v] = 1; n++; }
    });
    return n;
  }

  /* --- vínculo com os relatórios de Waiver ---------------------------------- */

  /** Itens de relatório que são esta NCR (pelo vínculo gravado ou pelo número). */
  function vinculos(rec, projects) {
    var out = [];
    (projects || []).forEach(function (p) {
      (p.ncrs || []).forEach(function (it) {
        if ((it.ncrKey && it.ncrKey === rec.key) || chave(it.ncrId) === rec.key) out.push({ project: p, item: it });
      });
    });
    return out;
  }

  /** Mapa chave -> vínculos, calculado uma vez para a tabela inteira. */
  function mapaVinculos(projects) {
    var mapa = {};
    (projects || []).forEach(function (p) {
      (p.ncrs || []).forEach(function (it) {
        var ks = {};
        if (it.ncrKey) ks[it.ncrKey] = 1;
        var k = chave(it.ncrId);
        if (k) ks[k] = 1;
        Object.keys(ks).forEach(function (kk) {
          (mapa[kk] = mapa[kk] || []).push({ project: p, item: it });
        });
      });
    });
    return mapa;
  }

  /** O relatório de Waiver cujo marco é igual ao informado (comparação exata). */
  function relatorioDoMarco(marco, projects) {
    var k = marcoChave(marco);
    if (!k) return null;
    return (projects || []).filter(function (p) { return marcoChave(p.marco) === k; })[0] || null;
  }

  /** "09 - Coordinate damage control" -> "FV09 - COORDINATE DAMAGE CONTROL", o padrão dos relatórios. */
  function funcaoParaWaiver(fv) {
    var t = limpo(fv);
    if (!t) return '';
    var m = /^(?:n\s*[°º]\s*)?(\d{1,2})\s*[-–]\s*(.+)$/i.exec(t);
    if (!m) return t;
    var num = m[1].length === 1 ? '0' + m[1] : m[1];
    return 'FV' + num + ' - ' + m[2].trim().toUpperCase();
  }

  /** Conteúdo inicial do item de Waiver criado a partir da NCR. */
  function paraItemWaiver(rec) {
    return {
      ncrId: rec.numero,
      ncrKey: rec.key,
      description: rec.fonte.descricao || rec.fonte.titulo || '',
      observation: rec.waiver.observacao,
      func: funcaoParaWaiver(rec.waiver.funcaoVital),
      systems: rec.fonte.sistema,
      historic: rec.waiver.waiverHistoric
    };
  }

  /** Anota, na parte do Waiver, que a NCR foi levada a um relatório. */
  function registrarAdicao(rec, project, item, quem) {
    rec.waiver.adicoes.push({
      projectId: project.id, marco: str(project.marco), itemId: item.id, em: nowIso(), por: str(quem)
    });
    rec.waiver.editedAt = Store.depoisDe(rec.waiver.editedAt);
    rec.waiver.editedBy = str(quem);
    return salvar([rec]);
  }

  function editarWaiver(rec, campo, valor, quem) {
    rec.waiver[campo] = str(valor);
    rec.waiver.editedAt = Store.depoisDe(rec.waiver.editedAt);
    rec.waiver.editedBy = str(quem);
    return salvar([rec]);
  }

  /* --- registro das importações --------------------------------------------- */

  function registrarImportacao(tipo, arquivo, quem, numeros) {
    meta.importacoes.push({ id: uid(), tipo: tipo, em: nowIso(), por: str(quem), arquivo: str(arquivo), numeros: numeros });
    if (meta.importacoes.length > MAX_IMPORTACOES) meta.importacoes = meta.importacoes.slice(-MAX_IMPORTACOES);
  }

  /* Resumo mostrado ao fim de cada importação: números, listas por grupo e
     os registros com problema. Mesmo formato para as três importações. */
  function novoResumo(titulo, arquivo) {
    return { titulo: titulo, arquivo: str(arquivo), numeros: [], grupos: [], erros: [], avisos: [] };
  }
  function grupo(res, titulo, itens, explica) {
    if (itens && itens.length) res.grupos.push({ titulo: titulo, explica: explica || '', itens: itens });
  }

  /* --- 1. importar / atualizar o banco NCR ----------------------------------- */

  /**
   * Transforma o que foi lido (planilha ou JSON do NCR Control) em linhas
   * { numero, campos } com a lista de colunas. Lança erro com explicação
   * quando o arquivo não é um banco de NCR.
   */
  function linhasDoBanco(entrada) {
    if (entrada && entrada.sheets) return linhasDaPlanilha(entrada);
    return linhasDoJson(entrada);
  }

  function linhasDaPlanilha(wb) {
    var infos = [];
    (wb.sheets || []).forEach(function (s) {
      var rows = s.rows || [];
      var hi = acharCabecalho(rows);
      if (hi < 0) return;
      var cols = nomesColunas(rows[hi] || []);
      var info = {
        sheet: s, hi: hi, cols: cols,
        iNcr: acharCol(cols, ALIAS.ncr),
        iStatus: acharCol(cols, ALIAS.status),
        iData: acharCol(cols, ALIAS.criadoEm),
        corr: acharCol(cols, ALIAS_CORR.marcoAtual) >= 0 || acharCol(cols, ALIAS_CORR.marcoOriginal) >= 0
      };
      info.score = (info.iNcr >= 0 ? 4 : -99) + (info.iStatus >= 0 ? 3 : 0) + (info.iData >= 0 ? 2 : 0) +
        (cols.length > 12 ? 2 : 0) + (info.corr ? -6 : 0);
      infos.push(info);
    });
    var cand = infos.filter(function (i) { return i.iNcr >= 0; }).sort(function (a, b) { return b.score - a.score; });
    if (!cand.length) {
      throw new Error('Nenhuma aba com a coluna do número da NCR (ex.: "Número NCR") foi encontrada. Abas lidas: ' +
        ((wb.sheets || []).map(function (s) { return s.name; }).join(', ') || '(nenhuma)'));
    }
    var info = cand[0];
    if (info.corr && info.iStatus < 0) {
      throw new Error('Este arquivo parece a planilha de CORRELAÇÃO (tem "Original Jx"/"Actual Jx"), não o banco NCR. ' +
        'Use "Importar correlação" para ele.');
    }
    var linhas = [];
    for (var r = info.hi + 1; r < info.sheet.rows.length; r++) {
      var row = info.sheet.rows[r] || [];
      var campos = {}, algo = false;
      for (var j = 0; j < info.cols.length; j++) {
        if (!info.cols[j]) continue;
        var v = valorCampo(row[j]);
        if (v !== '') { campos[info.cols[j]] = v; algo = true; }
      }
      if (!algo) continue;
      linhas.push({ linha: r + 1, numero: valorCampo(row[info.iNcr]), campos: campos });
    }
    return { cols: info.cols.filter(Boolean), colNcr: info.cols[info.iNcr], linhas: linhas, origem: 'aba "' + info.sheet.name + '"' };
  }

  function linhasDoJson(d) {
    var regs = null;
    if (d && d.tipo === 'ncr' && d.registros) regs = d.registros;           // BD/ncr.json do NCR Control
    else if (d && d.ncr && typeof d.ncr === 'object' && !Array.isArray(d.ncr)) regs = d.ncr;  // backup do NCR Control
    else if (d && d.registros) regs = d.registros;
    else if (Array.isArray(d)) regs = d;
    if (!regs) throw new Error('O JSON não parece um banco NCR (esperado o ncr.json do NCR Control).');
    var lista = Array.isArray(regs) ? regs : Object.keys(regs).map(function (k) { return regs[k]; });
    var cols = [], vistas = {};
    var linhas = lista.map(function (r, i) {
      var campos = {};
      var c = (r && r.campos) || r || {};
      Object.keys(c).forEach(function (k) {
        var v = valorCampo(c[k]);
        if (v === '' || typeof c[k] === 'object' && !(c[k] instanceof Date)) return;
        campos[k] = v;
        if (!vistas[k]) { vistas[k] = 1; cols.push(k); }
      });
      if (r && r.status && !Object.keys(campos).some(function (k) { return norm(k) === 'status'; })) campos.Status = str(r.status);
      return { linha: i + 1, numero: str((r && (r.id || r.numero || r.key)) || ''), campos: campos };
    });
    if (cols.indexOf('Status') < 0 && linhas.some(function (l) { return l.campos.Status; })) cols.push('Status');
    var iNcr = acharCol(cols, ALIAS.ncr);
    return { cols: cols, colNcr: iNcr >= 0 ? cols[iNcr] : '', linhas: linhas, origem: 'JSON do NCR Control' };
  }

  /** Papel de cada coluna conhecida (título, descrição…) — só as que existem. */
  function papeisDe(cols) {
    var p = {};
    ['status', 'titulo', 'descricao', 'sistema', 'sbr', 'criadoEm', 'responsavel', 'fechamento'].forEach(function (k) {
      var i = acharCol(cols, ALIAS[k]);
      if (i >= 0) p[k] = cols[i];
    });
    /* "Título" e "Descrição" não podem ser a mesma coluna */
    if (p.titulo && p.titulo === p.descricao) delete p.titulo;
    return p;
  }

  function assinaturaCampos(c) {
    return JSON.stringify(Object.keys(c || {}).sort().map(function (k) { return [k, c[k]]; }));
  }

  function aplicarPendente(rec) {
    var p = meta.pendentes[rec.key];
    if (!p) return false;
    var mudouAlgo = false;
    CAMPOS_WAIVER.forEach(function (c) {
      if (p[c.id] && !rec.waiver[c.id]) { rec.waiver[c.id] = p[c.id]; mudouAlgo = true; }
    });
    if (mudouAlgo) {
      rec.waiver.editedAt = Store.depoisDe(rec.waiver.editedAt);
      rec.waiver.editedBy = str(p.por);
    }
    delete meta.pendentes[rec.key];
    return mudouAlgo;
  }

  /**
   * Junta o banco lido ao que já existe. Só mexe na parte "fonte": a parte do
   * Waiver (marcos, função vital, observação, vínculos) nunca é tocada.
   * Nenhuma NCR é apagada — a que sumiu do export fica marcada como ausente.
   */
  function importarBase(entrada, arquivo, quem) {
    var lido = linhasDoBanco(entrada);
    var papeis = papeisDe(lido.cols);
    var agora = nowIso();
    var res = novoResumo('Banco NCR importado', arquivo);
    var st = { linhas: 0, sbr4: 0, novas: 0, atualizadas: 0, iguais: 0, outrosSbr: 0, semSbr: 0, dup: 0, correl: 0 };
    var listas = { novas: [], atualizadas: [], outros: {}, semSbr: [], dup: [] };
    var vistos = {}, alterados = [];

    lido.linhas.forEach(function (l) {
      st.linhas++;
      if (!l.numero) {
        res.erros.push('Linha ' + l.linha + ': sem número de NCR — ignorada.');
        return;
      }
      var key = chave(l.numero);
      var s = sbrDe(papeis.sbr ? l.campos[papeis.sbr] : '', l.numero);
      if (s.sbr !== SBR_ALVO) {
        if (s.sbr) { st.outrosSbr++; (listas.outros[s.sbr] = listas.outros[s.sbr] || []).push(l.numero); }
        else { st.semSbr++; listas.semSbr.push(l.numero); }
        return;
      }
      if (vistos[key]) { st.dup++; listas.dup.push(l.numero + ' (linha ' + l.linha + ')'); }
      vistos[key] = true;
      st.sbr4++;

      var rec = base[key];
      /* sem fonte = só havia dados do Waiver (vindos da pasta): conta como nova */
      var nova = !rec || !rec.fonte.importadoEm;
      if (!rec) { rec = recVazio(key, l.numero); base[key] = rec; }
      var antes = rec.fonte;
      var igual = !nova && antes.importadoEm && assinaturaCampos(antes.campos) === assinaturaCampos(l.campos);

      if (igual) {
        st.iguais++;
        if (!antes.presente) { antes.presente = true; alterados.push(rec); }
        return;
      }
      var f = fonteVazia();
      f.campos = l.campos;
      Object.keys(papeis).forEach(function (k) { f[k] = str(l.campos[papeis[k]]); });
      f.sbr = s.sbr; f.sbrPor = s.por;
      f.arquivo = str(arquivo); f.importadoEm = agora; f.presente = true;
      if (!nova) {
        var ks = {};
        Object.keys(antes.campos).concat(Object.keys(l.campos)).forEach(function (k) { ks[k] = 1; });
        f.alterados = Object.keys(ks).filter(function (k) { return str(antes.campos[k]) !== str(l.campos[k]); });
      }
      rec.fonte = f;
      rec.numero = l.numero;
      if (nova) {
        st.novas++; listas.novas.push(l.numero);
        if (aplicarPendente(rec)) st.correl++;
      } else {
        st.atualizadas++;
        listas.atualizadas.push(l.numero + ' — ' + (f.alterados.slice(0, 4).join(', ') || 'campos') +
          (f.alterados.length > 4 ? ' e mais ' + (f.alterados.length - 4) : ''));
      }
      alterados.push(rec);
    });

    /* as que não vieram neste export continuam aqui, apenas marcadas */
    var ausentes = [];
    lista().forEach(function (rec) {
      if (!vistos[rec.key] && rec.fonte.presente) {
        rec.fonte.presente = false;
        ausentes.push(rec.numero);
        alterados.push(rec);
      }
    });

    meta.colunas = lido.cols;
    meta.papeis = papeis;
    meta.colunasEm = agora;

    res.numeros = [
      ['Linhas lidas', st.linhas],
      ['NCRs do SBR4 encontradas', st.sbr4, true],
      ['Novas NCRs', st.novas, true],
      ['NCRs atualizadas', st.atualizadas, true],
      ['Sem alteração', st.iguais],
      ['Correlações aplicadas às novas', st.correl],
      ['Ignoradas — outros SBRs', st.outrosSbr],
      ['Ignoradas — SBR não identificado', st.semSbr],
      ['Repetidas no arquivo', st.dup],
      ['Não constam mais no export (mantidas)', ausentes.length],
      ['Erros', res.erros.length]
    ];
    grupo(res, 'Novas NCRs', listas.novas);
    grupo(res, 'NCRs atualizadas (campos que mudaram)', listas.atualizadas);
    Object.keys(listas.outros).sort().forEach(function (k) {
      grupo(res, 'Ignoradas — ' + k, listas.outros[k], 'só o SBR4 entra por enquanto');
    });
    grupo(res, 'Ignoradas — SBR não identificado', listas.semSbr,
      'sem coluna SBR preenchida e com número fora do padrão NCR-…-14-…');
    grupo(res, 'Repetidas no arquivo', listas.dup, 'vale a última linha');
    grupo(res, 'Não constam mais no export', ausentes, 'continuam no banco, com os dados do Waiver, marcadas como ausentes');
    res.avisos.push('Lido de: ' + lido.origem + ' · coluna do número: "' + (lido.colNcr || '?') + '"' +
      (papeis.sbr ? ' · SBR pela coluna "' + papeis.sbr + '" (e pelo número quando vazia)' : ' · sem coluna SBR: SBR pelo número'));

    registrarImportacao('banco', arquivo, quem, { novas: st.novas, atualizadas: st.atualizadas, sbr4: st.sbr4 });
    return { resumo: res, alterados: alterados };
  }

  /* --- 2. importar a correlação --------------------------------------------- */

  /** Lê os itens de correlação e as listas, de JSON ou da planilha. */
  function lerCorrelacao(entrada) {
    if (entrada && entrada.sheets) return correlacaoDaPlanilha(entrada);
    var itens, listasLidas = null;
    if (Array.isArray(entrada)) itens = entrada;
    else if (entrada && Array.isArray(entrada.itens)) itens = entrada.itens;
    else if (entrada && Array.isArray(entrada.correlacao)) itens = entrada.correlacao;
    else throw new Error('O JSON não traz uma lista de correlações ("itens").');
    if (entrada && entrada.listas) {
      listasLidas = {
        marcos: (entrada.listas.marcos || []).map(str),
        funcoes: (entrada.listas.funcoesVitais || entrada.listas.funcoes || []).map(str)
      };
    }
    return { itens: itens.map(itemCorrelacao), listas: listasLidas };
  }

  /** Aceita tanto as chaves do JSON quanto os nomes das colunas da planilha. */
  function itemCorrelacao(o) {
    var porNome = {};
    Object.keys(o || {}).forEach(function (k) { porNome[norm(k)] = o[k]; });
    var out = {};
    Object.keys(ALIAS_CORR).forEach(function (campo) {
      var v = '';
      var cands = [norm(campo)].concat(ALIAS_CORR[campo].map(norm));
      for (var i = 0; i < cands.length; i++) {
        if (porNome[cands[i]] != null && limpo(porNome[cands[i]]) !== '') { v = porNome[cands[i]]; break; }
      }
      out[campo] = limpo(v);
    });
    if (!out.numero) out.numero = limpo(o && (o.ncr || o.NCR));
    return out;
  }

  function correlacaoDaPlanilha(wb) {
    var itens = null, listasLidas = null;
    (wb.sheets || []).forEach(function (s) {
      var rows = s.rows || [];
      var hi = acharCabecalho(rows);
      if (hi < 0) return;
      var cols = nomesColunas(rows[hi] || []);
      var iNum = acharCol(cols, ALIAS_CORR.numero);
      var iAtual = acharCol(cols, ALIAS_CORR.marcoAtual);
      var iOrig = acharCol(cols, ALIAS_CORR.marcoOriginal);
      var iFv = acharCol(cols, ALIAS_CORR.funcaoVital);
      if (iNum >= 0 && (iAtual >= 0 || iOrig >= 0) && !itens) {
        itens = [];
        for (var r = hi + 1; r < rows.length; r++) {
          var row = rows[r] || [];
          var o = {};
          cols.forEach(function (c, j) { if (c) o[c] = valorCampo(row[j]); });
          itens.push(itemCorrelacao(o));
        }
      } else if (iNum < 0 && iFv >= 0) {
        /* aba "Possibilidades da Mascara": marcos (Original/Actual Jx) e funções */
        listasLidas = { marcos: [], funcoes: [] };
        for (var q = hi + 1; q < rows.length; q++) {
          var lin = rows[q] || [];
          [iOrig, iAtual].forEach(function (j) {
            if (j >= 0 && valorCampo(lin[j])) unirLista(listasLidas.marcos, [valorCampo(lin[j])]);
          });
          if (valorCampo(lin[iFv])) unirLista(listasLidas.funcoes, [valorCampo(lin[iFv])]);
        }
      }
    });
    if (!itens) throw new Error('Nenhuma aba de correlação encontrada (colunas "Número" e "Original Jx"/"Actual Jx").');
    return { itens: itens, listas: listasLidas };
  }

  /**
   * Aplica a correlação. Só preenche o que está vazio aqui, a menos que
   * opts.substituir: uma segunda importação do mesmo arquivo não desfaz o
   * que foi corrigido à mão depois. Valor vazio no arquivo nunca apaga nada.
   * NCR que ainda não está no banco fica guardada e é aplicada quando ela
   * chegar numa importação do banco.
   */
  function importarCorrelacao(dados, arquivo, quem, opts) {
    opts = opts || {};
    var res = novoResumo('Correlação importada', arquivo);
    var st = { lidas: 0, vazias: 0, importadas: 0, iguais: 0, conflitos: 0, naoAchadas: 0 };
    var listas = { conflitos: [], naoAchadas: [], atualizadas: [] };
    var alterados = [], vistos = {};

    dados.itens.forEach(function (it, i) {
      st.lidas++;
      if (!it.numero) {
        if (CAMPOS_WAIVER.some(function (c) { return it[c.id]; })) res.erros.push('Registro ' + (i + 1) + ': sem número de NCR — ignorado.');
        return;
      }
      var key = chave(it.numero);
      var campos = CAMPOS_WAIVER.filter(function (c) { return it[c.id]; });
      if (!campos.length) { st.vazias++; return; }
      if (vistos[key]) res.avisos.push(it.numero + ' aparece mais de uma vez no arquivo — valeu a última.');
      vistos[key] = true;

      var rec = base[key];
      if (!rec) {
        st.naoAchadas++;
        listas.naoAchadas.push(it.numero);
        var p = meta.pendentes[key] || {};
        campos.forEach(function (c) { p[c.id] = it[c.id]; });
        p.numero = it.numero; p.por = str(quem); p.em = nowIso();
        meta.pendentes[key] = p;
        return;
      }
      var mexeu = [];
      campos.forEach(function (c) {
        var atual = rec.waiver[c.id];
        if (atual === it[c.id]) return;
        if (!atual || opts.substituir) { rec.waiver[c.id] = it[c.id]; mexeu.push(c.nome); return; }
        st.conflitos++;
        listas.conflitos.push(rec.numero + ' — ' + c.nome + ': mantido "' + atual.split('\n')[0].slice(0, 40) +
          '", arquivo traz "' + it[c.id].split('\n')[0].slice(0, 40) + '"');
      });
      if (mexeu.length) {
        rec.waiver.editedAt = Store.depoisDe(rec.waiver.editedAt);
        rec.waiver.editedBy = str(quem);
        st.importadas++;
        listas.atualizadas.push(rec.numero + ' — ' + mexeu.join(', '));
        alterados.push(rec);
      } else {
        st.iguais++;
      }
    });

    var novasListas = 0;
    if (dados.listas) {
      novasListas = unirLista(meta.listas.marcos, dados.listas.marcos) + unirLista(meta.listas.funcoes, dados.listas.funcoes);
      if (novasListas) { meta.listas.editedAt = Store.depoisDe(meta.listas.editedAt); meta.listas.editedBy = str(quem); }
    }

    res.numeros = [
      ['Registros lidos', st.lidas],
      ['Correlações importadas', st.importadas, true],
      ['Já estavam iguais', st.iguais],
      ['Valores mantidos (já preenchidos aqui)', st.conflitos],
      ['NCRs não encontradas no banco', st.naoAchadas, true],
      ['Registros sem dados de correlação', st.vazias],
      ['Opções novas nas listas', novasListas],
      ['Erros', res.erros.length]
    ];
    grupo(res, 'NCRs atualizadas', listas.atualizadas);
    grupo(res, 'NCRs não encontradas no banco', listas.naoAchadas,
      'a correlação ficou guardada e entra sozinha quando a NCR aparecer numa importação do banco');
    grupo(res, 'Valores mantidos', listas.conflitos,
      opts.substituir ? '' : 'já havia valor aqui; marque "substituir" para trocar pelo do arquivo');
    registrarImportacao('correlacao', arquivo, quem, { importadas: st.importadas, naoAchadas: st.naoAchadas });
    return { resumo: res, alterados: alterados };
  }

  /* --- 3. importar histórico ------------------------------------------------- */

  /** Aceita o historico.json do NCR Control, um backup dele, uma lista ou {ncr: [eventos]}. */
  function eventosDoJson(d) {
    var ev = null;
    if (Array.isArray(d)) ev = d;
    else if (d && Array.isArray(d.eventos)) ev = d.eventos;
    else if (d && Array.isArray(d.historico)) ev = d.historico;
    else if (d && d.historico && typeof d.historico === 'object') ev = mapaParaEventos(d.historico);
    else if (d && typeof d === 'object') ev = mapaParaEventos(d);
    if (!ev || !ev.length) throw new Error('O JSON não traz eventos de histórico.');
    return ev;
  }
  function mapaParaEventos(m) {
    var out = [];
    Object.keys(m).forEach(function (k) {
      if (Array.isArray(m[k])) m[k].forEach(function (e) { var c = copia(e) || {}; if (!c.ncr) c.ncr = k; out.push(c); });
    });
    return out;
  }

  function importarHistorico(dados, arquivo, quem) {
    var eventos = eventosDoJson(dados);
    var res = novoResumo('Histórico importado', arquivo);
    var st = { lidos: 0, novos: 0, repetidos: 0, ncrs: 0, naoAchadas: 0 };
    var naoAchadas = {}, porRec = {}, alterados = [];

    eventos.forEach(function (e, i) {
      st.lidos++;
      var numero = str(e && (e.ncr || e.numero || e.key || e.id_ncr));
      if (!numero) { res.erros.push('Evento ' + (i + 1) + ': sem NCR — ignorado.'); return; }
      var ev = normalizarEvento(e);
      if (e && e.ncr && e.id) ev.id = str(e.id);
      if (!ev.data) { res.erros.push('Evento ' + (i + 1) + ' (' + numero + '): sem data — ignorado.'); return; }
      var rec = base[chave(numero)];
      if (!rec) { naoAchadas[chave(numero)] = numero; return; }
      var tem = porRec[rec.key];
      if (!tem) {
        tem = porRec[rec.key] = {};
        rec.historico.forEach(function (x) { tem[assinaturaEvento(x)] = 1; });
      }
      var sig = assinaturaEvento(ev);
      if (tem[sig]) { st.repetidos++; return; }
      tem[sig] = 1;
      rec.historico.push(ev);
      st.novos++;
      if (alterados.indexOf(rec) < 0) alterados.push(rec);
    });
    alterados.forEach(function (rec) {
      rec.historico.sort(function (a, b) { return str(a.data).localeCompare(str(b.data)); });
    });
    st.ncrs = alterados.length;
    var nomes = Object.keys(naoAchadas).map(function (k) { return naoAchadas[k]; });
    st.naoAchadas = nomes.length;

    res.numeros = [
      ['Eventos lidos', st.lidos],
      ['Eventos novos', st.novos, true],
      ['NCRs com histórico novo', st.ncrs, true],
      ['Eventos já existentes', st.repetidos],
      ['NCRs não encontradas no banco', st.naoAchadas, true],
      ['Erros', res.erros.length]
    ];
    grupo(res, 'NCRs não encontradas no banco', nomes, 'os eventos delas não foram guardados');
    registrarImportacao('historico', arquivo, quem, { novos: st.novos, ncrs: st.ncrs });
    return { resumo: res, alterados: alterados };
  }

  /* --- retrato, backup e restauração ---------------------------------------- */

  function retrato() {
    return { ncrs: copia(lista()), meta: copia(meta) };
  }

  /**
   * Volta ao retrato. O que volta é registrado como edição de agora (os
   * carimbos passam a ser posteriores aos atuais) — senão a pasta
   * compartilhada traria de novo, na sincronização seguinte, a versão que se
   * quis desfazer. NCRs que não estavam no retrato ficam: nada é apagado.
   */
  function restaurar(snap, quem) {
    var n = 0, alterados = [];
    ((snap && snap.ncrs) || []).forEach(function (x) {
      var r = normalizarRec(x);
      if (!r.key) return;
      var atual = base[r.key];
      if (atual) {
        if (r.fonte.importadoEm || atual.fonte.importadoEm) {
          r.fonte.importadoEm = Store.depoisDe(maior(atual.fonte.importadoEm, r.fonte.importadoEm));
        }
        r.waiver.adicoes = unirAdicoes(atual.waiver.adicoes, r.waiver.adicoes).lista;
        r.historico = unirHistorico(atual.historico, r.historico).lista;
      }
      if (r.waiver.editedAt || (atual && atual.waiver.editedAt)) {
        r.waiver.editedAt = Store.depoisDe(maior(atual ? atual.waiver.editedAt : '', r.waiver.editedAt));
        r.waiver.editedBy = str(quem);
      }
      base[r.key] = r;
      alterados.push(r);
      n++;
    });
    if (snap && snap.meta) {
      var m = normalizarMeta(snap.meta);
      meta.listas = m.listas;
      meta.listas.editedAt = Store.depoisDe(meta.listas.editedAt);
      Object.keys(m.pendentes).forEach(function (k) { if (!base[k]) meta.pendentes[k] = m.pendentes[k]; });
    }
    registrarImportacao('restauracao', '', quem, { ncrs: n });
    return { voltaram: n, alterados: alterados };
  }

  /** O banco inteiro, para ir dentro do backup. */
  function paraBackup() {
    return { format: 'derrogacao-ncr-base', schema: 1, ncrs: copia(lista()), meta: copia(meta) };
  }

  /* --- pasta compartilhada --------------------------------------------------- */

  /* Dois arquivos na pasta. O do banco é grande e só muda quando alguém
     importa; o do Waiver é pequeno e muda a cada campo preenchido. Separados,
     preencher uma Função Vital não obriga a regravar megabytes pela rede. */

  function arquivoBanco(quem) {
    return {
      format: 'derrogacao-ncr-banco', schema: 1, updatedAt: nowIso(), updatedBy: str(quem),
      colunas: meta.colunas, papeis: meta.papeis, colunasEm: meta.colunasEm,
      importacoes: meta.importacoes,
      ncrs: lista().filter(function (r) { return r.fonte.importadoEm || r.historico.length; })
        .map(function (r) { return { key: r.key, numero: r.numero, fonte: r.fonte, historico: r.historico }; })
    };
  }

  function arquivoWaiver(quem) {
    return {
      format: 'derrogacao-ncr-waiver', schema: 1, updatedAt: nowIso(), updatedBy: str(quem),
      listas: meta.listas, pendentes: meta.pendentes,
      ncrs: lista().filter(function (r) { return r.waiver.editedAt; })
        .map(function (r) { return { key: r.key, numero: r.numero, waiver: r.waiver }; })
    };
  }

  function unirHistorico(meus, deles) {
    var tem = {}, lista = (meus || []).slice(), entraram = 0, faltavamLa = 0;
    lista.forEach(function (e) { tem[assinaturaEvento(e)] = 1; });
    var la = {};
    (deles || []).forEach(function (e) {
      var ev = normalizarEvento(e);
      var s = assinaturaEvento(ev);
      la[s] = 1;
      if (!tem[s]) { tem[s] = 1; lista.push(ev); entraram++; }
    });
    (meus || []).forEach(function (e) { if (!la[assinaturaEvento(e)]) faltavamLa++; });
    if (entraram) lista.sort(function (a, b) { return str(a.data).localeCompare(str(b.data)); });
    return { lista: lista, entraram: entraram, faltavamLa: faltavamLa };
  }

  function unirAdicoes(meus, deles) {
    var s = function (a) { return a.projectId + '|' + a.itemId + '|' + a.em; };
    var tem = {}, lista = (meus || []).slice(), entraram = 0, faltavamLa = 0, la = {};
    lista.forEach(function (a) { tem[s(a)] = 1; });
    (deles || []).forEach(function (a) {
      var x = normalizarAdicao(a);
      la[s(x)] = 1;
      if (!tem[s(x)]) { tem[s(x)] = 1; lista.push(x); entraram++; }
    });
    (meus || []).forEach(function (a) { if (!la[s(a)]) faltavamLa++; });
    return { lista: lista, entraram: entraram, faltavamLa: faltavamLa };
  }

  /**
   * Junta o arquivo do banco que está na pasta. Vale a fonte importada por
   * último; o histórico é união. Devolve o que mudou aqui e se este lado tem
   * algo que a pasta ainda não tem (e precisa ser gravado).
   */
  function juntarBanco(d) {
    var res = { entraram: 0, atualizados: 0, localMaisNovo: false, alterados: [] };
    if (!d || !Array.isArray(d.ncrs)) return res;
    var vistos = {};
    d.ncrs.forEach(function (x) {
      var key = chave(x && (x.key || x.numero));
      if (!key) return;
      vistos[key] = 1;
      var f = normalizarFonte(x.fonte);
      var rec = base[key], mexeu = false;
      if (!rec) {
        rec = base[key] = recVazio(key, x.numero);
        rec.fonte = f;
        rec.historico = unirHistorico([], x.historico).lista;
        aplicarPendente(rec);
        res.entraram++;
        res.alterados.push(rec);
        return;
      }
      if (f.importadoEm > rec.fonte.importadoEm) {
        rec.fonte = f; rec.numero = str(x.numero) || rec.numero; mexeu = true;
      } else if (f.importadoEm < rec.fonte.importadoEm || f.presente !== rec.fonte.presente) {
        res.localMaisNovo = true;
      }
      var u = unirHistorico(rec.historico, x.historico);
      if (u.entraram) { rec.historico = u.lista; mexeu = true; }
      if (u.faltavamLa) res.localMaisNovo = true;
      if (mexeu) { res.atualizados++; res.alterados.push(rec); }
    });
    lista().forEach(function (r) {
      if (!vistos[r.key] && (r.fonte.importadoEm || r.historico.length)) res.localMaisNovo = true;
    });
    if (str(d.colunasEm) > meta.colunasEm) {
      meta.colunas = Array.isArray(d.colunas) ? d.colunas.map(str) : [];
      meta.papeis = d.papeis || {};
      meta.colunasEm = str(d.colunasEm);
    } else if (str(d.colunasEm) < meta.colunasEm) res.localMaisNovo = true;
    var ids = {};
    meta.importacoes.forEach(function (i) { ids[i.id] = 1; });
    var laIds = {};
    (d.importacoes || []).forEach(function (i) {
      laIds[i.id] = 1;
      if (i && i.id && !ids[i.id]) { meta.importacoes.push(i); ids[i.id] = 1; }
    });
    if (meta.importacoes.some(function (i) { return !laIds[i.id]; })) res.localMaisNovo = true;
    meta.importacoes.sort(function (a, b) { return str(a.em).localeCompare(str(b.em)); });
    if (meta.importacoes.length > MAX_IMPORTACOES) meta.importacoes = meta.importacoes.slice(-MAX_IMPORTACOES);
    if (res.alterados.length) mudou();
    return res;
  }

  /** Junta o arquivo do Waiver: vale quem editou por último, NCR a NCR. */
  function juntarWaiver(d) {
    var res = { entraram: 0, atualizados: 0, localMaisNovo: false, alterados: [] };
    if (!d || !Array.isArray(d.ncrs)) return res;
    var vistos = {};
    d.ncrs.forEach(function (x) {
      var key = chave(x && (x.key || x.numero));
      if (!key) return;
      vistos[key] = 1;
      var w = normalizarWaiver(x.waiver);
      var rec = base[key];
      if (!rec) {
        rec = base[key] = recVazio(key, x.numero);
        rec.waiver = w;
        res.entraram++;
        res.alterados.push(rec);
        return;
      }
      var ad = unirAdicoes(rec.waiver.adicoes, w.adicoes);
      if (w.editedAt > rec.waiver.editedAt) {
        w.adicoes = ad.lista;
        rec.waiver = w;
        res.atualizados++;
        res.alterados.push(rec);
      } else {
        if (w.editedAt < rec.waiver.editedAt || ad.faltavamLa) res.localMaisNovo = true;
        if (ad.entraram) { rec.waiver.adicoes = ad.lista; res.alterados.push(rec); }
      }
    });
    lista().forEach(function (r) { if (!vistos[r.key] && r.waiver.editedAt) res.localMaisNovo = true; });

    if (d.listas && str(d.listas.editedAt) > meta.listas.editedAt) {
      meta.listas = normalizarMeta({ listas: d.listas }).listas;
      res.atualizados++;
    } else if (!d.listas || str(d.listas.editedAt) < meta.listas.editedAt) {
      if (meta.listas.editedAt) res.localMaisNovo = true;
    }
    var pl = d.pendentes || {};
    Object.keys(pl).forEach(function (k) { if (!base[k] && !meta.pendentes[k]) meta.pendentes[k] = pl[k]; });
    Object.keys(meta.pendentes).forEach(function (k) {
      if (base[k] && base[k].fonte.importadoEm) delete meta.pendentes[k];
      else if (!pl[k]) res.localMaisNovo = true;
    });
    if (res.alterados.length) mudou();
    return res;
  }

  /** Banco NCR que veio dentro de um backup: as mesmas regras da pasta. */
  function juntarBackup(nb) {
    var m = (nb && nb.meta) || {};
    var ncrs = (nb && nb.ncrs) || [];
    var a = juntarBanco({ ncrs: ncrs, colunas: m.colunas, papeis: m.papeis, colunasEm: m.colunasEm, importacoes: m.importacoes || [] });
    var b = juntarWaiver({ ncrs: ncrs, listas: m.listas, pendentes: m.pendentes });
    return { entraram: a.entraram + b.entraram, atualizados: a.atualizados + b.atualizados,
             alterados: a.alterados.concat(b.alterados) };
  }

  /* --- utilidades para a tela ------------------------------------------------ */

  /** Data ISO -> dd/mm/aaaa; qualquer outro texto passa como está. */
  function data(v) {
    var s = str(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(s);
    if (!m) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var t = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    return (d.getHours() || d.getMinutes()) ? t + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : t;
  }

  /* Status finais do NCR Control (Cfg.PADRAO.statusFinais), e o mesmo
     critério por palavra para exports que escrevem de outro jeito. */
  var STATUS_FINAIS = ['cedoc closure', 'cedoc closure unfounded', 'closed', 'closed unfounded'];

  /** A NCR está fechada? Pelo status do banco, ou por ter data de fechamento. */
  function fechada(rec) {
    var st = norm(rec && rec.fonte && rec.fonte.status);
    if (st && (STATUS_FINAIS.indexOf(st) >= 0 || /\b(closed|closure|fechad[ao]|encerrad[ao]|cancelad[ao])\b/.test(st))) return true;
    return !st && !!(rec && rec.fonte && rec.fonte.fechamento);
  }

  /** Situação da correlação: completa, parcial ou vazia. */
  function situacaoCorrelacao(rec) {
    var w = rec.waiver;
    var n = [w.marcoOriginal, w.marcoAtual, w.funcaoVital].filter(Boolean).length;
    return n === 3 ? 'completa' : (n || w.observacao ? 'parcial' : 'vazia');
  }

  global.Ncrs = {
    SBR_ALVO: SBR_ALVO,
    LISTAS_PADRAO: LISTAS_PADRAO,
    CAMPOS_WAIVER: CAMPOS_WAIVER,
    chave: chave,
    norm: norm,
    marcoChave: marcoChave,
    grupoSbr: grupoSbr,
    sbrPeloNumero: sbrPeloNumero,
    sbrDe: sbrDe,
    carregar: carregar,
    salvar: salvar,
    salvarMeta: salvarMeta,
    lista: lista,
    get: get,
    versao: function () { return versao; },
    meta: function () { return meta; },
    listas: listas,
    setListas: setListas,
    vinculos: vinculos,
    mapaVinculos: mapaVinculos,
    relatorioDoMarco: relatorioDoMarco,
    funcaoParaWaiver: funcaoParaWaiver,
    paraItemWaiver: paraItemWaiver,
    registrarAdicao: registrarAdicao,
    editarWaiver: editarWaiver,
    importarBase: importarBase,
    lerCorrelacao: lerCorrelacao,
    importarCorrelacao: importarCorrelacao,
    importarHistorico: importarHistorico,
    retrato: retrato,
    restaurar: restaurar,
    paraBackup: paraBackup,
    arquivoBanco: arquivoBanco,
    arquivoWaiver: arquivoWaiver,
    juntarBanco: juntarBanco,
    juntarWaiver: juntarWaiver,
    juntarBackup: juntarBackup,
    data: data,
    fechada: fechada,
    situacaoCorrelacao: situacaoCorrelacao
  };
})(window);
