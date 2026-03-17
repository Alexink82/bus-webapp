(function() {
  const uid = getTelegramUserId();
  if (!uid) {
    document.getElementById('loginWarning').classList.remove('hidden');
    return;
  }

  const headers = { 'X-Telegram-User-Id': String(uid) };
  if (typeof getTelegramInitData === 'function' && getTelegramInitData())
    headers['X-Telegram-Init-Data'] = getTelegramInitData();
  const baseUrl = typeof BASE_URL !== 'undefined' ? BASE_URL : '';
  function fetchRoles() {
    return fetch(baseUrl + '/api/user/roles', { headers: headers }).then(function(r) { return r.json(); });
  }

  fetchRoles().then(function(roles) {
    const isDispatcher = roles.is_dispatcher === true;
    const isAdmin = roles.is_admin === true;
    if (!isDispatcher && !isAdmin) {
      window.location.href = 'index.html';
      return;
    }
    runDispatcherPanel();
  }).catch(function() {
    runDispatcherPanel();
  });

  function runDispatcherPanel() {
  document.getElementById('loginWarning').classList.add('hidden');
  const dispatcherWrap = document.getElementById('dispatcherWrap');
  if (dispatcherWrap) dispatcherWrap.classList.remove('hidden');

  let isAdminView = false;
  let dispatchersListLoaded = false;
  function setAdminView(enable) {
    if (isAdminView === enable) return;
    isAdminView = enable;
    const banner = document.getElementById('dispatcherAdminBanner');
    const filterWrap = document.getElementById('filterDispatcherWrap');
    const exportHint = document.getElementById('dispatcherExportHint');
    if (banner) banner.classList.toggle('hidden', !enable);
    if (filterWrap) filterWrap.classList.toggle('hidden', !enable);
    if (exportHint) exportHint.textContent = enable ? 'CSV всех заявок за сегодня (при фильтре «Диспетчер» — только его заявки).' : 'CSV всех заявок за сегодня по вашим маршрутам.';
    if (enable && !dispatchersListLoaded) {
      dispatchersListLoaded = true;
      api('/api/admin/dispatchers').then(function(data) {
        const list = (data.dispatchers || []);
        const sel = document.getElementById('filterDispatcher');
        if (!sel) return;
        sel.innerHTML = '<option value="">Все</option>';
        list.forEach(function(d) {
          const opt = document.createElement('option');
          opt.value = String(d.telegram_id);
          opt.textContent = (d.name || d.phone || 'ID ' + d.telegram_id) || String(d.telegram_id);
          sel.appendChild(opt);
        });
      }).catch(function() {});
    }
  }

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

  var sidebarToggle = document.getElementById('dispatcherSidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      document.body.classList.toggle('dispatcher-sidebar-collapsed');
      this.textContent = document.body.classList.contains('dispatcher-sidebar-collapsed') ? '▶' : '◀ Свернуть';
      this.setAttribute('aria-label', document.body.classList.contains('dispatcher-sidebar-collapsed') ? 'Развернуть панель' : 'Свернуть панель');
    });
  }

  function readFilters() {
    const f = {
      route: (document.getElementById('filterRoute') || {}).value || '',
      date: (document.getElementById('filterDate') || {}).value || '',
      payment: (document.getElementById('filterPayment') || {}).value || '',
      dispatcher_id: ''
    };
    if (isAdminView) {
      const d = document.getElementById('filterDispatcher');
      if (d && d.value) f.dispatcher_id = d.value;
    }
    return f;
  }

  function applySort(items, sortKey) {
    const key = sortKey || 'time';
    const copy = items.slice();
    if (key === 'time') {
      copy.sort(function(a, b) {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    } else if (key === 'route') {
      copy.sort(function(a, b) {
        const ra = (a.route_name || '').toLowerCase();
        const rb = (b.route_name || '').toLowerCase();
        return ra.localeCompare(rb) || 0;
      });
    } else if (key === 'dispatcher') {
      copy.sort(function(a, b) {
        const da = a.dispatcher_id != null ? String(a.dispatcher_id) : '';
        const db = b.dispatcher_id != null ? String(b.dispatcher_id) : '';
        return da.localeCompare(db) || 0;
      });
    }
    return copy;
  }

  const OVERDUE_MINUTES = 15;
  const SLA_WARNING_MINUTES = 10;
  var skeletonCardHtml = '<div class="skeleton-card-dispatcher"><div class="skeleton skeleton--title"></div><div class="skeleton"></div><div class="skeleton skeleton--short"></div></div>';
  var skeletonListHtml = skeletonCardHtml + skeletonCardHtml + skeletonCardHtml;

  function getSlaState(createdAt) {
    if (!createdAt) return { minutes: 0, state: 'ok', label: '' };
    var created = new Date(createdAt).getTime();
    var now = Date.now();
    var minutes = Math.floor((now - created) / 60000);
    var state = minutes <= SLA_WARNING_MINUTES ? 'ok' : (minutes <= OVERDUE_MINUTES ? 'warning' : 'overdue');
    var label = minutes < 1 ? 'только что' : (minutes === 1 ? '1 мин' : minutes + ' мин');
    return { minutes: minutes, state: state, label: label };
  }

  function renderNewCard(b) {
    var statusBadge = getBadgeHtml(b.status);
    var sla = getSlaState(b.created_at);
    var slaTitle = 'Заявка: ' + sla.label + (sla.state === 'overdue' ? ' (просрочено)' : '');
    return `
      <div class="dispatcher-card dispatcher-card--has-sla" data-booking="${esc(b.booking_id)}">
        <div class="dispatcher-card__sla dispatcher-card__sla--${esc(sla.state)}" title="${esc(slaTitle)}" aria-label="${esc(slaTitle)}">
          <span class="dispatcher-card__sla-bar" style="width: ${Math.min(100, (sla.minutes / OVERDUE_MINUTES) * 100)}%"></span>
          <span class="dispatcher-card__sla-label">${esc(sla.label)}</span>
        </div>
        <div class="dispatcher-card__row">
          <label class="dispatcher-card__check"><input type="checkbox" class="dispatcher-card__cb" data-booking="${esc(b.booking_id)}" aria-label="Выбрать заявку"></label>
          <div class="dispatcher-card__body">
            <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}<br>
            ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.passengers_count)} пасс. | ${esc(b.price_total)} ${esc(b.currency)}
            <div class="status">${statusBadge}</div>
            <div class="actions">
              <button data-action="take" data-id="${b.booking_id}">Взять в работу</button>
            </div>
          </div>
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
    var dispatcherLine = (isAdminView && b.dispatcher_id) ? '<br><span class="dispatcher-card__dispatcher">Диспетчер: ' + esc(String(b.dispatcher_id)) + '</span>' : '';
    return `
      <div class="dispatcher-card" data-booking="${esc(b.booking_id)}">
        <strong>${esc(b.booking_id)}</strong> ${esc(b.route_name)}${dispatcherLine}<br>
        ${esc(b.departure_date)} ${esc(b.departure_time)} | ${esc(b.price_total)} ${esc(b.currency)}
        <div class="status">${statusBadge}</div>
        <div class="actions">
          <button type="button" data-action="contact" data-id="${esc(b.booking_id)}" class="dispatcher-btn-contact">${contactLabel}</button>
          <button data-id="${b.booking_id}" data-status="payment_link_sent">Ссылка оплаты</button>
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

  function openCancelReasonModal(bookingId, onSuccess) {
    var textareaId = 'cancelReasonInput';
    var html = '<div class="dispatcher-cancel-reason"><label for="' + textareaId + '">Причина отмены</label><textarea id="' + textareaId + '" rows="3" placeholder="Укажите причину отмены заявки" class="dispatcher-cancel-reason__input"></textarea></div>';
    var buttons = [
      { text: 'Закрыть', primary: false },
      { text: 'Отменить заявку', primary: true, id: 'confirmCancelBtn' }
    ];
    if (typeof showAppModal === 'function') {
      showAppModal({ title: 'Отмена заявки', html: html, buttons: buttons });
      var confirmBtn = document.getElementById('confirmCancelBtn');
      var textarea = document.getElementById(textareaId);
      if (confirmBtn && textarea) {
        confirmBtn.addEventListener('click', function() {
          var reason = (textarea.value || '').trim();
          if (!reason) {
            (typeof showAppAlert === 'function' ? showAppAlert : alert)('Укажите причину отмены.', 'Внимание');
            return;
          }
          api('/api/dispatcher/bookings/' + encodeURIComponent(bookingId) + '/status', {
            method: 'POST',
            body: JSON.stringify({ status: 'cancelled', reason: reason }),
            headers: { 'Content-Type': 'application/json' },
          }).then(function() {
            var ov = document.querySelector('.app-modal-overlay.app-modal-visible');
            if (ov) ov.click();
            if (typeof onSuccess === 'function') onSuccess();
            loadActive(); loadNew(); loadStats();
          }).catch(function(e) {
            var msg = e && e.message ? e.message : 'Ошибка.';
            (typeof showAppAlert === 'function' ? showAppAlert : alert)(msg, 'Ошибка');
          });
        });
      }
    } else {
      var reason = prompt('Укажите причину отмены заявки:');
      if (!reason || !reason.trim()) return;
      api('/api/dispatcher/bookings/' + encodeURIComponent(bookingId) + '/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'cancelled', reason: reason.trim() }),
        headers: { 'Content-Type': 'application/json' },
      }).then(function() {
        if (typeof onSuccess === 'function') onSuccess();
        loadActive(); loadNew(); loadStats();
      }).catch(function(e) {
        var msg = e && e.message ? e.message : 'Ошибка.';
        alert(msg);
      });
    }
  }

  function bindStatusButtons(container) {
    if (!container) return;
    container.querySelectorAll('.actions button[data-status]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const status = btn.dataset.status;
        const bookingId = btn.dataset.id;
        if (status === 'cancelled') {
          openCancelReasonModal(bookingId);
          return;
        }
        api('/api/dispatcher/bookings/' + encodeURIComponent(bookingId) + '/status', {
          method: 'POST',
          body: JSON.stringify({ status: status }),
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
    if (isAdminView && f.dispatcher_id) qs.set('filter_dispatcher_id', f.dispatcher_id);
    api('/api/dispatcher/bookings?' + qs.toString()).then(data => {
      setAdminView(!!data.is_admin_view);
      let items = data.bookings || [];
      const sortEl = document.getElementById('sortNew');
      items = applySort(items, sortEl ? sortEl.value : 'time');
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
      updateNewBulkActions();
      bindNewBulkActionsOnce();
    }).catch(() => { if (list) list.innerHTML = '<p>Нет доступа (вы не диспетчер).</p>'; updateNewBulkActions(); });
  }

  function getNewCardCheckboxes() {
    var newList = document.getElementById('newList');
    var overdueList = document.getElementById('overdueList');
    var nodes = [];
    if (newList) nodes.push.apply(nodes, newList.querySelectorAll('.dispatcher-card__cb'));
    if (overdueList) nodes.push.apply(nodes, overdueList.querySelectorAll('.dispatcher-card__cb'));
    return nodes;
  }

  function getSelectedNewBookingIds() {
    return getNewCardCheckboxes().filter(function(cb) { return cb.checked; }).map(function(cb) { return cb.dataset.booking; });
  }

  function updateNewBulkActions() {
    var bar = document.getElementById('newBulkActions');
    var countEl = document.getElementById('takeSelectedCount');
    var btn = document.getElementById('takeSelectedBtn');
    var selectAll = document.getElementById('selectAllNew');
    if (!bar || !countEl || !btn) return;
    var cbs = getNewCardCheckboxes();
    bar.classList.toggle('hidden', cbs.length === 0);
    var selected = cbs.filter(function(cb) { return cb.checked; }).length;
    countEl.textContent = selected;
    btn.disabled = selected === 0;
    if (selectAll) {
      selectAll.checked = cbs.length > 0 && selected === cbs.length;
      selectAll.indeterminate = selected > 0 && selected < cbs.length;
    }
  }

  var newBulkActionsBound = false;
  function bindNewBulkActionsOnce() {
    if (newBulkActionsBound) return;
    newBulkActionsBound = true;
    var selectAll = document.getElementById('selectAllNew');
    var takeBtn = document.getElementById('takeSelectedBtn');
    var newList = document.getElementById('newList');
    var overdueList = document.getElementById('overdueList');
    if (selectAll) {
      selectAll.addEventListener('change', function() {
        var check = selectAll.checked;
        getNewCardCheckboxes().forEach(function(cb) { cb.checked = check; });
        updateNewBulkActions();
      });
    }
    if (takeBtn) {
      takeBtn.addEventListener('click', function() {
        var ids = getSelectedNewBookingIds();
        if (ids.length === 0) return;
        takeBtn.disabled = true;
        takeBtn.textContent = 'Ожидание…';
        var done = 0;
        function runNext() {
          if (done >= ids.length) {
            takeBtn.innerHTML = 'Взять все выбранные (<span id="takeSelectedCount">0</span>)';
            loadNew();
            loadActive();
            loadStats();
            return;
          }
          var id = ids[done];
          api('/api/dispatcher/bookings/' + encodeURIComponent(id) + '/take', { method: 'POST' })
            .then(function() { done++; runNext(); })
            .catch(function(e) {
              var msg = e && e.message ? e.message : 'Ошибка.';
              (typeof showAppAlert === 'function' ? showAppAlert : alert)(msg, 'Ошибка');
              takeBtn.disabled = false;
              takeBtn.innerHTML = 'Взять все выбранные (<span id="takeSelectedCount">0</span>)';
              document.getElementById('takeSelectedCount').textContent = getSelectedNewBookingIds().length;
              loadNew();
              loadActive();
              loadStats();
            });
        }
        runNext();
      });
    }
    function delegateCheck(e) {
      if (e.target && e.target.classList && e.target.classList.contains('dispatcher-card__cb')) updateNewBulkActions();
    }
    if (newList) newList.addEventListener('change', delegateCheck);
    if (overdueList) overdueList.addEventListener('change', delegateCheck);
  }

  function loadActive() {
    const activeList = document.getElementById('activeList');
    if (activeList) activeList.innerHTML = skeletonListHtml;
    const f = readFilters();
    const qs = new URLSearchParams({ status: 'active' });
    if (f.route) qs.set('route_id', f.route);
    if (f.date) qs.set('departure_date', f.date);
    if (f.payment) qs.set('payment_status', f.payment);
    if (isAdminView && f.dispatcher_id) qs.set('filter_dispatcher_id', f.dispatcher_id);
    api('/api/dispatcher/bookings?' + qs.toString()).then(data => {
      setAdminView(!!data.is_admin_view);
      let items = data.bookings || [];
      const sortEl = document.getElementById('sortActive');
      items = applySort(items, sortEl ? sortEl.value : 'time');
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
        <button data-id="${esc(booking.booking_id)}" data-status="payment_link_sent">Ссылка оплаты</button>
        <button data-id="${esc(booking.booking_id)}" data-status="paid">Оплачено</button>
        <button data-id="${esc(booking.booking_id)}" data-status="ticket_sent">Отправить билет</button>
        <button data-id="${esc(booking.booking_id)}" data-status="done">Завершено</button>
        <button data-id="${esc(booking.booking_id)}" data-status="cancelled">Отменить</button>
      </div>
    `;
    bindStatusButtons(cardEl);
    cardEl.querySelectorAll('[data-action="contact"]').forEach(function(btn) {
      btn.addEventListener('click', function() { openContactModal(btn.dataset.id); });
    });
  }

  function loadStats() {
    const f = readFilters();
    const qs = new URLSearchParams();
    if (isAdminView && f.dispatcher_id) qs.set('filter_dispatcher_id', f.dispatcher_id);
    const url = '/api/dispatcher/stats' + (qs.toString() ? '?' + qs.toString() : '');
    api(url).then(data => {
      setAdminView(!!data.is_admin_view);
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
      loadStats();
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

  // Экспорт заявок за смену (CSV)
  (function bindExport() {
    var btn = document.getElementById('dispatcherExportBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var base = (typeof BASE_URL !== 'undefined' ? BASE_URL : '');
      var qs = '';
      if (isAdminView) {
        var f = readFilters();
        if (f.dispatcher_id) qs = '?filter_dispatcher_id=' + encodeURIComponent(f.dispatcher_id);
      }
      window.open(base + '/api/dispatcher/export' + qs, '_blank');
    });
  })();

  // Сортировка: при смене перезагружаем список (данные уже есть, можно пересортировать без запроса)
  function attachSortHandlers() {
    var sortNew = document.getElementById('sortNew');
    var sortActive = document.getElementById('sortActive');
    if (sortNew) sortNew.addEventListener('change', function() { loadNew(); });
    if (sortActive) sortActive.addEventListener('change', function() { loadActive(); });
  }
  attachSortHandlers();

  // Двойной клик по карточке — модалка контакта
  if (dispatcherWrap) {
    dispatcherWrap.addEventListener('dblclick', function(e) {
      var card = e.target && e.target.closest && e.target.closest('.dispatcher-card[data-booking]');
      if (card && card.dataset.booking) {
        e.preventDefault();
        openContactModal(card.dataset.booking);
      }
    });
  }

  // Горячие клавиши (не срабатывают при фокусе в input/textarea/select)
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'k') {
        e.preventDefault();
        var searchEl = document.getElementById('dispatcherSearch');
        if (searchEl) { searchEl.focus(); searchEl.select(); }
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        document.querySelector('.dispatcher-tabs__btn[data-tab="new"]') && document.querySelector('.dispatcher-tabs__btn[data-tab="new"]').click();
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        document.querySelector('.dispatcher-tabs__btn[data-tab="active"]') && document.querySelector('.dispatcher-tabs__btn[data-tab="active"]').click();
        return;
      }
    }
    if (e.key === 'Enter' || e.key === 'v' || e.key === 'V') {
      var takeBtn = document.querySelector('#newList [data-action="take"], #overdueList [data-action="take"]');
      if (takeBtn) {
        e.preventDefault();
        takeBtn.click();
      }
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      var sendBtn = document.querySelector('#activeWidgetCard button[data-status="ticket_sent"]');
      if (sendBtn) {
        e.preventDefault();
        sendBtn.click();
      }
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      var cancelBtn = document.querySelector('#activeWidgetCard button[data-status="cancelled"]');
      if (cancelBtn) {
        e.preventDefault();
        cancelBtn.click();
      }
      return;
    }
  });

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
  } // runDispatcherPanel
})();
