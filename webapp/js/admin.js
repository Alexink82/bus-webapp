(function() {
  const rawApi = window.api;
  if (!rawApi) {
    document.getElementById('loginWarning').textContent = 'Ошибка: не загружен api.js';
    return;
  }
  const base = (typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '');
  var loginWarning = document.getElementById('loginWarning');
  var openInBrowserTrigger = document.getElementById('openAdminInBrowser');

  function showLoginWarning(message) {
    if (!loginWarning) return;
    loginWarning.classList.remove('hidden');
    loginWarning.innerHTML = message || 'Войдите через Telegram как администратор.';
  }

  function openBackofficeInBrowser(target) {
    try { localStorage.setItem('preferredBackofficeEntry', target); } catch (e) {}
    rawApi('/api/auth/browser-ticket', {
      method: 'POST',
      body: JSON.stringify({ target: target })
    }).then(function(data) {
      var url = base + '/backoffice-login.html?ticket=' + encodeURIComponent(data.ticket) + '&next=' + encodeURIComponent(target);
      if (window.Telegram && Telegram.WebApp && typeof Telegram.WebApp.openLink === 'function') {
        Telegram.WebApp.openLink(url);
        return;
      }
      window.open(url, '_blank', 'noopener');
    }).catch(function(e) {
      (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Не удалось открыть вход в браузере.', 'Ошибка');
    });
  }

  async function resolveIdentity() {
    var tgUid = typeof window.getTelegramUserId === 'function' ? window.getTelegramUserId() : null;
    if (tgUid) return { uid: tgUid, authMode: 'telegram' };
    try {
      var response = await fetch(base + '/api/auth/session');
      var data = await response.json().catch(function() { return {}; });
      if (response.ok && data && data.authenticated && data.telegram_user_id) {
        return { uid: data.telegram_user_id, authMode: 'browser' };
      }
    } catch (e) {}
    return null;
  }

  function start(identity) {
  const uid = identity.uid;
  const authMode = identity.authMode || 'telegram';
  try { localStorage.setItem('preferredBackofficeEntry', 'admin'); } catch (e) {}
  let statsFromDate = '', statsToDate = '';
  var latestStatsData = null;
  var adminContext = { permissions: [], permissions_catalog: [], is_super_admin: true, telegram_id: uid };
  var editingAdminId = null;
  var editingDispatcherId = null;
  var routeCatalog = [];
  var activeAdminTab = 'overviewPanel';
  var adminLoadState = {
    stats: false,
    bookingOps: false,
    systemHealth: false,
    privacy: false,
    logs: false,
    roleAudit: false,
    operationsAudit: false,
    admins: false,
    dispatchers: false,
    routeCatalog: false,
    bookings: false,
  };
  var authBadge = document.getElementById('adminAuthModeBadge');
  var sessionPanel = document.getElementById('adminSessionPanel');
  var openInBrowserBtn = document.getElementById('openAdminInBrowser');
  var logoutBtn = document.getElementById('adminLogoutBtn');
  var logoutAllBtn = document.getElementById('adminLogoutAllBtn');

  function api(path, options) {
    return rawApi(path, options).catch(function(e) {
      var detail = e && e.body ? e.body.detail : null;
      var code = typeof detail === 'string' ? detail : (detail && detail.code ? detail.code : '');
      if (authMode === 'browser' && ((e && e.status === 401) || code === 'backoffice_auth_required')) {
        window.location.href = 'backoffice-login.html?next=admin';
      }
      throw e;
    });
  }

  function fmtDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU');
    } catch (e) {
      return value;
    }
  }

  function renderSessionPanel() {
    if (!authBadge) return;
    authBadge.classList.remove('hidden');
    authBadge.textContent = authMode === 'browser' ? 'Browser session' : 'Telegram Mini App';
    if (openInBrowserBtn) openInBrowserBtn.classList.toggle('hidden', authMode === 'browser');
    if (logoutBtn) logoutBtn.classList.toggle('hidden', authMode !== 'browser');

    api('/api/auth/sessions').then(function(data) {
      var sessions = data.sessions || [];
      if (logoutAllBtn) logoutAllBtn.classList.toggle('hidden', !sessions.length);
      if (!sessionPanel) return;
      sessionPanel.classList.remove('hidden');
      var items = sessions.length ? sessions.map(function(item) {
        var title = item.is_current ? 'Текущее устройство' : 'Активная browser-session';
        return '<div class="admin-session__item">' +
          '<strong>' + title + '</strong>' +
          '<div>Последняя активность: ' + fmtDate(item.last_seen_at) + '</div>' +
          '<div>Истекает: ' + fmtDate(item.expires_at) + '</div>' +
          '<div>IP: ' + (item.ip_address || 'не определён') + '</div>' +
          '<div>UA: ' + esc(item.user_agent || 'не определён') + '</div>' +
        '</div>';
      }).join('') : '';
      var details = sessions.length
        ? '<details class="admin-session__details"><summary>Активные browser-session: ' + sessions.length + '</summary><div class="admin-session__list">' + items + '</div></details>'
        : '<div class="admin-session__meta">Активных browser-session пока нет.</div>';
      sessionPanel.innerHTML =
        '<div class="admin-session__title">Состояние доступа</div>' +
        '<div class="admin-session__meta">Режим: <strong>' + (authMode === 'browser' ? 'browser-session' : 'Telegram Mini App') + '</strong>. Для отдельного окна используйте кнопку "Открыть в браузере", затем при желании установите PWA через меню Chrome/Edge.</div>' +
        details;
    }).catch(function() {
      if (logoutAllBtn) logoutAllBtn.classList.add('hidden');
      if (!sessionPanel) return;
      sessionPanel.classList.remove('hidden');
      sessionPanel.innerHTML =
        '<div class="admin-session__title">Состояние доступа</div>' +
        '<div class="admin-session__meta">Не удалось загрузить browser-session. Основная работа панели доступна, но управление сессиями временно недоступно.</div>';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      api('/api/auth/logout', { method: 'POST' }).then(function() {
        window.location.href = 'backoffice-login.html?next=admin';
      }).catch(function(e) {
        (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Не удалось завершить текущую сессию.', 'Ошибка');
      });
    });
  }

  if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', function() {
      api('/api/auth/logout-all', { method: 'POST' }).then(function() {
        window.location.href = authMode === 'browser' ? 'backoffice-login.html?next=admin' : 'admin.html';
      }).catch(function(e) {
        (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Не удалось завершить все browser-session.', 'Ошибка');
      });
    });
  }

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function hasPermission(permission) {
    return adminContext.permissions.indexOf(permission) !== -1;
  }

  function routeName(routeId) {
    var found = routeCatalog.find(function(item) { return item.id === routeId; });
    return found ? (found.name || found.id) : routeId;
  }

  function renderRoutePicker(targetId, selectedRoutes, inputName) {
    var root = document.getElementById(targetId);
    if (!root) return;
    var selected = Array.isArray(selectedRoutes) ? selectedRoutes : [];
    if (!routeCatalog.length) {
      root.innerHTML = '<div class="admin-log-item text-tertiary">Маршруты загружаются...</div>';
      return;
    }
    root.innerHTML = routeCatalog.map(function(route) {
      var checked = selected.indexOf(route.id) !== -1 ? ' checked' : '';
      return '<label class="admin-route-picker__option">' +
        '<input type="checkbox" name="' + esc(inputName) + '" value="' + esc(route.id) + '"' + checked + '> ' +
        '<span>' + esc(route.name || route.id) + '</span>' +
      '</label>';
    }).join('') + '<div class="text-secondary text-small">Пустой выбор = диспетчер видит все маршруты.</div>';
  }

  function getCheckedValues(root, selector) {
    return Array.from(root.querySelectorAll(selector + ':checked')).map(function(input) { return input.value; });
  }

  function loadRouteCatalog() {
    return api('/api/routes').then(function(data) {
      routeCatalog = (data.routes || []).map(function(route) {
        return { id: route.id, name: route.name || route.id };
      });
      adminLoadState.routeCatalog = true;
      renderRoutePicker('dispatcherRoutesPicker', [], 'dispatcher-routes-create');
      return routeCatalog;
    }).catch(function() {
      routeCatalog = [];
      adminLoadState.routeCatalog = false;
      renderRoutePicker('dispatcherRoutesPicker', [], 'dispatcher-routes-create');
      return routeCatalog;
    });
  }

  function ensureRouteCatalog() {
    if (adminLoadState.routeCatalog && routeCatalog.length) {
      return Promise.resolve(routeCatalog);
    }
    return loadRouteCatalog();
  }

  function currentStatsPeriod() {
    var el = document.querySelector('.admin-period-tab--active');
    return el ? el.getAttribute('data-period') : 'month';
  }

  function setUnavailable(targetId, message) {
    var el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = '<div class="admin-log-item text-secondary">' + esc(message || 'Недоступно для вашей роли') + '</div>';
  }

  function toggleTab(tabName, visible) {
    var tabButton = document.querySelector('#adminTabs [data-tab="' + tabName + '"]');
    var tabPanel = document.getElementById('tab-' + tabName);
    if (tabButton) tabButton.classList.toggle('hidden', !visible);
    if (tabPanel) tabPanel.classList.toggle('hidden', !visible);
  }

  function applyPermissionsUi() {
    var canViewLogs = hasPermission('view_logs');
    var canManageRoles = hasPermission('manage_roles');
    var canManageOperations = hasPermission('manage_operations');
    var canExport = hasPermission('export_data');
    var canManagePrivacy = hasPermission('manage_privacy');
    toggleTab('logsPanel', canViewLogs);
    toggleTab('auditPanel', canViewLogs);
    toggleTab('adminsPanel', canManageRoles);
    toggleTab('dispatchersPanel', canManageRoles);
    toggleTab('monitoringPanel', canViewLogs || canManagePrivacy);
    var exportBtn = document.getElementById('exportCsv');
    if (exportBtn) exportBtn.classList.toggle('hidden', !canExport);
    var archiveBtn = document.getElementById('runArchiveBtn');
    if (archiveBtn) archiveBtn.classList.toggle('hidden', !canManageOperations);
    var rotateBtn = document.getElementById('runRotateLogsBtn');
    if (rotateBtn) rotateBtn.classList.toggle('hidden', !canManageOperations);
    var privacyBtn = document.getElementById('runPrivacyRedactionBtn');
    if (privacyBtn) privacyBtn.classList.toggle('hidden', !canManagePrivacy);
    var addAdminBtn = document.getElementById('addAdminBtn');
    if (addAdminBtn) addAdminBtn.classList.toggle('hidden', !canManageRoles);
    var addDispatcherBtn = document.getElementById('addDispatcherBtn');
    if (addDispatcherBtn) addDispatcherBtn.classList.toggle('hidden', !canManageRoles);
    var permissionsSummary = document.getElementById('adminPermissionsSummary');
    if (permissionsSummary) {
      var labels = (adminContext.permissions_catalog || []).filter(function(item) {
        return hasPermission(item.key);
      }).map(function(item) { return item.label; });
      permissionsSummary.innerHTML =
        '<div class="admin-permissions-summary">' +
          '<div><strong>Текущие права:</strong> ' + (labels.length ? labels.map(esc).join(', ') : 'только базовый просмотр') + '</div>' +
          '<div class="text-secondary text-small">' + (adminContext.is_super_admin ? 'Режим super-admin: полный доступ без явных ограничений.' : 'Ограниченный backoffice-доступ: скрыты недоступные разделы и действия.') + '</div>' +
        '</div>';
    }
    if (!canViewLogs) {
      setUnavailable('logsContent', 'У вас нет права на просмотр логов и аудита.');
      setUnavailable('roleAuditContent', 'У вас нет права на просмотр role audit.');
      setUnavailable('operationsAuditContent', 'У вас нет права на просмотр operations audit.');
      setUnavailable('systemHealthContent', 'System Health скрыт для вашей роли.');
    }
    if (!canManagePrivacy) {
      setUnavailable('privacyStatusContent', 'Privacy и retention доступны только назначенным администраторам.');
    }
    if (!canManageRoles) {
      setUnavailable('adminsList', 'У вас нет права на управление администраторами.');
      setUnavailable('dispatchersList', 'У вас нет права на управление диспетчерами.');
    }
  }

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
      adminLoadState.stats = true;
      latestStatsData = data;
      statsFromDate = data.from_date;
      statsToDate = data.to_date;
      document.getElementById('statsPeriod').innerHTML = 'Период: <strong>' + data.from_date + '</strong> — <strong>' + data.to_date + '</strong>';
      var analyticsPeriodEl = document.getElementById('analyticsPeriod');
      if (analyticsPeriodEl) analyticsPeriodEl.innerHTML = 'Период: <strong>' + data.from_date + '</strong> — <strong>' + data.to_date + '</strong>';
      document.getElementById('statsBookings').textContent = data.total_bookings != null ? data.total_bookings : '—';
      document.getElementById('statsSum').textContent = data.total_sum != null ? data.total_sum : '—';
      if (activeAdminTab === 'analyticsPanel') drawStatsCharts(data);
    }).catch(function() { document.getElementById('loginWarning').classList.remove('hidden'); document.getElementById('loginWarning').textContent = 'Нет доступа (не админ).'; });
  }

  function loadBookingOpsOverview() {
    api('/api/admin/booking-ops-overview').then(function(data) {
      adminLoadState.bookingOps = true;
      var today = data.today || {};
      var queues = data.queues || {};
      var alerts = data.alerts || [];
      var routes = data.route_hotspots || [];
      var dispatchers = data.dispatcher_load || [];
      var attention = data.attention_bookings || [];
      var cards = [
        { label: 'Новые без назначения', value: queues.unassigned_new },
        { label: 'Новые > 15 мин', value: queues.overdue_new_15m },
        { label: 'Active > 30 мин', value: queues.active_sla_breach_30m },
        { label: 'Ожидают оплату', value: queues.pending_payment },
        { label: 'Переносы дат', value: queues.reschedule_requests },
        { label: 'Создано сегодня', value: today.created },
        { label: 'Оплачено сегодня', value: today.paid },
      ];
      var cardsHtml = '<div class="admin-ops-grid">' + cards.map(function(item) {
        var danger = Number(item.value || 0) > 0 && (item.label === 'Новые > 15 мин' || item.label === 'Active > 30 мин');
        return '<div class="admin-ops-card">' +
          '<div class="admin-ops-card__value' + (danger ? ' admin-ops-card__value--danger' : '') + '">' + esc(item.value != null ? item.value : '—') + '</div>' +
          '<div class="admin-ops-card__label">' + esc(item.label) + '</div>' +
        '</div>';
      }).join('') + '</div>';
      var routesHtml = routes.length ? routes.map(function(item) {
        return '<div class="admin-health-item"><span>' + esc(item.route_name || item.route_id || '—') + '</span><strong>' + esc(item.count) + '</strong></div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет данных по маршрутам.</div>';
      var dispatchersHtml = dispatchers.length ? dispatchers.map(function(item) {
        return '<div class="admin-health-item"><span>Dispatcher ID ' + esc(item.dispatcher_id) + '</span><strong>' + esc(item.active_bookings) + '</strong></div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет активной загрузки диспетчеров.</div>';
      var alertsHtml = alerts.length ? '<div class="admin-alerts">' + alerts.map(function(item) {
        return '<div class="admin-alert admin-alert--' + esc(item.severity || 'info') + '">' + esc(item.message || '') + '</div>';
      }).join('') + '</div>' : '<div class="admin-log-item text-tertiary">SLA-alerts отсутствуют, критичных сигналов нет.</div>';
      var attentionHtml = attention.length ? attention.map(function(item) {
        var suffix = item.dispatcher_id != null ? ' | диспетчер ' + esc(item.dispatcher_id) : '';
        return '<div class="admin-log-item"><strong>' + esc(item.booking_id) + '</strong> · ' + esc(item.route_name || item.route_id || '—') + '<br><span class="text-tertiary">статус: ' + esc(item.status) + ' | возраст: ' + esc(item.age_minutes) + ' мин' + suffix + '</span></div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Критичных booking-сигналов сейчас нет.</div>';
      document.getElementById('bookingOpsOverviewContent').innerHTML =
        cardsHtml +
        '<div class="admin-logs mb-4"><div class="admin-logs__title">Операционные alerts</div>' + alertsHtml + '</div>' +
        '<div class="admin-ops-columns">' +
          '<div class="admin-logs"><div class="admin-logs__title">Горячие маршруты</div>' + routesHtml + '</div>' +
          '<div class="admin-logs"><div class="admin-logs__title">Загрузка диспетчеров</div>' + dispatchersHtml + '</div>' +
        '</div>' +
        '<div class="admin-logs mt-4"><div class="admin-logs__title">Требуют внимания</div>' + attentionHtml + '</div>';
    }).catch(function() {
      document.getElementById('bookingOpsOverviewContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить booking overview</div>';
    });
  }

  function loadSystemHealth() {
    api('/api/admin/system-health').then(function(data) {
      adminLoadState.systemHealth = true;
      var badge = function(label, value) {
        var cls = value === 'ok' ? 'badge badge--success' : (value === 'disabled' ? 'badge badge--neutral' : 'badge badge--warning');
        return '<div class="admin-health-item"><span>' + esc(label) + '</span><span class="' + cls + '">' + esc(value) + '</span></div>';
      };
      document.getElementById('systemHealthContent').innerHTML =
        badge('Общий статус', data.status || 'unknown') +
        badge('База данных', data.db || 'unknown') +
        badge('Redis', data.redis || 'unknown') +
        badge('Sentry', data.sentry_enabled ? 'enabled' : 'disabled') +
        badge('BOT_TOKEN', data.bot_token_configured ? 'configured' : 'missing') +
        badge('WEBPAY secret', data.webpay_secret_configured ? 'configured' : 'missing') +
        '<div class="admin-health-item"><span>Rate limit</span><strong>' + esc(data.rate_limit_per_minute) + '/min</strong></div>' +
        '<div class="admin-health-item"><span>Frontend mode</span><strong>' + esc(data.frontend_mode || 'unknown') + '</strong></div>';
    }).catch(function() {
      document.getElementById('systemHealthContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить system health</div>';
    });
  }

  function loadPrivacyStatus() {
    api('/api/admin/privacy-status').then(function(data) {
      adminLoadState.privacy = true;
      document.getElementById('privacyStatusContent').innerHTML =
        '<div class="admin-health-item"><span>Retention period</span><strong>' + esc(data.saved_passenger_passport_retention_days) + ' дней</strong></div>' +
        '<div class="admin-health-item"><span>Сохранённых паспортов</span><strong>' + esc(data.stored_passports_count) + '</strong></div>' +
        '<div class="admin-health-item"><span>Кандидатов на очистку</span><strong>' + esc(data.stale_passports_count) + '</strong></div>' +
        '<div class="admin-health-item"><span>Log redaction</span><span class="' + (data.log_redaction_enabled ? 'badge badge--success' : 'badge badge--warning') + '">' + (data.log_redaction_enabled ? 'enabled' : 'disabled') + '</span></div>';
      var daysInput = document.getElementById('privacyRedactDays');
      if (daysInput && !daysInput.dataset.userChanged) daysInput.value = String(data.saved_passenger_passport_retention_days || 365);
    }).catch(function() {
      document.getElementById('privacyStatusContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить privacy status</div>';
    });
  }

  function ensureStatsLoaded(period, force) {
    if (!force && adminLoadState.stats) return;
    loadStats(period || currentStatsPeriod());
  }

  function ensureOverviewLoaded(force) {
    ensureStatsLoaded(currentStatsPeriod(), force);
    if (!adminLoadState.bookingOps || force) loadBookingOpsOverview();
  }

  function ensureMonitoringLoaded(force) {
    if (hasPermission('view_logs') && (!adminLoadState.systemHealth || force)) loadSystemHealth();
    if (hasPermission('manage_privacy') && (!adminLoadState.privacy || force)) loadPrivacyStatus();
  }

  function ensureAnalyticsLoaded(force) {
    ensureStatsLoaded(currentStatsPeriod(), force);
    if (latestStatsData) drawStatsCharts(latestStatsData);
  }

  function ensureAdminTabLoaded(tabName, force) {
    if (tabName === 'overviewPanel') {
      ensureOverviewLoaded(force);
      return;
    }
    if (tabName === 'analyticsPanel') {
      ensureAnalyticsLoaded(force);
      return;
    }
    if (tabName === 'monitoringPanel') {
      ensureMonitoringLoaded(force);
      return;
    }
    if (tabName === 'bookingsPanel' && (!adminLoadState.bookings || force)) {
      loadAdminBookings();
      return;
    }
    if (tabName === 'logsPanel' && hasPermission('view_logs') && (!adminLoadState.logs || force)) {
      loadLogs();
      return;
    }
    if (tabName === 'auditPanel' && hasPermission('view_logs') && (!adminLoadState.roleAudit || !adminLoadState.operationsAudit || force)) {
      loadRoleAudit();
      loadOperationsAudit();
      return;
    }
    if (tabName === 'adminsPanel' && hasPermission('manage_roles') && (!adminLoadState.admins || force)) {
      loadAdmins();
      return;
    }
    if (tabName === 'dispatchersPanel' && hasPermission('manage_roles') && (!adminLoadState.dispatchers || force)) {
      ensureRouteCatalog().then(function() {
        loadDispatchers();
      });
    }
  }

  document.querySelectorAll('.admin-period-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var period = this.getAttribute('data-period');
      document.querySelectorAll('.admin-period-tab').forEach(function(b) {
        b.classList.toggle('admin-period-tab--active', b.getAttribute('data-period') === period);
      });
      ensureStatsLoaded(period, true);
      if (activeAdminTab === 'overviewPanel') loadBookingOpsOverview();
      if (activeAdminTab === 'analyticsPanel' && latestStatsData) drawStatsCharts(latestStatsData);
    });
  });

  document.getElementById('exportCsv').addEventListener('click', function() {
    var from = statsFromDate || periodToDates('month').from_date;
    var to = statsToDate || periodToDates('month').to_date;
    var exportUrl = base + '/api/admin/export?from_date=' + encodeURIComponent(from) + '&to_date=' + encodeURIComponent(to);
    var exportHeaders = {};
    if (authMode === 'telegram') {
      exportHeaders['X-Telegram-User-Id'] = String(uid);
      var initData = (typeof window.getTelegramInitData === 'function' ? window.getTelegramInitData() : '');
      if (initData) exportHeaders['X-Telegram-Init-Data'] = initData;
    }
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
        loadBookingOpsOverview();
        loadOperationsAudit();
      })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка архивации', 'Ошибка'); });
  });
  var privacyDaysInput = document.getElementById('privacyRedactDays');
  if (privacyDaysInput) {
    privacyDaysInput.addEventListener('input', function() {
      privacyDaysInput.dataset.userChanged = '1';
    });
  }
  var runPrivacyRedactionBtn = document.getElementById('runPrivacyRedactionBtn');
  if (runPrivacyRedactionBtn) {
    runPrivacyRedactionBtn.addEventListener('click', function() {
      var days = parseInt((document.getElementById('privacyRedactDays') || {}).value, 10);
      if (isNaN(days) || days < 30 || days > 3650) {
        (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Укажите число дней от 30 до 3650.', 'Ошибка');
        return;
      }
      if (!confirm('Очистить сохранённые паспортные данные у давно не использовавшихся пассажиров?')) return;
      api('/api/admin/privacy/redact-saved-passports?older_than_days=' + encodeURIComponent(days), { method: 'POST' })
        .then(function(data) {
          (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))('Очищено паспортов: ' + (data.redacted != null ? data.redacted : 0), 'success');
          loadPrivacyStatus();
          loadOperationsAudit();
        })
        .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка очистки', 'Ошибка'); });
    });
  }
  function loadLogs() {
    api('/api/admin/logs?limit=50').then(function(data) {
      adminLoadState.logs = true;
      const logs = data.logs || [];
      document.getElementById('logsContent').innerHTML = logs.length ? logs.map(function(l) {
        var cls = (l.level || '').toLowerCase().indexOf('error') !== -1 ? 'admin-log-item__level--error' : 'admin-log-item__level--info';
        return '<div class="admin-log-item"><span class="admin-log-item__time">' + esc(l.timestamp) + '</span> <span class="' + cls + '">' + esc(l.level) + '</span> ' + esc(l.source) + ' ' + esc(l.action || l.message || '') + '</div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет записей</div>';
    }).catch(function() { document.getElementById('logsContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить логи</div>'; });
  }
  document.getElementById('runRotateLogsBtn').addEventListener('click', function() {
    var daysEl = document.getElementById('rotateLogsOlderDays');
    var days = parseInt(daysEl.value, 10);
    if (isNaN(days) || days < 7 || days > 365) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Укажите число дней от 7 до 365.', 'Ошибка'); return; }
    if (!confirm('Удалить записи логов старше ' + days + ' дней? Это действие необратимо.')) return;
    api('/api/admin/rotate-logs?older_than_days=' + days, { method: 'POST' })
      .then(function(data) {
        (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))('Удалено записей: ' + (data.deleted != null ? data.deleted : 0), 'success');
        loadOperationsAudit();
        loadLogs();
      })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка ротации логов', 'Ошибка'); });
  });
  function loadRoleAudit() {
    api('/api/admin/role-audit').then(function(data) {
      adminLoadState.roleAudit = true;
      var entries = data.entries || [];
      var actionLabels = { add_admin: 'Добавлен админ', add_dispatcher: 'Добавлен диспетчер', delete_dispatcher: 'Удалён диспетчер', update_admin_permissions: 'Изменены права админа', update_dispatcher_scope: 'Изменён scope диспетчера' };
      document.getElementById('roleAuditContent').innerHTML = entries.length ? entries.map(function(e) {
        var label = actionLabels[e.action] || e.action;
        var target = (e.details && e.details.target_telegram_id) != null ? ' ID ' + e.details.target_telegram_id : '';
        var by = e.user_id != null ? ' (админ ID ' + esc(e.user_id) + ')' : '';
        var time = e.timestamp ? esc(e.timestamp).replace('T', ' ').slice(0, 19) : '';
        return '<div class="admin-log-item"><span class="admin-log-item__time">' + time + '</span> ' + label + target + by + '</div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет записей. Изменения ролей появятся здесь.</div>';
    }).catch(function() { document.getElementById('roleAuditContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить</div>'; });
  }
  function loadOperationsAudit() {
    api('/api/admin/operations-audit?limit=100').then(function(data) {
      adminLoadState.operationsAudit = true;
      var entries = data.entries || [];
      var actionLabels = {
        cancel_bulk_bookings: 'Массовая отмена заявок',
        archive_bookings: 'Архивация заявок',
        rotate_logs: 'Ротация логов',
        export_bookings: 'Экспорт админских заявок',
        take_booking: 'Диспетчер взял заявку',
        set_status: 'Смена статуса заявки',
        export_dispatcher_bookings: 'Экспорт диспетчерских заявок',
        cancel_booking: 'Отмена заявки',
        reschedule_request: 'Запрос на перенос даты'
      };
      var formatDetails = function(details) {
        if (!details || typeof details !== 'object') return '';
        var parts = [];
        if (details.booking_id) parts.push('заявка ' + esc(details.booking_id));
        if (details.target_telegram_id != null) parts.push('цель ID ' + esc(details.target_telegram_id));
        if (details.previous_status) parts.push('было: ' + esc(details.previous_status));
        if (details.new_status) parts.push('стало: ' + esc(details.new_status));
        if (details.rows != null) parts.push('строк: ' + esc(details.rows));
        if (details.archived != null) parts.push('архивировано: ' + esc(details.archived));
        if (details.cancelled != null) parts.push('отменено: ' + esc(details.cancelled));
        if (details.filter_dispatcher_id != null) parts.push('диспетчер: ' + esc(details.filter_dispatcher_id));
        if (details.actor_role) parts.push('роль: ' + esc(details.actor_role));
        if (details.requested_date) parts.push('новая дата: ' + esc(details.requested_date));
        if (details.routes && details.routes.length) parts.push('маршруты: ' + details.routes.map(esc).join(', '));
        if (details.direction) parts.push('направление: ' + esc(details.direction));
        if (details.has_reason) parts.push('с причиной');
        return parts.join(' | ');
      };
      document.getElementById('operationsAuditContent').innerHTML = entries.length ? entries.map(function(e) {
        var label = actionLabels[e.action] || e.action;
        var by = e.user_id != null ? ' (ID ' + esc(e.user_id) + ')' : '';
        var time = e.timestamp ? esc(e.timestamp).replace('T', ' ').slice(0, 19) : '';
        var detailsText = formatDetails(e.details);
        return '<div class="admin-log-item"><span class="admin-log-item__time">' + time + '</span> ' + label + by + (detailsText ? '<br><span class="text-tertiary">' + detailsText + '</span>' : '') + '</div>';
      }).join('') : '<div class="admin-log-item text-tertiary">Нет записей. Операционные действия появятся здесь.</div>';
    }).catch(function() { document.getElementById('operationsAuditContent').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить</div>'; });
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
      adminLoadState.bookings = true;
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
        if (!hasPermission('manage_operations')) {
          bulkBtn.classList.add('hidden');
        } else if (list.some(function(b) { return canCancel(b.status); })) {
          bulkBtn.classList.remove('hidden');
          bulkBtn.onclick = function() {
            var ids = Array.from(document.querySelectorAll('.booking-row-cb:checked')).map(function(cb) { return cb.getAttribute('data-id'); });
            if (!ids.length) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Выберите заявки для отмены.', 'Внимание'); return; }
            if (!confirm('Отменить ' + ids.length + ' заявок?')) return;
            api('/api/admin/bookings/cancel-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_ids: ids }) })
              .then(function(data) { (typeof window.showToast === 'function' ? window.showToast : (typeof showToast === 'function' ? showToast : alert))(data.message || 'Готово'); loadAdminBookings(); loadBookingOpsOverview(); loadOperationsAudit(); })
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
      activeAdminTab = this.getAttribute('data-tab') || 'overviewPanel';
      ensureAdminTabLoaded(activeAdminTab, false);
    });
  });

  function renderAdmins(admins) {
    var list = document.getElementById('adminsList');
    if (!list) return;
    list.innerHTML = admins.length ? admins.map(function(admin) {
      var badges = (admin.permissions || []).map(function(key) {
        var meta = (adminContext.permissions_catalog || []).find(function(item) { return item.key === key; });
        return '<span class="badge badge--neutral">' + esc(meta ? meta.label : key) + '</span>';
      }).join(' ');
      var source = admin.from_env ? '<span class="badge badge--success">env super-admin</span>' : (admin.is_super_admin ? '<span class="badge badge--success">полный доступ</span>' : '<span class="badge badge--warning">ограниченный доступ</span>');
      var actions = admin.from_env ? '<span class="text-secondary text-small">Права задаются через `ADMIN_ID/ADMIN_IDS`</span>' : '<button type="button" class="btn btn--outline btn--small" data-edit-admin="' + admin.telegram_id + '">' + (editingAdminId === admin.telegram_id ? 'Скрыть' : 'Настроить права') + '</button>';
      var editor = '';
      if (!admin.from_env && editingAdminId === admin.telegram_id) {
        editor = '<div class="admin-permissions-editor">' +
          (adminContext.permissions_catalog || []).map(function(item) {
            var checked = (admin.explicit_permissions || admin.permissions || []).indexOf(item.key) !== -1 ? ' checked' : '';
            return '<label class="admin-permissions-editor__option"><input type="checkbox" value="' + esc(item.key) + '"' + checked + '> <span>' + esc(item.label) + '</span></label>';
          }).join('') +
          '<div class="admin-permissions-editor__actions">' +
            '<button type="button" class="btn btn--primary btn--small" data-save-admin="' + admin.telegram_id + '">Сохранить</button>' +
            '<button type="button" class="btn btn--ghost btn--small" data-cancel-admin="' + admin.telegram_id + '">Отмена</button>' +
          '</div>' +
        '</div>';
      }
      return '<div class="admin-member-card" data-admin-card="' + admin.telegram_id + '">' +
        '<div class="admin-member-card__header">' +
          '<div><strong>' + esc(admin.telegram_id) + '</strong><div class="text-secondary text-small">' + (admin.from_env ? 'Источник: Render/env' : 'Источник: bot_roles') + '</div></div>' +
          '<div class="admin-member-card__actions">' + source + ' ' + actions + '</div>' +
        '</div>' +
        '<div class="admin-member-card__badges">' + badges + '</div>' +
        editor +
      '</div>';
    }).join('') : '<div class="admin-log-item text-tertiary">Нет записей. Добавьте ID выше или укажите ADMIN_IDS на Render.</div>';
    list.querySelectorAll('[data-edit-admin]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = parseInt(btn.getAttribute('data-edit-admin'), 10);
        editingAdminId = editingAdminId === tid ? null : tid;
        renderAdmins(admins);
      });
    });
    list.querySelectorAll('[data-cancel-admin]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        editingAdminId = null;
        renderAdmins(admins);
      });
    });
    list.querySelectorAll('[data-save-admin]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = parseInt(btn.getAttribute('data-save-admin'), 10);
        var card = list.querySelector('[data-admin-card="' + tid + '"]');
        var permissions = Array.from(card.querySelectorAll('input[type="checkbox"]:checked')).map(function(input) { return input.value; });
        if (!permissions.length) {
          (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Нужно выбрать хотя бы одно право.', 'Ошибка');
          return;
        }
        api('/api/admin/admin-permissions', { method: 'POST', body: JSON.stringify({ telegram_id: tid, permissions: permissions }) })
          .then(function() {
            editingAdminId = null;
            loadAdmins();
            loadRoleAudit();
          })
          .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Не удалось обновить права', 'Ошибка'); });
      });
    });
  }

  function loadAdmins() {
    api('/api/admin/admins').then(function(data) {
      adminLoadState.admins = true;
      if (data.permissions_catalog && data.permissions_catalog.length) {
        adminContext.permissions_catalog = data.permissions_catalog;
      }
      renderAdmins(data.admins || []);
    }).catch(function() { document.getElementById('adminsList').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить</div>'; });
  }

  document.getElementById('addAdminBtn').addEventListener('click', function() {
    var tidEl = document.getElementById('adminTelegramId');
    var tid = parseInt(tidEl.value, 10);
    if (!tid || isNaN(tid)) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Введите Telegram ID (число).', 'Ошибка'); return; }
    api('/api/admin/admins', { method: 'POST', body: JSON.stringify({ telegram_id: tid }) })
      .then(function() { tidEl.value = ''; loadAdmins(); if (hasPermission('view_logs')) { loadRoleAudit(); loadOperationsAudit(); } })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message, 'Ошибка'); });
  });

  function renderDispatchers(list) {
    var root = document.getElementById('dispatchersList');
    if (!root) return;
    root.innerHTML = list.length ? list.map(function(d) {
      var status = d.is_active ? '<span class="badge badge--success">активен</span>' : '<span class="badge badge--neutral">неактивен</span>';
      var fromEnv = d.from_env ? '<span class="badge badge--neutral">из Render</span>' : '';
      var direction = d.direction ? '<div class="text-secondary text-small">Направление: ' + esc(d.direction) + '</div>' : '';
      var routes = (d.routes && d.routes.length ? d.routes : []).map(function(routeId) {
        return '<span class="badge badge--neutral">' + esc(routeName(routeId)) + '</span>';
      }).join(' ');
      var routeBlock = routes || '<span class="text-secondary text-small">Все маршруты</span>';
      var actions = d.from_env ? '<span class="text-secondary text-small">Scope из env не редактируется здесь</span>' : '<button type="button" class="btn btn--outline btn--small" data-edit-dispatcher="' + d.telegram_id + '">' + (editingDispatcherId === d.telegram_id ? 'Скрыть' : 'Настроить scope') + '</button> <button type="button" class="btn btn--ghost btn--small" data-tid="' + d.telegram_id + '">Удалить</button>';
      var editor = '';
      if (!d.from_env && editingDispatcherId === d.telegram_id) {
        editor = '<div class="admin-dispatcher-editor">' +
          '<div class="form-group"><label class="form-label">Имя</label><input type="text" class="input" data-dispatcher-name value="' + esc(d.name || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Телефон</label><input type="text" class="input" data-dispatcher-phone value="' + esc(d.phone || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Направление / заметка</label><input type="text" class="input" data-dispatcher-direction value="' + esc(d.direction || '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Маршруты</label><div class="admin-route-picker">' + routeCatalog.map(function(route) {
            var checked = (d.routes || []).indexOf(route.id) !== -1 ? ' checked' : '';
            return '<label class="admin-route-picker__option"><input type="checkbox" data-dispatcher-route value="' + esc(route.id) + '"' + checked + '> <span>' + esc(route.name || route.id) + '</span></label>';
          }).join('') + '<div class="text-secondary text-small">Пустой выбор = все маршруты.</div></div></div>' +
          '<div class="admin-permissions-editor__actions"><button type="button" class="btn btn--primary btn--small" data-save-dispatcher="' + d.telegram_id + '">Сохранить</button><button type="button" class="btn btn--ghost btn--small" data-cancel-dispatcher="' + d.telegram_id + '">Отмена</button></div>' +
        '</div>';
      }
      return '<div class="admin-member-card" data-dispatcher-card="' + d.telegram_id + '">' +
        '<div class="admin-member-card__header">' +
          '<div><strong>' + esc(d.telegram_id) + '</strong><div class="text-secondary text-small">' + esc(d.name || '—') + (d.phone ? ' · ' + esc(d.phone) : '') + '</div>' + direction + '</div>' +
          '<div class="admin-member-card__actions">' + status + ' ' + fromEnv + ' ' + actions + '</div>' +
        '</div>' +
        '<div class="admin-member-card__badges">' + routeBlock + '</div>' +
        editor +
      '</div>';
    }).join('') : '<div class="admin-log-item text-tertiary">Нет диспетчеров. Добавьте Telegram ID выше или DISPATCHER_IDS на Render.</div>';
    root.querySelectorAll('[data-edit-dispatcher]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = parseInt(btn.getAttribute('data-edit-dispatcher'), 10);
        editingDispatcherId = editingDispatcherId === tid ? null : tid;
        renderDispatchers(list);
      });
    });
    root.querySelectorAll('[data-cancel-dispatcher]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        editingDispatcherId = null;
        renderDispatchers(list);
      });
    });
    root.querySelectorAll('[data-save-dispatcher]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = parseInt(btn.getAttribute('data-save-dispatcher'), 10);
        var card = root.querySelector('[data-dispatcher-card="' + tid + '"]');
        var payload = {
          telegram_id: tid,
          name: (card.querySelector('[data-dispatcher-name]') || {}).value || '',
          phone: (card.querySelector('[data-dispatcher-phone]') || {}).value || '',
          direction: (card.querySelector('[data-dispatcher-direction]') || {}).value || '',
          routes: getCheckedValues(card, 'input[data-dispatcher-route]'),
        };
        api('/api/admin/dispatchers/' + tid, { method: 'PUT', body: JSON.stringify(payload) })
          .then(function() {
            editingDispatcherId = null;
            loadDispatchers();
            if (hasPermission('view_logs')) {
              loadRoleAudit();
            }
          })
          .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Не удалось обновить диспетчера', 'Ошибка'); });
      });
    });
    root.querySelectorAll('[data-tid]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tid = this.getAttribute('data-tid');
        if (!tid || !confirm('Деактивировать диспетчера? Вкладка «Диспетчер» у него пропадёт.')) return;
        api('/api/admin/dispatchers/' + tid, { method: 'DELETE' })
          .then(function() { loadDispatchers(); if (hasPermission('view_logs')) { loadRoleAudit(); loadOperationsAudit(); } })
          .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message || 'Ошибка удаления', 'Ошибка'); });
      });
    });
  }

  function loadDispatchers() {
    api('/api/admin/dispatchers').then(function(data) {
      adminLoadState.dispatchers = true;
      renderDispatchers(data.dispatchers || []);
    }).catch(function() { document.getElementById('dispatchersList').innerHTML = '<div class="admin-log-item text-error">Не удалось загрузить список</div>'; });
  }

  document.getElementById('addDispatcherBtn').addEventListener('click', function() {
    var tidEl = document.getElementById('dispTelegramId');
    var tid = parseInt(tidEl.value, 10);
    if (!tid || isNaN(tid)) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)('Введите Telegram ID (число).', 'Ошибка'); return; }
    var name = (document.getElementById('dispName').value || '').trim();
    var phone = (document.getElementById('dispPhone').value || '').trim();
    var direction = (document.getElementById('dispDirection').value || '').trim();
    var routes = getCheckedValues(document, '#dispatcherRoutesPicker input[name="dispatcher-routes-create"]');
    api('/api/admin/dispatchers', { method: 'POST', body: JSON.stringify({ telegram_id: tid, name: name, phone: phone, routes: routes, direction: direction }) })
      .then(function() {
        tidEl.value = '';
        document.getElementById('dispName').value = '';
        document.getElementById('dispPhone').value = '';
        document.getElementById('dispDirection').value = '';
        renderRoutePicker('dispatcherRoutesPicker', [], 'dispatcher-routes-create');
        loadDispatchers();
        if (hasPermission('view_logs')) { loadRoleAudit(); loadOperationsAudit(); }
      })
      .catch(function(e) { (typeof window.showAppAlert === 'function' ? window.showAppAlert : alert)(e.message, 'Ошибка'); });
  });

  api('/api/admin/me').then(function(data) {
    adminContext = data || adminContext;
    document.getElementById('loginWarning').classList.add('hidden');
    document.getElementById('adminTabs').classList.remove('hidden');
    document.getElementById('adminMain').classList.remove('hidden');
    renderSessionPanel();
    applyPermissionsUi();
    ensureAdminTabLoaded(activeAdminTab, false);
  }).catch(function() {
    showLoginWarning('Нет доступа к админ-панели. Откройте её через Telegram под ролью администратора.');
  });
  }

  if (openInBrowserTrigger) {
    openInBrowserTrigger.addEventListener('click', function() {
      openBackofficeInBrowser('admin');
    });
  }

  resolveIdentity().then(function(identity) {
    if (!identity) {
      showLoginWarning('Для входа во внешнюю админ-панель сначала откройте админку в Telegram и нажмите "Открыть в браузере".');
      return;
    }
    start(identity);
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
    if (window.matchMedia && window.matchMedia('(min-width: 768px)').matches && localStorage.getItem(adminSidebarKey) === '1') {
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
