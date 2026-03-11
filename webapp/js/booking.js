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
    if (route.border_docs_text) borderEl.textContent = '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u0434\u043b\u044f \u0433\u0440\u0430\u043d\u0438\u0446\u044b: ' + route.border_docs_text;
  });

  document.getElementById('forAnotherPerson').addEventListener('change', function() {
    document.getElementById('anotherPhoneBlock').classList.toggle('hidden', !this.checked);
  });

  document.getElementById('passengerPlus').addEventListener('click', function() { passengerCount = Math.min(10, passengerCount + 1); updatePassengerNum(); renderPassengers(); });
  document.getElementById('passengerMinus').addEventListener('click', function() { passengerCount = Math.max(1, passengerCount - 1); updatePassengerNum(); renderPassengers(); });

  function updatePassengerNum() {
    document.getElementById('passengerNum').textContent = passengerCount;
  }

  function renderPassengers() {
    var list = document.getElementById('passengersList');
    list.innerHTML = '';
    for (var i = 0; i < passengerCount; i++) {
      var p = passengers[i] || { last_name: '', first_name: '', middle_name: '', birth_date: '', passport: '' };
      var div = document.createElement('div');
      div.className = 'passenger-block';
      div.innerHTML = '<label>\u041f\u0430\u0441\u0441\u0430\u0436\u0438\u0440 ' + (i + 1) + '</label>' +
        '<input type="text" placeholder="\u0424\u0430\u043c\u0438\u043b\u0438\u044f" data-i="' + i + '" data-f="last_name" value="' + (p.last_name || '') + '">' +
        '<input type="text" placeholder="\u0418\u043c\u044f" data-i="' + i + '" data-f="first_name" value="' + (p.first_name || '') + '">' +
        '<input type="text" placeholder="\u041e\u0442\u0447\u0435\u0441\u0442\u0432\u043e" data-i="' + i + '" data-f="middle_name" value="' + (p.middle_name || '') + '">' +
        '<input type="date" data-i="' + i + '" data-f="birth_date" value="' + (p.birth_date || '') + '">' +
        (route && route.type === 'international' ? '<input type="text" placeholder="\u041f\u0430\u0441\u043f\u043e\u0440\u0442 \u041c\u04211234567" data-i="' + i + '" data-f="passport" value="' + (p.passport || '') + '">' : '');
      list.appendChild(div);
    }
    list.querySelectorAll('input').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var i = parseInt(this.getAttribute('data-i'), 10);
        var f = this.getAttribute('data-f');
        if (!passengers[i]) passengers[i] = {};
        passengers[i][f] = this.value;
      });
    });
  }

  function collectPassengers() {
    document.querySelectorAll('#passengersList input').forEach(function(inp) {
      var i = parseInt(inp.getAttribute('data-i'), 10);
      var f = inp.getAttribute('data-f');
      if (!passengers[i]) passengers[i] = {};
      passengers[i][f] = inp.value;
    });
    return passengers.slice(0, passengerCount).map(function(p) {
      return { last_name: p.last_name || '', first_name: p.first_name || '', middle_name: p.middle_name || '', birth_date: p.birth_date || '', passport: p.passport || '' };
    });
  }

  document.getElementById('toStep2').addEventListener('click', function() {
    collectPassengers();
    var valid = passengers.slice(0, passengerCount).every(function(p) { return p.last_name && p.first_name && p.birth_date; });
    if (!valid) { alert('\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0424\u0418\u041e \u0438 \u0434\u0430\u0442\u0443 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f \u0432\u0441\u0435\u0445 \u043f\u0430\u0441\u0441\u0430\u0436\u0438\u0440\u043e\u0432.'); return; }
    if (route && route.type === 'international') {
      var hasPassport = passengers.slice(0, passengerCount).every(function(p) { return p.passport && /^[A-Z]{2}\d{7}$/i.test((p.passport || '').replace(/\s/g, '')); });
      if (!hasPassport) { alert('\u0414\u043b\u044f \u043c\u0435\u0436\u0434\u0443\u043d\u0430\u0440\u043e\u0434\u043d\u043e\u0433\u043e \u0440\u0435\u0439\u0441\u0430 \u0443\u043a\u0430\u0436\u0438\u0442\u0435 \u043f\u0430\u0441\u043f\u043e\u0440\u0442 (\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440 \u041c\u04211234567).'); return; }
    }
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('phone').value = (typeof getTelegramUserId === 'function' && getTelegramUserId() ? '' : '');
    var oneWay = route ? (route.base_price || 0) * passengerCount : 0;
    document.getElementById('priceSummary').textContent = '\u0418\u0442\u043e\u0433\u043e: ' + oneWay.toFixed(2) + ' BYN';
  });

  document.getElementById('submitBooking').addEventListener('click', function() {
    var phone = document.getElementById('phone').value.trim();
    if (!phone) { alert('\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0442\u0435\u043b\u0435\u0444\u043e\u043d.'); return; }
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
      is_for_another_person: document.getElementById('forAnotherPerson').checked,
      another_person_phone: document.getElementById('forAnotherPerson').checked ? document.getElementById('anotherPersonPhone').value : null,
      phone: phone,
      save_phone_in_profile: document.getElementById('savePhone').checked,
      payment_method: paymentMethod,
      user_id: typeof getTelegramUserId === 'function' && getTelegramUserId() ? parseInt(getTelegramUserId(), 10) : null
    };
    var base = typeof BASE_URL !== 'undefined' ? BASE_URL : '';
    var submitBtn = document.getElementById('submitBooking');
    submitBtn.disabled = true;
    function onError(e) { alert(e.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0437\u0430\u044f\u0432\u043a\u0438'); submitBtn.disabled = false; }
    if (typeof api === 'function') {
      api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
        .then(function(res) { window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id); })
        .catch(onError);
      return;
    }
    fetch(base + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function(r) { return r.json().then(function(data) { if (!r.ok) throw new Error(data.detail && (data.detail.code ? (typeof userFriendlyMessage === 'function' ? userFriendlyMessage(data.detail) : data.detail.code) : data.detail) || r.statusText); return data; }); })
      .then(function(res) { window.location.href = 'success.html?booking_id=' + encodeURIComponent(res.booking_id); })
      .catch(onError);
  });

  updatePassengerNum();
  renderPassengers();
})();
