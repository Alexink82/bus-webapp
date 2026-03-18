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

    if (url.pathname === '/api/user/roles') {
      return json({ is_admin: true, is_dispatcher: true });
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
    if (url.pathname === '/api/admin/logs') {
      return json({ logs: [{ timestamp: '2030-01-10T10:00:00', level: 'INFO', source: 'api', action: 'healthcheck' }] });
    }
    if (url.pathname === '/api/admin/admins') {
      return json({ admin_ids: [999] });
    }
    if (url.pathname === '/api/admin/dispatchers') {
      return json({ dispatchers: [{ telegram_id: 222, name: 'Иван', phone: '+375291111111', is_active: true, from_env: false }] });
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

test('admin desktop smoke shows sidebar and operations audit', async ({ page }) => {
  await mockTelegramAndCdn(page, 999);
  await mockAdminApi(page);

  await page.goto('/admin.html');

  await expect(page.locator('#adminTabs')).toBeVisible();
  await expect(page.locator('#adminSidebarToggle')).toBeVisible();

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
