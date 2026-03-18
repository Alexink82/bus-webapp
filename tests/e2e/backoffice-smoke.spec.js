import { test, expect } from '@playwright/test';

async function mockTelegramAndCdn(page, userId) {
  await page.addInitScript(({ userId: uid }) => {
    const mq = (query) => ({
      matches: query.includes('prefers-color-scheme') ? false : query.includes('min-width: 900px'),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    });
    window.matchMedia = window.matchMedia || mq;
    try {
      window.localStorage.setItem('dataConsentAccepted', '1');
    } catch {}
    window.Telegram = {
      WebApp: {
        initData: 'query_id=test&user=%7B%22id%22%3A' + uid + '%7D&auth_date=1893456000&hash=test',
        initDataUnsafe: {
          user: { id: uid, language_code: 'ru' },
          start_param: 'cursor-e2e',
        },
        ready() {},
        expand() {},
      },
    };
    window.WebSocket = class MockWebSocket {
      constructor() {
        setTimeout(() => { if (typeof this.onopen === 'function') this.onopen(); }, 0);
      }
      send() {}
      close() {}
    };
    if (!navigator.serviceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { register: () => Promise.resolve() },
        configurable: true,
      });
    }
  }, { userId });

  await page.route('https://telegram.org/js/telegram-web-app.js', async (route) => {
    await route.fulfill({ contentType: 'application/javascript', body: '' });
  });

  await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js.*/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.Chart = function(){ return { destroy(){} }; };',
    });
  });
}

async function mockAdminApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const permissionsCatalog = [
      { key: 'manage_roles', label: 'Управление ролями' },
      { key: 'view_logs', label: 'Логи и аудит' },
      { key: 'manage_operations', label: 'Операционные действия' },
      { key: 'export_data', label: 'Экспорт данных' },
      { key: 'manage_privacy', label: 'Privacy и retention' },
    ];

    if (url.pathname === '/api/user/roles') {
      return json({ is_admin: true, is_dispatcher: true });
    }
    if (url.pathname === '/api/routes') {
      return json({
        routes: [
          { id: 'minsk_moscow', name: 'Минск - Москва' },
          { id: 'gomel_mozyr', name: 'Гомель - Мозырь' },
        ],
      });
    }
    if (url.pathname === '/api/admin/me') {
      return json({
        telegram_id: 999,
        permissions_catalog: permissionsCatalog,
        permissions: permissionsCatalog.map((item) => item.key),
        is_super_admin: true,
      });
    }
    if (url.pathname === '/api/admin/stats') {
      return json({
        from_date: '2030-01-01',
        to_date: '2030-01-31',
        total_bookings: 12,
        total_sum: 3200,
        by_day: { '2030-01-01': 3, '2030-01-02': 4 },
        by_route: { minsk_moscow: 7, gomel_mozyr: 5 },
      });
    }
    if (url.pathname === '/api/admin/booking-ops-overview') {
      return json({
        today: { created: 5, paid: 2 },
        queues: { unassigned_new: 3, overdue_new_15m: 1, active_sla_breach_30m: 1, pending_payment: 2, reschedule_requests: 1 },
        alerts: [
          { severity: 'critical', code: 'new_bookings_sla_breach', message: '1 новых заявок ждут назначения более 15 минут.' },
        ],
        route_hotspots: [{ route_id: 'minsk_moscow', route_name: 'Минск - Москва', count: 4 }],
        dispatcher_load: [{ dispatcher_id: 222, active_bookings: 2 }],
        attention_bookings: [{ booking_id: 'BK-ATT-1', status: 'new', route_id: 'minsk_moscow', route_name: 'Минск - Москва', age_minutes: 27 }],
      });
    }
    if (url.pathname === '/api/admin/logs') {
      return json({ logs: [{ timestamp: '2030-01-10T10:00:00', level: 'INFO', source: 'api', action: 'healthcheck' }] });
    }
    if (url.pathname === '/api/admin/system-health') {
      return json({ status: 'ok', db: 'ok', redis: 'disabled', sentry_enabled: false, bot_token_configured: true, webpay_secret_configured: true, rate_limit_per_minute: 120, frontend_mode: 'dist-first' });
    }
    if (url.pathname === '/api/admin/privacy-status') {
      return json({ saved_passenger_passport_retention_days: 365, stored_passports_count: 4, stale_passports_count: 1, log_redaction_enabled: true });
    }
    if (url.pathname === '/api/admin/admins') {
      return json({
        admin_ids: [999],
        admins: [{ telegram_id: 999, from_env: true, is_super_admin: true, permissions: permissionsCatalog.map((item) => item.key), explicit_permissions: [] }],
        permissions_catalog: permissionsCatalog,
      });
    }
    if (url.pathname === '/api/admin/dispatchers') {
      return json({ dispatchers: [{ telegram_id: 222, name: 'Иван', phone: '+375291111111', is_active: true, from_env: false, routes: ['minsk_moscow'], route_names: ['Минск - Москва'], direction: 'Москва' }] });
    }
    if (url.pathname === '/api/admin/role-audit') {
      return json({ entries: [{ timestamp: '2030-01-10T09:00:00', action: 'add_dispatcher', user_id: 999, details: { target_telegram_id: 222 } }] });
    }
    if (url.pathname === '/api/admin/operations-audit') {
      return json({
        entries: [
          { timestamp: '2030-01-10T09:05:00', action: 'set_status', user_id: 222, details: { booking_id: 'BK-1', previous_status: 'active', new_status: 'paid' } },
        ],
      });
    }

    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not_found' }) });
  });
}

async function mockDispatcherApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/user/roles') {
      return json({ is_admin: true, is_dispatcher: true });
    }
    if (url.pathname === '/api/admin/dispatchers') {
      return json({
        dispatchers: [
          { telegram_id: 222, name: 'Иван', phone: '+375291111111', is_active: true, from_env: false },
          { telegram_id: 333, name: 'Ольга', phone: '+375292222222', is_active: true, from_env: false },
        ],
      });
    }
    if (url.pathname === '/api/dispatcher/stats') {
      return json({ total: 2, sum: 180, by_status: { new: 1, active: 1 }, overdue_15m: 0, is_admin_view: true });
    }
    if (url.pathname === '/api/dispatcher/bookings') {
      const status = url.searchParams.get('status');
      if (status === 'active') {
        return json({
          is_admin_view: true,
          bookings: [
            {
              booking_id: 'BK-ACTIVE-1',
              status: 'active',
              payment_status: 'pending',
              dispatcher_id: 222,
              route_name: 'Минск - Москва',
              from_city: 'Минск',
              to_city: 'Москва',
              departure_date: '2030-01-12',
              departure_time: '10:00',
              price_total: 100,
              currency: 'BYN',
              created_at: '2030-01-12T08:00:00',
            },
          ],
        });
      }
      return json({
        is_admin_view: true,
        bookings: [
          {
            booking_id: 'BK-NEW-1',
            status: 'new',
            payment_status: 'pending',
            dispatcher_id: null,
            route_name: 'Минск - Москва',
            from_city: 'Минск',
            to_city: 'Москва',
            departure_date: '2030-01-12',
            departure_time: '10:00',
            passengers_count: 2,
            price_total: 80,
            currency: 'BYN',
            created_at: '2030-01-12T09:30:00',
          },
        ],
      });
    }

    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not_found' }) });
  });
}

async function mockBookingApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/routes') {
      return json({
        routes: [
          {
            id: 'minsk_moscow',
            name: 'Минск - Москва',
            type: 'local',
            base_price: 80,
            border_docs_text: '',
            discount_rules: {},
            stops: [{ city: 'Минск', price_offset: 0 }, { city: 'Москва', price_offset: 80 }],
          },
        ],
      });
    }
    if (url.pathname === '/api/user/passengers') {
      return json({
        passengers: [
          { last_name: 'Иванов', first_name: 'Иван', middle_name: '', birth_date: '1990-01-01', passport: '' },
        ],
      });
    }

    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not_found' }) });
  });
}

async function mockProfileApi(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/user/dashboard') {
      return json({
        profile: { phone: '+375291112233' },
        passengers: [
          { id: 1, last_name: 'Иванов', first_name: 'Иван', middle_name: '', birth_date: '1990-01-01', passport: 'MP1234567' },
        ],
        bookings: [
          {
            booking_id: 'BK-PR-1',
            route_name: 'Минск - Москва',
            from_city: 'Минск',
            to_city: 'Москва',
            departure_date: '2030-01-12',
            departure_time: '10:00',
            status: 'paid',
            price_total: 120,
            currency: 'BYN',
            passengers_count: 1,
          },
        ],
      });
    }

    if (url.pathname === '/api/bookings/BK-PR-1') {
      return json({
        booking_id: 'BK-PR-1',
        route_name: 'Минск - Москва',
        from_city: 'Минск',
        to_city: 'Москва',
        departure_date: '2030-01-12',
        departure_time: '10:00',
        status: 'paid',
        price_total: 120,
        currency: 'BYN',
        passengers: [
          { last_name: 'Иванов', first_name: 'Иван', middle_name: '', birth_date: '1990-01-01' },
        ],
        contact_phone: '+375291112233',
      });
    }

    if (url.pathname === '/api/user/passengers') {
      return json({
        passengers: [
          { id: 1, last_name: 'Иванов', first_name: 'Иван', middle_name: '', birth_date: '1990-01-01', passport: 'MP1234567' },
        ],
      });
    }

    if (url.pathname === '/api/user/profile') {
      return json({ success: true });
    }

    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not_found' }) });
  });
}

test('admin desktop smoke shows sidebar and operations audit', async ({ page }) => {
  await mockTelegramAndCdn(page, 999);
  await mockAdminApi(page);

  await page.goto('/admin.html');

  await expect(page.locator('#adminTabs')).toBeVisible();
  await expect(page.locator('#adminSidebarToggle')).toBeVisible();
  await expect(page.locator('#bookingOpsOverviewContent')).toContainText('Новые без назначения');
  await expect(page.locator('#bookingOpsOverviewContent')).toContainText('BK-ATT-1');
  await expect(page.locator('#bookingOpsOverviewContent')).toContainText('ждут назначения более 15 минут');
  await page.locator('#adminTabs .segment[data-tab="dispatchersPanel"]').click();
  await expect(page.locator('#dispatchersList')).toContainText('Минск - Москва');
  await expect(page.locator('#dispatchersList')).toContainText('Москва');

  await page.locator('#adminTabs .segment[data-tab="roleAuditPanel"]').click();
  await expect(page.locator('#roleAuditContent')).toContainText('Добавлен диспетчер');
  await expect(page.locator('#operationsAuditContent')).toContainText('Смена статуса заявки');

  await page.locator('#adminSidebarToggle').click();
  await expect(page.locator('body')).toHaveClass(/admin-sidebar-collapsed/);

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/admin-sidebar-collapsed/);
});

test('dispatcher desktop smoke hides passenger links and keeps admin tools', async ({ page }) => {
  await mockTelegramAndCdn(page, 999);
  await mockDispatcherApi(page);

  await page.goto('/dispatcher.html');

  await expect(page.locator('#dispatcherSidebarToggle')).toBeVisible();
  await expect(page.locator('#dispatcherAdminBanner')).toBeVisible();
  await expect(page.locator('#filterDispatcherWrap')).toBeVisible();
  await expect(page.locator('#filterDispatcher')).toContainText('Иван');
  await expect(page.locator('#roleShellPlaceholder')).toContainText('Диспетчер');
  await expect(page.locator('#roleShellPlaceholder')).toContainText('Админ');
  await expect(page.locator('#roleShellPlaceholder')).not.toContainText('Бронь');
  await expect(page.locator('#roleShellPlaceholder')).not.toContainText('Профиль');

  await page.locator('#dispatcherSidebarToggle').click();
  await expect(page.locator('body')).toHaveClass(/dispatcher-sidebar-collapsed/);

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/dispatcher-sidebar-collapsed/);
});

test('booking smoke keeps core route and price flow', async ({ page }) => {
  await mockTelegramAndCdn(page, 999);
  await mockBookingApi(page);

  await page.goto('/booking.html?route_id=minsk_moscow&from=%D0%9C%D0%B8%D0%BD%D1%81%D0%BA&to=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&date=2030-01-12&time=10:00');

  if (await page.locator('#consentAccept').isVisible().catch(() => false)) {
    await page.locator('#consentAccept').click();
  }
  await expect(page.locator('#routeSummary')).toContainText('Минск');
  await expect(page.locator('#fillFromProfileWrap')).toBeVisible();
  await page.locator('#passengersList input[data-f="first_name"]').fill('Иван');
  await page.locator('#toStep2').click();
  await expect(page.locator('#priceSummary')).toContainText('80.00');
  await page.locator('#backToStep1').click();

  await page.locator('#passengerPlus').click();
  await page.locator('#passengersList input[data-i="0"][data-f="first_name"]').fill('Иван');
  await page.locator('#passengersList input[data-i="1"][data-f="first_name"]').fill('Петр');
  await page.locator('#toStep2').click();
  await expect(page.locator('#priceSummary')).toContainText('160.00');
});

test('profile smoke shows overview and nearest trip actions', async ({ page }) => {
  await mockTelegramAndCdn(page, 999);
  await mockProfileApi(page);

  await page.goto('/profile.html');

  await expect(page.locator('#profileOverviewPanel')).toBeVisible();
  await expect(page.locator('#profileOverviewTrip')).toContainText('Минск - Москва');
  await expect(page.locator('#profileOverviewTrip')).toContainText('BK-PR-1');
  await expect(page.locator('#profileOverviewActions')).toContainText('Подробнее');
  await expect(page.locator('#profileOverviewSupport')).toContainText('Поддержка');
  await expect(page.locator('#bookingsListActive')).toContainText('Минск - Москва');
});
