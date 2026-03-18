(function() {
  try {
    var standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    var inTelegram = !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
    var preferredEntry = localStorage.getItem('preferredBackofficeEntry');
    var paramsEarly = new URLSearchParams(window.location.search || '');
    var stayHome = paramsEarly.get('stay_home') === '1';
    if (standalone && !inTelegram && !stayHome && (preferredEntry === 'admin' || preferredEntry === 'dispatcher')) {
      fetch((typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : window.location.origin) + '/api/auth/session')
        .then(function(r) { return r.json().catch(function() { return {}; }).then(function(data) { return { ok: r.ok, data: data }; }); })
        .then(function(result) {
          var data = result.data || {};
          if (!result.ok || !data.authenticated || data.auth_mode !== 'browser') return;
          if (preferredEntry === 'admin' && data.is_admin) {
            window.location.replace('admin.html');
            return;
          }
          if (preferredEntry === 'dispatcher' && (data.is_dispatcher || data.is_admin)) {
            window.location.replace('dispatcher.html');
          }
        })
        .catch(function() {});
    }
  } catch (e) {}
  if (typeof window.isEconomyMode === 'function' && !window.isEconomyMode()) {
    ['profile.html', 'booking.html'].forEach(function(href) {
      if (!document.querySelector('link[rel="prefetch"][href="' + href + '"]')) {
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
      }
    });
  }
  var lang = localStorage.getItem('lang') || 'ru';
  var dateEl = document.getElementById('headerCurrentDate');
  if (dateEl) {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    var dayName = new Intl.DateTimeFormat(lang === 'be' ? 'be' : (lang === 'en' ? 'en-GB' : 'ru'), { weekday: 'long' }).format(d);
    dateEl.textContent = dd + '.' + mm + '.' + yyyy + ', ' + dayName;
  }
  var closeBtn = document.getElementById('tgCloseBtn');
  if (closeBtn) {
    var inTelegram = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData;
    if (inTelegram) {
      closeBtn.style.display = 'none';
    } else {
      closeBtn.style.display = '';
      closeBtn.addEventListener('click', function() { if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close(); });
    }
  }
  const fromSelect = document.getElementById('fromCity');
  const toSelect = document.getElementById('toCity');
  const travelDate = document.getElementById('travelDate');
  const searchForm = document.getElementById('searchForm');
  const resultsSection = document.getElementById('results');
  const resultsList = document.getElementById('resultsList');
  const resultsDateSpan = document.getElementById('resultsDate');
  const swapBtn = document.getElementById('swapBtn');
  const fromTrigger = document.getElementById('fromTrigger');
  const toTrigger = document.getElementById('toTrigger');
  const fromBlock = document.getElementById('fromBlock');
  const toBlock = document.getElementById('toBlock');
  const fromOptions = document.getElementById('fromOptions');
  const toOptions = document.getElementById('toOptions');
  const fromDropdown = document.getElementById('fromDropdown');
  const toDropdown = document.getElementById('toDropdown');
  const dateBlock = document.getElementById('dateBlock');
  const dateDisplay = document.getElementById('dateDisplay');
  const dateLabel = document.getElementById('dateLabel');
  const dateCalendar = document.getElementById('dateCalendar');

  let routes = [];
  let selectedRoute = null;
  let dateCalendarMonth = null;

  function closeFromDropdown() {
    if (fromBlock) fromBlock.classList.remove('search-field-block--open');
    if (fromDropdown) fromDropdown.classList.add('hidden');
    if (fromTrigger) fromTrigger.setAttribute('aria-expanded', 'false');
  }
  function closeToDropdown() {
    if (toBlock) toBlock.classList.remove('search-field-block--open');
    if (toDropdown) toDropdown.classList.add('hidden');
    if (toTrigger) toTrigger.setAttribute('aria-expanded', 'false');
  }
  function updateFromValue() {
    var v = fromSelect ? fromSelect.value : '';
    var el = document.getElementById('fromValue');
    if (el) el.textContent = v || '';
    if (fromBlock) fromBlock.classList.toggle('search-field-block--has-value', !!v);
  }
  function updateToValue() {
    var v = toSelect ? toSelect.value : '';
    var el = document.getElementById('toValue');
    if (el) el.textContent = v || '';
    if (toBlock) toBlock.classList.toggle('search-field-block--has-value', !!v);
  }

  function setMinDate() {
    const today = new Date().toISOString().slice(0, 10);
    travelDate.setAttribute('min', today);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 60);
    travelDate.setAttribute('max', maxDate.toISOString().slice(0, 10));
  }

  /** Доступные даты по выбранному направлению: расписание по дням недели + cutoff (после 17:00 сегодня недоступен). */
  function getAvailableDates(fromCity, toCity) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var result = [];
    if (!fromCity || !toCity) {
      for (var i = 0; i < 60; i++) {
        var d = new Date(today);
        d.setDate(d.getDate() + i);
        result.push(d.toISOString().slice(0, 10));
      }
      return result;
    }
    var matching = routes.filter(function(r) {
      var stops = r.stops || [];
      var iFrom = stops.findIndex(function(s) { return s.city === fromCity; });
      var iTo = stops.findIndex(function(s) { return s.city === toCity; });
      return iFrom !== -1 && iTo !== -1 && iFrom < iTo;
    });
    if (!matching.length) return [];
    var CUTOFF_HOUR = 17;
    var CUTOFF_MIN = 0;
    var now = new Date();
    var minskHour = (now.getUTCHours() + 3) % 24;
    var minskMin = now.getUTCMinutes();
    var nowMinutes = minskHour * 60 + minskMin;
    var cutoffMinutes = CUTOFF_HOUR * 60 + CUTOFF_MIN;
    for (var i = 0; i < 60; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() + i);
      var dayOfWeek = d.getDay();
      var isToday = i === 0;
      var runsOnDay = matching.some(function(r) {
        var sched = r.schedule_days || [0, 1, 2, 3, 4, 5, 6];
        return sched.indexOf(dayOfWeek) !== -1;
      });
      if (!runsOnDay) continue;
      if (isToday && nowMinutes >= cutoffMinutes) continue;
      result.push(d.toISOString().slice(0, 10));
    }
    return result;
  }

  function getAvailableDatesSet(fromCity, toCity) {
    var arr = getAvailableDates(fromCity, toCity);
    var set = {};
    arr.forEach(function(d) { set[d] = true; });
    return set;
  }

  function renderDateCalendar(year, month) {
    dateCalendarMonth = { year: year, month: month };
    var fromCity = fromSelect ? fromSelect.value : '';
    var toCity = toSelect ? toSelect.value : '';
    var availableSet = getAvailableDatesSet(fromCity, toCity);
    var first = new Date(year, month, 1);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var current = travelDate.value ? new Date(travelDate.value + 'T12:00:00') : null;
    var weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var html = '<div class="search-field-block__calendar-header">' +
      '<button type="button" class="search-field-block__calendar-prev" aria-label="Предыдущий месяц">←</button>' +
      '<span class="search-field-block__calendar-title">' + first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) + '</span>' +
      '<button type="button" class="search-field-block__calendar-next" aria-label="Следующий месяц">→</button></div>' +
      '<div class="search-field-block__calendar-grid">';
    weekdays.forEach(function(w) { html += '<span class="search-field-block__calendar-weekday">' + w + '</span>'; });
    var startDay = (first.getDay() + 6) % 7;
    var d = 1 - startDay;
    for (var i = 0; i < 42; i++) {
      var dayDate = new Date(year, month, d);
      var dayStr = dayDate.getFullYear() + '-' + String(dayDate.getMonth() + 1).padStart(2, '0') + '-' + String(dayDate.getDate()).padStart(2, '0');
      var inMonth = dayDate.getMonth() === month;
      var disabled = dayDate < today || !availableSet[dayStr];
      var selected = current && dayDate.getTime() === current.getTime();
      var cls = 'search-field-block__calendar-day';
      if (!inMonth) cls += ' other-month';
      if (disabled) cls += ' disabled';
      if (selected) cls += ' selected';
      var dayNum = dayDate.getDate();
      if (inMonth && !disabled) {
        html += '<button type="button" class="' + cls + '" data-date="' + dayStr + '">' + dayNum + '</button>';
      } else {
        html += '<span class="' + cls + '">' + dayNum + '</span>';
      }
      d++;
    }
    html += '</div>';
    dateCalendar.innerHTML = html;
    dateCalendar.querySelector('.search-field-block__calendar-prev').addEventListener('click', function() {
      if (month === 0) renderDateCalendar(year - 1, 11); else renderDateCalendar(year, month - 1);
    });
    dateCalendar.querySelector('.search-field-block__calendar-next').addEventListener('click', function() {
      if (month === 11) renderDateCalendar(year + 1, 0); else renderDateCalendar(year, month + 1);
    });
    dateCalendar.querySelectorAll('.search-field-block__calendar-day[data-date]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var dateStr = this.getAttribute('data-date');
        travelDate.value = dateStr;
        updateDateDisplay();
        closeDateCalendar();
      });
    });
  }

  function openDateCalendar() {
    dateBlock.classList.add('search-field-block--date-open');
    dateCalendar.classList.remove('hidden');
    var openYear, openMonth;
    if (travelDate.value) {
      var parsed = travelDate.value.split('-');
      if (parsed.length === 3) {
        openYear = parseInt(parsed[0], 10);
        openMonth = parseInt(parsed[1], 10) - 1;
        if (!isNaN(openYear) && !isNaN(openMonth)) {
          renderDateCalendar(openYear, openMonth);
          return;
        }
      }
    }
    var now = new Date();
    renderDateCalendar(now.getFullYear(), now.getMonth());
  }

  function closeDateCalendar() {
    dateBlock.classList.remove('search-field-block--date-open');
    dateCalendar.classList.add('hidden');
  }

  function updateDateDisplay() {
    if (travelDate.value) {
      dateDisplay.textContent = new Date(travelDate.value + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      dateBlock.classList.add('search-field-block--date-has-value');
    } else {
      dateDisplay.textContent = '';
      dateBlock.classList.remove('search-field-block--date-has-value');
    }
  }

  if (dateDisplay && dateCalendar) {
    dateDisplay.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openDateCalendar();
    });
    if (dateLabel) {
      dateLabel.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openDateCalendar();
      });
    }
    dateBlock.addEventListener('click', function(e) {
      if (e.target === dateBlock) openDateCalendar();
    });
    dateBlock.addEventListener('focusout', function(e) {
      if (!dateBlock.contains(e.relatedTarget)) setTimeout(closeDateCalendar, 150);
    });
  }
  travelDate.addEventListener('change', updateDateDisplay);

  document.querySelectorAll('.date-preset').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var preset = this.getAttribute('data-preset');
      var d = new Date();
      d.setHours(0, 0, 0, 0);
      if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
      if (preset === 'weekend') {
        while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
      }
      var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
      var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var min = travelDate.getAttribute('min'), max = travelDate.getAttribute('max');
      if (min && dateStr < min) dateStr = min;
      if (max && dateStr > max) dateStr = max;
      travelDate.value = dateStr;
      updateDateDisplay();
      closeDateCalendar();
    });
  });

  function fillCities() {
    const cities = new Set();
    routes.forEach(r => {
      (r.stops || []).forEach(s => { if (s.city) cities.add(s.city); });
    });
    const arr = Array.from(cities).sort();
    const esc = (typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => (s == null ? '' : String(s)));
    fromSelect.innerHTML = '<option value="">—</option>' + arr.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    toSelect.innerHTML = '<option value="">—</option>' + arr.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (fromOptions) {
      fromOptions.innerHTML = arr.map(c => '<button type="button" class="search-field-block__option" role="option" data-value="' + esc(c) + '">' + esc(c) + '</button>').join('');
      fromOptions.querySelectorAll('.search-field-block__option').forEach(function(btn) {
        btn.addEventListener('click', function() {
          fromSelect.value = this.getAttribute('data-value');
          updateFromValue();
          closeFromDropdown();
        });
      });
    }
    if (toOptions) {
      toOptions.innerHTML = arr.map(c => '<button type="button" class="search-field-block__option" role="option" data-value="' + esc(c) + '">' + esc(c) + '</button>').join('');
      toOptions.querySelectorAll('.search-field-block__option').forEach(function(btn) {
        btn.addEventListener('click', function() {
          toSelect.value = this.getAttribute('data-value');
          updateToValue();
          closeToDropdown();
        });
      });
    }
    updateFromValue();
    updateToValue();
  }

  if (fromTrigger && fromDropdown) {
    fromTrigger.addEventListener('click', function(e) {
      e.preventDefault();
      var isOpen = fromBlock.classList.toggle('search-field-block--open');
      fromDropdown.classList.toggle('hidden', !isOpen);
      fromTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) closeToDropdown();
    });
  }
  if (toTrigger && toDropdown) {
    toTrigger.addEventListener('click', function(e) {
      e.preventDefault();
      var isOpen = toBlock.classList.toggle('search-field-block--open');
      toDropdown.classList.toggle('hidden', !isOpen);
      toTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) closeFromDropdown();
    });
  }
  document.addEventListener('click', function(e) {
    if (fromBlock && !fromBlock.contains(e.target)) closeFromDropdown();
    if (toBlock && !toBlock.contains(e.target)) closeToDropdown();
    if (dateBlock && dateCalendar && !dateCalendar.classList.contains('hidden') && !dateBlock.contains(e.target)) closeDateCalendar();
  });

  function renderSchedule() {
    const list = document.getElementById('scheduleList');
    if (!list) return;
    if (!routes.length) {
      list.innerHTML = '<p class="text-secondary">Загрузка маршрутов...</p>';
      return;
    }
    const esc = (typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => (s == null ? '' : String(s)));
    list.innerHTML = routes.map(r => {
      const stopsStr = (r.stops || []).map(s => s.city).filter(Boolean).join(' → ');
      return (
        '<div class="schedule-card">' +
          '<div class="schedule-name">🚌 ' + esc(r.name) + '</div>' +
          '<div class="schedule-time">⏰ ' + esc(r.stops && r.stops[0] ? r.stops[0].time : '') + ' — ' + esc(r.stops && r.stops.length ? r.stops[r.stops.length - 1].time : '') + '</div>' +
          '<div class="schedule-stops">📍 ' + esc(stopsStr) + '</div>' +
          '<div class="schedule-price">💰 от ' + esc(r.base_price) + ' BYN</div>' +
        '</div>'
      );
    }).join('');
  }

  function parseTripDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    var t = String(timeStr).trim();
    var parts = t.split(':');
    if (parts.length < 2) return null;
    var hh = parseInt(parts[0], 10);
    var mm = parseInt(parts[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    var dparts = String(dateStr).split('-');
    if (dparts.length !== 3) return null;
    var y = parseInt(dparts[0], 10);
    var m = parseInt(dparts[1], 10);
    var d = parseInt(dparts[2], 10);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function getTripsForDate(route, dateStr) {
    var dt = parseTripDateTime(dateStr, '12:00');
    var day = dt ? dt.getDay() : new Date(dateStr).getDay();
    const schedule = route.schedule_days || [0,1,2,3,4,5,6];
    if (!schedule.includes(day)) return [];
    const now = new Date();
    const stops = route.stops || [];
    const boarding = stops.filter(s => s.is_boarding);
    return boarding
      .map(s => ({ stop: s, time: s.time, departureDt: parseTripDateTime(dateStr, s.time) }))
      .filter(t => !t.departureDt || t.departureDt > now);
  }

  function showResults(routeId, dateStr) {
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    selectedRoute = route;
    const fromCity = fromSelect.value;
    const toCity = toSelect.value;
    let trips = getTripsForDate(route, dateStr);
    trips = trips.filter(t => t.stop && t.stop.city === fromCity);
    resultsDateSpan.textContent = dateStr;
    const esc = (typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => (s == null ? '' : String(s)));
    resultsList.innerHTML = trips.map(t => `
      <div class="trip-card" data-time="${esc(t.time)}">
        <div class="trip-time">${esc(t.time)}</div>
        <div class="trip-route">${esc(fromCity)} → ${esc(toCity)}</div>
        <div class="trip-price">от ${esc(route.base_price)} BYN</div>
        <button type="button" class="btn btn-small" data-route-id="${esc(route.id)}" data-date="${esc(dateStr)}" data-time="${esc(t.time)}">Выбрать</button>
      </div>
    `).join('') || '<p>' + (typeof window.t === 'function' ? window.t('noTripsForDate') : 'На эту дату рейсов нет или время отправления уже прошло.') + '</p>';
    resultsList.querySelectorAll('.btn-small').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = `booking.html?route_id=${btn.dataset.routeId}&from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${btn.dataset.date}&time=${btn.dataset.time}`;
        window.location.href = url;
      });
    });
    resultsSection.classList.remove('hidden');
  }

  swapBtn.addEventListener('click', () => {
    const a = fromSelect.value;
    const b = toSelect.value;
    fromSelect.value = b;
    toSelect.value = a;
    updateFromValue();
    updateToValue();
  });

  var LAST_SEARCH_KEY = 'bus_booking_last_search';
  function saveLastSearch(fromCity, toCity, dateStr) {
    try {
      if (fromCity && toCity && dateStr) localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ from: fromCity, to: toCity, date: dateStr }));
    } catch (e) {}
  }
  function applyLastSearch() {
    try {
      var raw = localStorage.getItem(LAST_SEARCH_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      var from = data.from, to = data.to, date = data.date;
      if (!from || !to) return;
      var cities = new Set();
      routes.forEach(function(r) { (r.stops || []).forEach(function(s) { if (s.city) cities.add(s.city); }); });
      if (!cities.has(from) || !cities.has(to)) return;
      fromSelect.value = from;
      toSelect.value = to;
      updateFromValue();
      updateToValue();
      if (date) {
        var min = travelDate.getAttribute('min'), max = travelDate.getAttribute('max');
        if ((!min || date >= min) && (!max || date <= max)) { travelDate.value = date; updateDateDisplay(); }
      }
      searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
    } catch (e) {}
  }
  var repeatBtn = document.getElementById('repeatLastSearchBtn');
  if (repeatBtn) repeatBtn.addEventListener('click', applyLastSearch);

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fromCity = fromSelect.value;
    const toCity = toSelect.value;
    const dateStr = travelDate.value;
    if (!fromCity || !toCity || !dateStr) return;
    saveLastSearch(fromCity, toCity, dateStr);
    var stops, iFrom, iTo;
    var matching = routes.filter(function(r) {
      stops = r.stops || [];
      iFrom = stops.findIndex(function(s) { return s.city === fromCity; });
      iTo = stops.findIndex(function(s) { return s.city === toCity; });
      return iFrom !== -1 && iTo !== -1 && iFrom < iTo;
    });
    // На участке Гомель–Мозырь продаём только внутренние рейсы; международные (Москва–Мозырь) не предлагаем
    var hasLocal = matching.some(function(r) { return r.type === 'local'; });
    if (hasLocal) matching = matching.filter(function(r) { return r.type === 'local'; });
    // Прямой маршрут: отправление из fromCity = первая остановка
    var route = matching.find(function(r) {
      var first = (r.stops || [])[0];
      return first && first.city === fromCity;
    }) || matching[0];
    if (route) showResults(route.id, dateStr);
    else resultsList.innerHTML = '<p>' + (typeof window.t === 'function' ? window.t('routeNotFound') : 'Маршрут не найден.') + '</p>', resultsSection.classList.remove('hidden');
  });

  fetch(window.BASE_URL + '/api/routes').then(r =>
    r.ok ? r.json() : r.json().then(function(d) { throw new Error('routes'); })
  ).then(data => {
    routes = data.routes || [];
    fillCities();
    renderSchedule();
    var params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'invalid_booking_link') {
      (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Указан неполный маршрут. Выберите маршрут, дату и время.', 'Ошибка ссылки');
      params.delete('error');
      var clean = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '');
      window.history.replaceState({}, '', clean);
    }
    var fromUrl = params.get('from');
    var toUrl = params.get('to');
    if (fromUrl && toUrl && fromSelect && toSelect) {
      var cities = new Set();
      routes.forEach(r => { (r.stops || []).forEach(s => { if (s.city) cities.add(s.city); }); });
      if (cities.has(fromUrl)) fromSelect.value = fromUrl;
      if (cities.has(toUrl)) toSelect.value = toUrl;
      updateFromValue();
      updateToValue();
    }
    var lastBlock = document.getElementById('lastSearchBlock');
    var lastLabel = document.getElementById('lastSearchRoute');
    try {
      var raw = localStorage.getItem(LAST_SEARCH_KEY);
      if (raw) {
        var ls = JSON.parse(raw);
        var cities = new Set();
        routes.forEach(function(r) { (r.stops || []).forEach(function(s) { if (s.city) cities.add(s.city); }); });
        if (ls.from && ls.to && cities.has(ls.from) && cities.has(ls.to)) {
          if (lastBlock) lastBlock.classList.remove('hidden');
          if (lastLabel) lastLabel.textContent = ls.from + ' → ' + ls.to;
        }
      }
    } catch (err) {}
  }).catch(() => { routes = []; fillCities(); renderSchedule(); if (resultsList) resultsList.innerHTML = '<p class="text-secondary">Не удалось загрузить маршруты.</p>'; resultsSection.classList.remove('hidden'); });

  (function() {
    var scheduleSection = document.getElementById('scheduleSection');
    var scheduleToggle = document.getElementById('scheduleToggle');
    var scheduleDetail = scheduleSection && scheduleSection.querySelector('.schedule-section__detail');
    var scheduleList = document.getElementById('scheduleList');
    if (scheduleSection && scheduleToggle && scheduleList) {
      scheduleSection.classList.add('schedule-section--collapsed');
      scheduleToggle.addEventListener('click', function() {
        scheduleSection.classList.toggle('schedule-section--collapsed');
        scheduleToggle.setAttribute('aria-expanded', scheduleSection.classList.contains('schedule-section--collapsed') ? 'false' : 'true');
      });
      scheduleToggle.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scheduleToggle.click(); } });
    }
  })();

  fetch(window.BASE_URL + '/api/news').then(r => r.json()).then(data => {
    if (data.border) document.getElementById('borderInfo').textContent = data.border.message_ru || '—';
    if (data.weather) document.getElementById('weatherInfo').textContent = data.weather.city + ': ' + data.weather.temp + '°C, ' + (data.weather.description_ru || '');
  }).catch(() => {
    document.getElementById('borderInfo').textContent = '—';
    document.getElementById('weatherInfo').textContent = '—';
  });

  setMinDate();
  updateDateDisplay();

  if (window.Telegram && Telegram.WebApp) Telegram.WebApp.ready();

  var loader = document.getElementById('appLoader');
  if (loader) {
    function hideLoader() { loader.classList.add('hidden'); }
    if (document.readyState === 'complete') hideLoader();
    else window.addEventListener('load', hideLoader);
    setTimeout(hideLoader, 2500);
  }
})();
