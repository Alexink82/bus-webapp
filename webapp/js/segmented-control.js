/**
 * Универсальный переключатель табов (Segmented Control).
 * Работает на всех страницах: находит .segmented-control, по клику на .segment
 * переключает active и показывает контейнер #tab-{data-tab} или #{data-tab}.
 */
document.addEventListener('DOMContentLoaded', function() {
  var controls = document.querySelectorAll('.segmented-control');
  controls.forEach(function(control) {
    var buttons = control.querySelectorAll('.segment');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.getAttribute('data-tab');
        if (!tab) return;
        buttons.forEach(function(b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        var target = document.getElementById('tab-' + tab) || document.getElementById(tab);
        if (target) {
          var siblingContents = target.parentNode ? target.parentNode.querySelectorAll('.tab-content') : [];
          if (siblingContents.length) {
            siblingContents.forEach(function(el) { el.classList.remove('active'); });
          } else {
            document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
          }
          target.classList.add('active');
        }
      });
    });
  });
});
