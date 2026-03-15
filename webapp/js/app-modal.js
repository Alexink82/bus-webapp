/**
 * Модальные окна приложения с заголовком «СТОЛИЦА» (вместо URL в title).
 * showAppAlert(message), showAppConfirm(title, message) → Promise<boolean>
 */
(function() {
  var APP_TITLE = 'СТОЛИЦА';

  function ensureContainer() {
    var id = 'app-modal-root';
    var root = document.getElementById(id);
    if (!root) {
      root = document.createElement('div');
      root.id = id;
      root.className = 'app-modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var str = String(s);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showAppModal(options) {
    var title = options.title || APP_TITLE;
    var message = options.message || '';
    var html = options.html || '';
    var buttons = options.buttons || [{ text: 'OK', primary: true }];
    var hideHeaderClose = options.hideHeaderClose === true;
    var root = ensureContainer();
    var overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'app-modal-title');
    var content = document.createElement('div');
    content.className = 'app-modal-content';
    content.innerHTML =
      '<div class="app-modal-drag-handle" aria-hidden="true"></div>' +
      '<div class="app-modal-header">' +
        '<h2 id="app-modal-title" class="app-modal-title">' + escapeHtml(title) + '</h2>' +
        (hideHeaderClose ? '' : '<button type="button" class="app-modal-close" aria-label="Закрыть">&times;</button>') +
      '</div>' +
      '<div class="app-modal-body">' +
        (message ? '<p class="app-modal-message">' + escapeHtml(message) + '</p>' : '') +
        (html || '') +
      '</div>' +
      '<div class="app-modal-footer"></div>';
    var footer = content.querySelector('.app-modal-footer');
    var resolveResult;
    var resultPromise = new Promise(function(resolve) { resolveResult = resolve; });
    buttons.forEach(function(btn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = btn.primary ? 'btn btn-primary app-modal-btn' : 'btn btn-outline app-modal-btn';
      b.textContent = btn.text;
      b.addEventListener('click', function() {
        close();
        resolveResult(btn.value !== false);
      });
      footer.appendChild(b);
    });
    function close() {
      overlay.classList.remove('app-modal-visible');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }
    overlay.appendChild(content);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { close(); resolveResult(false); }
    });
    var headerCloseBtn = content.querySelector('.app-modal-close');
    if (headerCloseBtn) headerCloseBtn.addEventListener('click', function() {
      close();
      resolveResult(false);
    });
    root.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
    return resultPromise;
  }

  function errorToMessage(e) {
    if (!e) return 'Ошибка';
    if (typeof e === 'string') return e;
    if (e.message) return typeof e.message === 'string' ? e.message : 'Ошибка';
    if (e.detail && typeof e.detail === 'string') return e.detail;
    if (e.detail && e.detail.code && typeof userFriendlyMessage === 'function') return userFriendlyMessage(e.detail);
    return 'Ошибка';
  }

  window.showAppAlert = function(message, title) {
    return showAppModal({
      title: title || APP_TITLE,
      message: typeof message === 'string' ? message : errorToMessage(message),
      buttons: [{ text: 'OK', primary: true }]
    });
  };

  window.showAppConfirm = function(message, title) {
    title = title || APP_TITLE;
    return showAppModal({
      title: title,
      message: message,
      buttons: [
        { text: 'Отмена', primary: false, value: false },
        { text: 'OK', primary: true, value: true }
      ]
    });
  };

  /** Неблокирующее уведомление (тот же визуальный стиль, что модалки). type: 'success'|'error'|'info' */
  window.showToast = function(message, type) {
    type = type || 'info';
    var container = document.getElementById('app-toast-root');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-toast-root';
      container.className = 'app-toast';
      document.body.appendChild(container);
    }
    var el = document.createElement('div');
    el.className = 'app-toast__item app-toast__item--' + type;
    el.textContent = typeof message === 'string' ? message : errorToMessage(message);
    container.appendChild(el);
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
    return el;
  };

  window.errorToMessage = errorToMessage;
  window.showAppModal = showAppModal;
})();
