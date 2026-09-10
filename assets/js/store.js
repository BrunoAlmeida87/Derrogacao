/* ==========================================================================
   store.js — modelo de dados e persistência local
   Guarda os relatórios no IndexedDB do navegador (cai para localStorage se
   o IndexedDB não estiver disponível). Nada sai do computador do usuário.
   ========================================================================== */

(function (global) {
  'use strict';

  var USER_KEY = 'derrogacao:user';
  var BACKUP_KEY = 'derrogacao:lastBackupAt';
  var DB_NAME = 'derrogacao';
  var DB_VERSION = 1;
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
      done: false            // marcado pelo botão "Concluir" — só organiza o trabalho
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
      ncrs: [],
      devs: [],
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
      done: raw.done === true
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
      ncrs: Array.isArray(raw.ncrs) ? raw.ncrs.map(normalizeNcr) : [],
      devs: Array.isArray(raw.devs) ? raw.devs.map(normalizeNcr) : [],
      createdAt: str(raw.createdAt) || base.createdAt,
      updatedAt: str(raw.updatedAt) || base.updatedAt
    };
  }

  /* Nome da lista de itens de cada aba, dentro do projeto. */
  function itemsKey(kind) { return kind === 'dev' ? 'devs' : 'ncrs'; }

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
