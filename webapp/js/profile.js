(function() {
  if (typeof getTelegramUserId === 'function' && !getTelegramUserId()) {
    document.getElementById('bookingsList').innerHTML = '<p>\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 Telegram, \u0447\u0442\u043e\u0431\u044b \u0432\u0438\u0434\u0435\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0438.</p>';
    document.getElementById('passengersSection').innerHTML = '<p>\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 Telegram.</p>';
    return;
  }

  var base = typeof BASE_URL !== 'undefined' ? BASE_URL : '';
  var apiFn = typeof api === 'function' ? api : function(path, opts) {
    var o = opts || {};
    var headers = { 'X-Telegram-User-Id': String(getTelegramUserId()) };
    if (o.headers) Object.assign(headers, o.headers);
    return fetch(base + path, Object.assign({}, o, { headers: headers })).then(function(r) { return r.json(); });
  };

  function loadBookings() {
    apiFn('/api/user/bookings').then(function(data) {
      var list = document.getElementById('bookingsList');
      var items = data.bookings || [];
      list.innerHTML = items.length ? items.map(function(b) {
        return '<div class="trip-card"><strong>' + b.booking_id + '</strong> \u2014 ' + b.route_name + '<br>' +
          b.departure_date + ' ' + b.departure_time + ' | ' + b.price_total + ' ' + b.currency + ' | ' + b.status + '<br>' +
          '<a href="success.html?booking_id=' + encodeURIComponent(b.booking_id) + '">\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435</a></div>';
      }).join('') : '<p>\u041d\u0435\u0442 \u0437\u0430\u044f\u0432\u043e\u043a.</p>';
    }).catch(function() { document.getElementById('bookingsList').innerHTML = '<p>\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.</p>'; });
  }

  function loadPassengers() {
    var list = document.getElementById('passengersList');
    apiFn('/api/user/passengers').then(function(data) {
      var items = data.passengers || [];
      list.innerHTML = items.map(function(p) {
        return '<div class="trip-card" data-id="' + p.id + '">' + p.last_name + ' ' + p.first_name + ' ' + (p.middle_name || '') + ' | ' + (p.birth_date || '') +
          ' <button type="button" class="btn btn-small delete-passenger" data-id="' + p.id + '">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button></div>';
      }).join('');
      list.querySelectorAll('.delete-passenger').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (!confirm('Удалить?')) return;
          apiFn('/api/user/passengers/' + btn.getAttribute('data-id'), { method: 'DELETE' }).then(loadPassengers).catch(function(e) { alert(e.message); });
        });
      });
    }).catch(function() { list.innerHTML = '<p>\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438.</p>'; });
  }

  document.getElementById('addPassenger').addEventListener('click', function() {
    var last = prompt('\u0424\u0430\u043c\u0438\u043b\u0438\u044f');
    var first = prompt('\u0418\u043c\u044f');
    var birth = prompt('\u0414\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f (YYYY-MM-DD)');
    if (!last || !first || !birth) return;
    apiFn('/api/user/passengers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_name: last, first_name: first, middle_name: '', birth_date: birth, passport: '' })
    }).then(loadPassengers).catch(function(e) { alert(e.message); });
  });

  loadBookings();
  loadPassengers();
})();
