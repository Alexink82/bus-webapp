(function() {
  var api = window.api;
  var messageEl = document.getElementById('browserLoginMessage');
  var actionsEl = document.getElementById('browserLoginActions');
  var params = new URLSearchParams(window.location.search || '');
  var ticket = (params.get('ticket') || '').trim();
  var next = (params.get('next') || 'dispatcher').trim();
  var targetPage = next === 'admin' ? 'admin.html' : 'dispatcher.html';

  function setMessage(text) {
    if (messageEl) messageEl.textContent = text;
  }

  function setActions(html) {
    if (actionsEl) actionsEl.innerHTML = html || '';
  }

  function goToTarget() {
    window.location.replace(targetPage);
  }

  async function run() {
    if (!api) {
      setMessage('Не загружен API-клиент. Обновите страницу.');
      return;
    }

    try {
      var sessionRes = await fetch((window.BASE_URL || window.location.origin) + '/api/auth/session');
      var sessionData = await sessionRes.json().catch(function() { return {}; });
      if (sessionRes.ok && sessionData && sessionData.authenticated) {
        setMessage('Сессия уже активна. Перенаправляем...');
        goToTarget();
        return;
      }
    } catch (e) {}

    if (!ticket) {
      setMessage('Для входа откройте админку или диспетчерскую в Telegram и нажмите "Открыть в браузере".');
      setActions('<a class="btn btn--primary" href="' + targetPage + '">Проверить вход ещё раз</a>');
      return;
    }

    setMessage('Подтверждаем вход и создаём browser-session...');
    try {
      await api('/api/auth/browser-exchange', {
        method: 'POST',
        body: JSON.stringify({ ticket: ticket })
      });
      window.history.replaceState({}, document.title, '/backoffice-login.html?next=' + encodeURIComponent(next));
      setMessage('Вход выполнен. Перенаправляем...');
      goToTarget();
    } catch (e) {
      setMessage(e.message || 'Не удалось выполнить вход. Запросите новую ссылку из Telegram.');
      setActions('<a class="btn btn--primary" href="/backoffice-login.html?next=' + encodeURIComponent(next) + '">Повторить</a>');
    }
  }

  run();
})();
