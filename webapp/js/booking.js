(function() {
  const params = new URLSearchParams(window.location.search);
  const routeId = params.get('route_id');
  const fromCity = params.get('from') || '';
  const toCity = params.get('to') || '';
  const dateStr = params.get('date') || '';
  const timeStr = params.get('time') || '';

  if (!routeId || !fromCity || !toCity || !dateStr || !timeStr) {
    window.location.href = 'index.html?error=invalid_booking_link';
    return;
  }

  function getCurrentStep() {
    var s2 = document.getElementById('step2');
    return s2 && !s2.classList.contains('hidden') ? 2 : 1;
  }

  function updateBookingUIForStep(step) {
    var stepperSteps = document.querySelectorAll('.stepper .step');
    stepperSteps.forEach(function(s) {
      s.classList.toggle('active', parseInt(s.getAttribute('data-step'), 10) === step);
    });
    var toStep2Btn = document.getElementById('toStep2');
    var backBtn = document.getElementById('backToStep1');
    var submitBtn = document.getElementById('submitBooking');
    if (step === 1) {
      if (toStep2Btn) toStep2Btn.style.display = '';
      if (backBtn) backBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
    } else {
      if (toStep2Btn) toStep2Btn.style.display = 'none';
      if (backBtn) backBtn.style.display = '';
      if (submitBtn) submitBtn.style.display = '';
    }
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.MainButton) {
      window.Telegram.WebApp.MainButton.hide();
    }
  }

  let route = null;
  let passengerCount = 1;
  const passengers = [];

  var routeSummaryEl = document.getElementById('routeSummary');
  if (routeSummaryEl) routeSummaryEl.textContent = fromCity + ' \u2192 ' + toCity + ', ' + dateStr + ' ' + timeStr;

  var ROUTES_FETCH_TIMEOUT_MS = 15000;
  var base = (typeof BASE_URL !== 'undefined' ? BASE_URL : '') + '/api/routes';
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, ROUTES_FETCH_TIMEOUT_MS);
  function clearRoutesTimeout() { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } }
  fetch(base, { signal: controller.signal }).then(function(r) {
    clearRoutesTimeout();
    return r.json().then(function(data) {
      if (!r.ok) throw new Error(data.detail || data.message || 'Ошибка ' + r.status);
      return data;
    });
  }).then(function(data) {
    route = (data.routes || []).find(function(r) { return r.id === routeId; });
    if (!route) { window.location.href = 'index.html'; return; }
    var borderEl = document.getElementById('borderDocs');
    if (route.border_docs_text) borderEl.textContent = 'Документы для границы: ' + route.border_docs_text;
    else borderEl.textContent = '';
    updateDiscountsBlock();
    renderPassengers();
    loadSavedPassengersForFill();
    if (typeof updateBookingUIForStep === 'function') updateBookingUIForStep(1);
  }).catch(function(err) {
    clearRoutesTimeout();
    var list = document.getElementById('passengersList');
    var loadingEl = document.getElementById('passengersListLoading');
    if (loadingEl) loadingEl.remove();
    var msg = 'Не удалось загрузить маршруты. Проверьте интернет или откройте позже.';
    var html = '<div class="booking-error-block"><p class="field-error">' + msg + '</p><p><button type="button" class="btn btn-primary" id="retryRoutesBtn">Повторить</button> <a href="index.html" class="btn btn-outline">Выбрать маршрут</a></p></div>';
    if (list) list.innerHTML = html;
    document.getElementById('retryRoutesBtn').addEventListener('click', function() { window.location.reload(); });
    if (typeof showAppAlert === 'function') showAppAlert(msg, 'Ошибка');
    if (typeof updateBookingUIForStep === 'function') updateBookingUIForStep(1);
  });

  function getDiscountRulesText() {
    if (!route) return '';
    var name = (route.name || '').replace(/\s*→\s*/, ' — ');
    if (route.type === 'international') {
      return 'Льготы по маршруту ' + name + ': до 2 лет включительно — скидка 100%, с предоставлением места; до 11 лет включительно — скидка 50%, с предоставлением места.';
    }
    if (route.type === 'local') {
      return 'Льготы по маршруту Гомель — Мозырь — Гомель: до 9 лет включительно — скидка 50%, с предоставлением места. При указании даты рождения скидка рассчитывается автоматически.';
    }
    return '';
  }

  function updateDiscountsBlock() {
    var block = document.getElementById('discountsBlock');
    if (!block) return;
    var text = getDiscountRulesText();
    if (!text) { block.classList.add('hidden'); block.innerHTML = ''; return; }
    block.classList.remove('hidden');
    block.innerHTML = '<p class="discounts-block__text">' + (typeof escapeHtml === 'function' ? escapeHtml(text) : text.replace(/</g, '&lt;')) + '</p>';
  }

  function getAgeAtTravel(birthIso, travelDateStr) {
    if (!birthIso || birthIso.length !== 10 || !travelDateStr || travelDateStr.length !== 10) return null;
    var b = birthIso.split('-').map(Number);
    var t = travelDateStr.split('-').map(Number);
    if (b.length !== 3 || t.length !== 3) return null;
    var age = t[0] - b[0];
    if (t[1] < b[1] || (t[1] === b[1] && t[2] < b[2])) age--;
    return age >= 0 ? age : null;
  }

  function getPassengerDiscountLabel(birthIso, travelDateStr) {
    if (!route || !route.discount_rules || !birthIso || !travelDateStr) return '';
    var age = getAgeAtTravel(birthIso, travelDateStr);
    if (age === null) return '';
    var rules = route.discount_rules;
    var keys = Object.keys(rules);
    for (var k = 0; k < keys.length; k++) {
      var r = rules[keys[k]];
      var ageTo = r.age_to;
      if (age <= ageTo) return (r.label || keys[k]) + ': скидка ' + (r.discount_percent || 0) + '%, с местом';
    }
    return 'Взрослый';
  }

  function getPassengerDiscountPercent(birthIso, travelDateStr) {
    if (!route || !route.discount_rules || !birthIso || !travelDateStr) return 0;
    var age = getAgeAtTravel(birthIso, travelDateStr);
    if (age === null) return 0;
    var rules = route.discount_rules;
    for (var key in rules) {
      var r = rules[key];
      if (age <= (r.age_to || 0)) return r.discount_percent || 0;
    }
    return 0;
  }

  function recalcPriceSummary() {
    var summaryEl = getEl('priceSummary');
    if (!summaryEl || !route || !dateStr) return;
    var base = route.base_price || 0;
    var total = 0;
    for (var i = 0; i < passengerCount; i++) {
      var p = passengers[i] || {};
      var bd = (p.birth_date || '').trim();
      if (bd.length === 10 && bd.indexOf('-') === -1 && typeof dobToIso === 'function') bd = dobToIso(bd) || bd;
      var pct = getPassengerDiscountPercent(bd, dateStr);
      total += base * (1 - pct / 100);
    }
    summaryEl.textContent = 'Итого: ' + total.toFixed(2) + ' BYN';
  }

  var savedPassengersForFill = [];

  function loadSavedPassengersForFill() {
    var apiFn = typeof api === 'function' ? api : null;
    if (!apiFn || (typeof getTelegramUserId === 'function' && !getTelegramUserId())) return;
    apiFn('/api/user/passengers').then(function(data) {
      savedPassengersForFill = (data.passengers || []).filter(function(p) {
        var pass = (p.passport || '').replace(/\s/g, '').replace(/[^A-Z0-9]/gi, '');
        return (p.last_name || '').trim() && (p.first_name || '').trim() && (p.birth_date || '').trim() &&
          (!route || route.type !== 'international' || pass.length >= 6);
      });
      var wrap = document.getElementById('fillFromProfileWrap');
      if (wrap) wrap.classList.toggle('hidden', !savedPassengersForFill.length);
    }).catch(function() {});
  }

  function fillFromSavedPassengers() {
    if (!savedPassengersForFill.length) {
      if (typeof showAppAlert === 'function') showAppAlert('В профиле нет сохранённых данных пассажира или они неполные.', 'Профиль');
      return;
    }
    var root = document.getElementById('app-modal-root') || (function() { var r = document.createElement('div'); r.id = 'app-modal-root'; r.className = 'app-modal-root'; document.body.appendChild(r); return r; })();
    var overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    var opts = savedPassengersForFill.map(function(p, idx) {
      var label = (p.last_name || '') + ' ' + (p.first_name || '') + (p.birth_date ? ' | ' + (typeof datePickerIsoToDisplay === 'function' ? datePickerIsoToDisplay(p.birth_date) : p.birth_date) : '');
      return '<option value="' + idx + '">' + label.replace(/</g, '&lt;') + '</option>';
    }).join('');
    var rows = '';
    for (var slot = 0; slot < passengerCount; slot++) {
      rows += '<div class="field-group"><label>Пассажир ' + (slot + 1) + '</label><select id="fillSlot' + slot + '" class="fill-slot-select" aria-label="Выберите пассажира">' +
        '<option value="">— Не подставлять</option>' + opts + '</select></div>';
    }
    var html = '<div class="app-modal-header"><h2 class="app-modal-title">Вставить данные пассажира</h2><button type="button" class="app-modal-close fill-profile-close" aria-label="Закрыть">&times;</button></div>' +
      '<div class="app-modal-body"><p class="field-hint">Выберите, чьи данные подставить в каждую позицию.</p>' + rows + '</div>' +
      '<div class="app-modal-footer"><button type="button" class="btn btn-secondary app-modal-btn fill-profile-cancel">Отмена</button><button type="button" class="btn btn-primary app-modal-btn fill-profile-apply">Подставить</button></div>';
    overlay.innerHTML = '<div class="app-modal-content">' + html + '</div>';
    var content = overlay.querySelector('.app-modal-content');
    function closeFillModal() {
      overlay.classList.remove('app-modal-visible');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeFillModal(); });
    content.querySelector('.fill-profile-close').addEventListener('click', closeFillModal);
    content.querySelector('.fill-profile-cancel').addEventListener('click', closeFillModal);
    content.querySelector('.fill-profile-apply').addEventListener('click', function() {
      for (var i = 0; i < passengerCount; i++) {
        var sel = content.querySelector('#fillSlot' + i);
        if (!sel) continue;
        var idx = parseInt(sel.value, 10);
        if (isNaN(idx) || idx < 0 || !savedPassengersForFill[idx]) continue;
        var s = savedPassengersForFill[idx];
        var pass = (s.passport || '').replace(/\s/g, '');
        var countryCode = pass.replace(/\D/g, '').length === 10 ? 'RU' : (pass.length >= 9 && /^[A-Z]{2}\d{7}$/i.test(pass.replace(/[^A-Z0-9]/g, '')) ? 'BY' : 'OTHER';
        passengers[i] = { last_name: s.last_name || '', first_name: s.first_name || '', middle_name: s.middle_name || '', birth_date: s.birth_date || '', passport: s.passport || '', passport_country: countryCode, citizenship: countryCode };
      }
      closeFillModal();
      renderPassengers();
    });
    root.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
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
  function clearStep2Errors() { setError('phoneError'); var g = document.querySelector('.phone-field-group'); if (g) g.classList.remove('phone-field-group--error'); }

  function renderPassengers() {
    var list = getEl('passengersList');
    list.innerHTML = '';
    var isInternational = route && route.type === 'international';
    for (var i = 0; i < passengerCount; i++) {
      var p = passengers[i] || { last_name: '', first_name: '', middle_name: '', birth_date: '', passport: '', passport_country: 'BY' };
      var div = document.createElement('div');
      div.className = 'passenger-block';
      div.setAttribute('data-passenger-index', i);
      if (isInternational) {
        var birthVal = (p.birth_date || '');
        var birthIso = birthVal;
        if (birthVal.length === 10 && birthVal.indexOf('-') !== -1) birthIso = birthVal;
        else if (birthVal.length === 10 && birthVal.indexOf('.') !== -1 && typeof dobToIso === 'function') birthIso = dobToIso(birthVal) || birthVal;
        else if (birthVal && birthVal.length !== 10) birthIso = typeof dobToIso === 'function' ? dobToIso(birthVal) : '';
        var birthDisplay = typeof datePickerIsoToDisplay === 'function' ? datePickerIsoToDisplay(birthIso) : (birthVal.indexOf('.') !== -1 ? birthVal : birthIso);
        var countryCode = p.passport_country || p.citizenship || 'BY';
        var topCountries = typeof PASSPORT_TOP_COUNTRIES !== 'undefined' ? PASSPORT_TOP_COUNTRIES : [];
        var otherCode = typeof PASSPORT_OTHER_CODE !== 'undefined' ? PASSPORT_OTHER_CODE : 'OTHER';
        var countryOpts = topCountries.map(function(c) { return '<option value="' + c.code + '"' + (countryCode === c.code ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
        if (topCountries.length === 0) countryOpts = '<option value="BY"' + (countryCode === 'BY' ? ' selected' : '') + '>Беларусь</option><option value="RU"' + (countryCode === 'RU' ? ' selected' : '') + '>Россия</option>';
        var selectedCountry = typeof getPassportCountry === 'function' ? getPassportCountry(countryCode) : null;
        var passportPlaceholder = selectedCountry ? selectedCountry.example : 'Введите номер паспорта';
        var passportDisplay = (p.passport || '');
        if (typeof passportFormatDisplay === 'function') passportDisplay = passportFormatDisplay(passportDisplay, countryCode);
        else if (countryCode === 'RU' && passportDisplay.length >= 4) passportDisplay = passportDisplay.slice(0, 4) + ' ' + passportDisplay.slice(4);
        else if (passportDisplay.length === 9 && countryCode !== 'RU') passportDisplay = passportDisplay.slice(0, 2) + ' ' + passportDisplay.slice(2);
        var passportRow =
          '<div class="field-group passport-group"><label>Страна выдачи паспорта <span class="required">*</span></label>' +
          '<select class="passport-country" data-i="' + i + '" aria-label="Страна выдачи паспорта">' + countryOpts + '<option value="' + otherCode + '"' + (countryCode === otherCode ? ' selected' : '') + '>Другая страна</option></select></div>' +
          '<div class="field-group"><label>Номер паспорта / ID <span class="required">*</span></label>' +
          '<p class="field-hint passport-format-hint">' + (selectedCountry ? 'Пример: ' + selectedCountry.example : 'Введите номер паспорта') + '</p>' +
          '<input type="text" class="passport-input" data-i="' + i + '" data-f="passport" value="' + (passportDisplay || '') + '" placeholder="' + passportPlaceholder + '" maxlength="20">' +
          '<p class="passport-warning">Паспортные данные передаются пограничным службам. Ошибка в номере → отказ в посадке.</p>' +
          '<button type="button" class="mrz-toggle" data-i="' + i + '">Ввести из MRZ (машинно-читаемая зона)</button>' +
          '<div class="mrz-block hidden" data-i="' + i + '"><input type="text" class="mrz-line1" placeholder="Строка 1 (P&lt;UTO...)" maxlength="44"><input type="text" class="mrz-line2" placeholder="Строка 2 (123456...)" maxlength="44">' +
          '<div class="mrz-actions"><button type="button" class="mrz-parse">Распознать</button><button type="button" class="mrz-cancel">Отмена</button></div></div>' +
          '<span class="field-error" data-passenger-error="' + i + '"></span></div>';
        var birthDisplayDob = (birthIso && typeof isoToDob === 'function') ? isoToDob(birthIso) : (birthVal.indexOf('.') !== -1 ? birthVal : (birthIso ? (birthIso.slice(8, 10) + '.' + birthIso.slice(5, 7) + '.' + birthIso.slice(0, 4)) : ''));
        div.innerHTML =
          '<label class="passenger-block__title">Пассажир ' + (i + 1) + '</label>' +
          '<div class="field-group"><label>Фамилия <span class="required">*</span></label><input type="text" placeholder="Иванов" data-i="' + i + '" data-f="last_name" value="' + (p.last_name || '') + '"></div>' +
          '<div class="field-group"><label>Имя <span class="required">*</span></label><input type="text" placeholder="Иван" data-i="' + i + '" data-f="first_name" value="' + (p.first_name || '') + '"></div>' +
          '<div class="field-group"><label>Отчество</label><input type="text" placeholder="Иванович" data-i="' + i + '" data-f="middle_name" value="' + (p.middle_name || '') + '"></div>' +
          '<div class="field-group"><label>Дата рождения пассажира <span class="required">*</span></label><p class="field-hint">Введите дату в формате ДД.ММ.ГГГГ</p><input type="hidden" data-i="' + i + '" data-f="birth_date" value="' + (birthIso || '') + '"><input type="text" class="birth-date-input" data-i="' + i + '" placeholder="ДД.ММ.ГГГГ" value="' + (birthDisplayDob || '') + '" autocomplete="off"><span class="passenger-discount-label" data-i="' + i + '">' + (getPassengerDiscountLabel(birthIso, dateStr) ? ' • ' + getPassengerDiscountLabel(birthIso, dateStr) : '') + '</span><span class="field-error" data-dob-error="' + i + '"></span></div>' +
          passportRow +
          '<span class="field-error passenger-block-error" data-passenger-index="' + i + '"></span>';
      } else {
        var birthVal = (p.birth_date || '');
        var birthIso = birthVal.length === 10 && birthVal.indexOf('-') !== -1 ? birthVal : (typeof dobToIso === 'function' ? dobToIso(birthVal) || '' : '');
        var birthDisplay = typeof datePickerIsoToDisplay === 'function' ? datePickerIsoToDisplay(birthIso) : (birthVal.indexOf('.') !== -1 ? birthVal : birthIso);
        var birthDisplayDob = (birthIso && typeof isoToDob === 'function') ? isoToDob(birthIso) : (birthVal.indexOf('.') !== -1 ? birthVal : (birthIso ? (birthIso.slice(8, 10) + '.' + birthIso.slice(5, 7) + '.' + birthIso.slice(0, 4)) : ''));
        var discountLabel = getPassengerDiscountLabel(birthIso, dateStr);
        div.innerHTML =
          '<label class="passenger-block__title">Пассажир ' + (i + 1) + '</label>' +
          '<p class="field-hint field-hint--block">Для внутреннего рейса — имя и по желанию дата рождения для расчёта льготы (до 9 лет 50%).</p>' +
          '<div class="field-group"><label>Имя пассажира <span class="required">*</span></label><input type="text" placeholder="Иван Иванов" data-i="' + i + '" data-f="first_name" value="' + (p.first_name || '') + '"></div>' +
          '<div class="field-group"><label>Дата рождения (для льготы)</label><p class="field-hint">Введите дату в формате ДД.ММ.ГГГГ</p><input type="hidden" data-i="' + i + '" data-f="birth_date" value="' + (birthIso || '') + '"><input type="text" class="birth-date-input" data-i="' + i + '" placeholder="ДД.ММ.ГГГГ" value="' + (birthDisplayDob || '') + '" autocomplete="off"><span class="passenger-discount-label" data-i="' + i + '">' + (discountLabel ? ' • ' + discountLabel : '') + '</span></div>' +
          '<span class="field-error passenger-block-error" data-passenger-index="' + i + '"></span>';
      }
      list.appendChild(div);
    }
    list.querySelectorAll('input').forEach(function(inp) {
      inp.addEventListener('input', function() { clearStep1Errors(); });
      var f = inp.getAttribute('data-f');
      if (f === 'last_name' || f === 'first_name' || f === 'middle_name') {
        inp.addEventListener('input', function() {
          var start = this.selectionStart, end = this.selectionEnd;
          this.value = this.value.toUpperCase();
          this.setSelectionRange(start, end);
        });
      }
      inp.addEventListener('change', function() {
        var i = parseInt(this.getAttribute('data-i'), 10);
        var f = this.getAttribute('data-f');
        if (!f) return;
        if (!passengers[i]) passengers[i] = {};
        passengers[i][f] = this.value;
      });
      if (inp.getAttribute('data-f') === 'passport' && inp.classList.contains('passport-input')) {
        inp.addEventListener('input', function() {
          var i = parseInt(this.getAttribute('data-i'), 10);
          var sel = list.querySelector('.passport-country[data-i="' + i + '"]');
          var countryCode = (sel && sel.value) || 'BY';
          if (!passengers[i]) passengers[i] = {};
          var v = typeof passportFormatInput === 'function' ? passportFormatInput(this.value, countryCode) : this.value;
          if (v !== this.value) { this.value = v; passengers[i].passport = v; }
        });
      }
    });
    list.querySelectorAll('.passport-country').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var i = parseInt(sel.getAttribute('data-i'), 10);
        if (!passengers[i]) passengers[i] = {};
        passengers[i].passport_country = sel.value;
        passengers[i].citizenship = sel.value;
        var block = sel.closest('.passenger-block');
        var hint = block && block.querySelector('.passport-format-hint');
        var passInp = block && block.querySelector('.passport-input');
        var country = typeof getPassportCountry === 'function' ? getPassportCountry(sel.value) : null;
        if (hint) hint.textContent = country ? 'Пример: ' + country.example : 'Введите номер паспорта';
        if (passInp) {
          passInp.placeholder = country ? country.example : 'Введите номер паспорта';
          passInp.maxLength = sel.value === 'OTHER' ? 20 : (country && country.pattern === 'digits4_6' ? 11 : 12);
          passInp.inputMode = (country && (country.pattern === 'digits4_6' || country.pattern === 'digits9')) ? 'numeric' : 'text';
          var cur = passInp.value;
          var formatted = typeof passportFormatInput === 'function' ? passportFormatInput(cur, sel.value) : cur;
          if (formatted !== cur) { passInp.value = formatted; passengers[i].passport = formatted; }
        }
        clearStep1Errors();
      });
    });
    list.querySelectorAll('.mrz-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var block = btn.closest('.passenger-block');
        var mrzBlock = block && block.querySelector('.mrz-block[data-i="' + i + '"]');
        if (mrzBlock) mrzBlock.classList.remove('hidden');
      });
    });
    list.querySelectorAll('.mrz-cancel').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mrzBlock = btn.closest('.mrz-block');
        if (mrzBlock) { mrzBlock.classList.add('hidden'); mrzBlock.querySelector('.mrz-line1').value = ''; mrzBlock.querySelector('.mrz-line2').value = ''; }
      });
    });
    list.querySelectorAll('.mrz-parse').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mrzBlock = btn.closest('.mrz-block');
        var i = mrzBlock ? mrzBlock.getAttribute('data-i') : null;
        var line1 = mrzBlock ? mrzBlock.querySelector('.mrz-line1').value.trim().toUpperCase() : '';
        var line2 = mrzBlock ? mrzBlock.querySelector('.mrz-line2').value.trim().toUpperCase() : '';
        var num = typeof parseMrzDocumentNumber === 'function' ? parseMrzDocumentNumber(line1, line2) : null;
        if (num && i !== null) {
          var block = mrzBlock.closest('.passenger-block');
          var passInp = block && block.querySelector('.passport-input');
          var countrySel = block && block.querySelector('.passport-country');
          var countryCode = countrySel ? countrySel.value : 'BY';
          if (passInp) {
            var formatted = typeof passportFormatInput === 'function' ? passportFormatInput(num, countryCode) : num;
            passInp.value = formatted;
            if (!passengers[parseInt(i, 10)]) passengers[parseInt(i, 10)] = {};
            passengers[parseInt(i, 10)].passport = formatted;
          }
          mrzBlock.classList.add('hidden');
          mrzBlock.querySelector('.mrz-line1').value = '';
          mrzBlock.querySelector('.mrz-line2').value = '';
        }
      });
    });
    if (typeof IMask !== 'undefined') {
      list.querySelectorAll('.birth-date-input').forEach(function(inp) {
        var i = parseInt(inp.getAttribute('data-i'), 10);
        var block = inp.closest('.passenger-block');
        var hiddenInp = block ? block.querySelector('input[data-f="birth_date"]') : list.querySelector('input[data-i="' + i + '"][data-f="birth_date"]');
        IMask(inp, {
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
            if (!passengers[i]) passengers[i] = {};
            passengers[i].birth_date = iso;
            if (hiddenInp) hiddenInp.value = iso;
            var labelEl = block ? block.querySelector('.passenger-discount-label') : list.querySelector('.passenger-discount-label[data-i="' + i + '"]');
            if (labelEl) { var lbl = getPassengerDiscountLabel(iso, dateStr); labelEl.textContent = lbl ? ' • ' + lbl : ''; }
            clearStep1Errors();
            recalcPriceSummary();
          }
        });
      });
    }
  }

  function collectPassengers() {
    document.querySelectorAll('#passengersList input').forEach(function(inp) {
      var i = parseInt(inp.getAttribute('data-i'), 10);
      if (isNaN(i) || i < 0) return;
      var f = inp.getAttribute('data-f');
      if (!f) return;
      if (!passengers[i]) passengers[i] = {};
      var val = inp.value;
      if (typeof val === 'string' && f !== 'birth_date' && f !== 'passport') val = val.trim();
      if (f === 'birth_date') {
        if (val.indexOf('-') !== -1) { /* уже ISO */ }
        else if (typeof dobToIso === 'function') val = dobToIso(val) || val;
      }
      if (f === 'passport') {
        var sel = document.querySelector('#passengersList .passport-country[data-i="' + i + '"]');
        var countryCode = (sel && sel.value) || 'BY';
        passengers[i].passport_country = countryCode;
        passengers[i].citizenship = countryCode;
        val = typeof passportCleanForApi === 'function' ? passportCleanForApi(val, countryCode) : val.replace(/\s/g, '');
      }
      passengers[i][f] = val;
    });
    // Если скрытое поле даты пустое — брать из видимого (IMask мог не вызвать onAccept)
    for (var idx = 0; idx < passengerCount; idx++) {
      if (passengers[idx] && (!passengers[idx].birth_date || !passengers[idx].birth_date.trim())) {
        var block = document.querySelector('#passengersList .passenger-block[data-passenger-index="' + idx + '"]');
        var visibleDateInp = block ? block.querySelector('.birth-date-input') : null;
        if (visibleDateInp && visibleDateInp.value && typeof dobToIso === 'function') {
          var iso = dobToIso(visibleDateInp.value.trim());
          if (iso) {
            passengers[idx].birth_date = iso;
            var hiddenInp = block ? block.querySelector('input[data-f="birth_date"]') : null;
            if (hiddenInp) hiddenInp.value = iso;
          }
        }
      }
    }
    var isInternational = route && route.type === 'international';
    return passengers.slice(0, passengerCount).map(function(p) {
      if (isInternational) {
        var bd = p.birth_date || '';
        if (bd.length === 10 && bd.indexOf('-') === -1 && typeof dobToIso === 'function') bd = dobToIso(bd) || bd;
        var pass = p.passport || '';
        var countryCode = p.passport_country || p.citizenship || 'BY';
        if (typeof passportCleanForApi === 'function') pass = passportCleanForApi(pass, countryCode);
        return { last_name: p.last_name || '', first_name: p.first_name || '', middle_name: p.middle_name || '', birth_date: bd, passport: pass, passport_country: countryCode, citizenship: countryCode };
      }
      return { last_name: '', first_name: (p.first_name || '').trim(), middle_name: '', birth_date: (p.birth_date || '').trim(), passport: '' };
    });
  }

  document.getElementById('toStep2').addEventListener('click', function() {
    collectPassengers();
    clearStep1Errors();
    var isInternational = route && route.type === 'international';
    var list = passengers.slice(0, passengerCount);
    if (isInternational) {
      var valid = list.every(function(p) {
        return (p.last_name || '').trim() && (p.first_name || '').trim() && (p.birth_date || '').trim();
      });
      if (!valid) {
        setError('step1Errors', 'Заполните фамилию, имя и дату рождения у всех пассажиров.');
        var firstInvalid = list.findIndex(function(p) {
          return !(p.last_name || '').trim() || !(p.first_name || '').trim() || !(p.birth_date || '').trim();
        });
        var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + firstInvalid + '"]');
        if (errEl) errEl.textContent = 'Укажите фамилию, имя и дату рождения.';
        var step1Errors = getEl('step1Errors');
        if (step1Errors) step1Errors.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      var invalidDob = list.findIndex(function(p) {
        var raw = (p.birth_date || '').trim();
        if (!raw) return true;
        if (raw.length === 10 && raw.indexOf('-') !== -1) return false;
        var iso = typeof dobToIso === 'function' ? dobToIso(raw) : '';
        return !iso || iso.length !== 10;
      });
      if (invalidDob >= 0) {
        setError('step1Errors', 'Проверьте дату рождения (день.месяц.год, месяц 01–12).');
        var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + invalidDob + '"]');
        if (errEl) errEl.textContent = 'Неверная дата (например 31.12.1990).';
        var dobErr = document.querySelector('[data-dob-error="' + invalidDob + '"]');
        if (dobErr) dobErr.textContent = 'Неверная дата.';
        if (getEl('step1Errors')) getEl('step1Errors').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      var hasPassport = list.every(function(p) {
        var countryCode = p.passport_country || p.citizenship || 'BY';
        var raw = p.passport || '';
        if (!raw) return false;
        var res = typeof passportValidate === 'function' ? passportValidate(countryCode, raw) : { valid: true };
        return res.valid;
      });
      if (!hasPassport) {
        var invalidPass = list.findIndex(function(p) {
          var countryCode = p.passport_country || p.citizenship || 'BY';
          var raw = p.passport || '';
          if (!raw) return true;
          var res = typeof passportValidate === 'function' ? passportValidate(countryCode, raw) : { valid: true };
          return !res.valid;
        });
        var msg = 'Укажите паспорт у каждого пассажира. Выберите страну выдачи и введите номер.';
        if (invalidPass >= 0 && typeof passportValidate === 'function') {
          var pp = list[invalidPass];
          var r = passportValidate(pp.passport_country || pp.citizenship || 'BY', pp.passport || '');
          if (r.message) msg = r.message;
        }
        setError('step1Errors', msg);
        if (invalidPass >= 0) {
          var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + invalidPass + '"]');
          if (errEl) errEl.textContent = msg;
        }
        if (getEl('step1Errors')) getEl('step1Errors').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    } else {
      var validLocal = list.every(function(p) { return (p.first_name || '').trim(); });
      if (!validLocal) {
        setError('step1Errors', 'Укажите имя каждого пассажира.');
        var firstInvalid = list.findIndex(function(p) { return !(p.first_name || '').trim(); });
        var errEl = document.querySelector('.passenger-block-error[data-passenger-index="' + firstInvalid + '"]');
        if (errEl) errEl.textContent = 'Введите имя пассажира.';
        if (getEl('step1Errors')) getEl('step1Errors').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    getEl('step1').classList.add('hidden');
    getEl('step2').classList.remove('hidden');
    if (typeof updateBookingUIForStep === 'function') updateBookingUIForStep(2);
    if (typeof getTheme === 'function') document.documentElement.setAttribute('data-theme', getTheme());
    clearStep2Errors();
    var phoneVal = (typeof getTelegramUserId === 'function' && getTelegramUserId() ? '' : '');
    if (getEl('phone').value.trim() === '' && phoneVal) getEl('phone').value = phoneVal;
    recalcPriceSummary();
  });

  function initPhoneFields() {
    var phoneInp = getEl('phone');
    var phoneCountry = getEl('phoneCountry');
    var anotherInp = getEl('anotherPersonPhone');
    var anotherCountry = getEl('anotherPhoneCountry');
  function updatePlaceholder(inp, code) {
      if (!inp) return;
      var fn = typeof getPhonePlaceholderLocal === 'function' ? getPhonePlaceholderLocal : (typeof getPhoneCountry === 'function' ? function(c) { var x = getPhoneCountry(c); return x ? x.placeholder : ''; } : function() { return '+375 (29) 123-45-67'; });
      inp.placeholder = fn(code);
    }
    if (phoneCountry && phoneInp && !phoneInp.dataset.phoneInited) {
      phoneInp.dataset.phoneInited = '1';
      phoneCountry.addEventListener('change', function() {
        updatePlaceholder(phoneInp, phoneCountry.value);
        phoneInp.value = '';
        clearStep2Errors();
      });
      phoneInp.addEventListener('input', function() {
        if (typeof formatPhoneInputLocal === 'function') {
          var v = formatPhoneInputLocal(this.value, phoneCountry.value);
          if (v !== this.value) this.value = v;
        }
        clearStep2Errors();
      });
      updatePlaceholder(phoneInp, phoneCountry.value);
    }
    if (anotherCountry && anotherInp && !anotherInp.dataset.phoneInited) {
      anotherInp.dataset.phoneInited = '1';
      anotherCountry.addEventListener('change', function() {
        updatePlaceholder(anotherInp, anotherCountry.value);
        anotherInp.value = '';
      });
      anotherInp.addEventListener('input', function() {
        if (typeof formatPhoneInputLocal === 'function') {
          var v = formatPhoneInputLocal(this.value, anotherCountry.value);
          if (v !== this.value) this.value = v;
        }
      });
      updatePlaceholder(anotherInp, anotherCountry.value);
    }
  }

  getEl('backToStep1').addEventListener('click', function() {
    getEl('step2').classList.add('hidden');
    getEl('step1').classList.remove('hidden');
    if (typeof updateBookingUIForStep === 'function') updateBookingUIForStep(1);
    if (typeof getTheme === 'function') document.documentElement.setAttribute('data-theme', getTheme());
    clearStep2Errors();
  });

  getEl('phone').addEventListener('input', function() {
    clearStep2Errors();
    if (typeof formatPhoneInput === 'function') {
      var v = formatPhoneInput(this.value);
      if (v !== this.value) { this.value = v; }
    }
    var res = typeof validatePhoneStep === 'function' ? validatePhoneStep(this.value) : null;
    var errEl = getEl('phoneError');
    var wrap = this.closest('.phone-field-group');
    if (wrap) wrap.classList.toggle('phone-field-group--error', res && !res.valid && this.value.trim().length > 0);
    if (errEl && res && !res.valid && this.value.trim().length > 0) errEl.textContent = res.message; else if (errEl) errEl.textContent = '';
  });

  document.getElementById('submitBooking').addEventListener('click', function() {
    var phoneInp = getEl('phone');
    var phoneCountry = getEl('phoneCountry');
    var phoneRaw = phoneInp ? phoneInp.value.trim() : '';
    var countryCode = phoneCountry ? phoneCountry.value : 'BY';
    var phone = typeof getCleanPhone === 'function' ? getCleanPhone(phoneRaw, countryCode) : phoneRaw.replace(/\D/g, '');
    if (!phoneRaw) phone = '';
    clearStep2Errors();
    if (!phoneRaw) {
      setError('phoneError', 'Укажите контактный телефон.');
      return;
    }
    var phoneValidation = typeof validatePhone === 'function' ? validatePhone(phoneRaw, countryCode) : { valid: true };
    if (!phoneValidation.valid) {
      setError('phoneError', phoneValidation.message || 'Некорректный номер телефона.');
      return;
    }
    var anotherPhoneRaw = getEl('forAnotherPerson').checked && getEl('anotherPersonPhone') ? getEl('anotherPersonPhone').value.trim() : '';
    var anotherCountryEl = getEl('anotherPhoneCountry');
    var anotherCountryCode = anotherCountryEl ? anotherCountryEl.value : 'BY';
    var anotherPhone = anotherPhoneRaw && typeof getCleanPhone === 'function' ? getCleanPhone(anotherPhoneRaw, anotherCountryCode) : (anotherPhoneRaw ? anotherPhoneRaw.replace(/\D/g, '') : null);
    if (getEl('forAnotherPerson').checked && anotherPhoneRaw && typeof validatePhone === 'function') {
      var anotherVal = validatePhone(anotherPhoneRaw, anotherCountryCode);
      if (!anotherVal.valid) {
        setError('anotherPersonPhoneError', anotherVal.message || 'Некорректный номер телефона получателя.');
        return;
      }
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
      another_person_phone: getEl('forAnotherPerson').checked ? anotherPhone : null,
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
      var msg = typeof errorToMessage === 'function' ? errorToMessage(e) : (e && e.message ? e.message : 'Ошибка создания заявки. Попробуйте ещё раз.');
      setError('phoneError', msg);
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
  initPhoneFields();
})();
