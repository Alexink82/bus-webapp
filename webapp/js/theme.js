/**
 * Переключатель светлой/тёмной темы.
 * Сохраняет выбор в localStorage, при первом визите можно учитывать prefers-color-scheme.
 */
(function() {
  var STORAGE_KEY = 'theme';
  var LIGHT = 'light';
  var DARK = 'dark';

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStored(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  function getSystemPreference() {
    if (typeof window.matchMedia !== 'function') return DARK;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
  }

  function getTheme() {
    var stored = getStored();
    if (stored === LIGHT || stored === DARK) return stored;
    return getSystemPreference();
  }

  function applyTheme(theme) {
    var html = document.documentElement;
    html.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === LIGHT ? '#f0f2f5' : '#1a1a2e');
    if (typeof window.onThemeChange === 'function') window.onThemeChange(theme);
  }

  function setTheme(theme) {
    if (theme !== LIGHT && theme !== DARK) return;
    setStored(theme);
    applyTheme(theme);
    return theme;
  }

  function toggleTheme() {
    var current = getTheme();
    return setTheme(current === LIGHT ? DARK : LIGHT);
  }

  function init() {
    applyTheme(getTheme());
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.setAttribute('aria-label', getTheme() === LIGHT ? 'Включить тёмную тему' : 'Включить светлую тему');
      btn.setAttribute('title', getTheme() === LIGHT ? 'Тёмная тема' : 'Светлая тема');
      btn.addEventListener('click', function() {
        var next = toggleTheme();
        btn.setAttribute('aria-label', next === LIGHT ? 'Включить тёмную тему' : 'Включить светлую тему');
        btn.setAttribute('title', next === LIGHT ? 'Тёмная тема' : 'Светлая тема');
        btn.textContent = next === LIGHT ? '🌙' : '☀️';
      });
      btn.textContent = getTheme() === LIGHT ? '🌙' : '☀️';
    }
  }

  window.getTheme = getTheme;
  window.setTheme = setTheme;
  window.toggleTheme = toggleTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
