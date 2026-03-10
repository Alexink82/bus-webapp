(function() {
  const uid = getTelegramUserId();
  if (!uid) {
    document.getElementById('loginWarning').classList.remove('hidden');
    return;
  }

  document.getElementById('loginWarning').classList.add('hidden');
  document.getElementById('dispatcherMain').classList.remove('hidden');

  const headers = { 'X-Telegram-User-Id': String(uid) };

  function api(path, opts = {}) {
    return fetch(BASE_URL + path, { ...opts, headers: { ...opts.headers, ...headers } }).then(r => r.json());
  }

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
      if (tab === 'new') loadNew();
      if (tab === 'active') loadActive();
      if (tab === 'stats') loadStats();
    });
  });

  function loadNew() {
    api('/api/dispatcher/bookings?status=new').then(data => {
      const list = document.getElementById('newList');
      const items = data.bookings || [];
      list.innerHTML = items.map(b => `
        <div class="dispatcher-card" data-booking="${b.booking_id}">
          <strong>${b.booking_id}</strong> ${b.route_name}<br>
          ${b.departure_date} ${b.departure_time} | ${b.passengers_count} пасс. | ${b.price_total} ${b.currency}
          <div class="status">${b.status}</div>
          <div class="actions">
            <button data-action="take" data-id="${b.booking_id}">Взять в работу</button>
          </div>
        </div>
      `).join('') || '<p>Нет новых заявок.</p>';
      list.querySelectorAll('[data-action="take"]').forEach(btn => {
        btn.addEventListener('click', () => {
          api('/api/dispatcher/bookings/' + btn.dataset.id + '/take', { method: 'POST' })
            .then(() => { loadNew(); loadActive(); })
            .catch(e => alert(e.message || 'Ошибка'));
        });
      });
    }).catch(() => { document.getElementById('newList').innerHTML = '<p>Нет доступа (вы не диспетчер).</p>'; });
  }

  function loadActive() {
    api('/api/dispatcher/bookings?status=active').then(data => {
      const list = document.getElementById('activeList');
      const items = data.bookings || [];
      list.innerHTML = items.map(b => `
        <div class="dispatcher-card">
          <strong>${b.booking_id}</strong> ${b.route_name}<br>
          ${b.departure_date} ${b.departure_time} | ${b.price_total} ${b.currency}
          <div class="status">${b.payment_status}</div>
          <div class="actions">
            <button data-id="${b.booking_id}" data-status="paid">Оплачено</button>
            <button data-id="${b.booking_id}" data-status="ticket_sent">Билет отправлен</button>
            <button data-id="${b.booking_id}" data-status="done">Завершено</button>
          </div>
        </div>
      `).join('') || '<p>Нет заявок в работе.</p>';
      list.querySelectorAll('.actions button').forEach(btn => {
        btn.addEventListener('click', () => {
          api('/api/dispatcher/bookings/' + btn.dataset.id + '/status', {
            method: 'POST',
            body: JSON.stringify({ status: btn.dataset.status }),
            headers: { 'Content-Type': 'application/json' },
          }).then(() => loadActive()).catch(e => alert(e.message));
        });
      });
    });
  }

  function loadStats() {
    api('/api/dispatcher/stats').then(data => {
      document.getElementById('statsContent').innerHTML = `
        <div class="dispatcher-card">
          За сегодня: <strong>${data.total || 0}</strong> заявок, сумма <strong>${data.sum || 0} BYN</strong>
        </div>
      `;
    });
  }

  document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    fetch(BASE_URL + '/api/bookings/' + q).then(r => r.json()).then(b => {
      document.getElementById('searchResults').innerHTML = `
        <div class="dispatcher-card">
          <strong>${b.booking_id}</strong> ${b.route_name}<br>
          ${b.departure_date} ${b.departure_time} | ${b.status} | ${b.price_total} ${b.currency}
        </div>
      `;
    }).catch(() => { document.getElementById('searchResults').innerHTML = '<p>Не найдено.</p>'; });
  });

  loadNew();
})();
