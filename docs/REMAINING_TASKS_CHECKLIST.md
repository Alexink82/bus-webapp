# Чек-лист: что сделано и что осталось

**Обновлено:** 2026-03-10.

Этот документ — единый список задач по проекту. Раздел **«Осталось сделать»** содержит только то, что ещё не реализовано; по нему можно планировать следующие спринты.

---

## Как пользоваться

- **Уже реализовано** — проверенные в коде фичи (для справки).
- **Осталось сделать** — актуальный список задач; всё перечисленное там по-прежнему нужно сделать.

---

## Уже реализовано (проверено в коде)

| # | Рекомендация | Где |
|---|----------------|-----|
| 1 | UserProfile создаётся перед добавлением SavedPassenger | `backend/api/user.py` (add_passenger) |
| 2 | Расчёт цены сегмента: кумулятивные offset, полный маршрут = base_price | `booking.py`, `price_calc.py` |
| 3 | Убран лишний db.commit в payment, user, booking, admin | Эндпоинты полагаются на get_db |
| 4 | Сумма платежа только из Booking.price_total | `backend/api/payment.py` (create_payment) |
| 5 | Диспетчер видит заявки только по своим маршрутам (GET booking) | `backend/api/booking.py` (get_booking, dispatcher_can_view) |
| 6 | WebSocket: рассылка по маршрутам диспетчера | `backend/api/websocket.py` |
| 7 | Таймаут 15 с на fetch /api/routes + блок ошибки | `webapp/js/booking.js` (AbortController) |
| 8 | Cache-busting ?v= на index, success, dispatcher, admin, booking | Все HTML |
| 9 | Кнопка «Назад» на success → index.html (не history.back) | `webapp/success.html` |
| 10 | Степпер: отдельный соединитель, линия не наезжает на «Пассажиры» | `booking.html`, `booking.css` |
| 11 | Логирование: stdout + flush для Render | `logging_config.py`, `main.py` |
| 12 | Проверка `typeof t === 'function'` перед вызовом t() | success.html, profile.js, nav.js, faq.html |
| 13 | GET /api/user/roles + вкладки Админ/Диспетчер в nav | `backend/api/user.py`, `webapp/js/nav.js` |
| 14 | Повтор при IntegrityError в create_booking (новый id с суффиксом) | `backend/api/booking.py` |
| 15 | _resolve_departure_time, _ensure_not_departed, stop_times для маршрутов | `booking.py`, `constants.py` |
| 16 | Редактирование/удаление пассажиров в профиле, «Подставить из профиля» с выбором | profile.js, booking.js |
| 17 | Кнопка «Отмена» в модалках — нейтральный стиль (btn-secondary) | app-modal.js |
| 18 | UI: tap-target 44px, focus-visible, границы карточек | main.css, dispatcher.css |
| 19 | Блокировка «Взять в работу» (гонка диспетчеров) | `take_booking` с `.with_for_update()` в dispatcher.py |
| 20 | WebSocket: при коде 4003 не реконнектить, показать alert | dispatcher.js (event.code === 4003) |
| 21 | Подсказка при неполной ссылке на бронирование | index.html?error=invalid_booking_link, сообщение на index |
| 22 | Админка: общий window.api, экспорт CSV с заголовками | admin.html |
| 23 | CreateBookingIn: extra='ignore' | model_config = ConfigDict(extra="ignore") |
| 24 | Диспетчер: кнопка «Отменить заявку» с причиной (prompt, cancel_reason) | SetStatusIn.reason, backend + dispatcher UI |
| 25 | Sentry: инициализация при SENTRY_DSN, интеграция FastAPI | main.py |
| 26 | Redis rate limit: при REDIS_URL — общий лимит для воркеров | main.py, config.py (redis_url) |
| 27 | README: rate limit при нескольких воркерах, Redis, кэш ролей после add_admin | README.md (разделы Sentry/Redis, Rate limit и кэш ролей) |
| 28 | Health-check с проверкой БД (опционально HEALTH_CHECK_DB=1) | main.py: при недоступной БД /api/health возвращает 503. |
| 29 | Параметризованные тесты access-control | test_api.py: владелец/админ/диспетчер/чужой для get_booking и cancel. |
| 30 | README: раздел «Проверка доступа» | Кто как определяется (админ, диспетчер, пассажир, чужой) и что может делать. |

---

## Осталось сделать (актуальный список)

Всё перечисленное ниже **ещё не сделано** — используйте этот раздел для планирования.

### Инфраструктура и БД (низкий приоритет)

| # | Задача | Детали |
|---|--------|--------|
| 1 | ~~Ротация/архивация log_entries~~ | **Сделано:** POST /api/admin/rotate-logs?older_than_days=N (7–365) удаляет записи из log_entries старше N дней; в админке вкладка «Логи» — блок «Ротация логов» (поле + кнопка); в README добавлен раздел «Ротация логов» (ручная и cron). |
| 2 | ~~Индексы БД для частых запросов~~ | **Сделано:** 002 — route_id+date, status+created_at, dispatcher+status, log_entries.timestamp, saved_passengers.user_id; 004 — bookings.contact_tg_id. |
| 3 | ~~CORS в проде (опционально)~~ | **Сделано:** поддержка уже была (config.cors_origins из ALLOWED_ORIGINS); в README добавлена рекомендация для прода — задать ALLOWED_ORIGINS (домен сервиса и https://web.telegram.org). |
| 4 | ~~Health-check с проверкой БД~~ | **Сделано:** при HEALTH_CHECK_DB=1 в /api/health пинг БД, при недоступности 503. |

### Новый функционал (P0)

| # | Задача | Детали |
|---|--------|--------|
| 5 | ~~SLA-панель диспетчера~~ | **Сделано:** вкладка «Новые» — блок «Просроченные > 15 мин» (заявки в статусе new старше 15 мин), dispatcher.js + dispatcher.html + dispatcher.css. |
| 6 | ~~Блок «Моя активная заявка» на главной/профиле~~ | **Сделано:** на главной (index.html) карточка «Моя заявка» с номером, маршрутом, статусом, «что дальше» и ссылкой на booking.html; загрузка через /api/user/bookings при наличии Telegram user. |
| 7 | ~~Админ: audit log ролей~~ | **Сделано:** при add_admin, add_dispatcher, delete_dispatcher пишем в log_entries (source=admin, action, details); GET /api/admin/role-audit; вкладка «История ролей» в админке. |
| 8 | ~~Расширенные фильтры диспетчера~~ | **Уже было:** фильтры по маршруту, дате, оплате в UI; кнопка «Применить» вызывает loadNew/loadActive с readFilters(). |

### UX и навигация (P1)

| # | Задача | Детали |
|---|--------|--------|
| 9 | ~~Role-shell / единая навигация~~ | **Сделано:** на страницах Диспетчер и Админ добавлена полоса навигации (Бронь \| Профиль \| Диспетчер \| Админ) с подсветкой текущего контура; ссылки на контуры по ролям из /api/user/roles; nav.js заполняет #roleShellPlaceholder; стили в main.css и design-system.css. |
| 10 | ~~Единый feedback pattern~~ | **Сделано:** showAppAlert (модалка) и showToast (неблокирующее уведомление) в app-modal.js; стили в main.css и design-system.css; app-modal.js подключён на index, dispatcher, admin; все alert() заменены на showAppAlert/showToast с fallback на alert. |
| 11 | ~~KPI-переключатель периодов в админке~~ | **Сделано:** кнопки День / Неделя / Месяц в блоке «Статистика»; загрузка /api/admin/stats с from_date и to_date, экспорт CSV за выбранный период. |

### Тесты и качество (P1)

| # | Задача | Детали |
|---|--------|--------|
| 12 | ~~Параметризованные тесты access-control~~ | **Сделано:** test_api.py — владелец/админ/диспетчер/чужой для get_booking и cancel. |

### Улучшения (P2 и по желанию)

| # | Задача | Детали |
|---|--------|--------|
| 13 | ~~Быстрые пресеты дат (Сегодня / Завтра / Выходные)~~ | **Сделано:** кнопки «Сегодня», «Завтра», «Выходные» (ближайшая суббота) у поля даты на главной; i18n RU/EN/BE. |
| 14 | ~~Память последнего маршрута + one-tap повтор~~ | **Сделано:** при отправке формы сохраняем from/to/date в localStorage; на главной кнопка «Повторить последний поиск: X → Y», по клику подставляются значения и выполняется поиск; i18n RU/EN/BE. |
| 15 | ~~FAQ для BE: question_be/answer_be или документировать~~ | **Сделано:** API — для lang=be отдаётся question_en/answer_en (fallback); в README добавлена заметка «Языки и FAQ» (при необходимости можно добавить question_be/answer_be в БД). |
| 16 | ~~UI по UI_IMPROVEMENTS_PLAN~~ | **Сделано:** логотип в шапке уже был на всех страницах; кнопка «✕» скрыта в Telegram (index, success, profile, faq); tab-bar с safe-area (padding-bottom и padding-left/right с env(safe-area-inset-*)). См. `docs/UI_IMPROVEMENTS_PLAN.md`. |
| 17 | ~~Идемпотентность create_booking~~ | **Сделано:** опциональный заголовок X-Idempotency-Key; при REDIS_URL повторный запрос с тем же ключом в течение 5 мин возвращает сохранённый ответ (200) без создания дубликата; клиент (booking.js) генерирует ключ при отправке (crypto.randomUUID или fallback); общий Redis в services/redis_client.py. |

### Стиль и UX (см. TODO_UX_STYLE.md)

| # | Задача | Детали |
|---|--------|--------|
| 18 | ~~Единый стиль админки~~ | **Сделано:** в admin.html подключён main.css перед design-system; в design-system добавлен блок .app с переопределением переменных (--color-* из var(--bg), var(--surface), var(--accent) и т.д.) — админка использует ту же палитру и тему (тёмная/светлая), что и основное приложение. См. `docs/TODO_UX_STYLE.md` §1. |
| 19 | ~~Неделя в календаре с понедельника~~ | **Сделано:** index.html — weekdays Пн…Вс, startDay = (first.getDay() + 6) % 7. |
| 20 | ~~Кнопка «Редактировать» в сохранённых пассажирах~~ | **Сделано:** profile.js — класс `btn btn-small btn-outline` вместо `btn-link` (как «Удалить»). |

### Roadmap (безопасность и прод)

| # | Задача | Детали |
|---|--------|--------|
| 21 | ~~README: раздел про проверку доступа~~ | **Сделано:** раздел «Проверка доступа» в README (админ, диспетчер, пассажир, чужой). |
| 22 | ~~Idempotency при бронировании~~ | **Сделано:** серверный ключ от (маршрут + дата + время + нормализованный телефон + user_id); при REDIS_URL повторная заявка с тем же содержимым в течение 10 мин возвращает сохранённый ответ (200) без создания дубликата; клиентский X-Idempotency-Key по-прежнему 5 мин. |
| 23 | ~~Реальный WebPay: проверка подписи в callback~~ | **Сделано:** при WEBPAY_CALLBACK_SECRET проверяется заголовок X-WebPay-Signature = HMAC-SHA256(raw_body, secret) (hex); сохранена обратная совместимость с body.secret; callback читает raw body для подписи; в README описан способ проверки. |
| 24 | ~~Админка: UI для архивации и управления диспетчерами~~ | **Сделано:** UI архивации в блоке «Статистика» (поле «старше N дней» + кнопка «Выполнить архивацию» → POST /api/admin/archive). Управление диспетчерами уже было (вкладка «Диспетчеры», добавление/удаление). |
| 25 | ~~Кэш маршрутов~~ | **Сделано:** при USE_ROUTES_FROM_DB=1 GET /api/routes отдаёт маршруты из БД через services/cache.py (таблица routes, TTL 10 мин); иначе — из core.constants.ROUTES; в config добавлен use_routes_from_db. |

---

## Краткая сводка

- **Сделано:** критические исправления (профиль, цена, оплата, доступ диспетчера, WebSocket по маршрутам), блокировка «Взять в работу», обработка 4003, таймауты, cache-busting, логи, Sentry, Redis rate limit, документирование rate limit и кэша ролей в README, UI профиля и модалок, отмена заявки диспетчером с причиной; health-check с опциональной проверкой БД (HEALTH_CHECK_DB), параметризованные тесты access-control (get_booking, cancel), раздел README «Проверка доступа».
- **Осталось:** инфраструктура (ротация логов, опционально CORS); P2 и прочее (UI_IMPROVEMENTS, идемпотентность, единый стиль админки, WebPay, кэш маршрутов). Полный список — в разделе **«Осталось сделать»** выше.
