/* Imagens à parte no IndexedDB: o registro do relatório leva só o texto
   (o autossalvamento não regrava megabytes), as fotos moram em `img:<id>`
   e voltam inteiras ao listar; foto que não mudou não é gravada de novo. */
'use strict';
const L = require('./lib');

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({});
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    const r = await pg.evaluate(async () => {
      const grande = 'data:image/png;base64,' + 'A'.repeat(300000);
      const p = Store.normalizeProject({ name: 'IMG', marco: 'J77' });
      const n = Store.normalizeNcr({ ncrId: 'NCR-IMG' });
      n.evidence = [{ id: 'e1', ref: 'x', images: [{ id: 'im1', src: grande, caption: 'c' }] }];
      p.ncrs = [n];
      await Store.save(p);
      const cru = await new Promise((ok) => {
        const rq = indexedDB.open('derrogacao');
        rq.onsuccess = () => {
          const db = rq.result;
          const t = db.transaction(['projects', 'snapshots'], 'readonly');
          const a = t.objectStore('projects').get(p.id), b = t.objectStore('snapshots').get('img:im1');
          t.oncomplete = () => ok({ proj: JSON.stringify(a.result), img: b.result && b.result.src.length });
        };
      });
      const lista = await Store.list();
      const q = lista.filter((x) => x.id === p.id)[0];
      const im = q.ncrs[0].evidence[0].images[0];
      return { leve: cru.proj.length, tem: cru.proj.indexOf('AAAA') >= 0, img: cru.img, volta: im.src.length, cap: im.caption };
    });
    L.ok(r.leve < 5000 && !r.tem, 'o registro do relatório não carrega a foto (' + r.leve + ' caracteres)');
    L.ok(r.img === 300022, 'a foto está no próprio registro img:<id>');
    L.ok(r.volta === 300022 && r.cap === 'c', 'ao listar, a foto volta inteira ao item');
  } finally {
    const f = L.resultado('imagens à parte no IndexedDB', s.erros);
    await s.navegador.close(); srv.fechar();
    process.exitCode = f ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(1); });
