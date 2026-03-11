/**
 * Проверка режима технических работ и отображение экрана с обратным отсчётом.
 * Вызывается до отображения приложения. При maintenance: true показывается overlay.
 */
(function() {
  var overlay = document.getElementById('maintenanceOverlay');
  var appContent = document.getElementById('appContent');
  var appLoader = document.getElementById('appLoader');
  var base = window.location.origin;

  function showApp() {
    if (appLoader) appLoader.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    if (appContent) appContent.style.display = '';
  }

  function showMaintenance(untilIso) {
    if (appLoader) appLoader.classList.add('hidden');
    if (appContent) appContent.style.display = 'none';
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var endEl = document.getElementById('maintenanceUntil');
    var countEl = document.getElementById('maintenanceCountdown');
    if (!endEl || !countEl) return;

    var untilDate = new Date(untilIso);
    endEl.textContent = untilDate.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

    function tick() {
      var now = new Date();
      if (now >= untilDate) {
        countEl.textContent = 'Возобновляем работу…';
        fetch(base + '/api/health').then(function(r) { return r.json(); }).then(function(d) {
          if (!d.maintenance) { showApp(); window.location.reload(); }
        }).catch(showApp);
        return;
      }
      var s = Math.floor((untilDate - now) / 1000);
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      countEl.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
      setTimeout(tick, 1000);
    }
    tick();
  }

  fetch(base + '/api/health')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.maintenance && d.maintenance_until) {
        showMaintenance(d.maintenance_until);
      } else {
        showApp();
      }
    })
    .catch(function() { showApp(); });
})();
