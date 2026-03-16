/**
 * Предзагрузка страниц вкладок меню для быстрого переключения.
 * После загрузки страницы подгружаем остальные вкладки в кэш браузера.
 */
(function() {
  function run() {
    if (typeof window.isEconomyMode === 'function' && window.isEconomyMode()) return;
    var tabBar = document.getElementById('tabBar');
    if (!tabBar) return;
    var currentPath = window.location.pathname.replace(/\/$/, '') || '/index.html';
    var links = tabBar.querySelectorAll('a.tab[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || href.indexOf('://') !== -1) continue;
      try {
        var url = new URL(href, window.location.href).href;
        if (url === window.location.href.split('?')[0]) continue;
      } catch (e) { continue; }
      var existing = document.querySelector('link[rel="prefetch"][href="' + url + '"]');
      if (existing) continue;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
