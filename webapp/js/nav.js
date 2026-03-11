/**
 * Injects Admin / Dispatcher tabs into .tab-bar based on GET /api/user/roles.
 * Call after DOM ready. Tab bar must have id="tabBar" and contain base tabs (Бронь, Профиль, FAQ).
 */
(function() {
  function injectRoleTabs() {
    var tabBar = document.getElementById('tabBar');
    if (!tabBar || typeof api !== 'function') return;

    api('/api/user/roles')
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
          disp.textContent = '🔄 Диспетчер';
          tabBar.insertBefore(disp, faqTab);
        }
        if (isAdmin) {
          var adm = document.createElement('a');
          adm.href = 'admin.html';
          adm.className = 'tab';
          adm.textContent = '⚙️ Админ';
          tabBar.insertBefore(adm, faqTab);
        }
      })
      .catch(function() {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRoleTabs);
  } else {
    injectRoleTabs();
  }
})();
