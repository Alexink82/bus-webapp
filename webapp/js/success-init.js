/**
 * Инициализация страницы успешного бронирования: i18n, haptic, закрытие, booking_id, статус, отмена.
 */
(function() {
  if (typeof window.applyI18nToPage === 'function') window.applyI18nToPage();
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
  var closeBtn = document.getElementById('tgCloseBtn');
  if (closeBtn) {
    var inTelegram = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData;
    if (inTelegram) closeBtn.style.display = 'none';
    else {
      closeBtn.style.display = '';
      closeBtn.addEventListener('click', function() { if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close(); });
    }
  }
  var params = new URLSearchParams(window.location.search);
  var id = params.get('booking_id');
  var bookingIdEl = document.getElementById('bookingId');
  var t = window.t;
  if (id) bookingIdEl.textContent = (typeof t === 'function' ? t('bookingId') : 'Номер заявки') + ': ' + id;
  else bookingIdEl.textContent = (typeof t === 'function' ? t('success') : 'Заявка создана') + '.';
  var statusEl = document.getElementById('statusText');
  if (id && typeof window.api === 'function') {
    window.api('/api/bookings/' + encodeURIComponent(id)).then(function(b) {
      if (statusEl && b && b.status) {
        var statusMap = { new: 'Ожидает подтверждения диспетчером', active: 'В работе', paid: 'Оплачено', ticket_sent: 'Билет отправлен', done: 'Завершено', cancelled: 'Заявка отменена' };
        var label = statusMap[b.status] || b.status;
        var esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : function(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        if (typeof window.getStatusBadge === 'function') {
          var badge = window.getStatusBadge(b.status);
          var icon = (badge.class.indexOf('success') !== -1 && typeof window.APP_ICONS !== 'undefined' && window.APP_ICONS.check) ? window.APP_ICONS.check : '';
          statusEl.innerHTML = '<span class="' + esc(badge.class) + '">' + icon + '<span>' + esc(label) + '</span></span>';
        } else {
          statusEl.textContent = label;
        }
      }
    }).catch(function() {});
  }
  var cancelBtn = document.getElementById('cancelBookingBtn');
  if (id && typeof window.api === 'function' && cancelBtn) {
    cancelBtn.classList.remove('hidden');
    cancelBtn.onclick = function() {
      var msg = typeof t === 'function' ? t('cancelConfirm') : 'Вы уверены, что хотите отменить заявку?';
      var title = typeof t === 'function' ? t('cancelConfirmTitle') : 'Отмена заявки';
      (typeof window.showAppConfirm === 'function' ? window.showAppConfirm(msg, title) : Promise.resolve(confirm(msg)))
        .then(function(ok) {
          if (!ok) return;
          cancelBtn.disabled = true;
          window.api('/api/bookings/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: JSON.stringify({}) })
            .then(function() {
              document.getElementById('statusText').textContent = typeof t === 'function' ? t('bookingCancelled') : 'Заявка отменена.';
              cancelBtn.classList.add('hidden');
            })
            .catch(function(e) {
              var text = (typeof window.errorToMessage === 'function' ? window.errorToMessage(e) : (e && e.message ? e.message : (typeof t === 'function' ? t('error') : 'Ошибка')));
              (typeof window.showAppAlert === 'function' ? window.showAppAlert(text, typeof t === 'function' ? t('error') : 'Ошибка') : alert(text));
              cancelBtn.disabled = false;
            });
        });
    };
  }
  if (window.Telegram && Telegram.WebApp) Telegram.WebApp.ready();
  var backBtn = document.getElementById('backOrCloseBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function() { window.location.href = 'index.html'; });
  }
})();
