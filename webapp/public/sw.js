/**
 * Service Worker: Cache First для статики того же origin.
 * /api/ не кэшируется. Версионирование кэша — при обновлении приложения старый кэш удаляется.
 */
var CACHE_VERSION = '2';
var CACHE_NAME = 'bus-booking-v' + CACHE_VERSION;

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
  var url = event.request.url;
  try {
    var origin = self.location.origin;
    if (url.indexOf(origin) !== 0) return;
    if (url.indexOf('/api/') !== -1) {
      event.respondWith(fetch(event.request));
      return;
    }
  } catch (e) { return; }
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        return response;
      });
    })
  );
});
