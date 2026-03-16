/**
 * Настройки: уменьшить анимации (reduce motion), режим интерфейса (нормальный/экономный).
 * localStorage reduceMotion=1; uiMode=normal|economy; классы .reduce-motion и .economy-mode на html.
 */
(function() {
  var STORAGE_KEY = 'reduceMotion';
  var STORAGE_KEY_UI_MODE = 'uiMode';
  var STORAGE_KEY_ECONOMY_COHORT = 'economyAbCohort';
  var CLASS = 'reduce-motion';
  var CLASS_ECONOMY = 'economy-mode';

  function getReduceMotion() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function setReduceMotion(value) {
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch (e) {}
    apply();
  }

  function getUiMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY_UI_MODE);
      return (v === 'normal' || v === 'economy') ? v : null;
    } catch (e) { return null; }
  }

  function setUiMode(value) {
    try { localStorage.setItem(STORAGE_KEY_UI_MODE, value === 'economy' ? 'economy' : 'normal'); } catch (e) {}
    apply();
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /** Единая точка проверки: экономный режим (меньше эффектов, без автозагрузки QR, префетч сокращён). */
  function isEconomyMode() {
    if (getReduceMotion() || prefersReducedMotion()) return true;
    var mode = getUiMode();
    if (mode !== null) return mode === 'economy';
    var hw = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < 4;
    var mem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4;
    return hw || mem;
  }

  function apply() {
    var html = document.documentElement;
    if (getReduceMotion()) html.classList.add(CLASS);
    else html.classList.remove(CLASS);
    if (isEconomyMode()) html.classList.add(CLASS_ECONOMY);
    else html.classList.remove(CLASS_ECONOMY);
  }

  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem(STORAGE_KEY))
      setReduceMotion(true);
    else
      apply();
    var mode = getUiMode();
    if (mode === null) {
      try {
        var cohort = localStorage.getItem(STORAGE_KEY_ECONOMY_COHORT);
        if (!cohort || (cohort !== 'A' && cohort !== 'B')) {
          cohort = Math.random() < 0.5 ? 'A' : 'B';
          localStorage.setItem(STORAGE_KEY_ECONOMY_COHORT, cohort);
        }
        var weakDevice = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < 4 ||
          (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4);
        var economy = cohort === 'B' || weakDevice;
        localStorage.setItem(STORAGE_KEY_UI_MODE, economy ? 'economy' : 'normal');
      } catch (e) {}
      apply();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.getReduceMotion = getReduceMotion;
  window.setReduceMotion = setReduceMotion;
  window.getUiMode = getUiMode;
  window.setUiMode = setUiMode;
  window.isEconomyMode = isEconomyMode;
  window.getEconomyCohort = function() { try { return localStorage.getItem(STORAGE_KEY_ECONOMY_COHORT) || null; } catch (e) { return null; } };
})();
