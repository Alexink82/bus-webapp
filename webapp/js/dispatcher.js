(function() {
  const uid = getTelegramUserId();
  if (!uid) {
    document.getElementById('loginWarning').classList.remove('hidden');
    return;
  }

  document.getElementById('loginWarning').classList.add('hidden');
  const dispatcherWrap = document.getElementById('dispatcherWrap');
  if (dispatcherWrap) dispatcherWrap.classList.remove('hidden');

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

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getBadgeHtml(statusOrPayment) {
    if (typeof getStatusBadge !== 'function') return statusOrPayment || '—';
    var badge = getStatusBadge(statusOrPayment);
    var icon = (badge.class.indexOf('success') !== -1 && typeof APP_ICONS !== 'undefined' && APP_ICONS.check) ? APP_ICONS.check : '';
    return '<span class="' + badge.class + '">' + icon + '<span>' + (statusOrPayment ? badge.label : '—') + '</span></span>';
  }

  // Табы: только Новые / В работе
  document.querySelectorAll('.dispatcher-tabs__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dispatcher-tabs__btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.dispatcher-tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tab = btn.dataset.tab;
      const panelId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.remove('hidden');
      if (tab === 'new') loadNew();
      if (tab === 'active') loadActive();
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
  var skeletonCardHtml = '<div class="skeleton-card-dispatcher"><div class="skeleton skeleton--title"></div><div class="skeleton"></div><div class="skeleton skeleton--short"></div></div>';
  var skeletonListHtml = skeletonCardHtml + skeletonCardHtml + skeletonCardHtml;

  function renderNewCard(b) {
    var statusBadge = getBadgeHtml(b.status);
    return `
      <div class="dispatcher-card" data-booking="${esc(b.booking_id)}">
        <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
        ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.passengers_count)} пасс. | ${esc(b.price_total)} ${esc(b.currency)}
        <div class="status">${statusBadge}</div>
        <div class="actions">
          <button data-action="take" data-id="${b.booking_id}">Взять в работу</button>
        </div>
      </div>
    `;
  }

  function openContactModal(bookingId) {
    api('/api/bookings/' + encodeURIComponent(bookingId)).then(function(b) {
      var phone = (b.contact_phone || '').trim();
      var tgId = b.contact_tg_id;
      var tgLink = tgId ? ('tg://user?id=' + tgId) : '';
      var parts = [];
      if (phone) parts.push('<p><strong>Телефон:</strong> <a href="tel:' + esc(phone) + '">' + esc(phone) + '</a></p>');
      if (tgLink) parts.push('<p><strong>Telegram:</strong> <a href="' + esc(tgLink) + '" target="_blank" rel="noopener">Написать в Telegram</a></p>');
      if (b.passengers && b.passengers.length) {
        parts.push('<p><strong>Пассажиры:</strong></p><ul>');
        b.passengers.forEach(function(p) {
          parts.push('<li>' + esc(p.last_name) + ' ' + esc(p.first_name) + (p.passport ? ' · ' + esc(p.passport) : '') + '</li>');
        });
        parts.push('</ul>');
      }
      if (!parts.length) parts.push('<p>Контакт не указан.</p>');
      var html = '<div class="dispatcher-contact-modal">' + parts.join('') + '</div>';
      if (typeof showAppModal === 'function') {
        showAppModal({ title: 'Контакт · ' + esc(b.booking_id), html: html, buttons: [{ text: 'Закрыть', primary: true }] });
      } else {
        alert(phone || 'Контакт не указан.');
      }
    }).catch(function() {
      (typeof showAppAlert === 'function' ? showAppAlert : alert)('Не удалось загрузить заявку.', 'Ошибка');
    });
  }

  function renderActiveCard(b) {
    var statusBadge = getBadgeHtml(b.payment_status || b.status);
    var contactLabel = (b.contact_phone || '').trim() ? 'Телефон' : 'Связаться';
    return `
      <div class="dispatcher-card" data-booking="${esc(b.booking_id)}">
        <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
        ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.price_total)} ${esc(b.currency)}
        <div class="status">${statusBadge}</div>
        <div class="actions">
          <button type="button" data-action="contact" data-id="${esc(b.booking_id)}" class="dispatcher-btn-contact">${contactLabel}</button>
          <button data-id="${b.booking_id}" data-status="paid">Оплачено</button>
          <button data-id="${b.booking_id}" data-status="ticket_sent">Билет отправлен</button>
          <button data-id="${b.booking_id}" data-status="done">Завершено</button>
          <button data-id="${b.booking_id}" data-status="cancelled">Отменить</button>
        </div>
      </div>
    `;
  }

  function bindTakeButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-action="take"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        api('/api/dispatcher/bookings/' + btn.dataset.id + '/take', { method: 'POST' })
          .then(() => { loadNew(); loadActive(); loadStats(); })
          .catch(e => { var msg = e && e.message ? e.message : 'Произошла ошибка. Попробуйте позже.'; (typeof showAppAlert === 'function' ? showAppAlert : alert)(msg, 'Ошибка'); });
      });
    });
  }

  function bindStatusButtons(container) {
    if (!container) return;
    container.querySelectorAll('.actions button[data-status]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
        }).then(() => { loadActive(); loadNew(); loadStats(); }).catch(e => { var msg = e && e.message ? e.message : 'Произошла ошибка.'; (typeof showAppAlert === 'function' ? showAppAlert : alert)(msg, 'Ошибка'); });
      });
    });
  }

  function loadNew() {
    const list = document.getElementById('newList');
    if (list) list.innerHTML = skeletonListHtml;
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
      if (overdue.length > 0 && overdueBlock && overdueCountEl && overdueListEl) {
        overdueBlock.classList.remove('hidden');
        overdueCountEl.textContent = overdue.length + ' заявок ждут более ' + OVERDUE_MINUTES + ' мин.';
        overdueListEl.innerHTML = overdue.map(b => renderNewCard(b)).join('');
        bindTakeButtons(overdueListEl);
      } else if (overdueBlock && overdueListEl) {
        overdueBlock.classList.add('hidden');
        overdueListEl.innerHTML = '';
      }

      if (list) {
        list.innerHTML = fresh.map(b => renderNewCard(b)).join('') || '<p>Нет новых заявок.</p>';
        bindTakeButtons(list);
      }
    }).catch(() => { if (list) list.innerHTML = '<p>Нет доступа (вы не диспетчер).</p>'; });
  }

  function loadActive() {
    const activeList = document.getElementById('activeList');
    if (activeList) activeList.innerHTML = skeletonListHtml;
    const f = readFilters();
    const qs = new URLSearchParams({ status: 'active' });
    if (f.route) qs.set('route_id', f.route);
    if (f.date) qs.set('departure_date', f.date);
    if (f.payment) qs.set('payment_status', f.payment);
    api('/api/dispatcher/bookings?' + qs.toString()).then(data => {
      const items = data.bookings || [];
      if (activeList) {
        activeList.innerHTML = items.map(b => renderActiveCard(b)).join('') || '<p>Нет заявок в работе.</p>';
        bindStatusButtons(activeList);
        activeList.querySelectorAll('[data-action="contact"]').forEach(function(btn) {
          btn.addEventListener('click', function(e) { e.stopPropagation(); openContactModal(btn.dataset.id); });
        });
      }
      updateActiveWidget(items.length ? items[0] : null);
    }).catch(() => {
      if (activeList) activeList.innerHTML = '<p>Нет доступа (вы не диспетчер).</p>';
      updateActiveWidget(null);
    });
  }

  function updateActiveWidget(booking) {
    const emptyEl = document.getElementById('activeWidgetEmpty');
    const cardEl = document.getElementById('activeWidgetCard');
    if (!emptyEl || !cardEl) return;
    if (!booking) {
      emptyEl.classList.remove('hidden');
      cardEl.classList.add('hidden');
      cardEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');
    cardEl.classList.remove('hidden');
    cardEl.innerHTML = `
      <p><strong>${esc(booking.booking_id)}</strong><br>${esc(booking.route_name)}</p>
      <p>${esc(booking.departure_date)} ${esc(booking.departure_time)} · ${esc(booking.price_total)} ${esc(booking.currency)}</p>
      <div class="actions">
        <button type="button" data-action="contact" data-id="${esc(booking.booking_id)}" class="dispatcher-btn-contact">Связаться</button>
        <button data-id="${esc(booking.booking_id)}" data-status="ticket_sent">Отправить билет</button>
        <button data-id="${esc(booking.booking_id)}" data-status="cancelled">Отменить</button>
      </div>
    `;
    bindStatusButtons(cardEl);
    cardEl.querySelectorAll('[data-action="contact"]').forEach(function(btn) {
      btn.addEventListener('click', function() { openContactModal(btn.dataset.id); });
    });
  }

  function loadStats() {
    api('/api/dispatcher/stats').then(data => {
      const total = data.total != null ? data.total : 0;
      const sum = data.sum != null ? data.sum : 0;
      const overdue15 = data.overdue_15m != null ? data.overdue_15m : 0;
      const sidebarEl = document.getElementById('sidebarStatsContent');
      if (sidebarEl) {
        sidebarEl.innerHTML = 'За сегодня: <strong>' + total + '</strong> заявок, <strong>' + sum + ' BYN</strong><br>Просрочено &gt;15 мин: <strong>' + overdue15 + '</strong>';
      }
      const slaEl = document.getElementById('dispatcherSlaCount');
      if (slaEl) {
        slaEl.textContent = overdue15 > 0 ? 'Просрочено: ' + overdue15 : '—';
        slaEl.setAttribute('data-overdue', overdue15 > 0 ? 'true' : 'false');
      }
    }).catch(() => {
      const sidebarEl = document.getElementById('sidebarStatsContent');
      if (sidebarEl) sidebarEl.textContent = 'Ошибка загрузки';
      const slaEl = document.getElementById('dispatcherSlaCount');
      if (slaEl) slaEl.textContent = '—';
    });
  }

  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', function() {
      loadNew();
      loadActive();
    });
  }

  // Поиск в топ-баре
  const searchInput = document.getElementById('dispatcherSearch');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      const q = this.value.trim();
      if (!q) return;
      const url = (typeof BASE_URL !== 'undefined' ? BASE_URL : '') + '/api/bookings/' + encodeURIComponent(q);
      fetch(url, { headers }).then(r =>
        r.ok ? r.json() : r.json().then(data => { throw { status: r.status, body: data }; })
      ).then(b => {
        if (typeof showAppAlert === 'function') {
          showAppAlert(esc(b.booking_id) + ' · ' + esc(b.route_name) + ' · ' + esc(b.departure_date) + ' ' + esc(b.departure_time) + ' · ' + esc(b.status), 'Заявка');
        } else {
          alert(esc(b.booking_id) + ' · ' + esc(b.route_name));
        }
      }).catch(() => {
        (typeof showAppAlert === 'function' ? showAppAlert : alert)('Не найдено.', 'Поиск');
      });
    });
  }

  // Мобильная кнопка «Моя активная заявка» — открыть модалку с тем же контентом
  const mobileActiveBtn = document.getElementById('mobileActiveBtn');
  if (mobileActiveBtn) {
    mobileActiveBtn.addEventListener('click', function() {
      const content = document.getElementById('activeWidgetContent');
      if (!content) return;
      const html = '<div class="dispatcher-active-widget__content">' + content.innerHTML + '</div>';
      if (typeof showAppModal === 'function') {
        showAppModal({ title: 'Моя активная заявка', html: html, buttons: [{ text: 'Закрыть', primary: true }] });
      } else {
        alert(content.innerText || 'Нет активной заявки.');
      }
    });
  }

  // Мобильная кнопка «Фильтры» — модалка с фильтрами
  const mobileFiltersBtn = document.getElementById('mobileFiltersBtn');
  if (mobileFiltersBtn) {
    mobileFiltersBtn.addEventListener('click', function() {
      const route = document.getElementById('filterRoute');
      const date = document.getElementById('filterDate');
      const payment = document.getElementById('filterPayment');
      const rVal = route ? esc(route.value) : '';
      const dVal = date ? esc(date.value) : '';
      const pVal = payment ? esc(payment.value) : '';
      const body = '<div class="dispatcher-filters"><label>Маршрут</label><input type="text" id="modalFilterRoute" value="' + rVal + '" placeholder="ID маршрута"><label>Дата</label><input type="date" id="modalFilterDate" value="' + dVal + '"><label>Оплата</label><select id="modalFilterPayment"><option value="">Все</option><option value="paid">Оплачено</option><option value="pending">Не оплачено</option></select><button type="button" id="modalApplyFilters" class="btn btn-primary">Применить</button></div>';
      if (typeof showAppModal === 'function') {
        showAppModal({ title: 'Фильтры', html: body, buttons: [] });
        var sel = document.getElementById('modalFilterPayment');
        if (sel && payment && pVal) sel.value = pVal;
        document.getElementById('modalApplyFilters').addEventListener('click', function() {
          var r = document.getElementById('modalFilterRoute');
          var d = document.getElementById('modalFilterDate');
          var p = document.getElementById('modalFilterPayment');
          if (route && r) route.value = r.value || '';
          if (date && d) date.value = d.value || '';
          if (payment && p) payment.value = p.value || '';
          var ov = document.querySelector('.app-modal-overlay.app-modal-visible');
          if (ov) ov.click();
          loadNew();
          loadActive();
        });
      } else {
        loadNew();
        loadActive();
      }
    });
  }

  loadNew();
  loadActive();
  loadStats();

  // WebSocket: new_booking + status_changed
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
          if (msg.type === 'new_booking') {
            loadNew();
            loadStats();
            if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          }
          if (msg.type === 'status_changed') {
            loadNew();
            loadActive();
            loadStats();
          }
        } catch (e) {}
      };
      ws.onclose = function(event) {
        if (event && event.code === 4003) {
          (typeof showAppAlert === 'function' ? showAppAlert : alert)('Сессия истекла, обновите страницу', 'Сессия');
          return;
        }
        setTimeout(connectWs, 5000);
      };
      ws.onerror = function() { ws.close(); };
    } catch (e) {}
  })();
})();
