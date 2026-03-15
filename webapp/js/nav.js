/**
 * 1) Injects Admin / Dispatcher tabs into .tab-bar (passenger pages) from GET /api/user/roles.
 * 2) Fills #roleShellPlaceholder (dispatcher/admin pages) with role-shell: Бронь | Профиль | Диспетчер | Админ.
 */
(function() {
  var apiFn = function() { return typeof window.api === 'function' ? window.api : null; };

  function injectRoleShell(placeholder, data) {
    var isDispatcher = data.is_dispatcher === true;
    var isAdmin = data.is_admin === true;
    var path = (window.location.pathname || '').replace(/.*\//, '') || 'index.html';
    var L = typeof t === 'function' ? { bro: t('tabBooking') || 'Бронь', pro: t('tabProfile') || 'Профиль', disp: t('tabDispatcher') || 'Диспетчер', adm: t('tabAdmin') || 'Админ' } : { bro: 'Бронь', pro: 'Профиль', disp: 'Диспетчер', adm: 'Админ' };
    var links = [
      { href: 'index.html', label: '🎫 ' + L.bro, show: true },
      { href: 'profile.html', label: '👤 ' + L.pro, show: true },
      { href: 'dispatcher.html', label: '🔄 ' + L.disp, show: isDispatcher },
      { href: 'admin.html', label: '⚙️ ' + L.adm, show: isAdmin }
    ];
    var frag = document.createDocumentFragment();
    var shell = document.createElement('nav');
    shell.className = 'role-shell';
    shell.setAttribute('aria-label', 'Переключение контуров');
    links.forEach(function(item) {
      if (!item.show) return;
      var a = document.createElement('a');
      a.href = item.href;
      a.className = 'role-shell__link' + (path === item.href ? ' role-shell__link--active' : '');
      a.textContent = item.label;
      shell.appendChild(a);
    });
    placeholder.innerHTML = '';
    placeholder.appendChild(shell);
  }

  function run() {
    var placeholder = document.getElementById('roleShellPlaceholder');
    if (placeholder) {
      var fn = apiFn();
      if (!fn) {
        setTimeout(run, 50);
        return;
      }
      fn('/api/user/roles')
        .then(function(data) { injectRoleShell(placeholder, data); })
        .catch(function() { placeholder.innerHTML = ''; });
      return;
    }

    var tabBar = document.getElementById('tabBar');
    if (!tabBar) return;
    var fn = apiFn();
    if (!fn) {
      setTimeout(run, 50);
      return;
    }
    fn('/api/user/roles')
      .then(function(data) {
        var isDispatcher = data.is_dispatcher === true;
        var isAdmin = data.is_admin === true;
        if (!isDispatcher && !isAdmin) return;
        var faqTab = tabBar.querySelector('a[href="faq.html"]');
        if (!faqTab) return;
        if (isDispatcher) {
          var disp = document.createElement('a');
          disp.href = 'dispatcher.html';
          disp.className = 'tab';
          disp.textContent = '🔄 ' + (typeof t === 'function' ? t('tabDispatcher') : 'Диспетчер');
          tabBar.insertBefore(disp, faqTab);
        }
        if (isAdmin) {
          var adm = document.createElement('a');
          adm.href = 'admin.html';
          adm.className = 'tab';
          adm.textContent = '⚙️ ' + (typeof t === 'function' ? t('tabAdmin') : 'Админ');
          tabBar.insertBefore(adm, faqTab);
        }
      })
      .catch(function() {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
