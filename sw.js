const CACHE_NAME = 'zgedit-static-v15';
const CORE_ASSETS = [
  './',
  './index.html',
  './landing.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/themes.js',
  './js/wechat-renderer.js',
  './js/app.js',
  './js/channels-decoder.js',
  './js/vendor/wasm_video_decode.js',
  './assets/zgedit-icon.svg',
  './assets/zgedit-workbench.png'
];

const NETWORK_FIRST_ASSETS = new Set([
  '/index.html',
  '/landing.html',
  '/css/main.css',
  '/js/themes.js',
  '/js/wechat-renderer.js',
  '/js/app.js',
  '/js/channels-decoder.js',
  '/js/vendor/wasm_video_decode.js',
  '/manifest.webmanifest',
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === location.origin && NETWORK_FIRST_ASSETS.has(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
