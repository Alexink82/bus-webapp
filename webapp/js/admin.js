(function() {
  const uid = typeof window.getTelegramUserId === 'function' ? window.getTelegramUserId() : null;
  if (!uid) {
    document.getElementById('loginWarning').classList.remove('hidden');
    return;
  }
  const api = window.api;
  if (!api) {
    document.getElementById('loginWarning').textContent = 'Ошибка: не загружен api.js';
    return;
  }
  const base = (typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '');
  let statsFromDate = '', statsToDate = '';

  function periodToDates(period) {
    var today = new Date();
    var y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
    var from = new Date(y, m, d);
    if (period === 'week') from.setDate(from.getDate() - 6);
    if (period === 'month') from.setDate(from.getDate() - 29);
    var to = new Date(y, m, d);
    return {
      from_date: from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-' + String(from.getDate()).padStart(2, '0'),
      to_date: to.getFullYear() + '-' + String(to.getMonth() + 1).padStart(2, '0') + '-' + String(to.getDate()).padStart(2, '0')
    };
  }

  var statsChartBookingsInstance = null;
  var statsChartRoutesInstance = null;
  function drawStatsCharts(data) {
    var byDay = data.by_day || {};
    var byRoute = data.by_route || {};
    var dayLabels = Object.keys(byDay).sort();
    var dayValues = dayLabels.map(function(d) { return byDay[d] || 0; });
    var routeLabels = Object.keys(byRoute).sort();
    var routeValues = routeLabels.map(function(r) { return byRoute[r] || 0; });
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || '#1a1a2e';
    var surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#16213e';
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#e94560';
    var text = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim() || '#e8e8ee';
    if (statsChartBookingsInstance) { statsChartBookingsInstance.destroy(); statsChartBookingsInstance = null; }
    if (statsChartRoutesInstance) { statsChartRoutesInstance.destroy(); statsChartRoutesInstance = null; }
    if (typeof Chart !== 'undefined' && dayLabels.length) {
      statsChartBookingsInstance = new Chart(document.getElementById('statsChartBookings'), {
        type: 'bar',
        data: { labels: dayLabels, datasets: [{ label: 'Заявок', data: dayValues, backgroundColor: accent, borderColor: accent, borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: text } }, x: { ticks: { color: text, maxRotation: 45 } } } }
      });
    }
    if (typeof Chart !== 'undefined' && routeLabels.length) {
      statsChartRoutesInstance = new Chart(document.getElementById('statsChartRoutes'), {
        type: 'bar',
        data: { labels: routeLabels, datasets: [{ label: 'Заявок', data: routeValues, backgroundColor: accent, borderColor: accent, borderWidth: 1 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { color: text } }, y: { ticks: { color: text } } } }
      });
    }
  }
  function loadStats(period) {
    var range = periodToDates(period || 'month');
    api('/api/admin/stats?from_date=' + encodeURIComponent(range.from_date) + '&to_date=' + encodeURIComponent(range.to_date)).then(function(data) {
      document.getElementById('loginWarning').classList.add('hidden');
      document.getElementById('adminTabs').classList.remove('hidden');
      document.getElementById('adminMain').classList.remove('hidden');
      statsFromDate = data.from_date;
      statsToDate = data.to_date;
      document.getElementById('statsPeriod').innerHTML = 'Период: <strong>' + data.from_date + '</strong> — <strong>' + data.to_date + '</strong>';
      document.getElementById('statsBookings').textContent = data.total_bookings != null ? data.total_bookings : '—';
      document.getElementById('statsSum').textContent = data.total_sum != null ? data.total_sum : '—';
      drawStatsCharts(data);
    }).catch(function() { document.getElementById('loginWarning').classList.remove('hidden'); document.getElementById('loginWarning').textContent = 'Нет доступа (не админ).'; });
  }

  loadStats('month');

  document.querySelectorAll('.admin-period-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var period = this.getAttribute('data-period');
      document.querySelectorAll('.admin-period-tab').forEach(function(b) { b.classList.remove('admin-period-tab--active'); });
      this.classList.add('admin-period-tab--active');
      loadStats(period);
    });
  });

  document.getElementById('exportCsv').addEventListener('click', function() {
    var from = statsFromDate || periodToDates('month').from_date;
    var to = statsToDate || periodToDates('month').to_date;
    var exportUrl = base + '/api/admin/export?from_date=' + encodeURIComponent(from) + '&to_date=' + encodeURIComponent(to);
    var exportHeaders = { 'X-Telegram-User-Id': String(uid) };
    var initData = (typeof window.getTelegramInitData === 'function' ? window.getTelegramInitData() : '');
    if (initData) exportHeaders['X-Telegram-Init-Data'] = initData;
    fetch(exportUrl, { headers: exportHeaders }).then(function(r) {
      if (!r.ok) return r.json().catch(function() { return {}; }).then(function(d) { throw new Error(d.detail || 'Ошибка экспорта'); });
      return r.blob();
    }).then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bookings.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка экспорта', 'Ошибка'); });
  });

  document.getElementById('runArchiveBtn').addEventListener('click', function() {
    var daysEl = document.getElementById('archiveOlderDays');
    var days = parseInt(daysEl.value, 10);
    if (isNaN(days) || days < 30 || days > 365) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Укажите число дней от 30 до 365.', 'Ошибка'); return; }
    if (!confirm('Пометить заявки старше ' + days + ' дней как архивированные? Они не будут учитываться в статистике.')) return;
    api('/api/admin/archive?older_than_days=' + days, { method: 'POST' })
      .then(function(data) {
        var n = data.archived != null ? data.archived : 0;
        (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))('Архивировано заявок: ' + n, 'success');
        loadStats((function(){ var el = document.querySelector('.admin-period-tab--active'); return el ? el.getAttribute('data-period') : null; })() || 'month');
      })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка архивации', 'Ошибка'); });
  });
  api('/api/admin/logs?limit=50').then(data => {
    const logs = data.logs || [];
    const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'));
    document.getElementById('logsContent').innerHTML = logs.length ? logs.map(function(l) {
      var cls = (l.level || '').toLowerCase().indexOf('error') !== -1 ? 'admin-log-item__level--error' : 'admin-log-item__level--info';
      return '<div class="admin-log-item"><span class="admin-log-item__time">' + esc(l.timestamp) + '</span> <span class="' + cls + '">' + esc(l.level) + '</span> ' + esc(l.source) + ' ' + esc(l.action || l.message || '') + '</div>';
    }).join('') : '<div class="admin-log-item text-tertiary">Нет записей</div>';
  }).catch(function() { document.getElementById('logsContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить логи</div>'; });
  document.getElementById('runRotateLogsBtn').addEventListener('click', function() {
    var daysEl = document.getElementById('rotateLogsOlderDays');
    var days = parseInt(daysEl.value, 10);
    if (isNaN(days) || days < 7 || days > 365) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Укажите число дней от 7 до 365.', 'Ошибка'); return; }
    if (!confirm('Удалить записи логов старше ' + days + ' дней? Это действие необратимо.')) return;
    api('/api/admin/rotate-logs?older_than_days=' + days, { method: 'POST' })
      .then(function(data) {
        (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))('Удалено записей: ' + (data.deleted != null ? data.deleted : 0), 'success');
        api('/api/admin/logs?limit=50').then(function(d) {
          var logs = d.logs || [];
          var esc = function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
          document.getElementById('logsContent').innerHTML = logs.length ? logs.map(function(l) {
            var cls = (l.level || '').toLowerCase().indexOf('error') !== -1 ? 'admin-log-item__level--error' : 'admin-log-item__level--info';
            return '<div class="admin-log-item"><span class="admin-log-item__time">' + esc(l.timestamp) + '</span> <span class="' + cls + '">' + esc(l.level) + '</span> ' + esc(l.source) + ' ' + esc(l.action || l.message || '') + '</div>';
          }).join('') : '<div class="admin-log-item text-tertiary">Нет записей</div>';
        }).catch(function() {});
      })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка ротации логов', 'Ошибка'); });
  });
  function loadRoleAudit() {
    api('/api/admin/role-audit').then(function(data) {
      var entries = data.entries || [];
      var esc = function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var actionLabels = { add_admin: 'Добавлен админ', add_dispatcher: 'Добавлен диспетчер', delete_dispatcher: 'Удалён диспетчер' };
      document.getElementById('roleAuditContent').innerHTML = entries.length ? entries.map(function(e) {
        var label = actionLabels[e.action] || e.action;
        var target = (e.details && e.details.target_telegram_id) != null ? ' ID ' + e.details.target_telegram_id : '';
        var by = e.user_id != null ? ' (админ ID ' + esc(e.user_id) + ')' : '';
        var time = e.timestamp ? esc(e.timestamp).replace('T', ' ').slice(0, 19) : '';
        return '<div class="admin-log-item"><span class="admin-log-item__time">' + time + '</span> ' + label + target + by + '</div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет записей. Изменения ролей появятся здесь.</div>';
    }).catch(function() { document.getElementById('roleAuditContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить</div>'; });
  }

  var bookingsOffset = 0;
  var bookingsLimit = 50;
  function loadAdminBookings() {
    var from = document.getElementById('bookingsFromDate').value || '';
    var to = document.getElementById('bookingsToDate').value || '';
    var status = document.getElementById('bookingsStatus').value || '';
    var qs = 'limit=' + bookingsLimit + '&offset=' + bookingsOffset;
    if (from) qs += '&from_date=' + encodeURIComponent(from);
    if (to) qs += '&to_date=' + encodeURIComponent(to);
    if (status) qs += '&status=' + encodeURIComponent(status);
    var skeletonRows = Array(5).join('<tr><td></td><td><span class="skeleton" style="display:inline-block;width:80px;height:12px;"></span></td><td><span class="skeleton" style="display:inline-block;width:120px;height:12px;"></span></td><td><span class="skeleton" style="display:inline-block;width:70px;height:12px;"></span></td><td><span class="skeleton" style="display:inline-block;width:50px;height:12px;"></span></td><td><span class="skeleton" style="display:inline-block;width:50px;height:12px;"></span></td><td><span class="skeleton" style="display:inline-block;width:80px;height:12px;"></span></td></tr>');
    document.getElementById('bookingsListWrap').innerHTML = '<div class="admin-bookings-table-wrap"><table class="admin-bookings-table"><thead><tr><th></th><th>ID</th><th>Маршрут</th><th>Дата / время</th><th>Статус</th><th>Сумма</th><th>Контакт</th></tr></thead><tbody>' + skeletonRows + '</tbody></table></div>';
    api('/api/admin/bookings?' + qs).then(function(data) {
      var list = data.bookings || [];
      var total = data.total != null ? data.total : 0;
      var esc = function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      var statusLabels = { new: 'Новая', active: 'В работе', paid: 'Оплачено', ticket_sent: 'Билет', done: 'Завершено', cancelled: 'Отменено' };
      var canCancel = function(s) { return s && ['new', 'active', 'payment_link_sent', 'pending_payment'].indexOf(s) !== -1; };
      document.getElementById('bookingsListWrap').innerHTML = list.length ? '<div class="admin-bookings-table-wrap"><table class="admin-bookings-table"><thead><tr><th><input type="checkbox" id="bookingsSelectAll" aria-label="Выбрать все"></th><th>ID</th><th>Маршрут</th><th>Дата / время</th><th>Статус</th><th>Сумма</th><th>Контакт</th></tr></thead><tbody>' +
        list.map(function(b) {
          var check = canCancel(b.status) ? '<input type="checkbox" class="booking-row-cb" data-id="' + esc(b.booking_id) + '">' : '';
          return '<tr><td>' + check + '</td><td>' + esc(b.booking_id) + '</td><td>' + esc(b.route_name) + ' (' + esc(b.from_city) + ' → ' + esc(b.to_city) + ')</td><td>' + esc(b.departure_date) + ' ' + esc(b.departure_time) + '</td><td>' + (statusLabels[b.status] || esc(b.status)) + '</td><td>' + esc(b.price_total) + ' ' + esc(b.currency || 'BYN') + '</td><td>' + esc(b.contact_phone) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="text-secondary">Нет заявок за выбранный период.</p>';
      var bulkBtn = document.getElementById('bookingsCancelBulk');
      if (bulkBtn) {
        if (list.some(function(b) { return canCancel(b.status); })) {
          bulkBtn.classList.remove('hidden');
          bulkBtn.onclick = function() {
            var ids = Array.from(document.querySelectorAll('.booking-row-cb:checked')).map(function(cb) { return cb.getAttribute('data-id'); });
            if (!ids.length) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Выберите заявки для отмены.', 'Внимание'); return; }
            if (!confirm('Отменить ' + ids.length + ' заявок?')) return;
            api('/api/admin/bookings/cancel-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_ids: ids }) })
              .then(function(data) { (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))(data.message || 'Готово'); loadAdminBookings(); })
              .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка', 'Ошибка'); });
          };
        } else bulkBtn.classList.add('hidden');
      }
      var selectAllEl = document.getElementById('bookingsSelectAll');
      if (selectAllEl) selectAllEl.addEventListener('change', function() { document.querySelectorAll('.booking-row-cb').forEach(function(cb) { cb.checked = selectAllEl.checked; }); });
      var pagination = document.getElementById('bookingsPagination');
      if (total > bookingsLimit) {
        var pages = Math.ceil(total / bookingsLimit);
        var currentPage = Math.floor(bookingsOffset / bookingsLimit) + 1;
        var prevDisabled = bookingsOffset <= 0;
        var nextDisabled = bookingsOffset + bookingsLimit >= total;
        pagination.innerHTML = '<span class="admin-bookings-total">Всего: ' + total + '</span> ' +
          '<button type="button" class="btn btn--outline btn--small" id="bookingsPrev" ' + (prevDisabled ? 'disabled' : '') + '>← Назад</button> ' +
          '<span> ' + currentPage + ' / ' + pages + ' </span> ' +
          '<button type="button" class="btn btn--outline btn--small" id="bookingsNext" ' + (nextDisabled ? 'disabled' : '') + '>Вперёд →</button>';
        document.getElementById('bookingsPrev').addEventListener('click', function() { if (bookingsOffset > 0) { bookingsOffset -= bookingsLimit; loadAdminBookings(); } });
        document.getElementById('bookingsNext').addEventListener('click', function() { if (bookingsOffset + bookingsLimit < total) { bookingsOffset += bookingsLimit; loadAdminBookings(); } });
      } else {
        pagination.innerHTML = total ? '<span class="admin-bookings-total">Всего: ' + total + '</span>' : '';
      }
    }).catch(function() { document.getElementById('bookingsListWrap').innerHTML = '<p class="text-error">Не удалось загрузить заявки.</p>'; });
  }
  document.getElementById('bookingsApplyFilters').addEventListener('click', function() { bookingsOffset = 0; loadAdminBookings(); });
  document.querySelectorAll('.segmented-control .segment').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.getAttribute('data-tab');
      if (tab === 'roleAuditPanel') loadRoleAudit();
      if (tab === 'bookingsPanel') loadAdminBookings();
    });
  });

  function loadAdmins() {
    api('/api/admin/admins').then(function(data) {
      var ids = data.admin_ids || [];
      var esc = function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      document.getElementById('adminsList').innerHTML = ids.length ? ids.map(function(id) { return '<div class="admin-log-item">' + esc(id) + '</div>'; }).join('') : '<div class="admin-log-item text-tertiary">Нет записей. Добавьте ID выше или укажите ADMIN_IDS на Render.</div>';
    }).catch(function() { document.getElementById('adminsList').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить</div>'; });
  }
  loadAdmins();

  document.getElementById('addAdminBtn').addEventListener('click', function() {
    var tidEl = document.getElementById('adminTelegramId');
    var tid = parseInt(tidEl.value, 10);
    if (!tid || isNaN(tid)) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Введите Telegram ID (число).', 'Ошибка'); return; }
    api('/api/admin/admins', { method: 'POST', body: JSON.stringify({ telegram_id: tid }) })
      .then(function() { tidEl.value = ''; loadAdmins(); loadRoleAudit(); })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message, 'Ошибка'); });
  });

  function loadDispatchers() {
    api('/api/admin/dispatchers').then(function(data) {
      var list = data.dispatchers || [];
      var esc = function(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
      document.getElementById('dispatchersList').innerHTML = list.length ? list.map(function(d) {
        var status = d.is_active ? '<span class="badge badge--success">активен</span>' : '<span class="badge badge--neutral">неактивен</span>';
        var fromEnv = d.from_env ? ' <span class="badge badge--neutral">из Render</span>' : '';
        var delBtn = d.is_active && !d.from_env ? '<button type="button" class="btn btn--ghost btn--small" data-tid="' + d.telegram_id + '">Удалить</button>' : '';
        return '<div class="admin-log-item" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
          '<span><strong>' + esc(d.telegram_id) + '</strong> ' + esc(d.name || '—') + ' ' + esc(d.phone || '') + ' ' + status + fromEnv + '</span>' + delBtn + '</div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет диспетчеров. Добавьте Telegram ID выше или DISPATCHER_IDS на Render.</div>';
      document.querySelectorAll('#dispatchersList [data-tid]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var tid = this.getAttribute('data-tid');
          if (!tid || !confirm('Деактивировать диспетчера? Вкладка «Диспетчер» у него пропадёт.')) return;
          api('/api/admin/dispatchers/' + tid, { method: 'DELETE' })
            .then(function() { loadDispatchers(); loadRoleAudit(); })
            .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка удаления', 'Ошибка'); });
        });
      });
    }).catch(function() { document.getElementById('dispatchersList').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить список</div>'; });
  }
  loadDispatchers();

  document.getElementById('addDispatcherBtn').addEventListener('click', function() {
    var tidEl = document.getElementById('dispTelegramId');
    var tid = parseInt(tidEl.value, 10);
    if (!tid || isNaN(tid)) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Введите Telegram ID (число).', 'Ошибка'); return; }
    var name = (document.getElementById('dispName').value || '').trim();
    var phone = (document.getElementById('dispPhone').value || '').trim();
    api('/api/admin/dispatchers', { method: 'POST', body: JSON.stringify({ telegram_id: tid, name: name, phone: phone, routes: [], direction: '' }) })
      .then(function() { tidEl.value = ''; document.getElementById('dispName').value = ''; document.getElementById('dispPhone').value = ''; loadDispatchers(); loadRoleAudit(); })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message, 'Ошибка'); });
  });

  var sidebarToggle = document.getElementById('adminSidebarToggle');
  var adminSidebarKey = 'adminSidebarCollapsed';
  function syncAdminSidebarToggle() {
    if (!sidebarToggle) return;
    var collapsed = document.body.classList.contains('admin-sidebar-collapsed');
    sidebarToggle.textContent = collapsed ? '▶' : '◀ Свернуть';
    sidebarToggle.setAttribute('aria-label', collapsed ? 'Развернуть меню' : 'Свернуть меню');
    sidebarToggle.setAttribute('title', collapsed ? 'Развернуть меню' : 'Свернуть меню');
  }
  if (sidebarToggle) {
    if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches && localStorage.getItem(adminSidebarKey) === '1') {
      document.body.classList.add('admin-sidebar-collapsed');
    }
    syncAdminSidebarToggle();
    sidebarToggle.addEventListener('click', function() {
      document.body.classList.toggle('admin-sidebar-collapsed');
      localStorage.setItem(adminSidebarKey, document.body.classList.contains('admin-sidebar-collapsed') ? '1' : '0');
      syncAdminSidebarToggle();
    });
  }

  if (window.Telegram && Telegram.WebApp) Telegram.WebApp.ready();
})();
