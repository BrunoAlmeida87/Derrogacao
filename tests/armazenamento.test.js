/* Uma falha do IndexedDB não pode derrubar o programa.

   O que o Bruno viu (v022): uma falha qualquer do banco do navegador fazia o
   programa desistir do IndexedDB até recarregar e passar a gravar no
   localStorage, que não comporta os relatórios — QuotaExceededError em toda
   gravação, "salvando…" parado, e a rodada da pasta que nunca terminava
   (`sincronizando` preso). Aqui a conexão "cai" uma vez (como quando o
   navegador a fecha por conta própria) com um relatório de vários MB. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({});
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    const r = await pg.evaluate(async () => {
      const grande = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024);
      const p = Store.normalizeProject({ name: 'Q', marco: 'J88' });
      const n = Store.normalizeNcr({ ncrId: 'NCR-Q' });
      n.evidence = [{ id: 'e1', ref: 'x', images: [{ id: 'imq', src: grande, caption: 'c' }] }];
      p.ncrs = [n];
      await Store.save(p);

      /* a conexão cai: a próxima transação falha com InvalidStateError */
      const orig = IDBDatabase.prototype.transaction;
      let falhas = 1;
      IDBDatabase.prototype.transaction = function () {
        if (falhas > 0) { falhas--; throw new DOMException('The database connection is closing.', 'InvalidStateError'); }
        return orig.apply(this, arguments);
      };
      const out = {};
      n.description = 'depois da queda';
      try { await Store.save(p); out.salvou = true; } catch (e) { out.salvou = false; out.erro = e.name; }
      n.description = 'segunda gravação';
      try { await Store.save(p); out.salvou2 = true; } catch (e) { out.salvou2 = false; out.erro2 = e.name; }
      IDBDatabase.prototype.transaction = orig;
      const lista = await Store.list();
      const q = lista.filter((x) => x.id === p.id)[0];
      out.texto = q && q.ncrs[0].description;
      out.foto = q && q.ncrs[0].evidence[0].images[0].src && q.ncrs[0].evidence[0].images[0].src.length;

      /* o banco falha de vez: a gravação recusa com erro (sem exceção solta) */
      IDBDatabase.prototype.transaction = function () { throw new DOMException('x', 'UnknownError'); };
      let sincrono = false, rejeitou = '';
      try {
        await Store.save(p).catch((e) => { rejeitou = e.name; });
      } catch (e) { sincrono = true; }
      IDBDatabase.prototype.transaction = orig;
      out.sincrono = sincrono; out.rejeitou = rejeitou;
      try { await Store.save(p); out.voltou = true; } catch (e) { out.voltou = false; }
      return out;
    });
    L.ok(r.salvou && r.salvou2, 'depois da conexão cair, as gravações continuam dando certo (' + JSON.stringify(r) + ')');
    L.ok(r.texto === 'segunda gravação', 'o que foi gravado depois da queda está no banco do navegador');
    L.ok(r.foto === 6 * 1024 * 1024 + 22, 'a foto continua inteira');
    L.ok(!r.sincrono && r.rejeitou, 'banco fora do ar: a gravação recusa com erro, sem exceção solta (' + r.rejeitou + ')');
    L.ok(r.voltou, 'o banco voltando, a gravação seguinte volta a usar o IndexedDB');
  } finally {
    const f = L.resultado('falha do banco do navegador', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
