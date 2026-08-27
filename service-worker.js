const CACHE_NAME = 'ca-solutions-v8-task12';
const APP_SHELL = ['./', './manifest.webmanifest', './wingman-client.js', './security-repair.js', './security-repair-v2.js', './firebase-task12.js'];

async function appShellResponse(request) {
  const response = await fetch(request);
  if (!response || !response.ok) return response;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  const source = await response.text();
  let injected = source;
  const tags = [
    '<script src="/wingman-client.js"></script>',
    '<script src="/security-repair.js"></script>',
    '<script src="/security-repair-v2.js"></script>',
    '<script src="/firebase-task12.js"></script>'
  ];
  for (const tag of tags) {
    if (!injected.includes(tag)) injected = injected.replace('</body>', tag + '\n</body>');
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(injected, {status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const indexResponse = await appShellResponse(new Request('./index.html'));
      if (indexResponse && indexResponse.ok) await cache.put('./index.html', indexResponse.clone());
      await Promise.all(APP_SHELL.map(async url => {
        try { const response = await fetch(url); if (response.ok) await cache.put(url, response.clone()); } catch {}
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (url.pathname === '/' || url.pathname.endsWith('/index.html'))
      ? appShellResponse(request).then(response => {
          if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
      : fetch(request).then(response => {
          if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});
