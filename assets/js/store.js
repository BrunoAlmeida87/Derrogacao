/* ==========================================================================
   store.js — modelo de dados e persistência local
   Guarda os relatórios no IndexedDB do navegador (cai para localStorage se
   o IndexedDB não estiver disponível). Nada sai do computador do usuário.
   ========================================================================== */

(function (global) {
  'use strict';

  var MAX_SESSIONS = 30;      // histórico guardado por relatório
  var USER_KEY = 'derrogacao:user';
  var BACKUP_KEY = 'derrogacao:lastBackupAt';
  var FOLDER_KEY = 'derrogacao:pastaBackup';
  var DB_NAME = 'derrogacao';
  var DB_VERSION = 3;
  var STORE = 'projects';
  var LS_KEY = 'derrogacao:projects';
  var SCHEMA = 1;

  /* --- utilidades ------------------------------------------------------- */

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() { return new Date().toISOString(); }

  /* --- fábrica de registros --------------------------------------------- */

  function newEvidence(index) {
    return {
      id: uid(),
      ref: 'Attachment ' + (index || 1),
      note: '',
      orientation: 'landscape',   // padrão do relatório original
      images: []
    };
  }

  /* Situação de acompanhamento do item. É controle interno: não sai em
     nenhuma página do PDF — quem vai para o relatório é o campo
     "Arch Status Waiver", que segue independente deste. O item só conta como
     concluído quando chega em "Waiver accepted". */
  var STATUS = [
    { id: 'preenchendo', nome: 'Em preenchimento',     cor: '#9aa1ae',
      ajuda: 'Ainda sendo escrito.' },
    { id: 'solicitado',  nome: 'Waiver requested',     cor: '#2a78d6',
      ajuda: 'Enviado, aguardando resposta.' },
    { id: 'justificar',  nome: 'Improve justification', cor: '#eb6834',
      ajuda: 'Voltou pedindo justificativa melhor.' },
    { id: 'aceito',      nome: 'Waiver accepted',      cor: '#1baf7a',
      ajuda: 'Aceito — o item conta como concluído.' }
  ];
  var STATUS_PADRAO = 'preenchendo';
  var STATUS_CONCLUIDO = 'aceito';

  function statusInfo(id) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i];
    return STATUS[0];
  }

  /** Único ponto que mexe na situação: "done" nunca se descola dela. */
  function setStatus(item, id) {
    item.status = statusInfo(id).id;
    item.done = item.status === STATUS_CONCLUIDO;
    return item.status;
  }

  function newNcr() {
    return {
      id: uid(),
      ncrId: '',
      systems: '',
      func: '',
      description: '',
      currentSituation: '',
      whyNotPossible: '',
      arguments: '',
      archAnswer: '',
      requestExpiry: '',
      archStatus: '',
      approvedExpiry: '',
      historic: '',
      certificates: [],
      evidence: [],
      status: STATUS_PADRAO, // acompanhamento interno; não sai no PDF
      done: false,           // espelho de status === 'aceito', para filtros e contagens
      editedBy: '',          // quem mexeu nele por último
      editedAt: '',
      syncBase: ''           // editedAt na última troca de arquivo — base da mesclagem
    };
  }

  /* Um projeto guarda dois relatórios irmãos, de mesmo layout: as NCRs e as
     DEVs. Cada um tem o seu marco e o seu título de capa, e é exportado
     separadamente. */
  function newProject(marco) {
    return {
      id: uid(),
      schema: SCHEMA,
      name: marco || 'Novo relatório',
      marco: marco || '',
      marcoDev: '',
      lastEditedBy: '',
      lastEditedAt: '',
      lastBackupBy: '',
      lastBackupAt: '',
      coverTitle: 'Waiver Request For',
      coverTitleDev: 'DEV: Waiver Request For',
      coverSubtitle: 'List of Waiver Requested :',
      footer: 'Gerência técnica operacional',
      showCoverDate: true,   // data de emissão no pé da capa
      ordem: 'manual',       // ordem das páginas: vale para a tela e para o PDF
      ncrs: [],
      devs: [],
      deleted: [],           // lápides: sem elas, o item excluído por um volta pelo outro
      sessions: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  /* --- normalização (tolera arquivos de backup antigos/parciais) -------- */

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

  function normalizeImage(img) {
    if (typeof img === 'string') return { id: uid(), src: img, caption: '' };
    return {
      id: str(img && img.id) || uid(),
      src: str(img && img.src),
      caption: str(img && img.caption)
    };
  }

  function normalizeEvidence(ev, i) {
    var images = Array.isArray(ev && ev.images) ? ev.images.map(normalizeImage).filter(function (im) { return im.src; }) : [];
    return {
      id: str(ev && ev.id) || uid(),
      ref: str(ev && ev.ref) || 'Attachment ' + (i + 1),
      note: str(ev && ev.note),
      orientation: str(ev && ev.orientation) === 'portrait' ? 'portrait' : 'landscape',
      images: images
    };
  }

  function normalizeNcr(raw) {
    var base = newNcr();
    if (!raw || typeof raw !== 'object') return base;
    var certs = Array.isArray(raw.certificates) ? raw.certificates.map(str)
              : (str(raw.certificates) ? [str(raw.certificates)] : []);
    /* Arquivos gravados antes de existir a situação só tinham "done": o que
       estava concluído vira "Waiver accepted", o resto começa em branco. */
    var status = str(raw.status);
    var conhecido = STATUS.some(function (o) { return o.id === status; });
    if (!conhecido) status = raw.done === true ? STATUS_CONCLUIDO : STATUS_PADRAO;
    return {
      id: str(raw.id) || base.id,
      ncrId: str(raw.ncrId),
      systems: str(raw.systems),
      func: str(raw.func),
      description: str(raw.description),
      currentSituation: str(raw.currentSituation),
      whyNotPossible: str(raw.whyNotPossible),
      arguments: str(raw['arguments']),
      archAnswer: str(raw.archAnswer),
      requestExpiry: str(raw.requestExpiry),
      archStatus: str(raw.archStatus),
      approvedExpiry: str(raw.approvedExpiry),
      historic: str(raw.historic),
      certificates: certs,
      evidence: Array.isArray(raw.evidence) ? raw.evidence.map(normalizeEvidence) : [],
      status: status,
      done: status === STATUS_CONCLUIDO,
      editedBy: str(raw.editedBy),
      editedAt: str(raw.editedAt),
      syncBase: str(raw.syncBase)
    };
  }

  /* Aceita backups gravados antes da aba DEV existir: nesses arquivos há
     apenas "ncrs", e a lista de DEVs simplesmente nasce vazia. */
  function normalizeLapide(t) {
    return {
      id: str(t && t.id),
      kind: str(t && t.kind) === 'dev' ? 'dev' : 'ncr',
      ncrId: str(t && t.ncrId),
      at: str(t && t.at),
      by: str(t && t.by)
    };
  }

  function normalizeProject(raw) {
    var base = newProject('');
    if (!raw || typeof raw !== 'object') return base;
    return {
      id: str(raw.id) || base.id,
      schema: SCHEMA,
      name: str(raw.name) || str(raw.marco) || 'Relatório sem nome',
      marco: str(raw.marco),
      marcoDev: str(raw.marcoDev),
      lastEditedBy: str(raw.lastEditedBy),
      lastEditedAt: str(raw.lastEditedAt),
      lastBackupBy: str(raw.lastBackupBy),
      lastBackupAt: str(raw.lastBackupAt),
      coverTitle: str(raw.coverTitle) || base.coverTitle,
      coverTitleDev: str(raw.coverTitleDev) || base.coverTitleDev,
      coverSubtitle: str(raw.coverSubtitle) || base.coverSubtitle,
      footer: raw.footer === '' ? '' : (str(raw.footer) || base.footer),
      showCoverDate: raw.showCoverDate !== false,
      ordem: ordemInfo(raw.ordem).id,
      ncrs: Array.isArray(raw.ncrs) ? raw.ncrs.map(normalizeNcr) : [],
      devs: Array.isArray(raw.devs) ? raw.devs.map(normalizeNcr) : [],
      deleted: Array.isArray(raw.deleted) ? raw.deleted.map(normalizeLapide).filter(function (t) { return t.id; }) : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession).slice(-MAX_SESSIONS) : [],
      createdAt: str(raw.createdAt) || base.createdAt,
      updatedAt: str(raw.updatedAt) || base.updatedAt
    };
  }

  /* Uma sessão é um período de trabalho num navegador: começa quando a
     página é aberta e guarda quais itens foram mexidos nela. */
  function normalizeSession(sess) {
    var changes = Array.isArray(sess && sess.changes) ? sess.changes : [];
    return {
      id: str(sess && sess.id) || uid(),
      user: str(sess && sess.user),
      startedAt: str(sess && sess.startedAt),
      endedAt: str(sess && sess.endedAt),
      changes: changes.map(function (c) {
        return {
          itemId: str(c && c.itemId),
          kind: str(c && c.kind) === 'dev' ? 'dev' : 'ncr',
          label: str(c && c.label),
          action: ['criou', 'excluiu'].indexOf(str(c && c.action)) >= 0 ? str(c.action) : 'editou'
        };
      }).filter(function (c) { return c.itemId; })
    };
  }

  /* Nome da lista de itens de cada aba, dentro do projeto. */
  function itemsKey(kind) { return kind === 'dev' ? 'devs' : 'ncrs'; }

  /* --- comparação de itens ---------------------------------------------- */

  /**
   * Resumo do conteúdo do item, ignorando os campos de controle. Serve para
   * saber se dois lados realmente divergem, e não apenas se têm carimbos de
   * hora diferentes. As imagens entram pelo id e pela legenda: trocar uma
   * imagem gera um id novo, então a diferença é detectada sem comparar os
   * megabytes do base64.
   */
  function signature(item) {
    return JSON.stringify([
      item.ncrId, item.systems, item.func,
      item.description, item.currentSituation, item.whyNotPossible,
      item['arguments'], item.archAnswer,
      item.requestExpiry, item.archStatus, item.approvedExpiry, item.historic,
      item.certificates,
      statusInfo(item.status).id,
      (item.evidence || []).map(function (ev) {
        return [ev.id, ev.ref, ev.note, ev.orientation,
          (ev.images || []).map(function (im) { return [im.id, im.caption]; })];
      })
    ]);
  }

  /**
   * Compara o relatório local com o que veio do arquivo, item a item.
   *
   * A decisão usa o syncBase — o editedAt que o item tinha na última troca de
   * arquivo. Com ele dá para separar os três casos:
   *   - só o outro lado mexeu  -> atualização limpa;
   *   - só este lado mexeu     -> nada a fazer;
   *   - os dois mexeram        -> conflito de verdade, que vai para o usuário.
   */
  /** Número da NCR/DEV normalizado, para parear itens de origens diferentes. */
  function numeroChave(n) {
    return str(n && n.ncrId).trim().toUpperCase().replace(/\s+/g, ' ');
  }

  /**
   * @param opts.semRemocoes  não propor exclusões. Vale quando os dois lados
   *   nunca foram o mesmo relatório (pareados pelo marco): a ausência de um
   *   item no arquivo do colega não quer dizer que ele o excluiu.
   */
  function diffProject(local, incoming, kind, opts) {
    opts = opts || {};
    var key = itemsKey(kind);
    var mine = local ? local[key] : [];
    var theirs = incoming[key] || [];

    var byId = {};
    mine.forEach(function (n) { byId[n.id] = n; });

    /* Pareamento em duas passadas. Pelo id resolve o caso normal — o mesmo
       item que já circulou entre os dois. Pelo número resolve o caso de duas
       pessoas terem criado a mesma NCR cada uma no seu navegador: os ids são
       diferentes, mas é o mesmo item, e sem isso ele entraria duplicado. */
    var usados = {};
    var pares = [];
    var sobraram = [];

    theirs.forEach(function (t) {
      var m = byId[t.id];
      if (m && !usados[m.id]) {
        usados[m.id] = true;
        pares.push({ m: m, t: t, porNumero: false });
      } else {
        sobraram.push(t);
      }
    });

    var porNumero = {};
    mine.forEach(function (n) {
      var k = numeroChave(n);
      if (!k || usados[n.id]) return;
      (porNumero[k] = porNumero[k] || []).push(n);
    });

    var novos = [];
    sobraram.forEach(function (t) {
      var k = numeroChave(t);
      var fila = k ? porNumero[k] : null;
      var m = fila && fila.length ? fila.shift() : null;
      if (m) {
        usados[m.id] = true;
        pares.push({ m: m, t: t, porNumero: true });
      } else {
        novos.push(t);
      }
    });

    var out = { novos: [], atualizados: [], conflitos: [], removidos: [], iguais: 0 };
    novos.forEach(function (t) { out.novos.push({ kind: kind, incoming: t }); });

    pares.forEach(function (par) {
      var m = par.m, t = par.t;
      if (signature(m) === signature(t)) { out.iguais++; return; }
      var entry = { kind: kind, mine: m, incoming: t, porNumero: par.porNumero };

      /* Pareado pelo número não há base comum: os dois lados escreveram por
         conta própria, então a escolha é sempre de quem está mesclando. */
      if (par.porNumero) { out.conflitos.push(entry); return; }

      var euMudei = m.editedAt !== m.syncBase;
      var eleMudou = t.editedAt !== m.syncBase;

      if (!euMudei && eleMudou) out.atualizados.push(entry);
      else if (euMudei && !eleMudou) { /* só eu mexi: o meu permanece */ }
      else out.conflitos.push(entry);
    });

    /* Presente aqui e ausente no arquivo: se já foi sincronizado antes, o
       outro lado provavelmente o excluiu. Nunca apagamos sozinhos. */
    if (!opts.semRemocoes) {
      mine.forEach(function (m) {
        if (!usados[m.id] && m.syncBase) out.removidos.push({ kind: kind, mine: m });
      });
    }

    return out;
  }

  /* --- ordem das páginas do relatório ------------------------------------- */

  /* A ordem escolhida vale para a lista lateral E para o PDF — é a mesma
     coisa. Guardar o modo (e não reescrever o vetor) deixa voltar atrás: a
     ordem manual continua intacta por baixo. */
  var ORDENS = [
    { id: 'manual',   nome: 'Manual (arrastando)',   ajuda: 'A ordem que você montou arrastando os itens.' },
    { id: 'numero',   nome: 'Número',                ajuda: 'Pelo número da NCR/DEV, em ordem alfanumérica.' },
    { id: 'sistema',  nome: 'Sistema',               ajuda: 'Pelas letras do sistema (HP, EX, BF…); depois pelo número.' },
    { id: 'funcao',   nome: 'Função',                ajuda: 'Pelo texto da função (FV01, FV09…); depois pelo número.' },
    { id: 'situacao', nome: 'Situação',              ajuda: 'Do que está em preenchimento até o waiver aceito.' }
  ];

  function ordemInfo(id) {
    for (var i = 0; i < ORDENS.length; i++) if (ORDENS[i].id === id) return ORDENS[i];
    return ORDENS[0];
  }

  /* localeCompare com numeric trata "NCR-10" depois de "NCR-9", que é o que
     se espera de "ordem alfanumérica" — e não a ordem crua de caracteres. */
  function cmpTexto(a, b) {
    a = str(a).trim(); b = str(b).trim();
    if (!a && !b) return 0;
    if (!a) return 1;            /* sem valor vai para o fim */
    if (!b) return -1;
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function indiceStatus(n) {
    var id = statusInfo(n.status).id;
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return i;
    return 0;
  }

  /** Itens da aba na ordem escolhida. Devolve um vetor novo; não mexe no projeto. */
  function ordenar(project, kind) {
    var lista = (project && project[itemsKey(kind)]) || [];
    var modo = ordemInfo(project && project.ordem).id;
    if (modo === 'manual') return lista.slice();

    var pos = {};
    lista.forEach(function (n, i) { pos[n.id] = i; });   /* desempate estável */
    return lista.slice().sort(function (a, b) {
      var r = 0;
      if (modo === 'numero')       r = cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'sistema') r = cmpTexto(a.systems, b.systems) || cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'funcao')  r = cmpTexto(a.func, b.func) || cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'situacao') r = (indiceStatus(a) - indiceStatus(b)) || cmpTexto(a.ncrId, b.ncrId);
      return r || (pos[a.id] - pos[b.id]);
    });
  }

  /* --- banco compartilhado numa pasta ------------------------------------ */

  /**
   * Marco normalizado. Só o campo marco vale: "name" nasce "Novo relatório"
   * para todos, e dois relatórios ainda sem marco não são o mesmo trabalho.
   */
  function marcoChave(p) {
    return str(p && p.marco).trim().toUpperCase().replace(/\s+/g, ' ');
  }

  var MAX_LAPIDES = 500;

  /**
   * Registra que um item foi excluído, para a exclusão alcançar os outros.
   *
   * A lápide precisa ser mais recente do que a versão que se está excluindo —
   * senão o item ressuscita na próxima sincronização. Como o relógio de cada
   * máquina pode estar adiantado, não basta usar a hora daqui: tomamos o
   * maior entre agora e a hora da versão excluída, mais um instante.
   */
  /** Um instante garantidamente posterior a `quando`, mesmo com relógio adiantado. */
  function depoisDe(quando) {
    var agora = nowIso();
    var outro = str(quando);
    if (outro && outro >= agora) {
      var t = new Date(outro).getTime();
      if (!isNaN(t)) return new Date(t + 1000).toISOString();
    }
    return agora;
  }

  function tombstone(project, kind, item) {
    var agora = depoisDe(item.editedAt);
    project.deleted = (project.deleted || []).filter(function (t) { return t.id !== item.id; });
    project.deleted.push({
      id: item.id,
      kind: kind === 'dev' ? 'dev' : 'ncr',
      ncrId: str(item.ncrId),
      at: agora,
      by: getUser()
    });
    if (project.deleted.length > MAX_LAPIDES) {
      project.deleted = project.deleted
        .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); })
        .slice(-MAX_LAPIDES);
    }
  }

  function maisRecente(a, b) { return String(a || '') >= String(b || '') ? String(a || '') : String(b || ''); }

  /**
   * Junta dois retratos do MESMO relatório pela regra "vale quem editou por
   * último", item a item, respeitando as lápides.
   *
   * Por que aqui não há tela de conflito, ao contrário da importação manual
   * de arquivo: num banco compartilhado a gravação acontece sozinha, e
   * ninguém pode ficar parado esperando outra pessoa decidir. A rede de
   * proteção é o histórico automático da pasta, que guarda cada versão.
   *
   * A regra converge: mesmo que duas gravações simultâneas se atropelem, a
   * próxima sincronização de cada lado traz de volta o que faltava, porque
   * cada um ainda tem os seus itens com a sua hora de edição.
   *
   * Altera `local` no lugar e devolve o que mudou aqui.
   */
  function mergeLWW(local, remoto) {
    var res = { entraram: 0, atualizados: 0, removidos: 0 };

    /* a lápide mais recente de cada item, vinda de qualquer um dos lados */
    var lapides = {};
    [local, remoto].forEach(function (p) {
      (p.deleted || []).forEach(function (t) {
        var atual = lapides[t.id];
        if (!atual || String(t.at) > String(atual.at)) lapides[t.id] = t;
      });
    });

    ['ncrs', 'devs'].forEach(function (key) {
      var meus = {}, deles = {}, ordem = [], vistos = {};
      (local[key] || []).forEach(function (n) { meus[n.id] = n; });
      (remoto[key] || []).forEach(function (n) { deles[n.id] = n; });
      /* a ordem das páginas do PDF é a daqui; o que só existe lá entra no fim */
      (local[key] || []).forEach(function (n) { if (!vistos[n.id]) { vistos[n.id] = 1; ordem.push(n.id); } });
      (remoto[key] || []).forEach(function (n) { if (!vistos[n.id]) { vistos[n.id] = 1; ordem.push(n.id); } });

      var saida = [];
      ordem.forEach(function (id) {
        var meu = meus[id], dele = deles[id];
        var lapide = lapides[id];
        var editado = maisRecente(meu && meu.editedAt, dele && dele.editedAt);

        /* excluído, e ninguém o editou depois disso */
        if (lapide && String(lapide.at) >= editado) {
          if (meu) res.removidos++;
          return;
        }
        if (meu && dele) {
          var novo = String(dele.editedAt || '') > String(meu.editedAt || '');
          if (novo && signature(meu) !== signature(dele)) res.atualizados++;
          saida.push(novo ? normalizeNcr(dele) : meu);
        } else if (dele) {
          res.entraram++;
          saida.push(normalizeNcr(dele));
        } else {
          saida.push(meu);
        }
      });
      local[key] = saida;
    });

    /* Textos de capa e rodapé não têm hora própria: segue o retrato do
       relatório que foi gravado por último. */
    if (String(remoto.updatedAt || '') > String(local.updatedAt || '')) {
      ['marco', 'marcoDev', 'coverTitle', 'coverTitleDev', 'coverSubtitle'].forEach(function (k) {
        if (str(remoto[k])) local[k] = str(remoto[k]);
      });
      if (typeof remoto.footer === 'string') local.footer = remoto.footer;
      if (typeof remoto.showCoverDate === 'boolean') local.showCoverDate = remoto.showCoverDate;
      if (str(remoto.ordem)) local.ordem = ordemInfo(remoto.ordem).id;
      if (str(remoto.lastBackupBy)) {
        local.lastBackupBy = str(remoto.lastBackupBy);
        local.lastBackupAt = str(remoto.lastBackupAt);
      }
    }
    if (!str(local.marco) && str(remoto.marco)) local.marco = str(remoto.marco);
    if (!str(local.name) || local.name === 'Novo relatório') local.name = str(local.marco) || local.name;

    local.deleted = Object.keys(lapides).map(function (k) { return lapides[k]; });

    /* o histórico de sessões é união: cada um viu uma parte do trabalho */
    var minhas = {};
    (local.sessions || []).forEach(function (x) { minhas[x.id] = x; });
    (remoto.sessions || []).forEach(function (x) {
      if (!minhas[x.id]) local.sessions.push(normalizeSession(x));
      else if (String(x.endedAt) > String(minhas[x.id].endedAt)) {
        minhas[x.id].endedAt = str(x.endedAt);
        minhas[x.id].changes = normalizeSession(x).changes;
      }
    });
    local.sessions.sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });
    if (local.sessions.length > MAX_SESSIONS) local.sessions = local.sessions.slice(-MAX_SESSIONS);

    return res;
  }

  /**
   * Traz de volta os itens de um retrato antigo que não existem mais aqui.
   *
   * Não é o mesmo que mesclar: uma versão do histórico é sempre mais velha do
   * que a lápide que apagou o item, então pela regra normal ela seria
   * descartada — e "restaurar" nunca restauraria nada. Aqui a volta é
   * registrada como uma edição de quem restaurou, o que é verdade e é o que
   * faz o item sobreviver também no computador dos outros.
   *
   * Só ressuscita o que sumiu. O que existe hoje não é tocado: restaurar
   * nunca desfaz o trabalho de ninguém.
   */
  function reviver(locais, retrato) {
    var res = { voltaram: 0, relatorios: 0 };
    var quem = getUser();
    var porId = {}, porMarco = {};
    locais.forEach(function (p) {
      porId[p.id] = p;
      var k = marcoChave(p);
      if (k && !porMarco[k]) porMarco[k] = p;
    });

    (retrato || []).forEach(function (r) {
      var k = marcoChave(r);
      var alvo = porId[r.id] || (k ? porMarco[k] : null);
      if (!alvo) {
        var novo = normalizeProject(r);
        locais.push(novo);
        res.relatorios++;
        res.voltaram += novo.ncrs.length + novo.devs.length;
        return;
      }
      ['ncrs', 'devs'].forEach(function (key) {
        var tem = {};
        (alvo[key] || []).forEach(function (n) { tem[n.id] = true; });
        (r[key] || []).forEach(function (n) {
          if (!n || !n.id || tem[n.id]) return;
          var copia = normalizeNcr(n);
          var lapide = (alvo.deleted || []).filter(function (t) { return t.id === copia.id; })[0];
          copia.editedAt = depoisDe(lapide && lapide.at);
          copia.editedBy = quem || copia.editedBy;
          copia.syncBase = '';
          alvo[key].push(copia);
          alvo.deleted = (alvo.deleted || []).filter(function (t) { return t.id !== copia.id; });
          res.voltaram++;
        });
      });
    });
    return res;
  }

  /**
   * Junta a lista inteira: cada relatório recebido é casado com o daqui pelo
   * identificador e, na falta, pelo marco. Devolve a lista resultante e um
   * resumo do que mudou deste lado.
   */
  function mergeListas(locais, recebidos) {
    var res = { entraram: 0, atualizados: 0, removidos: 0, novosRelatorios: 0 };
    var porId = {}, porMarco = {};
    locais.forEach(function (p) {
      porId[p.id] = p;
      var k = marcoChave(p);
      if (k && !porMarco[k]) porMarco[k] = p;
    });

    (recebidos || []).forEach(function (r) {
      var k = marcoChave(r);
      var alvo = porId[r.id] || (k ? porMarco[k] : null);
      if (!alvo) {
        var novo = normalizeProject(r);
        locais.push(novo);
        porId[novo.id] = novo;
        if (marcoChave(novo)) porMarco[marcoChave(novo)] = novo;
        res.novosRelatorios++;
        res.entraram += novo.ncrs.length + novo.devs.length;
        return;
      }
      var um = mergeLWW(alvo, normalizeProject(r));
      res.entraram += um.entraram;
      res.atualizados += um.atualizados;
      res.removidos += um.removidos;
    });
    return res;
  }

  /* --- IndexedDB -------------------------------------------------------- */

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
        /* guarda o "crachá" da pasta compartilhada, que não é um caminho de
           texto e sim um objeto que só o navegador sabe interpretar */
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Falha ao abrir o banco local')); };
    });
    return dbPromise;
  }

  function idbAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(project) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(project);
        tx.oncomplete = function () { resolve(project); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Gravação abortada')); };
      });
    });
  }

  function idbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* --- crachá da pasta compartilhada -------------------------------------- */

  /* O handle não é um caminho: é um objeto que o navegador serializa e só ele
     sabe reabrir. Por isso vive no IndexedDB e não no localStorage. */
  var HANDLE_STORE = 'handles';

  function putHandle(handle) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).put(handle, 'pasta');
        tx.oncomplete = function () { resolve(handle); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get('pasta');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function clearHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).delete('pasta');
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* sem pasta guardada */ });
  }

  /* --- retrato antes da mesclagem ---------------------------------------- */

  var SNAP_STORE = 'snapshots';

  /* Guarda o estado anterior à mesclagem, para que uma escolha errada possa
     ser desfeita. Só o último é mantido. */
  function saveSnapshot(projects, info) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(SNAP_STORE, 'readwrite');
        tx.objectStore(SNAP_STORE).put({
          id: 'last',
          at: nowIso(),
          info: info || '',
          projects: JSON.parse(JSON.stringify(projects))
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function (e) { console.warn('Não foi possível guardar o retrato.', e); });
  }

  function getSnapshot() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(SNAP_STORE, 'readonly').objectStore(SNAP_STORE).get('last');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function clearSnapshot() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(SNAP_STORE, 'readwrite');
        tx.objectStore(SNAP_STORE).delete('last');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () { /* sem retrato: nada a limpar */ });
  }

  /* --- localStorage (reserva) ------------------------------------------- */

  function lsAll() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function lsWriteAll(list) {
    global.localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function lsPut(project) {
    var list = lsAll().filter(function (p) { return p.id !== project.id; });
    list.push(project);
    lsWriteAll(list);
    return Promise.resolve(project);
  }

  function lsDelete(id) {
    lsWriteAll(lsAll().filter(function (p) { return p.id !== id; }));
    return Promise.resolve();
  }

  /* --- quem está usando este navegador ---------------------------------- */

  /* Não há login: o nome é digitado uma vez e fica guardado no navegador,
     só para registrar quem editou e quem gerou cada backup. */
  function getUser() {
    try { return global.localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; }
  }

  function setUser(name) {
    try { global.localStorage.setItem(USER_KEY, str(name).trim()); } catch (e) { /* ignora */ }
  }

  /* Caminho da pasta onde os backups devem ser guardados. Fica no navegador,
     como o nome: serve só para o lembrete depois de cada backup. */
  function getFolder() {
    try { return global.localStorage.getItem(FOLDER_KEY) || ''; } catch (e) { return ''; }
  }

  function setFolder(caminho) {
    try { global.localStorage.setItem(FOLDER_KEY, str(caminho).trim()); } catch (e) { /* ignora */ }
  }

  function getLastBackupAt() {
    try { return global.localStorage.getItem(BACKUP_KEY) || ''; } catch (e) { return ''; }
  }

  function setLastBackupAt(iso) {
    try { global.localStorage.setItem(BACKUP_KEY, iso); } catch (e) { /* ignora */ }
  }

  /* --- API pública ------------------------------------------------------ */

  var useIdb = true;

  function fallback(err) {
    useIdb = false;
    console.warn('IndexedDB indisponível, usando localStorage.', err);
  }

  var Store = {
    SCHEMA: SCHEMA,
    uid: uid,
    nowIso: nowIso,
    newProject: newProject,
    newNcr: newNcr,
    STATUS: STATUS,
    STATUS_CONCLUIDO: STATUS_CONCLUIDO,
    statusInfo: statusInfo,
    ORDENS: ORDENS,
    ordemInfo: ordemInfo,
    ordenar: ordenar,
    cmpTexto: cmpTexto,
    setStatus: setStatus,
    itemsKey: itemsKey,
    newEvidence: newEvidence,
    normalizeProject: normalizeProject,
    normalizeNcr: normalizeNcr,

    list: function () {
      var read = useIdb ? idbAll().catch(function (e) { fallback(e); return lsAll(); }) : Promise.resolve(lsAll());
      return read.then(function (rows) {
        return rows.map(normalizeProject).sort(function (a, b) {
          return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
      });
    },

    getUser: getUser,
    getFolder: getFolder,
    setFolder: setFolder,
    setUser: setUser,
    MAX_SESSIONS: MAX_SESSIONS,
    signature: signature,
    diffProject: diffProject,
    numeroChave: numeroChave,
    reviver: reviver,
    marcoChave: marcoChave,
    tombstone: tombstone,
    mergeLWW: mergeLWW,
    mergeListas: mergeListas,
    putHandle: putHandle,
    getHandle: getHandle,
    clearHandle: clearHandle,
    saveSnapshot: saveSnapshot,
    getSnapshot: getSnapshot,
    clearSnapshot: clearSnapshot,

    /**
     * Anota, na sessão corrente do projeto, que um item foi criado, editado
     * ou excluído. Uma anotação por item: repetir só atualiza o rótulo.
     */
    logChange: function (project, sessionId, kind, item, action) {
      if (!project.sessions) project.sessions = [];
      var sess = project.sessions.filter(function (x) { return x.id === sessionId; })[0];
      if (!sess) {
        sess = { id: sessionId, user: getUser(), startedAt: nowIso(), endedAt: '', changes: [] };
        project.sessions.push(sess);
        if (project.sessions.length > MAX_SESSIONS) {
          project.sessions = project.sessions.slice(-MAX_SESSIONS);
        }
      }
      sess.user = getUser() || sess.user;
      sess.endedAt = nowIso();

      var label = (item.ncrId || '').trim() || '(sem número)';
      var found = sess.changes.filter(function (c) { return c.itemId === item.id; })[0];
      if (found) {
        found.label = label;
        /* criar e depois editar continua sendo "criou"; excluir vence tudo */
        if (action === 'excluiu') found.action = 'excluiu';
      } else {
        sess.changes.push({ itemId: item.id, kind: kind, label: label, action: action });
      }

      if (action !== 'excluiu') {
        item.editedBy = getUser();
        item.editedAt = sess.endedAt;
      }
      return sess;
    },

    getLastBackupAt: getLastBackupAt,
    setLastBackupAt: setLastBackupAt,

    save: function (project) {
      project.updatedAt = nowIso();
      var who = getUser();
      if (who) { project.lastEditedBy = who; }
      project.lastEditedAt = project.updatedAt;
      var copy = JSON.parse(JSON.stringify(project));
      if (!useIdb) return lsPut(copy);
      return idbPut(copy).catch(function (e) { fallback(e); return lsPut(copy); });
    },

    remove: function (id) {
      if (!useIdb) return lsDelete(id);
      return idbDelete(id).catch(function (e) { fallback(e); return lsDelete(id); });
    },

    /* Backup: um arquivo .json com um ou vários relatórios. */
    toBackup: function (projects) {
      var who = getUser();
      var when = nowIso();
      return {
        format: 'derrogacao-waiver-backup',
        schema: SCHEMA,
        exportedAt: when,
        exportedBy: who,
        projects: projects.map(function (p) {
          p.lastBackupBy = who;
          p.lastBackupAt = when;
          /* o que sai no arquivo passa a ser a base comum da próxima mesclagem */
          ['ncrs', 'devs'].forEach(function (k) {
            (p[k] || []).forEach(function (n) { n.syncBase = n.editedAt; });
          });
          return JSON.parse(JSON.stringify(p));
        })
      };
    },

    fromBackup: function (data) {
      if (!data || typeof data !== 'object') throw new Error('Arquivo inválido.');
      var list;
      if (Array.isArray(data.projects)) list = data.projects;
      else if (Array.isArray(data)) list = data;
      else if (data.ncrs) list = [data];
      else throw new Error('O arquivo não contém relatórios reconhecíveis.');
      if (!list.length) throw new Error('O arquivo não contém relatórios.');
      return list.map(normalizeProject);
    }
  };

  global.Store = Store;
})(window);
