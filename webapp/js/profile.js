(function() {
  if (typeof getTelegramUserId === 'function' && !getTelegramUserId()) {
    document.getElementById('bookingsList').innerHTML = '<p>' + (typeof t === 'function' ? t('loginViaTelegram') : 'Войдите через Telegram, чтобы видеть заявки.') + '</p>';
    document.getElementById('passengersSection').innerHTML = '<p>' + (typeof t === 'function' ? t('loginViaTelegramShort') : 'Войдите через Telegram.') + '</p>';
    return;
  }

  var base = typeof BASE_URL !== 'undefined' ? BASE_URL : '';
  var userMsg = typeof userFriendlyMessage === 'function' ? userFriendlyMessage : function(d) { return (d && d.code) ? d.code : (d ? String(d) : ''); };
  var apiFn = typeof api === 'function' ? api : function(path, opts) {
    var o = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (typeof getTelegramUserId === 'function' && getTelegramUserId()) headers['X-Telegram-User-Id'] = String(getTelegramUserId());
    if (typeof getTelegramInitData === 'function' && getTelegramInitData()) headers['X-Telegram-Init-Data'] = getTelegramInitData();
    if (o.headers) Object.assign(headers, o.headers);
    return fetch(base + path, Object.assign({}, o, { headers: headers }))
      .then(function(r) { return r.json().catch(function() { return {}; }).then(function(data) {
        if (!r.ok) {
          var msg = userMsg(data.detail) || (data.detail && data.detail.code) || (data.detail && typeof data.detail === 'string' ? data.detail : null) || r.statusText;
          throw new Error(typeof msg === 'string' ? msg : r.statusText);
        }
        return data;
      }); });
  };

  window.showAddPassengerModal = function(apiFn, onSuccess) {
    var root = document.getElementById('app-modal-root') || (function() { var r = document.createElement('div'); r.id = 'app-modal-root'; r.className = 'app-modal-root'; document.body.appendChild(r); return r; })();
    var overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    var formHtml = '<div class="app-modal-header"><h2 class="app-modal-title">Добавить пассажира</h2><button type="button" class="app-modal-close" aria-label="Закрыть">&times;</button></div>' +
      '<div class="app-modal-body">' +
      '<form id="addPassengerForm" class="add-passenger-form">' +
      '<div class="field-group"><label>Фамилия <span class="required">*</span></label><input type="text" id="apLast" required placeholder="Иванов"></div>' +
      '<div class="field-group"><label>Имя <span class="required">*</span></label><input type="text" id="apFirst" required placeholder="Иван"></div>' +
      '<div class="field-group"><label>Отчество</label><input type="text" id="apMiddle" placeholder="Иванович"></div>' +
      '<div class="field-group"><label>Дата рождения <span class="required">*</span></label><input type="text" id="apBirth" maxlength="10" placeholder="31.12.1990"></div>' +
      '<div class="field-group"><label>Паспорт (серия и номер)</label><input type="text" id="apPassport" maxlength="10" placeholder="МР 1234567"></div>' +
      '<p id="addPassengerError" class="field-error"></p>' +
      '</form></div>' +
      '<div class="app-modal-footer"><button type="button" class="btn btn-outline app-modal-btn" id="addPassengerCancel">Отмена</button><button type="button" class="btn btn-primary app-modal-btn" id="addPassengerSave">Сохранить</button></div>';
    overlay.innerHTML = '<div class="app-modal-content">' + formHtml + '</div>';
    var content = overlay.querySelector('.app-modal-content');
    function close() {
      overlay.classList.remove('app-modal-visible');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    content.querySelector('.app-modal-close').addEventListener('click', close);
    content.querySelector('#addPassengerCancel').addEventListener('click', close);
    var birthInp = content.querySelector('#apBirth');
    var passportInp = content.querySelector('#apPassport');
    ['#apLast', '#apFirst', '#apMiddle'].forEach(function(sel) {
      var el = content.querySelector(sel);
      if (el) el.addEventListener('input', function() {
        var start = this.selectionStart, end = this.selectionEnd;
        this.value = this.value.toUpperCase();
        this.setSelectionRange(start, end);
      });
    });
    if (typeof formatDobInput === 'function') birthInp.addEventListener('input', function() { this.value = formatDobInput(this.value); });
    if (typeof formatPassportInput === 'function') passportInp.addEventListener('input', function() { this.value = formatPassportInput(this.value); });
    content.querySelector('#addPassengerSave').addEventListener('click', function() {
      var last = (content.querySelector('#apLast').value || '').trim();
      var first = (content.querySelector('#apFirst').value || '').trim();
      var middle = (content.querySelector('#apMiddle').value || '').trim();
      var birthRaw = (content.querySelector('#apBirth').value || '').trim();
      var passportRaw = (content.querySelector('#apPassport').value || '').trim();
      var errEl = content.querySelector('#addPassengerError');
      errEl.textContent = '';
      if (!last || !first) { errEl.textContent = 'Укажите фамилию и имя.'; return; }
      var birthIso = typeof dobToIso === 'function' ? dobToIso(birthRaw) : birthRaw;
      if (!birthIso || birthIso.length !== 10) { errEl.textContent = 'Введите дату рождения (день.месяц.год, например 31.12.1990).'; return; }
      var passport = typeof passportToApi === 'function' ? passportToApi(passportRaw) : passportRaw.replace(/\s/g, '');
      var payload = { last_name: last, first_name: first, middle_name: middle, birth_date: birthIso, passport: passport || '' };
      apiFn('/api/user/passengers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function() { close(); if (onSuccess) onSuccess(); })
        .catch(function(e) {
          var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
          errEl.textContent = text;
        });
    });
    root.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
    if (birthInp) birthInp.focus();
  };

  function loadBookings() {
    apiFn('/api/user/bookings').then(function(data) {
      var list = document.getElementById('bookingsList');
      var items = data.bookings || [];
      list.innerHTML = items.length ? items.map(function(b) {
        var esc = function(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        var cancelBtn = (b.status !== 'cancelled' && b.status !== 'done' && b.status !== 'ticket_sent') ? ' <button type="button" class="btn btn-outline btn-small cancel-booking" data-id="' + esc(b.booking_id) + '">' + (typeof t === 'function' ? t('cancel') : 'Отменить') + '</button>' : '';
        var detailsBtn = '<button type="button" class="btn btn-outline btn-small booking-details" data-id="' + esc(b.booking_id) + '" data-from="' + esc(b.from_city) + '" data-to="' + esc(b.to_city) + '">' + (typeof t === 'function' ? t('details') : 'Подробнее') + '</button>';
        return '<div class="trip-card booking-card">' +
          '<div class="booking-card__head"><strong>' + esc(b.booking_id) + '</strong> — ' + esc(b.route_name) + '</div>' +
          '<div class="booking-card__meta">' + esc(b.departure_date) + ' ' + esc(b.departure_time) + ' | ' + esc(b.price_total) + ' ' + esc(b.currency) + ' | ' + esc(b.status) + '</div>' +
          '<div class="booking-card__actions">' + detailsBtn + cancelBtn + '</div></div>';
      }).join('') : '<p>' + (typeof t === 'function' ? t('noBookings') : 'Нет заявок.') + '</p>';
      list.querySelectorAll('.cancel-booking').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var msg = typeof t === 'function' ? t('cancelConfirm') : 'Отменить заявку?';
          var title = typeof t === 'function' ? t('cancelConfirmTitle') : 'Отмена заявки';
          (typeof showAppConfirm === 'function' ? showAppConfirm(msg, title) : Promise.resolve(confirm(msg)))
            .then(function(ok) {
              if (!ok) return;
              var bid = btn.getAttribute('data-id');
              btn.disabled = true;
              apiFn('/api/bookings/' + encodeURIComponent(bid) + '/cancel', { method: 'POST', body: JSON.stringify({}) })
                .then(function() { loadBookings(); })
                .catch(function(e) {
                  var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
                  (typeof showAppAlert === 'function' ? showAppAlert(text, typeof t === 'function' ? t('error') : 'Ошибка') : alert(text));
                  btn.disabled = false;
                });
            });
        });
      });
      list.querySelectorAll('.booking-details').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var bid = btn.getAttribute('data-id');
          var fromCity = btn.getAttribute('data-from') || '';
          var toCity = btn.getAttribute('data-to') || '';
          apiFn('/api/bookings/' + encodeURIComponent(bid)).then(function(d) {
            showBookingDetailsModal(d, fromCity, toCity);
          }).catch(function(e) {
            var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
            (typeof showAppAlert === 'function' ? showAppAlert(text, 'Ошибка') : alert(text));
          });
        });
      });
    }).catch(function() { document.getElementById('bookingsList').innerHTML = '<p>\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.</p>'; });
  }

  function showBookingDetailsModal(booking, fromCity, toCity) {
    var esc = function(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var from = fromCity || (booking.from_city || '');
    var to = toCity || (booking.to_city || '');
    var passengersStr = '';
    if (booking.passengers && booking.passengers.length) {
      passengersStr = booking.passengers.map(function(p) {
        return esc(p.last_name) + ' ' + esc(p.first_name) + (p.middle_name ? ' ' + esc(p.middle_name) : '') + (p.birth_date ? ' (' + esc(p.birth_date) + ')' : '');
      }).join('<br>');
    } else {
      passengersStr = '—';
    }
    var rescheduleUrl = 'index.html?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    var rescheduleText = (typeof t === 'function' ? t('rescheduleDate') : 'Перенести дату');
    var html = '<div class="booking-details-modal">' +
      '<p><strong>Маршрут:</strong> ' + esc(booking.route_name) + ' (' + esc(from) + ' → ' + esc(to) + ')</p>' +
      '<p><strong>Дата и время:</strong> ' + esc(booking.departure_date) + ' ' + esc(booking.departure_time) + '</p>' +
      '<p><strong>Пассажиры:</strong><br>' + passengersStr + '</p>' +
      (booking.contact_phone ? '<p><strong>Контактный телефон:</strong> ' + esc(booking.contact_phone) + '</p>' : '') +
      '<p><strong>Стоимость:</strong> ' + esc(booking.price_total) + ' ' + esc(booking.currency || 'BYN') + '</p>' +
      '<p><strong>Статус:</strong> ' + esc(booking.status) + '</p>' +
      '<div class="booking-details-modal__actions">' +
      '<a href="' + rescheduleUrl + '" class="btn btn-primary">' + rescheduleText + '</a> ' +
      '<a href="success.html?booking_id=' + encodeURIComponent(booking.booking_id) + '" class="btn btn-outline">Страница заявки</a></div></div>';
    if (typeof showAppModal === 'function') {
      showAppModal({ title: (typeof t === 'function' ? t('details') : 'Подробнее'), html: html, buttons: [{ text: typeof t === 'function' ? t('close') : 'Закрыть', primary: true }] });
    } else {
      (typeof showAppAlert === 'function' ? showAppAlert : alert)(html.replace(/<[^>]+>/g, ' '), 'Подробнее');
    }
  }

  function loadPassengers() {
    var list = document.getElementById('passengersList');
    apiFn('/api/user/passengers').then(function(data) {
      var items = data.passengers || [];
      list.innerHTML = items.map(function(p) {
        var esc = function(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
        return '<div class="trip-card" data-id="' + esc(p.id) + '">' + esc(p.last_name) + ' ' + esc(p.first_name) + ' ' + esc(p.middle_name || '') + ' | ' + esc(p.birth_date) +
          ' <button type="button" class="btn btn-small delete-passenger" data-id="' + esc(p.id) + '">Удалить</button></div>';
      }).join('');
      list.querySelectorAll('.delete-passenger').forEach(function(btn) {
        btn.addEventListener('click', function() {
          (typeof showAppConfirm === 'function' ? showAppConfirm('Удалить пассажира из списка?', 'Удаление') : Promise.resolve(confirm('Удалить?')))
            .then(function(ok) {
              if (!ok) return;
              apiFn('/api/user/passengers/' + btn.getAttribute('data-id'), { method: 'DELETE' })
                .then(loadPassengers)
                .catch(function(e) {
                  var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
                  (typeof showAppAlert === 'function' ? showAppAlert(text, 'Ошибка') : alert(text));
                });
            });
        });
      });
    }).catch(function() { list.innerHTML = '<p>\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.</p>'; });
  }

  document.getElementById('addPassenger').addEventListener('click', function() {
    if (typeof showAddPassengerModal === 'function') {
      showAddPassengerModal(apiFn, loadPassengers);
      return;
    }
    var last = prompt('\u0424\u0430\u043c\u0438\u043b\u0438\u044f');
    var first = prompt('\u0418\u043c\u044f');
    var birth = prompt('\u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f (DD.MM.YYYY)');
    if (!last || !first || !birth) return;
    apiFn('/api/user/passengers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_name: last, first_name: first, middle_name: '', birth_date: (typeof dobToIso === 'function' ? dobToIso(birth) : birth) || birth, passport: '' })
    }).then(loadPassengers).catch(function(e) {
      var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
      (typeof showAppAlert === 'function' ? showAppAlert(text, 'Ошибка') : alert(text));
    });
  });

  loadBookings();
  loadPassengers();
})();
