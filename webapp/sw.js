const CACHE_NAME = 'bus-booking-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/booking.html',
  '/success.html',
  '/profile.html',
  '/faq.html',
  '/dispatcher.html',
  '/admin.html',
  '/css/main.css',
  '/css/booking.css',
  '/css/dispatcher.css',
  '/css/telegram-theme.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/booking.js',
  '/js/profile.js',
  '/js/dispatcher.js',
  '/js/i18n.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
