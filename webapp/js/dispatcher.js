(function() {
  const uid = getTelegramUserId();
  if (!uid) {
    document.getElementById('loginWarning').classList.remove('hidden');
    return;
  }

  document.getElementById('loginWarning').classList.add('hidden');
  document.getElementById('dispatcherMain').classList.remove('hidden');

  const headers = { 'X-Telegram-User-Id': String(uid) };
  if (typeof getTelegramInitData === 'function' && getTelegramInitData())
    headers['X-Telegram-Init-Data'] = getTelegramInitData();

  function api(path, opts = {}) {
    const url = (typeof BASE_URL !== 'undefined' ? BASE_URL : '') + path;
    const mergedHeaders = { ...headers, ...(opts.headers || {}) };
    if (opts.body && typeof opts.body === 'string' && !mergedHeaders['Content-Type'])
      mergedHeaders['Content-Type'] = 'application/json';
    return fetch(url, { ...opts, headers: mergedHeaders }).then(r =>
      r.json().catch(() => ({})).then(data => {
        if (!r.ok) {
          const detail = data.detail;
          let msg = '';
          if (typeof window.userFriendlyMessage === 'function' && detail != null)
            msg = window.userFriendlyMessage(detail);
          if (!msg && typeof detail === 'string') msg = (window.ERROR_MESSAGES && window.ERROR_MESSAGES[detail]) || detail;
          if (!msg && detail && typeof detail === 'object' && detail.code) msg = (window.ERROR_MESSAGES && window.ERROR_MESSAGES[detail.code]) || detail.code;
          if (!msg && Array.isArray(detail) && detail.length > 0) msg = detail[0].msg || 'Ошибка валидации.';
          if (!msg) msg = r.statusText || 'Произошла ошибка. Попробуйте позже.';
          const e = new Error(msg);
          e.status = r.status;
          e.body = data;
          throw e;
        }
        return data;
      })
    );
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

  function readFilters() {
    return {
      route: (document.getElementById('filterRoute') || {}).value || '',
      date: (document.getElementById('filterDate') || {}).value || '',
      payment: (document.getElementById('filterPayment') || {}).value || ''
    };
  }

  const OVERDUE_MINUTES = 15;

  function loadNew() {
    const f = readFilters();
    const qs = new URLSearchParams({ status: 'new' });
    if (f.route) qs.set('route_id', f.route);
    if (f.date) qs.set('departure_date', f.date);
    if (f.payment) qs.set('payment_status', f.payment);
    api('/api/dispatcher/bookings?' + qs.toString()).then(data => {
      const items = data.bookings || [];
      const now = Date.now();
      const threshold = OVERDUE_MINUTES * 60 * 1000;
      const overdue = items.filter(b => {
        const created = b.created_at ? new Date(b.created_at).getTime() : 0;
        return created && (now - created) > threshold;
      });
      const fresh = items.filter(b => {
        const created = b.created_at ? new Date(b.created_at).getTime() : 0;
        return !created || (now - created) <= threshold;
      });

      const overdueBlock = document.getElementById('overdueBlock');
      const overdueCountEl = document.getElementById('overdueCount');
      const overdueListEl = document.getElementById('overdueList');
      if (overdue.length > 0) {
        overdueBlock.classList.remove('hidden');
        overdueCountEl.textContent = overdue.length + ' заявок ждут более ' + OVERDUE_MINUTES + ' мин.';
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
        overdueListEl.innerHTML = overdue.map(b => renderNewCard(b, esc)).join('');
        bindTakeButtons(overdueListEl);
      } else {
        overdueBlock.classList.add('hidden');
        overdueListEl.innerHTML = '';
      }

      const list = document.getElementById('newList');
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
      list.innerHTML = fresh.map(b => renderNewCard(b, esc)).join('') || '<p>Нет новых заявок.</p>';
      bindTakeButtons(list);
    }).catch(() => { document.getElementById('newList').innerHTML = '<p>Нет доступа (вы не диспетчер).</p>'; });
  }

  function renderNewCard(b, esc) {
    return `
      <div class="dispatcher-card" data-booking="${esc(b.booking_id)}">
        <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
        ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.passengers_count)} пасс. | ${esc(b.price_total)} ${esc(b.currency)}
        <div class="status">${b.status}</div>
        <div class="actions">
          <button data-action="take" data-id="${b.booking_id}">Взять в работу</button>
        </div>
      </div>
    `;
  }

  function bindTakeButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-action="take"]').forEach(btn => {
      btn.addEventListener('click', () => {
        api('/api/dispatcher/bookings/' + btn.dataset.id + '/take', { method: 'POST' })
          .then(() => { loadNew(); loadActive(); loadStats(); })
          .catch(e => alert(e && e.message ? e.message : 'Произошла ошибка. Попробуйте позже.'));
      });
    });
  }

  function loadActive() {
    const f = readFilters();
    const qs = new URLSearchParams({ status: 'active' });
    if (f.route) qs.set('route_id', f.route);
    if (f.date) qs.set('departure_date', f.date);
    if (f.payment) qs.set('payment_status', f.payment);
    api('/api/dispatcher/bookings?' + qs.toString()).then(data => {
      const list = document.getElementById('activeList');
      const items = data.bookings || [];
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
      list.innerHTML = items.map(b => `
        <div class="dispatcher-card">
          <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
          ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.price_total)} ${esc(b.currency)}
          <div class="status">${esc(b.payment_status)}</div>
          <div class="actions">
            <button data-id="${b.booking_id}" data-status="paid">Оплачено</button>
            <button data-id="${b.booking_id}" data-status="ticket_sent">Билет отправлен</button>
            <button data-id="${b.booking_id}" data-status="done">Завершено</button>
            <button data-id="${b.booking_id}" data-status="cancelled">Отменить</button>
          </div>
        </div>
      `).join('') || '<p>Нет заявок в работе.</p>';
      list.querySelectorAll('.actions button').forEach(btn => {
        btn.addEventListener('click', () => {
          const payload = { status: btn.dataset.status };
          if (btn.dataset.status === 'cancelled') {
            const reason = prompt('Укажите причину отмены заявки:');
            if (!reason || !reason.trim()) return;
            payload.reason = reason.trim();
          }
          api('/api/dispatcher/bookings/' + btn.dataset.id + '/status', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
          }).then(() => { loadActive(); loadStats(); }).catch(e => alert(e && e.message ? e.message : 'Произошла ошибка. Попробуйте позже.'));
        });
      });
    }).catch(() => { document.getElementById('activeList').innerHTML = '<p>Нет доступа (вы не диспетчер).</p>'; });
  }

  function loadStats() {
    api('/api/dispatcher/stats').then(data => {
      document.getElementById('statsContent').innerHTML = `
        <div class="dispatcher-card">
          За сегодня: <strong>${data.total || 0}</strong> заявок, сумма <strong>${data.sum || 0} BYN</strong><br>
          Просроченные в работе (&gt;15 мин): <strong>${data.overdue_15m || 0}</strong>
        </div>
      `;
    }).catch(() => {
      document.getElementById('statsContent').innerHTML = '<p>Ошибка загрузки статистики.</p>';
    });
  }

  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', function() {
      loadNew();
      loadActive();
    });
  }

  document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    const url = (typeof BASE_URL !== 'undefined' ? BASE_URL : '') + '/api/bookings/' + encodeURIComponent(q);
    fetch(url, { headers }).then(r =>
      r.ok ? r.json() : r.json().then(data => { throw { status: r.status, body: data }; })
    ).then(b => {
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
      document.getElementById('searchResults').innerHTML = `
        <div class="dispatcher-card">
          <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
          ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.status)} | ${esc(b.price_total)} ${esc(b.currency)}
        </div>
      `;
    }).catch(() => {
      document.getElementById('searchResults').innerHTML = '<p>Не найдено.</p>';
    });
  });

  loadNew();
  loadStats();

  // WebSocket для real-time уведомлений о новых заявках
  (function connectWs() {
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = wsProto + '//' + location.host + '/ws/dispatcher/' + uid;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = function() {
        const initData = typeof getTelegramInitData === 'function' ? getTelegramInitData() : '';
        if (initData) ws.send(JSON.stringify({ type: 'auth', init_data: initData }));
        else ws.send(JSON.stringify({ type: 'ping' }));
      };
      ws.onmessage = function(ev) {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'new_booking') { loadNew(); if (window.Telegram && Telegram.WebApp) Telegram.WebApp.HapticFeedback.notificationOccurred('success'); }
        } catch (e) {}
      };
      ws.onclose = function(event) {
        if (event && event.code === 4003) {
          alert('Сессия истекла, обновите страницу');
          return;
        }
        setTimeout(connectWs, 5000);
      };
      ws.onerror = function() { ws.close(); };
    } catch (e) {}
  })();
})();
