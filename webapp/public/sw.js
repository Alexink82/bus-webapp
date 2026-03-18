/**
 * Service Worker:
 * - /api/ никогда не кэшируется;
 * - HTML и navigation идут network-first, чтобы после деплоя не оставался старый UI;
 * - статические ассеты same-origin можно брать из кэша с догрузкой из сети.
 */
var CACHE_VERSION = '3';
var CACHE_NAME = 'bus-booking-v' + CACHE_VERSION;

function isSameOrigin(url) {
  try {
    return url.indexOf(self.location.origin) === 0;
  } catch (e) {
    return false;
  }
}

function isApiRequest(url) {
  return url.indexOf('/api/') !== -1;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

function isHtmlRequest(request) {
  var accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  var clone = response.clone();
  caches.open(CACHE_NAME).then(function(cache) {
    cache.put(request, clone);
  });
  return response;
}

function networkFirst(request) {
  return fetch(request).then(function(response) {
    return cachePut(request, response);
  }).catch(function() {
    return caches.match(request);
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      return cachePut(request, response);
    });
  });
}

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name.indexOf('bus-booking-') === 0 && name !== CACHE_NAME; }).map(function(name) { return caches.delete(name); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = event.request.url;
  if (!isSameOrigin(url)) return;
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (isNavigationRequest(event.request) || isHtmlRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});
