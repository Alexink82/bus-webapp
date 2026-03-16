/**
 * Сбор Core Web Vitals (LCP, FID, CLS) для пользовательских страниц.
 * Логирует в console; если задан window.__WEB_VITALS_BEACON_URL — отправляет sendBeacon.
 */
(function() {
  if (typeof window === 'undefined' || !window.performance || !window.PerformanceObserver) return;

  var reported = { lcp: false, fid: false, cls: false };
  var clsValue = 0;

  function send(name, value, id, delta) {
    var payload = { name: name, value: value, id: id, delta: delta, page: window.location.pathname || '/' };
    if (typeof console !== 'undefined' && console.log) console.log('[Web Vitals]', payload);
    var url = typeof window.__WEB_VITALS_BEACON_URL === 'string' ? window.__WEB_VITALS_BEACON_URL : '';
    if (url) {
      try {
        navigator.sendBeacon(url, JSON.stringify(payload));
      } catch (e) {}
    }
  }

  try {
    var lcpObserver = new PerformanceObserver(function(list) {
      var entries = list.getEntries();
      if (entries.length && !reported.lcp) {
        var last = entries[entries.length - 1];
        reported.lcp = true;
        send('LCP', last.startTime, last.id, last.startTime);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  try {
    var fidObserver = new PerformanceObserver(function(list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if (e.processingStart > 0 && !reported.fid) {
          reported.fid = true;
          var delay = e.processingStart - e.startTime;
          send('FID', delay, e.name, delay);
          break;
        }
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch (e) {}

  try {
    var clsObserver = new PerformanceObserver(function(list) {
      for (var i = 0; i < list.getEntries().length; i++) {
        var e = list.getEntries()[i];
        if (!e.hadRecentInput) clsValue += e.value;
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
    window.addEventListener('pagehide', function() {
      if (!reported.cls && clsValue >= 0) {
        reported.cls = true;
        send('CLS', clsValue, 'pagehide', clsValue);
      }
    });
    setInterval(function() {
      if (reported.cls) return;
      if (clsValue > 0) {
        reported.cls = true;
        send('CLS', clsValue, 'final', clsValue);
      }
    }, 5000);
  } catch (e) {}
})();
