(function() {
  const params = new URLSearchParams(window.location.search);
  const routeId = params.get('route_id');
  const fromCity = params.get('from') || '';
  const toCity = params.get('to') || '';
  const dateStr = params.get('date') || '';
  const timeStr = params.get('time') || '';

  if (!routeId || !fromCity || !toCity || !dateStr || !timeStr) {
    window.location.href = 'index.html';
    return;
  }

  let route = null;
  let passengerCount = 1;
  const passengers = [];

  document.getElementById('routeSummary').textContent = fromCity + ' \u2192 ' + toCity + ', ' + dateStr + ' ' + timeStr;

  fetch((typeof BASE_URL !== 'undefined' ? BASE_URL : '') + '/api/routes').then(function(r) { return r.json(); }).then(function(data) {
    route = (data.routes || []).find(function(r) { return r.id === routeId; });
    if (!route) { window.location.href = 'index.html'; return; }
    var borderEl = document.getElementById('borderDocs');
    if (route.border_docs_text) borderEl.textContent = 'Документы для границы: ' + route.border_docs_text;
    else borderEl.textContent = '';
    renderPassengers();
    loadSavedPassengersForFill();
  });

  var savedPassengersForFill = [];

  function loadSavedPassengersForFill() {
    if (!route || route.type !== 'international') return;
    var apiFn = typeof api === 'function' ? api : null;
    if (!apiFn || (typeof getTelegramUserId === 'function' && !getTelegramUserId())) return;
    apiFn('/api/user/passengers').then(function(data) {
      savedPassengersForFill = data.passengers || [];
      var wrap = document.getElementById('fillFromProfileWrap');
      if (wrap && savedPassengersForFill.length) wrap.classList.remove('hidden');
    }).catch(function() {});
  }

  function fillFromSavedPassengers() {
    for (var i = 0; i < passengerCount && i < savedPassengersForFill.length; i++) {
      var s = savedPassengersForFill[i];
      var bd = s.birth_date ? (typeof isoToDob === 'function' ? isoToDob(s.birth_date) : s.birth_date) : '';
      passengers[i] = { last_name: s.last_name || '', first_name: s.first_name || '', middle_name: s.middle_name || '', birth_date: s.birth_date || '', passport: s.passport || '' };
    }
    renderPassengers();
  }

  document.getElementById('fillFromProfile').addEventListener('click', fillFromSavedPassengers);

  document.getElementById('forAnotherPerson').addEventListener('change', function() {
    document.getElementById('anotherPhoneBlock').classList.toggle('hidden', !this.checked);
  });

  document.getElementById('passengerPlus').addEventListener('click', function() { passengerCount = Math.min(10, passengerCount + 1); updatePassengerNum(); renderPassengers(); });
  document.getElementById('passengerMinus').addEventListener('click', function() { passengerCount = Math.max(1, passengerCount - 1); updatePassengerNum(); renderPassengers(); });

  function updatePassengerNum() {
    document.getElementById('passengerNum').textContent = passengerCount;
  }

  function getEl(id) { return document.getElementById(id); }
  function setError(id, text) { var el = getEl(id); if (el) { el.textContent = text || ''; } }
  function clearStep1Errors() {
    setError('step1Errors');
    setError('passengerCountError');
    document.querySelectorAll('.passenger-block .field-error, .passenger-block-error').forEach(function(e) { e.textContent = ''; });
  }
  function clearStep2Errors() { setError('phoneError'); }

  function renderPassengers() {
    var list = getEl('passengersList');
    list.innerHTML = '';
    var isInternational = route && route.type === 'international';
    for (var i = 0; i < passengerCount; i++) {
      var p = passengers[i] || { last_name: '', first_name: '', middle_name: '', birth_date: '', passport: '' };
      var div = document.createElement('div');
      div.className = 'passenger-block';
      div.setAttribute('data-passenger-index', i);
      if (isInternational) {
        var birthVal = (p.birth_date || '');
        if (birthVal.length === 10 && birthVal.indexOf('-') !== -1 && typeof isoToDob === 'function') birthVal = isoToDob(birthVal);
        else if (birthVal.length === 10 && birthVal.indexOf('.') !== -1) { }
        else if (birthVal && birthVal.length !== 10) birthVal = typeof isoToDob === 'function' ? isoToDob(birthVal) : '';
        var passportDisplay = (p.passport || '');
        if (passportDisplay.length === 9 && passportDisplay.indexOf(' ') === -1) passportDisplay = passportDisplay.slice(0, 2) + ' ' + passportDisplay.slice(2);
        var passportRow = '<div class="field-group"><label>Паспорт (международный) <span class="required">*</span></label><p class="field-hint">Серия и номер: МР или MR и 7 цифр. Можно вводить кириллицей или латиницей.</p><input type="text" inputmode="text" maxlength="10" placeholder="МР 1234567" data-i="' + i + '" data-f="passport" value="' + passportDisplay + '"><span class="field-error" data-passenger-error="' + i + '"></span></div>';
        div.innerHTML =
          '<label class="passenger-block__title">Пассажир ' + (i + 1) + '</label>' +
          '<div class="field-group"><label>Фамилия <span class="required">*</span></label><input type="text" placeholder="Иванов" data-i="' + i + '" data-f="last_name" value="' + (p.last_name || '') + '"></div>' +
          '<div class="field-group"><label>Имя <span class="required">*</span></label><input type="text" placeholder="Иван" data-i="' + i + '" data-f="first_name" value="' + (p.first_name || '') + '"></div>' +
          '<div class="field-group"><label>Отчество</label><input type="text" placeholder="Иванович" data-i="' + i + '" data-f="middle_name" value="' + (p.middle_name || '') + '"></div>' +
          '<div class="field-group"><label>Дата рождения пассажира <span class="required">*</span></label><p class="field-hint">День.Месяц.Год, например 31.12.1990</p><input type="text" inputmode="numeric" maxlength="10" placeholder="31.12.1990" data-i="' + i + '" data-f="birth_date" value="' + (birthVal || '') + '"><span class="field-error" data-dob-error="' + i + '"></span></div>' +
          passportRow +
          '<span class="field-error passenger-block-error" data-passenger-index="' + i + '"></span>';
      } else {
        div.innerHTML =
          '<label class="passenger-block__title">Пассажир ' + (i + 1) + '</label>' +
          '<p class="field-hint field-hint--block">Для внутреннего рейса достаточно имени и контактного телефона (телефон — на следующем шаге).</p>' +
          '<div class="field-group"><label>Имя пассажира <span class="required">*</span></label><input type="text" placeholder="Иван Иванов" data-i="' + i + '" data-f="first_name" value="' + (p.first_name || '') + '"></div>' +
          '<span class="field-error passenger-block-error" data-passenger-index="' + i + '"></span>';
      }
      list.appendChild(div);
    }
    list.querySelectorAll('input').forEach(function(inp) {
      inp.addEventListener('input', function() { clearStep1Errors(); });
      inp.addEventListener('change', function() {
        var i = parseInt(this.getAttribute('data-i'), 10);
        var f = this.getAttribute('data-f');
        if (!passengers[i]) passengers[i] = {};
        passengers[i][f] = this.value;
      });
      if (inp.getAttribute('data-f') === 'birth_date' && typeof formatDobInput === 'function') {
        inp.addEventListener('input', function() {
          var v = formatDobInput(this.value);
          if (v !== this.value) { this.value = v; var i = parseInt(this.getAttribute('data-i'), 10); if (!passengers[i]) passengers[i] = {}; passengers[i].birth_date = v; }
        });
      }
      if (inp.getAttribute('data-f') === 'passport' && typeof formatPassportInput === 'function') {
        inp.addEventListener('input', function() {
          var v = formatPassportInput(this.value);
          if (v !== this.value) { this.value = v; var i = parseInt(this.getAttribute('data-i'), 10); if (!passengers[i]) passengers[i] = {}; passengers[i].passport = v; }
        });
      }
    });
  }

  function collectPassengers() {
    document.querySelectorAll('#passengersList input').forEach(function(inp) {
      var i = parseInt(inp.getAttribute('data-i'), 10);
      var f = inp.getAttribute('data-f');
      if (!passengers[i]) passengers[i] = {};
      var val = inp.value;
      if (f === 'birth_date' && typeof dobToIso === 'function') val = dobToIso(val) || val;
      if (f === 'passport' && typeof passportToApi === 'function') val = passportToApi(val) || val;
      passengers[i][f] = val;
    });
    var isInternational = route && route.type === 'international';
    return passengers.slice(0, passengerCount).map(function(p) {
      if (isInternational) {
        var bd = p.birth_date || '';
        if (bd.length === 10 && bd.indexOf('-') === -1 && typeof dobToIso === 'function') bd = dobToIso(bd) || bd;
        var pass = p.passport || '';
        if (typeof passportToApi === 'function') pass = passportToApi(pass) || pass;
        return { last_name: p.last_name || '', first_name: p.first_name || '', middle_name: p.middle_name || '', birth_date: bd, passport: pass };
      }
      return { last_name: '', first_name: (p.first_name || '').trim(), middle_name: '', birth_date: '', passport: '' };
    });
  }

  document.getElementById('toStep2').addEventListener('click', function() {
    collectPassengers();
    clearStep1Errors();
    var isInternational = route && route.type === 'international';
    var list = passengers.slice(0, passengerCount);
    if (isInternational) {
      var valid = list.every(function(p) { return p.last_name && p.first_name && p.birth_date; });
      if (!valid) {
        setError('step1Errors', 'Заполните фамилию, имя и дату рождения у всех пассажиров.');
        var firstInvalid = list.findIndex(function(p) { return !p.last_name || !p.first_name || !p.birth_date; });
        var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + firstInvalid + '"]');
        if (errEl) errEl.textContent = 'Укажите фамилию, имя и дату рождения.';
        return;
      }
      var hasPassport = list.every(function(p) {
        var raw = p.passport || '';
        var pass = typeof passportToApi === 'function' ? passportToApi(raw) : raw.replace(/\s/g, '');
        return pass && /^[A-Z]{2}\d{7}$/i.test(pass);
      });
      if (!hasPassport) {
        setError('step1Errors', 'Для международного рейса укажите паспорт у каждого пассажира (формат: МР1234567).');
        return;
      }
    } else {
      var validLocal = list.every(function(p) { return (p.first_name || '').trim(); });
      if (!validLocal) {
        setError('step1Errors', 'Укажите имя каждого пассажира.');
        var firstInvalid = list.findIndex(function(p) { return !(p.first_name || '').trim(); });
        var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + firstInvalid + '"]');
        if (errEl) errEl.textContent = 'Введите имя пассажира.';
        return;
      }
    }
    getEl('step1').classList.add('hidden');
    getEl('step2').classList.remove('hidden');
    clearStep2Errors();
    var phoneVal = (typeof getTelegramUserId === 'function' && getTelegramUserId() ? '' : '');
    if (getEl('phone').value.trim() === '' && phoneVal) getEl('phone').value = phoneVal;
    var oneWay = route ? (route.base_price || 0) * passengerCount : 0;
    getEl('priceSummary').textContent = 'Итого: ' + oneWay.toFixed(2) + ' BYN';
  });

  getEl('backToStep1').addEventListener('click', function() {
    getEl('step2').classList.add('hidden');
    getEl('step1').classList.remove('hidden');
    clearStep2Errors();
  });

  getEl('phone').addEventListener('input', function() { clearStep2Errors(); });

  document.getElementById('submitBooking').addEventListener('click', function() {
    var phone = getEl('phone').value.trim();
    clearStep2Errors();
    if (!phone) {
      setError('phoneError', 'Укажите контактный телефон.');
      return;
    }
    var paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    var pass = collectPassengers();
    var payload = {
      route_id: routeId,
      from_city: fromCity,
      to_city: toCity,
      departure_date: dateStr,
      departure_time: timeStr,
      passengers: pass,
      is_round_trip: false,
      is_for_another_person: getEl('forAnotherPerson').checked,
      another_person_phone: getEl('forAnotherPerson').checked ? getEl('anotherPersonPhone').value : null,
      phone: phone,
      save_phone_in_profile: getEl('savePhone').checked,
      payment_method: paymentMethod,
      user_id: typeof getTelegramUserId === 'function' && getTelegramUserId() ? parseInt(getTelegramUserId(), 10) : null
    };
    if (getEl('savePassengers') && getEl('savePassengers').checked) payload.save_passengers_to_profile = true;
    var base = typeof BASE_URL !== 'undefined' ? BASE_URL : '';
    var submitBtn = getEl('submitBooking');
    submitBtn.disabled = true;
    function onError(e) {
      setError('phoneError', e.message || 'Ошибка создания заявки. Попробуйте ещё раз.');
      submitBtn.disabled = false;
    }
    if (typeof api === 'function') {
      api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
        .then(function(res) {
          if (payload.save_passengers_to_profile && pass.length && typeof api === 'function') {
            var saveNext = function(idx) {
              if (idx >= pass.length) { window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id); return; }
              var p = pass[idx];
              api('/api/user/passengers', { method: 'POST', body: JSON.stringify({ last_name: p.last_name || '', first_name: p.first_name || '', middle_name: p.middle_name || '', birth_date: p.birth_date || null, passport: p.passport || '' }) })
                .catch(function() {})
                .then(function() { saveNext(idx + 1); });
            };
            saveNext(0);
          } else {
            window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id);
          }
        })
        .catch(onError);
      return;
    }
    fetch(base + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(r) { return r.json().then(function(data) { if (!r.ok) throw new Error(data.detail && (data.detail.code ? (typeof userFriendlyMessage === 'function' ? userFriendlyMessage(data.detail) : data.detail.code) : data.detail) || r.statusText); return data; }); })
      .then(function(res) {
        if (payload.save_passengers_to_profile && pass.length && typeof api === 'function') {
          var saveNext = function(idx) {
            if (idx >= pass.length) { window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id); return; }
            var p = pass[idx];
            api('/api/user/passengers', { method: 'POST', body: JSON.stringify({ last_name: p.last_name || '', first_name: p.first_name || '', middle_name: p.middle_name || '', birth_date: p.birth_date || null, passport: p.passport || '' }) }).catch(function() {}).then(function() { saveNext(idx + 1); });
          };
          saveNext(0);
        } else {
          window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id);
        }
      })
      .catch(onError);
  });

  updatePassengerNum();
  renderPassengers();
})();
