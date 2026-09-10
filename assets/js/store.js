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
  var DB_NAME = 'derrogacao';
  var DB_VERSION = 2;
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
      ncrs: [],
      devs: [],
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
      ncrs: Array.isArray(raw.ncrs) ? raw.ncrs.map(normalizeNcr) : [],
      devs: Array.isArray(raw.devs) ? raw.devs.map(normalizeNcr) : [],
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
  function diffProject(local, incoming, kind) {
    var key = itemsKey(kind);
    var mine = local ? local[key] : [];
    var theirs = incoming[key] || [];
    var byId = {};
    mine.forEach(function (n) { byId[n.id] = n; });
    var seen = {};

    var out = { novos: [], atualizados: [], conflitos: [], removidos: [], iguais: 0 };

    theirs.forEach(function (t) {
      seen[t.id] = true;
      var m = byId[t.id];
      if (!m) { out.novos.push({ kind: kind, incoming: t }); return; }
      if (signature(m) === signature(t)) { out.iguais++; return; }

      var euMudei = m.editedAt !== m.syncBase;
      var eleMudou = t.editedAt !== m.syncBase;
      var entry = { kind: kind, mine: m, incoming: t };

      if (!euMudei && eleMudou) out.atualizados.push(entry);
      else if (euMudei && !eleMudou) { /* só eu mexi: o meu permanece */ }
      else out.conflitos.push(entry);
    });

    /* Presente aqui e ausente no arquivo: se já foi sincronizado antes, o
       outro lado provavelmente o excluiu. Nunca apagamos sozinhos. */
    mine.forEach(function (m) {
      if (!seen[m.id] && m.syncBase) out.removidos.push({ kind: kind, mine: m });
    });

    return out;
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
    setUser: setUser,
    MAX_SESSIONS: MAX_SESSIONS,
    signature: signature,
    diffProject: diffProject,
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
