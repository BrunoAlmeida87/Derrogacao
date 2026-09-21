/* ==========================================================================
   sw.js — para o programa abrir sem rede, e para o Edge oferecer a
   instalação como aplicativo.
   --------------------------------------------------------------------------
   A regra é "rede primeiro, cache como reserva": a versão publicada é sempre
   a que vale, e o cache só entra quando a rede não responde. O contrário —
   cache primeiro — já seria aquele problema conhecido de HTML novo com JS
   velho, que o carimbo ?v=<sha> existe justamente para evitar.

   Nada daqui toca nos dados: relatórios ficam no IndexedDB e na pasta da
   rede, que o service worker não enxerga.
   ========================================================================== */

var VERSAO = '3a25d65';               /* trocado pelo SHA na publicação */
var CACHE = 'derrogacao-' + VERSAO;
var ESSENCIAIS = ['./', 'index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ESSENCIAIS); })
      .catch(function () { /* sem rede na instalação: o cache enche no uso */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        return n === CACHE ? null : caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;   /* nunca mexe no que é de fora */

  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request).then(function (r) {
        return r || caches.match('index.html');
      });
    })
  );
});
