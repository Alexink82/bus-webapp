(function() {
  if (typeof getTelegramUserId === 'function' && !getTelegramUserId()) {
    var loginMsg = (typeof t === 'function' ? t('loginViaTelegram') : 'Войдите через Telegram, чтобы видеть заявки.');
    ['bookingsListActive', 'bookingsListUpcoming', 'bookingsListCompleted', 'bookingsListCancelled'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '<p>' + loginMsg + '</p>';
    });
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
          var msgStr = (typeof msg === 'string' ? msg : null) || r.statusText;
          throw new Error(msgStr);
        }
        return data;
      }); });
  };

  window.showAddPassengerModal = function(apiFn, onSuccess, passengerData) {
    var isEdit = passengerData && passengerData.id;
    var title = isEdit ? 'Редактировать пассажира' : 'Добавить пассажира';
    var root = document.getElementById('app-modal-root') || (function() { var r = document.createElement('div'); r.id = 'app-modal-root'; r.className = 'app-modal-root'; document.body.appendChild(r); return r; })();
    var overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    var topCountries = typeof PASSPORT_TOP_COUNTRIES !== 'undefined' ? PASSPORT_TOP_COUNTRIES : [{ code: 'BY', name: 'Беларусь', example: 'MP 1234567' }, { code: 'RU', name: 'Россия', example: '4511 123456' }];
    var otherCode = typeof PASSPORT_OTHER_CODE !== 'undefined' ? PASSPORT_OTHER_CODE : 'OTHER';
    var birthVal = (passengerData && passengerData.birth_date) ? (typeof datePickerIsoToDisplay === 'function' ? datePickerIsoToDisplay(passengerData.birth_date) : passengerData.birth_date) : '';
    var birthIsoVal = (passengerData && passengerData.birth_date) ? passengerData.birth_date : '';
    var lastVal = (passengerData && passengerData.last_name) ? String(passengerData.last_name) : '';
    var firstVal = (passengerData && passengerData.first_name) ? String(passengerData.first_name) : '';
    var middleVal = (passengerData && passengerData.middle_name) ? String(passengerData.middle_name) : '';
    var passportVal = (passengerData && passengerData.passport) ? String(passengerData.passport) : '';
    var countryVal = (passengerData && passengerData.passport_country) ? passengerData.passport_country : 'BY';
    var formHtml = '<div class="app-modal-header"><h2 class="app-modal-title">' + title + '</h2><button type="button" class="app-modal-close" aria-label="Закрыть">&times;</button></div>' +
      '<div class="app-modal-body">' +
      '<form id="addPassengerForm" class="add-passenger-form">' +
      '<div class="field-group"><label>Фамилия <span class="required">*</span></label><input type="text" id="apLast" required placeholder="Иванов" value="' + (lastVal.replace(/"/g, '&quot;') || '') + '"></div>' +
      '<div class="field-group"><label>Имя <span class="required">*</span></label><input type="text" id="apFirst" required placeholder="Иван" value="' + (firstVal.replace(/"/g, '&quot;') || '') + '"></div>' +
      '<div class="field-group"><label>Отчество</label><input type="text" id="apMiddle" placeholder="Иванович" value="' + (middleVal.replace(/"/g, '&quot;') || '') + '"></div>' +
      '<div class="field-group"><label>Дата рождения <span class="required">*</span></label><p class="field-hint">Введите дату в формате ДД.ММ.ГГГГ</p><input type="hidden" id="apBirthIso" value="' + (birthIsoVal || '') + '"><input type="text" id="apBirthInput" class="birth-date-input" placeholder="ДД.ММ.ГГГГ" value="' + (birthVal.replace(/"/g, '&quot;') || '') + '" autocomplete="off"></div>' +
      '<div class="field-group passport-group"><label>Страна выдачи паспорта <span class="required">*</span></label><select id="apCountry" aria-label="Страна выдачи">' + topCountries.map(function(c) { return '<option value="' + c.code + '"' + (countryVal === c.code ? ' selected' : '') + '>' + c.name + '</option>'; }).join('') + '<option value="' + otherCode + '"' + (countryVal === otherCode ? ' selected' : '') + '>Другая страна</option></select></div>' +
      '<div class="field-group"><label>Номер паспорта / ID <span class="required">*</span></label><p class="field-hint" id="apPassportHint">Пример: MP 1234567</p><input type="text" id="apPassport" maxlength="20" placeholder="MP 1234567" value="' + (passportVal.replace(/"/g, '&quot;') || '') + '"><p class="passport-warning">Паспортные данные передаются пограничным службам. Ошибка в номере → отказ в посадке.</p><span class="mrz-toggle-wrap"><button type="button" class="mrz-toggle" id="apMrzToggle">Ввести из MRZ</button> <button type="button" class="mrz-hint-trigger" id="apMrzHint" aria-label="Что такое MRZ?">?</button></span><div id="apMrzHintText" class="mrz-hint-text hidden" role="tooltip">MRZ — машинно-читаемая зона на развороте паспорта: две строки внизу страницы. Скопируйте их в поля ниже.</div><div class="mrz-block hidden" id="apMrzBlock"><input type="text" class="mrz-line1" placeholder="Строка 1" maxlength="44"><input type="text" class="mrz-line2" placeholder="Строка 2" maxlength="44"><div class="mrz-actions"><button type="button" class="mrz-parse">Распознать</button><button type="button" class="mrz-cancel">Отмена</button></div></div></div>' +
      '<p id="addPassengerError" class="field-error"></p>' +
      '</form></div>' +
      '<div class="app-modal-footer"><button type="button" class="btn btn-secondary app-modal-btn" id="addPassengerCancel">Отмена</button><button type="button" class="btn btn-primary app-modal-btn" id="addPassengerSave">Сохранить</button></div>';
    overlay.innerHTML = '<div class="app-modal-content"><div class="app-modal-drag-handle" aria-hidden="true"></div>' + formHtml + '</div>';
    var content = overlay.querySelector('.app-modal-content');
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    function close() {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      overlay.classList.remove('app-modal-visible');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    content.querySelector('.app-modal-close').addEventListener('click', close);
    content.querySelector('#addPassengerCancel').addEventListener('click', close);
    var birthIsoInp = content.querySelector('#apBirthIso');
    var birthInput = content.querySelector('#apBirthInput');
    if (typeof IMask !== 'undefined' && birthInput && birthIsoInp) {
      IMask(birthInput, {
        mask: 'd.m.Y',
        blocks: {
          d: { mask: IMask.MaskedRange, from: 1, to: 31, maxLength: 2 },
          m: { mask: IMask.MaskedRange, from: 1, to: 12, maxLength: 2 },
          Y: { mask: IMask.MaskedRange, from: 1900, to: 2026, maxLength: 4 }
        },
        lazy: false,
        autofix: true,
        placeholderChar: '_',
        onAccept: function(value) {
          var iso = typeof dobToIso === 'function' ? dobToIso(value) : '';
          if (birthIsoInp) birthIsoInp.value = iso;
        }
      });
    }
    var passportInp = content.querySelector('#apPassport');
    var citizenshipSel = content.querySelector('#apCountry');
    var passportHint = content.querySelector('#apPassportHint');
    if (citizenshipSel && passportInp) {
      citizenshipSel.addEventListener('change', function() {
        var c = citizenshipSel.value;
        var country = typeof getPassportCountry === 'function' ? getPassportCountry(c) : null;
        if (passportHint) passportHint.textContent = country ? 'Пример: ' + country.example : 'Введите номер паспорта';
        passportInp.placeholder = country ? country.example : 'Введите номер паспорта';
        passportInp.maxLength = c === otherCode ? 20 : 12;
        if (typeof passportFormatInput === 'function') passportInp.value = passportFormatInput(passportInp.value, c);
      });
      passportInp.addEventListener('input', function() {
        var c = citizenshipSel.value;
        if (typeof passportFormatInput === 'function') { var v = passportFormatInput(this.value, c); if (v !== this.value) this.value = v; }
      });
    }
    var mrzHint = content.querySelector('#apMrzHint');
    var mrzHintText = content.querySelector('#apMrzHintText');
    if (mrzHint && mrzHintText) {
      mrzHint.addEventListener('click', function() { mrzHintText.classList.toggle('hidden'); });
    }
    var mrzToggle = content.querySelector('#apMrzToggle');
    var mrzBlock = content.querySelector('#apMrzBlock');
    if (mrzToggle && mrzBlock) {
      mrzToggle.addEventListener('click', function() { mrzBlock.classList.remove('hidden'); });
      mrzBlock.querySelector('.mrz-cancel').addEventListener('click', function() { mrzBlock.classList.add('hidden'); mrzBlock.querySelector('.mrz-line1').value = ''; mrzBlock.querySelector('.mrz-line2').value = ''; });
      mrzBlock.querySelector('.mrz-parse').addEventListener('click', function() {
        var line1 = mrzBlock.querySelector('.mrz-line1').value.trim().toUpperCase();
        var line2 = mrzBlock.querySelector('.mrz-line2').value.trim().toUpperCase();
        var num = typeof parseMrzDocumentNumber === 'function' ? parseMrzDocumentNumber(line1, line2) : null;
        if (num) {
          var c = citizenshipSel ? citizenshipSel.value : 'BY';
          passportInp.value = typeof passportFormatInput === 'function' ? passportFormatInput(num, c) : num;
          mrzBlock.classList.add('hidden');
          mrzBlock.querySelector('.mrz-line1').value = '';
          mrzBlock.querySelector('.mrz-line2').value = '';
        }
      });
    }
    content.querySelector('#addPassengerSave').addEventListener('click', function() {
      var apBirthIsoEl = content.querySelector('#apBirthIso');
      var apBirthInputEl = content.querySelector('#apBirthInput');
      if (apBirthIsoEl && apBirthInputEl && (!apBirthIsoEl.value || !apBirthIsoEl.value.trim()) && (apBirthInputEl.value || '').trim() && typeof dobToIso === 'function') {
        var iso = dobToIso(apBirthInputEl.value.trim());
        if (iso) apBirthIsoEl.value = iso;
      }
      var last = (content.querySelector('#apLast').value || '').trim();
      var first = (content.querySelector('#apFirst').value || '').trim();
      var middle = (content.querySelector('#apMiddle').value || '').trim();
      var birthIso = (content.querySelector('#apBirthIso').value || '').trim();
      var countryCode = (content.querySelector('#apCountry') && content.querySelector('#apCountry').value) || 'BY';
      var passportRaw = (content.querySelector('#apPassport').value || '').trim();
      var errEl = content.querySelector('#addPassengerError');
      errEl.textContent = '';
      if (!last || !first) { errEl.textContent = 'Укажите фамилию и имя.'; return; }
      if (!birthIso || birthIso.length !== 10 || birthIso.indexOf('-') === -1) { errEl.textContent = 'Выберите дату рождения.'; return; }
      var passportRes = typeof passportValidate === 'function' ? passportValidate(countryCode, passportRaw) : { valid: true };
      if (!passportRes.valid) { errEl.textContent = passportRes.message || 'Неверный формат паспорта.'; return; }
      var passport = typeof passportCleanForApi === 'function' ? passportCleanForApi(passportRaw, countryCode) : passportRaw.replace(/\s/g, '');
      var payload = { last_name: last, first_name: first, middle_name: middle, birth_date: birthIso, passport: passport || '' };

      function doSave() {
        if (isEdit && passengerData && passengerData.id) {
          apiFn('/api/user/passengers/' + passengerData.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function() { close(); if (onSuccess) onSuccess(); })
            .catch(function(e) {
              var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
              errEl.textContent = text;
            });
        } else {
          apiFn('/api/user/passengers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function() { close(); if (onSuccess) onSuccess(); })
            .catch(function(e) {
              var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
              errEl.textContent = text;
            });
        }
      }

      if (isEdit && passengerData && passengerData.id) {
        var orig = passengerData;
        var changes = [];
        if ((orig.last_name || '') !== last) changes.push('Фамилия: «' + (orig.last_name || '') + '» → «' + last + '»');
        if ((orig.first_name || '') !== first) changes.push('Имя: «' + (orig.first_name || '') + '» → «' + first + '»');
        if ((orig.middle_name || '') !== middle) changes.push('Отчество: «' + (orig.middle_name || '') + '» → «' + middle + '»');
        if ((orig.birth_date || '') !== birthIso) changes.push('Дата рождения изменена');
        if ((orig.passport || '') !== passport) changes.push('Паспорт изменён');
        if (changes.length > 0) {
          var msg = 'Изменения:\n' + changes.join('\n') + '\n\nВерны ли данные? Сохранить?';
          (typeof showAppConfirm === 'function' ? showAppConfirm(msg, 'Подтверждение') : Promise.resolve(confirm(msg)))
            .then(function(ok) { if (ok) doSave(); })
            .catch(function() {});
          return;
        }
      }
      doSave();
    });
    root.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
    if (birthInput) birthInput.focus();
  };

  function renderBookingCards(items, containerId) {
    var list = document.getElementById(containerId);
    if (!list) return;
    var esc = function(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var getBadge = typeof getStatusBadge === 'function' ? getStatusBadge : function(s) { return { class: 'badge badge--neutral', label: s || '—' }; };
    var iconCross = (typeof APP_ICONS !== 'undefined' && APP_ICONS.crossS) ? APP_ICONS.crossS : '';
    var iconCheck = (typeof APP_ICONS !== 'undefined' && APP_ICONS.check) ? APP_ICONS.check : '';
    list.innerHTML = items.length ? items.map(function(b) {
      var badge = getBadge(b.status);
      var badgeHtml = '<span class="' + esc(badge.class) + '">' + (badge.class.indexOf('success') !== -1 ? iconCheck : '') + '<span>' + esc(badge.label) + '</span></span>';
      var cancelBtn = (b.status !== 'cancelled' && b.status !== 'done' && b.status !== 'ticket_sent') ? ' <button type="button" class="btn btn-outline btn-small cancel-booking" data-id="' + esc(b.booking_id) + '">' + iconCross + ' Отменить</button>' : '';
      var detailsBtn = '<button type="button" class="btn btn-outline btn-small booking-details" data-id="' + esc(b.booking_id) + '">Подробнее</button>';
      return '<div class="trip-card booking-card">' +
        '<div class="booking-card__head"><strong>' + esc(b.booking_id) + '</strong> — ' + esc(b.route_name) + '</div>' +
        '<div class="booking-card__meta">' + esc(b.departure_date) + ' ' + esc(b.departure_time) + ' | ' + esc(b.price_total) + ' ' + esc(b.currency) + ' | ' + badgeHtml + '</div>' +
        '<div class="booking-card__actions">' + detailsBtn + cancelBtn + '</div></div>';
    }).join('') : (typeof APP_ICONS !== 'undefined' && APP_ICONS.bus ? '<div class="empty-state"><span class="icon icon--l">' + APP_ICONS.bus + '</span><p class="empty-state__title">' + (typeof t === 'function' ? t('noBookings') : 'Пока нет заявок') + '</p><p>' + (typeof t === 'function' ? t('noBookingsHint') : 'Здесь появятся ваши поездки') + '</p></div>' : '<p>' + (typeof t === 'function' ? t('noBookings') : 'Нет заявок') + '.</p>');
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
              .then(function() { if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success'); loadBookings(); })
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
        apiFn('/api/bookings/' + encodeURIComponent(bid))
          .then(function(booking) { showBookingDetailsModal(booking); })
          .catch(function(e) {
            var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
            (typeof showAppAlert === 'function' ? showAppAlert(text, 'Ошибка') : alert(text));
          });
      });
    });
  }

  function updateProfileStats(items) {
    var block = document.getElementById('profileStatsBlock');
    if (!block) return;
    var tripsEl = document.getElementById('profileStatTrips');
    var spentEl = document.getElementById('profileStatSpent');
    var nextEl = document.getElementById('profileStatNext');
    if (!items.length) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');
    var completed = items.filter(function(b) { return b.status === 'done'; });
    var paidOrDone = items.filter(function(b) { return ['paid', 'ticket_sent', 'done'].indexOf(b.status) !== -1; });
    var totalSpent = paidOrDone.reduce(function(sum, b) { return sum + (parseFloat(b.price_total) || 0); }, 0);
    var currency = (paidOrDone[0] && paidOrDone[0].currency) || 'BYN';
    if (tripsEl) tripsEl.textContent = completed.length;
    if (spentEl) spentEl.textContent = Math.round(totalSpent * 100) / 100 + ' ' + currency;
    var upcoming = items.filter(function(b) {
      return ['new', 'active', 'paid', 'payment_link_sent', 'ticket_sent'].indexOf(b.status) !== -1 && b.departure_date;
    });
    if (nextEl) {
      if (!upcoming.length) {
        nextEl.textContent = '—';
        return;
      }
      upcoming.sort(function(a, b) {
        var da = (a.departure_date || '') + ' ' + (a.departure_time || '');
        var db = (b.departure_date || '') + ' ' + (b.departure_time || '');
        return da.localeCompare(db);
      });
      var next = upcoming[0];
      var depDate = next.departure_date;
      var depTime = next.departure_time || '';
      var label = depDate + (depTime ? ' ' + depTime : '');
      var today = new Date().toISOString().slice(0, 10);
      if (depDate === today) label = (typeof t === 'function' ? t('today') : 'Сегодня') + (depTime ? ' ' + depTime : '');
      nextEl.textContent = label;
    }
  }

  function showBookingsSkeleton() {
    var html = '<div class="skeleton-card trip-card"><div class="skeleton skeleton-line skeleton-line--title"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></div>' +
      '<div class="skeleton-card trip-card"><div class="skeleton skeleton-line skeleton-line--title"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></div>' +
      '<div class="skeleton-card trip-card"><div class="skeleton skeleton-line skeleton-line--title"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></div>';
    ['bookingsListActive', 'bookingsListUpcoming', 'bookingsListCompleted', 'bookingsListCancelled'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
  }

  function loadBookings() {
    showBookingsSkeleton();
    apiFn('/api/user/bookings').then(function(data) {
      var items = data.bookings || [];
      var today = new Date().toISOString().slice(0, 10);
      var active = items.filter(function(b) { return ['active', 'paid', 'payment_link_sent', 'ticket_sent'].indexOf(b.status) !== -1; });
      var upcoming = items.filter(function(b) { return b.status === 'new' && b.departure_date >= today; });
      var completed = items.filter(function(b) { return b.status === 'done'; });
      var cancelled = items.filter(function(b) { return b.status === 'cancelled'; });
      updateProfileStats(items);
      renderBookingCards(active, 'bookingsListActive');
      renderBookingCards(upcoming, 'bookingsListUpcoming');
      renderBookingCards(completed, 'bookingsListCompleted');
      renderBookingCards(cancelled, 'bookingsListCancelled');
    }).catch(function() {
      ['bookingsListActive', 'bookingsListUpcoming', 'bookingsListCompleted', 'bookingsListCancelled'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = '<p>Ошибка загрузки.</p>';
      });
    });
  }

  function minutesUntilDeparture(depDateStr, depTimeStr) {
    if (!depDateStr || !depTimeStr) return null;
    var d = depDateStr.split('-').map(Number);
    var t = depTimeStr.trim().split(':');
    if (d.length !== 3 || t.length < 2) return null;
    var dep = new Date(d[0], d[1] - 1, d[2], parseInt(t[0], 10) || 0, parseInt(t[1], 10) || 0, 0);
    return Math.floor((dep - new Date()) / 60000);
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
    var rescheduleText = (typeof t === 'function' ? t('rescheduleDate') : 'Перенести дату');
    var routeType = booking.route_type || 'local';
    var mins = minutesUntilDeparture(booking.departure_date, booking.departure_time);
    var bookingId = booking.booking_id;
    window.__rescheduleClick = function() {
      if (mins === null) { (typeof showAppAlert === 'function' ? showAppAlert : alert)('Не удалось определить дату отправления.'); return; }
      var limitMin = routeType === 'international' ? 120 : 15;
      if (mins < limitMin) {
        var msg = routeType === 'international'
          ? 'Перенос менее чем за 2 часа до отправления возможен только через диспетчера. Обратитесь в поддержку в Telegram или по телефону.'
          : 'Перенос менее чем за 15 минут до отправления возможен только через диспетчера. Обратитесь в поддержку.';
        (typeof showAppAlert === 'function' ? showAppAlert : alert)(msg);
        return;
      }
      var today = new Date();
      var minDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      var root = document.getElementById('app-modal-root') || document.body;
      var overlay = document.createElement('div');
      overlay.className = 'app-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      var hintText = 'Выберите новую дату поездки. Заявка будет отправлена диспетчеру на одобрение.';
      overlay.innerHTML = '<div class="app-modal-content">' +
        '<div class="app-modal-header"><h2 class="app-modal-title">' + rescheduleText + '</h2><button type="button" class="app-modal-close reschedule-modal-close" aria-label="Закрыть">&times;</button></div>' +
        '<div class="app-modal-body">' +
        '<p class="field-hint">' + hintText + '</p>' +
        '<div class="field-group"><label for="rescheduleNewDate">Новая дата</label><input type="date" id="rescheduleNewDate" min="' + minDate + '" class="reschedule-date-input"></div>' +
        '<p id="rescheduleError" class="field-error"></p></div>' +
        '<div class="app-modal-footer">' +
        '<button type="button" class="btn btn-secondary app-modal-btn reschedule-cancel">Отмена</button>' +
        '<button type="button" class="btn btn-primary app-modal-btn reschedule-submit">Отправить заявку диспетчеру</button></div></div>';
      function closeRescheduleModal() {
        overlay.classList.remove('app-modal-visible');
        setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
      }
      overlay.querySelector('.reschedule-modal-close').addEventListener('click', closeRescheduleModal);
      overlay.querySelector('.reschedule-cancel').addEventListener('click', closeRescheduleModal);
      overlay.addEventListener('click', function(e) { if (e.target === overlay) closeRescheduleModal(); });
      overlay.querySelector('.reschedule-submit').addEventListener('click', function() {
        var dateInp = overlay.querySelector('#rescheduleNewDate');
        var newDate = dateInp ? dateInp.value.trim() : '';
        var errEl = overlay.querySelector('#rescheduleError');
        if (errEl) errEl.textContent = '';
        if (!newDate) { if (errEl) errEl.textContent = 'Выберите дату.'; return; }
        var btn = overlay.querySelector('.reschedule-submit');
        if (btn) btn.disabled = true;
        apiFn('/api/bookings/' + encodeURIComponent(bookingId) + '/reschedule-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_date: newDate })
        }).then(function() {
          closeRescheduleModal();
          (typeof showAppAlert === 'function' ? showAppAlert : alert)('Заявка на перенос отправлена диспетчеру. Ожидайте подтверждения.', 'Перенести дату');
          loadBookings();
        }).catch(function(e) {
          var text = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка');
          if (errEl) errEl.textContent = text;
          (typeof showAppAlert === 'function' ? showAppAlert : alert)(text, 'Ошибка');
          if (btn) btn.disabled = false;
        });
      });
      root.appendChild(overlay);
      requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
    };
    var badge = typeof getStatusBadge === 'function' ? getStatusBadge(booking.status) : { class: 'badge badge--neutral', label: booking.status || '—' };
    var iconCheck = (typeof APP_ICONS !== 'undefined' && APP_ICONS.check) ? APP_ICONS.check : '';
    var statusBadgeHtml = '<span class="' + esc(badge.class) + '">' + (badge.class.indexOf('success') !== -1 ? iconCheck : '') + '<span>' + esc(badge.label) + '</span></span>';
    var showQr = (booking.status === 'paid' || booking.status === 'active' || booking.status === 'ticket_sent');
    var qrBlock = showQr ? '<div class="booking-details-modal__qr-wrap"><p class="booking-details-modal__qr-label">QR билета</p><div id="bookingDetailsQr" class="booking-details-modal__qr" data-booking-id="' + esc(booking.booking_id) + '"></div></div>' : '';
    var successUrl = window.location.origin + window.location.pathname.replace(/profile\.html$/, 'success.html') + '?booking_id=' + encodeURIComponent(booking.booking_id);
    var html = '<div class="booking-details-modal">' +
      qrBlock +
      '<p><strong>Маршрут:</strong> ' + esc(booking.route_name) + ' (' + esc(from) + ' → ' + esc(to) + ')</p>' +
      '<p><strong>Дата и время:</strong> ' + esc(booking.departure_date) + ' ' + esc(booking.departure_time) + '</p>' +
      '<p><strong>Пассажиры:</strong><br>' + passengersStr + '</p>' +
      (booking.contact_phone ? '<p><strong>Контактный телефон:</strong> ' + esc(booking.contact_phone) + '</p>' : '') +
      '<p><strong>Стоимость:</strong> ' + esc(booking.price_total) + ' ' + esc(booking.currency || 'BYN') + '</p>' +
      '<p><strong>Статус:</strong> ' + statusBadgeHtml + '</p>' +
      '<div class="booking-details-modal__actions">' +
      '<button type="button" class="btn btn-primary reschedule-date-btn">' + esc(rescheduleText) + '</button> ' +
      '<a href="success.html?booking_id=' + encodeURIComponent(booking.booking_id) + '" class="btn btn-outline">Страница заявки</a></div></div>';
    if (typeof showAppModal === 'function') {
      showAppModal({ title: (typeof t === 'function' ? t('details') : 'Подробнее'), html: html, buttons: [{ text: typeof t === 'function' ? t('close') : 'Закрыть', primary: true }], hideHeaderClose: true });
      setTimeout(function() {
        var qrEl = document.getElementById('bookingDetailsQr');
        if (qrEl && typeof QRCode !== 'undefined' && !qrEl.querySelector('canvas') && !qrEl.querySelector('img')) {
          qrEl.innerHTML = '';
          new QRCode(qrEl, { text: successUrl, width: 80, height: 80 });
        }
      }, 150);
      var btn = document.querySelector('.app-modal-root .reschedule-date-btn');
      if (btn) btn.addEventListener('click', function() { window.__rescheduleClick && window.__rescheduleClick(); });
    } else {
      (typeof showAppAlert === 'function' ? showAppAlert : alert)(html.replace(/<[^>]+>/g, ' '), 'Подробнее');
    }
  }

  function loadPassengers() {
    var list = document.getElementById('passengersList');
    apiFn('/api/user/passengers').then(function(data) {
      var items = data.passengers || [];
      var esc = function(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var iconPassenger = (typeof APP_ICONS !== 'undefined' && APP_ICONS.passenger) ? APP_ICONS.passenger : '';
      list.innerHTML = items.map(function(p) {
        var nameLine = esc(p.last_name) + ' ' + esc(p.first_name) + (p.middle_name ? ' ' + esc(p.middle_name) : '');
        var dobLine = typeof datePickerIsoToDisplay === 'function' ? (datePickerIsoToDisplay(p.birth_date) || p.birth_date) : p.birth_date;
        var docLine = p.passport ? ('Документ: ' + esc(p.passport)) : '';
        return '<div class="passenger-card trip-card" data-id="' + esc(p.id) + '">' +
          '<div class="passenger-card__info">' +
          '<div class="passenger-card__name">' + iconPassenger + ' ' + nameLine + '</div>' +
          (dobLine ? '<div class="passenger-card__meta">' + esc(dobLine) + '</div>' : '') +
          (docLine ? '<div class="passenger-card__meta">' + docLine + '</div>' : '') +
          '</div>' +
          '<div class="passenger-card__actions">' +
          '<button type="button" class="btn btn-small btn-outline edit-passenger" data-id="' + esc(p.id) + '">Редактировать</button>' +
          '<button type="button" class="btn btn-small btn-outline delete-passenger" data-id="' + esc(p.id) + '">Удалить</button>' +
          '</div></div>';
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
      list.querySelectorAll('.edit-passenger').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = btn.getAttribute('data-id');
          var item = items.filter(function(p) { return String(p.id) === id; })[0];
          if (item) {
            var pass = (item.passport || '').replace(/\s/g, '');
            var countryCode = pass.replace(/\D/g, '').length === 10 ? 'RU' : (pass.length >= 9 && /^[A-Z]{2}\d{7}$/i.test(pass.replace(/[^A-Z0-9]/g, '')) ? 'BY' : 'OTHER');
            showAddPassengerModal(apiFn, loadPassengers, { id: item.id, last_name: item.last_name, first_name: item.first_name, middle_name: item.middle_name || '', birth_date: item.birth_date || '', passport: item.passport || '', passport_country: countryCode });
          }
        });
      });
    }).catch(function() { list.innerHTML = '<p>\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.</p>'; });
  }

  var refreshBookingsBtn = document.getElementById('refreshBookingsBtn');
  if (refreshBookingsBtn) refreshBookingsBtn.addEventListener('click', function() { loadBookings(); if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred('light'); });
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

  var profilePhoneEl = document.getElementById('profilePhone');
  var saveProfileBtn = document.getElementById('saveProfileBtn');
  if (profilePhoneEl && saveProfileBtn) {
    apiFn('/api/user/profile').then(function(data) { if (data && data.phone) profilePhoneEl.value = data.phone || ''; }).catch(function() {});
    saveProfileBtn.addEventListener('click', function() {
      var phone = profilePhoneEl.value.trim();
      saveProfileBtn.disabled = true;
      apiFn('/api/user/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone }) })
        .then(function() {
          var msg = document.getElementById('profileSaveMessage');
          if (msg) { msg.textContent = (typeof t === 'function' ? t('saved') : 'Сохранено.'); msg.classList.remove('hidden'); setTimeout(function() { msg.classList.add('hidden'); }, 2000); }
          if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        })
        .catch(function(e) { (typeof showAppAlert === 'function' ? showAppAlert : alert)((e && e.message) || (typeof t === 'function' ? t('error') : 'Ошибка'), (typeof t === 'function' ? t('error') : 'Ошибка')); })
        .finally(function() { saveProfileBtn.disabled = false; });
    });
  }
})();
