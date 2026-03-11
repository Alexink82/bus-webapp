/**
 * Настройки: уменьшить анимации (reduce motion).
 * localStorage reduceMotion=1; класс .reduce-motion на html.
 */
(function() {
  var STORAGE_KEY = 'reduceMotion';
  var CLASS = 'reduce-motion';

  function getReduceMotion() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function setReduceMotion(value) {
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch (e) {}
    apply();
  }

  function apply() {
    var html = document.documentElement;
    if (getReduceMotion()) html.classList.add(CLASS);
    else html.classList.remove(CLASS);
  }

  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem(STORAGE_KEY))
      setReduceMotion(true);
    else
      apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.getReduceMotion = getReduceMotion;
  window.setReduceMotion = setReduceMotion;
})();
