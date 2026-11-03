/* ==========================================================================
   tests/pasta-disco.js — a pasta da rede, compartilhada por VÁRIOS navegadores
   --------------------------------------------------------------------------
   A pasta OPFS do lib.js vale para uma pessoa: cada contexto do navegador
   tem a sua, e copiar a de um para a do outro é o caso "um está com a pasta
   velha do outro", não "duas pessoas ao mesmo tempo" (CLAUDE.md §6).

   Aqui a pasta é um diretório de verdade no disco. Cada navegador recebe um
   FileSystemDirectoryHandle de mentira cujas operações vão para o Node
   (`window.__fs`), e o Node lê e grava naquele diretório — o mesmo para
   todos. É assim que três pessoas, cada uma com o seu navegador (o seu
   IndexedDB, o seu localStorage), trabalham na mesma pasta.

   O que o Chrome faz e a mentira imita:
   - getFile() só pega os metadados (tamanho, data); o conteúdo é lido em
     text()/arrayBuffer() — e falha com NotReadableError se o arquivo mudou
     no meio, como no Chrome;
   - a gravação vai para um arquivo ao lado e é renomeada no fim (o .crswap);
   - a data do arquivo sempre anda (o disco dos testes tem resolução de ms, e
     duas gravações no mesmo ms pareceriam uma só).

   Cada operação fica anotada (quem, o quê, qual arquivo, quantos bytes): é o
   que deixa o teste dizer "ninguém regravou nada" em vez de achar.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

/* roda dentro de cada página, antes do programa */
const SHIM = `(function () {
  function erro(nome) { return new DOMException(nome, nome); }
  function b64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function deB64(s) {
    var bin = atob(s), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function paraBytes(d) {
    if (d && d.type === 'write') d = d.data;
    if (typeof d === 'string') return Promise.resolve(new TextEncoder().encode(d));
    if (d instanceof Blob) return d.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    if (d instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(d));
    if (ArrayBuffer.isView(d)) return Promise.resolve(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
    return Promise.reject(new Error('tipo de escrita desconhecido'));
  }
  function arquivo(caminho, nome) {
    return {
      kind: 'file', name: nome, __c: caminho,
      isSameEntry: function (o) { return Promise.resolve(!!o && o.__c === caminho); },
      getFile: function () {
        return window.__fs('stat', caminho).then(function (s) {
          if (!s || s.dir) throw erro('NotFoundError');
          function ler() {
            return window.__fs('read', caminho).then(function (r) {
              if (!r) throw erro('NotFoundError');
              if (r.mtime !== s.mtime) throw erro('NotReadableError');
              return deB64(r.b64);
            });
          }
          return { name: nome, lastModified: s.mtime, size: s.size, type: '',
            text: function () { return ler().then(function (u) { return new TextDecoder().decode(u); }); },
            arrayBuffer: function () {
              return ler().then(function (u) { return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); });
            },
            /* um pedaço (o programa lê só o fim, para saber se o arquivo é o dele) */
            slice: function (ini, fim) {
              return { text: function () {
                return ler().then(function (u) { return new TextDecoder().decode(u.subarray(ini || 0, fim == null ? u.length : fim)); });
              } };
            } };
        });
      },
      createWritable: function () {
        var partes = [];
        return Promise.resolve({
          write: function (d) { return paraBytes(d).then(function (u) { partes.push(u); }); },
          close: function () {
            var tot = partes.reduce(function (a, p) { return a + p.length; }, 0);
            var u = new Uint8Array(tot), o = 0;
            partes.forEach(function (p) { u.set(p, o); o += p.length; });
            return window.__fs('write', caminho, b64(u)).then(function () {});
          },
          abort: function () { return Promise.resolve(); }
        });
      }
    };
  }
  function pasta(caminho, nome) {
    function filho(e) {
      var c = caminho + '/' + e.nome;
      return e.dir ? pasta(c, e.nome) : arquivo(c, e.nome);
    }
    function iterar(f) {
      var lista = null, i = 0;
      var it = {
        next: function () {
          var p = lista ? Promise.resolve(lista)
            : window.__fs('list', caminho).then(function (l) { lista = l || []; return lista; });
          return p.then(function (l) {
            return i < l.length ? { done: false, value: f(l[i++]) } : { done: true, value: undefined };
          });
        }
      };
      it[Symbol.asyncIterator] = function () { return it; };
      return it;
    }
    return {
      kind: 'directory', name: nome, __c: caminho,
      isSameEntry: function (o) { return Promise.resolve(!!o && o.__c === caminho); },
      queryPermission: function () { return Promise.resolve('granted'); },
      requestPermission: function () { return Promise.resolve('granted'); },
      getFileHandle: function (n, o) {
        var c = caminho + '/' + n;
        return window.__fs('stat', c).then(function (s) {
          if (s && s.dir) throw erro('TypeMismatchError');
          if (s) return arquivo(c, n);
          if (!(o && o.create)) throw erro('NotFoundError');
          return window.__fs('write', c, '').then(function () { return arquivo(c, n); });
        });
      },
      getDirectoryHandle: function (n, o) {
        var c = caminho + '/' + n;
        return window.__fs('stat', c).then(function (s) {
          if (s && !s.dir) throw erro('TypeMismatchError');
          if (s) return pasta(c, n);
          if (!(o && o.create)) throw erro('NotFoundError');
          return window.__fs('mkdir', c).then(function () { return pasta(c, n); });
        });
      },
      removeEntry: function (n) { return window.__fs('rm', caminho + '/' + n).then(function () {}); },
      keys: function () { return iterar(function (e) { return e.nome; }); },
      values: function () { return iterar(filho); },
      entries: function () { return iterar(function (e) { return [e.nome, filho(e)]; }); }
    };
  }
  window.showDirectoryPicker = function () { return Promise.resolve(pasta('', 'Derrogacao')); };
  /* o crachá de mentira não cabe no IndexedDB (não é clonável): não guarda */
  var s = null;
  Object.defineProperty(window, 'Store', { configurable: true,
    get: function () { return s; },
    set: function (v) { if (v) v.putHandle = function () { return Promise.resolve(); }; s = v; } });
})();`;

function dorme(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

/**
 * Cria (vazia) a pasta em `dir`. `opts.lat`: atraso por operação, em ms.
 * Devolve o controle: ligar um contexto, ler o que foi feito, mexer na
 * pasta por fora (como uma quarta pessoa).
 */
function criar(dir, opts) {
  opts = opts || {};
  const lat = opts.lat == null ? 3 : opts.lat;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ops = [];
  const ultimaData = {};

  function alvo(c) { return path.join(dir, c || ''); }

  /* a data do arquivo sempre anda, mesmo com duas gravações no mesmo ms */
  function carimbar(arq) {
    const s = fs.statSync(arq);
    let m = Math.floor(s.mtimeMs);
    if (ultimaData[arq] != null && m <= ultimaData[arq]) {
      m = ultimaData[arq] + 1;
      fs.utimesSync(arq, s.atime, new Date(m));
    }
    ultimaData[arq] = m;
  }

  async function fazer(quem, op, c, data) {
    const a = alvo(c);
    let bytes = 0, res = null;
    if (op === 'stat') {
      try {
        const s = fs.statSync(a);
        res = { dir: s.isDirectory(), mtime: Math.floor(s.mtimeMs), size: s.size };
      } catch (e) { res = null; }
    } else if (op === 'read') {
      try {
        const b = fs.readFileSync(a);
        bytes = b.length;
        res = { b64: b.toString('base64'), mtime: Math.floor(fs.statSync(a).mtimeMs) };
      } catch (e) { res = null; }
    } else if (op === 'write') {
      const b = Buffer.from(data || '', 'base64');
      bytes = b.length;
      fs.writeFileSync(a + '.crswap', b);
      fs.renameSync(a + '.crswap', a);
      carimbar(a);
      res = true;
    } else if (op === 'mkdir') {
      fs.mkdirSync(a, { recursive: true });
      res = true;
    } else if (op === 'list') {
      try {
        res = fs.readdirSync(a, { withFileTypes: true })
          .filter(function (d) { return !/\.crswap$/.test(d.name); })
          .map(function (d) { return { nome: d.name, dir: d.isDirectory() }; });
      } catch (e) { res = []; }
    } else if (op === 'rm') {
      try { fs.rmSync(a, { recursive: true, force: true }); } catch (e) { /* já foi */ }
      res = true;
    }
    if (lat) await dorme(lat);
    ops.push({ t: Date.now(), quem: quem, op: op, arq: String(c || '').replace(/^\//, ''), bytes: bytes });
    return res;
  }

  return {
    dir: dir,
    ops: ops,
    /** Liga um contexto do navegador à pasta, como `quem`. */
    ligar: async function (contexto, quem) {
      await contexto.exposeFunction('__fs', function (op, c, d) { return fazer(quem, op, c, d); });
      await contexto.addInitScript(SHIM);
    },
    /** Marca o ponto de agora; `desde(marca)` devolve o que veio depois. */
    marca: function () { return ops.length; },
    desde: function (m) { return ops.slice(m); },
    /** Operações que leram ou gravaram `arq` (texto ou RegExp), por pessoa. */
    contar: function (lista, op, arq, quem) {
      return lista.filter(function (o) {
        return o.op === op && (!quem || o.quem === quem) &&
          (!arq || (arq instanceof RegExp ? arq.test(o.arq) : o.arq === arq));
      }).length;
    },
    /** Espera `ms` sem nenhuma leitura nem gravação (as conferências de data não contam). */
    calma: async function (ms, limite) {
      const ate = Date.now() + (limite || 60000);
      while (Date.now() < ate) {
        const ult = ops.filter(function (o) { return o.op !== 'stat' && o.op !== 'list'; }).pop();
        if (!ult || Date.now() - ult.t >= ms) return true;
        await dorme(200);
      }
      return false;
    },
    ler: function (arq) {
      try { return fs.readFileSync(alvo(arq), 'utf8'); } catch (e) { return null; }
    },
    /** Grava por fora — uma quarta pessoa, ou uma cópia atrasada. */
    gravar: function (arq, texto) {
      const a = alvo(arq);
      fs.mkdirSync(path.dirname(a), { recursive: true });
      fs.writeFileSync(a + '.crswap', texto);
      fs.renameSync(a + '.crswap', a);
      carimbar(a);
    },
    listar: function (sub) {
      try { return fs.readdirSync(alvo(sub)).filter(function (n) { return !/\.crswap$/.test(n); }); } catch (e) { return []; }
    },
    /** Muda a data de um arquivo (para fingir uma imagem velha). */
    envelhecer: function (arq, dias) {
      const a = alvo(arq);
      const t = new Date(Date.now() - dias * 86400000);
      fs.utimesSync(a, t, t);
      ultimaData[a] = t.getTime();
    }
  };
}

module.exports = { criar: criar, SHIM: SHIM };
