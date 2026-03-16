/**
 * Инициализация после загрузки профиля: кнопка закрытия, язык, reduce motion, applyI18nToPage.
 */
(function() {
  var closeBtn = document.getElementById('tgCloseBtn');
  if (closeBtn) {
    var inTelegram = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData;
    if (inTelegram) closeBtn.style.display = 'none';
    else {
      closeBtn.style.display = '';
      closeBtn.addEventListener('click', function() {
        if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close();
      });
    }
  }
  var langSelect = document.getElementById('langSelect');
  var reduceCheck = document.getElementById('reduceMotionCheck');
  if (langSelect) {
    langSelect.value = typeof window.getLang === 'function' ? window.getLang() : 'ru';
    langSelect.addEventListener('change', function() {
      if (typeof window.setLang === 'function') window.setLang(this.value);
      if (typeof window.applyI18nToPage === 'function') window.applyI18nToPage();
    });
  }
  if (reduceCheck) {
    reduceCheck.checked = typeof window.getReduceMotion === 'function' ? window.getReduceMotion() : false;
    reduceCheck.addEventListener('change', function() {
      if (typeof window.setReduceMotion === 'function') window.setReduceMotion(this.checked);
    });
  }
  var uiModeSelect = document.getElementById('uiModeSelect');
  if (uiModeSelect) {
    var mode = typeof window.getUiMode === 'function' ? window.getUiMode() : null;
    uiModeSelect.value = (mode === 'economy' || mode === 'normal') ? mode : 'normal';
    uiModeSelect.addEventListener('change', function() {
      if (typeof window.setUiMode === 'function') window.setUiMode(this.value);
    });
  }
  if (typeof window.applyI18nToPage === 'function') window.applyI18nToPage();
})();
