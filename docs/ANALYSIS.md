# Полный анализ проекта Bus Booking Webapp

## 1. Связи между файлами и действиями

### 1.1 Frontend: HTML → JS → API

| Страница | Подключаемые скрипты | Ключевые кнопки/действия | Вызываемые API |
|----------|----------------------|---------------------------|----------------|
| **index.html** | api.js, auth.js, i18n.js | Поиск рейсов (форма), обмен городов, клик по рейсу | GET /api/routes, GET /api/news |
| **booking.html** | api.js, auth.js, booking.js | Шаг 1→2, Отправить заявку | GET /api/routes, POST /api/bookings |
| **profile.html** | api.js, auth.js, profile.js | Удалить пассажира, Добавить пассажира, ссылка «Подробнее» на заявку | GET /api/user/bookings, GET /api/user/passengers, DELETE/POST /api/user/passengers |
| **success.html** | api.js, auth.js (inline) | Новый поиск, Мои заявки, Отменить заявку (при наличии booking_id) | POST /api/bookings/{id}/cancel (при отмене) |
| **admin.html** | api.js, auth.js (inline) | Статистика/Логи, Экспорт CSV | GET /api/admin/stats, GET /api/admin/export, GET /api/admin/logs |
| **dispatcher.html** | api.js, auth.js, dispatcher.js | Вкладки Новые/В работе/Поиск/Статистика, Взять в работу, Оплачено/Билет отправлен/Завершено | GET /api/dispatcher/bookings?status=, POST take/status, GET /api/bookings/{id} (поиск), GET /api/dispatcher/stats, WebSocket /ws/dispatcher/{uid} |
| **faq.html** | api.js, auth.js (inline) | Поиск по FAQ | GET /api/faq?lang= |

### 1.2 Backend: маршруты и зависимости

- **auth_deps**: `get_verified_telegram_user_id` (401 при отсутствии/неверном initData), `get_optional_verified_telegram_user_id`.
- **booking**: POST /api/bookings — get_db; GET /api/bookings/{id} — get_optional_verified + права (владелец/диспетчер/админ); POST cancel — get_verified + проверка владельца/диспетчер/админ.
- **user**: все маршруты /api/user/* — get_verified_telegram_user_id.
- **dispatcher**: все — get_verified_telegram_user_id + get_dispatcher_route_ids (403 not_dispatcher если не диспетчер).
- **admin**: get_admin_id = get_verified + is_admin (403 not_admin).

---

## 2. Имитация сценариев пользователей

### 2.1 Пассажир

1. **Поиск → бронь → успех**  
   index: ввод from/to/date → showResults → клик по рейсу → переход на booking.html с query.  
   booking: шаг 1 (ФИО, дата, паспорт при international) → шаг 2 (телефон, способ оплаты) → POST /api/bookings → редирект на success.html?booking_id=...

   **Возможные сбои:** неверная дата/формат → 400; маршрут не найден → 404; пустые пассажиры → 400; телефон не прошёл валидацию → 400; номер в чёрном списке → 403 blocked; rate limit → 429.

2. **Профиль**  
   Без Telegram user_id показывается «Войдите через Telegram». С user_id: GET /api/user/bookings и /api/user/passengers; отображение заявок (ссылка на success.html?booking_id=...) и пассажиров (удаление/добавление).

   **Пробел (устранён):** В профиле и на success.html добавлена кнопка «Отменить заявку» с подтверждением и вызовом POST /api/bookings/{id}/cancel.

3. **FAQ**  
   GET /api/faq?lang= — список вопросов; фильтр по вводу в #faqSearch по тексту.

### 2.2 Диспетчер

1. **Вход**  
   Без uid показывается loginWarning. С uid: запросы с X-Telegram-User-Id и X-Telegram-Init-Data (если есть). При 403 (не диспетчер) ранее показывалось «Нет новых заявок» из-за того, что локальный api() не проверял res.ok — исправлено: api() бросает при !res.ok, в catch показывается «Нет доступа (вы не диспетчер)».

2. **Новые заявки**  
   GET /api/dispatcher/bookings?status=new → карточки с кнопкой «Взять в работу» → POST /api/dispatcher/bookings/{id}/take → перезагрузка новых и активных.

3. **В работе**  
   GET /api/dispatcher/bookings?status=active → кнопки Оплачено / Билет отправлен / Завершено → POST /api/dispatcher/bookings/{id}/status с body { status }.

4. **Поиск**  
   GET /api/bookings/{q}. При 404 тело — { detail: "booking_not_found" }, без проверки res.ok в карточку попадали undefined — исправлено: при !res.ok показывается «Не найдено», карточка не рисуется.

5. **WebSocket**  
   Подключение к /ws/dispatcher/{uid}, первый кадр auth с init_data; при new_booking — loadNew() и haptic.

### 2.3 Админ

1. **Статистика**  
   GET /api/admin/stats (с заголовками User-Id и Init-Data в продакшене) → период, total_bookings, total_sum; при ошибке — «Нет доступа (не админ)».

2. **Экспорт**  
   GET /api/admin/export?from_date=&to_date=. Раньше без проверки res.ok при 403/401 fetch давал JSON, .blob() падал — добавлена проверка res.ok; при ошибке показ «Ошибка экспорта» и чтение detail из JSON при наличии.

3. **Логи**  
   GET /api/admin/logs?limit=50 → вывод action (message не возвращается бэкендом, используется action).

4. **Архивация и диспетчеры**  
   POST /api/admin/archive, GET/POST /api/admin/dispatchers в API есть; в текущем admin.html UI только Статистика и Логи (архив и диспетчеры можно добавить отдельно).

---

## 3. Краш-тесты и граничные случаи

| Сценарий | Ожидание | Реализация |
|----------|----------|------------|
| POST /api/bookings без passengers | 400 | test_api.py: test_create_booking_validation_empty_passengers |
| POST /api/bookings с несуществующим route_id | 404 | test_create_booking_validation_invalid_route |
| GET /api/bookings/{id} несуществующий | 404 | test_get_booking_not_found |
| GET /api/user/bookings без заголовков | 401 | test_user_bookings_unauthorized |
| GET /api/dispatcher/bookings без заголовков | 401 | test_dispatcher_bookings_unauthorized |
| GET /api/admin/stats без заголовков | 401 | test_admin_stats_unauthorized |
| Отмена чужой заявки (не владелец, не диспетчер, не админ) | 403 not_authorized_to_cancel | Добавлен тест test_cancel_booking_unauthorized |
| Запросы сверх rate limit | 429 too_many_requests | Добавлен тест test_rate_limit_returns_429 |
| Диспетчер: 403 при запросе списка | Показать «Нет доступа» | dispatcher.js: api() бросает при !res.ok |
| Поиск заявки по id: 404 | Показать «Не найдено», не рендерить карточку | dispatcher.js: проверка res.ok перед рендером |
| Админ экспорт: 403/401 | Не вызывать .blob() по error response | admin.html: проверка res.ok, alert с текстом ошибки |

---

## 4. Найденные ошибки и план устранения

| # | Проблема | Статус |
|---|----------|--------|
| 1 | Диспетчер: при 403 показывалось «Нет новых заявок» вместо «Нет доступа» | Исправлено: в dispatcher.js api() проверяет res.ok и бросает Error с data.detail |
| 2 | Диспетчер поиск: при 404 в карточке отображались undefined | Исправлено: проверка res.ok; при 404/ошибке показ «Не найдено» |
| 3 | loadActive/loadStats без .catch — при 403 пустой экран | Исправлено: .catch с сообщением «Нет доступа» / «Ошибка загрузки» |
| 4 | Админ: без X-Telegram-Init-Data в продакшене 401 | Исправлено: в admin.html добавлена передача initData в заголовках и использование api() для stats/logs |
| 5 | Админ экспорт: при 403/401 .blob() на JSON ломает скачивание | Исправлено: проверка res.ok; при ошибке alert с текстом |
| 6 | Пользователю показываются коды ошибок (blocked, invalid_phone и т.д.) | Добавлены маппинги already_taken, invalid_status, not_your_booking, dispatcher_exists в api.js |
| 7 | Нет кнопки «Отменить заявку» в веб-интерфейсе | Исправлено: на success.html и в профиле (в карточке заявки) кнопка отмены с подтверждением, вызов POST /api/bookings/{id}/cancel |
| 8 | Двойной клик «Забронировать» → две заявки | Исправлено: кнопка отключается на время запроса, включается при ошибке |
| 9 | booking.js fallback apiFn: при 400/403 редирект на success с undefined | Исправлено: fallback проверяет res.ok перед редиректом |
| 10 | profile.js fallback apiFn: при 401 рендер «Нет заявок» вместо «Ошибка загрузки» | Исправлено: fallback проверяет res.ok и бросает |

---

## 5. Упреждающая защита от будущих сбоев

- **Двойная отправка формы бронирования**  
  В booking.js кнопка «Забронировать» отключается (disabled) при клике и включается при ошибке в catch — снижает риск дублей при двойном клике.

- **Единое сообщение при 5xx**  
  В api.js при res.status >= 500 можно подставлять сообщение «Временная ошибка сервера. Попробуйте позже.» вместо сырого detail.

- **Двойная отправка формы бронирования**  
  В booking.js кнопка «Забронировать» отключается при клике и включается при ошибке — снижает риск дублей.

- **Единое сообщение при 5xx**  
  В api.js при res.status >= 500 подставляется сообщение «Временная ошибка сервера. Попробуйте позже.»

- **Истёкший initData**  
  Telegram рекомендует повторно запрашивать контекст при долгой сессии. При 401 invalid_init_data на фронте можно показать «Сессия истекла, перезапустите приложение» и не пытаться повторять запрос без нового initData.

- **Пустые списки (routes, bookings, passengers)**  
  Уже обрабатываются: «Маршрут не найден», «Нет заявок», «Нет новых заявок». Бэкенд возвращает пустые массивы, а не null — фронт использует `data.bookings || []` и аналоги.

- **Падение БД / таймаут**  
  При 500/502 фронт получает res.ok false и api() бросает; в catch показывается сообщение из body или statusText. Рекомендуется единое сообщение типа «Временная ошибка, попробуйте позже» для 5xx.

- **WebSocket отключён**  
  Уже есть переподключение через setTimeout(connectWs, 5000) при onclose; при ошибке вызывается ws.close(), что приводит к onclose и переподключению.

- **Конфликт booking_id при вставке**  
  Уже обрабатывается в create_booking: при IntegrityError повторная вставка с суффиксом к id.

- **Отмена уже отменённой/завершённой заявки**  
  Бэкенд возвращает 400 cannot_cancel; на фронте при отмене показывается сообщение из api() (через userFriendlyMessage при наличии кода).

- **Экспорт без прав**  
  Админ экспорт проверяет res.ok; при 403 пользователь видит сообщение об ошибке вместо сломанного файла.

---

## 6. Рекомендации по тестам

- Добавить тест на rate limit (много запросов подряд → 429).
- Добавить тест cancel от неавторизованного/не владельца → 403.
- При появлении тестов с БД: тест создания брони с телефоном в blacklist → 403 blocked.
- Опционально: тест GET /api/bookings/{id} с заголовком владельца — полный ответ; без заголовка — только публичные поля.

Документ обновлён после внесённых исправлений в dispatcher.js, admin.html, api.js, success.html и profile.js.
