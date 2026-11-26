// Guarda somente o aviso de "sem conexão". Dados, API e telas do app sempre vêm do servidor.
self.addEventListener('install', e => { e.waitUntil(caches.open('offline-v1').then(c => c.add('/sem-conexao.html'))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate' && !new URL(e.request.url).pathname.startsWith('/api'))
    e.respondWith(fetch(e.request).catch(() => caches.match('/sem-conexao.html')));
});
