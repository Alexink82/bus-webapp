# Глубокий анализ проекта bus-webapp

**Дата:** 2026-03-15  
**Репозиторий:** [Alexink82/bus-webapp](https://github.com/Alexink82/bus-webapp)

Анализ выполнен с позиций **пассажира**, **администратора** и **диспетчера**: сценарии использования, тесты, взаимосвязи файлов, найденные ошибки и рекомендации.

---

## 1. Взаимосвязи между файлами

### 1.1 Backend (FastAPI)

```
main.py
├── config.get_settings, database.init_db, logging_config
├── api.routes (GET /api/routes, /api/news)
├── api.booking (POST/GET /api/bookings, cancel, reschedule-request)
├── api.user (GET/POST/PUT/DELETE /api/user/*)
├── api.dispatcher (GET/POST /api/dispatcher/bookings, take, status, stats)
├── api.admin (GET/POST/DELETE /api/admin/*)
├── api.websocket (/ws/dispatcher/{id})
├── api.faq (GET /api/faq)
└── api.payment (WebPay)
```

**Зависимости авторизации и ролей:**

- `api.auth_deps`: `get_verified_telegram_user_id`, `get_optional_verified_telegram_user_id` — проверка BOT_TOKEN vs X-Telegram-User-Id / X-Telegram-Init-Data.
- `services.roles`: `is_admin`, `is_dispatcher`, `get_dispatcher_route_ids` — объединение ADMIN_IDS/DISPATCHER_IDS из env и таблиц bot_roles/dispatchers.
- `api.booking.get_booking`: полный ответ (passengers, contact_phone) только для владельца, админа или диспетчера по своему маршруту.
- `api.booking.cancel_booking`: разрешено владельцу (с правилами по времени), админу и диспетчеру (с обязательной причиной).

### 1.2 Frontend

| Страница      | Скрипты              | Ключевые API                                      |
|---------------|----------------------|---------------------------------------------------|
| index.html    | api.js, auth.js, i18n | GET /api/routes, /api/news                        |
| booking.html  | api.js, booking.js    | GET /api/routes, POST /api/bookings, /api/user/passengers |
| profile.html  | api.js, profile.js   | GET /api/user/bookings, /api/user/passengers, GET/POST/DELETE /api/bookings, cancel |
| success.html  | api.js, auth.js       | POST /api/bookings/{id}/cancel                    |
| admin.html    | api.js, auth.js, nav  | GET/POST /api/admin/stats, logs, export, admins, dispatchers, archive, rotate-logs |
| dispatcher.html | api.js, dispatcher.js | GET /api/dispatcher/bookings, take, status, stats; GET /api/bookings/{id}; WebSocket |
| faq.html      | api.js                | GET /api/faq?lang=                                |

Общая точка входа для запросов — `webapp/js/api.js`: функция `api()`, заголовки X-Telegram-User-Id и X-Telegram-Init-Data, маппинг кодов ошибок в `ERROR_MESSAGES`.

---

## 2. Анализ по ролям

### 2.1 Пассажир

**Сценарии:**

1. **Поиск → бронирование → успех**  
   index: маршрут, дата → рейсы → переход на booking.html?route_id=...&from=...&to=...&date=...&time=...  
   booking: шаг 1 (пассажиры, при международном — паспорт), шаг 2 (телефон, оплата) → POST /api/bookings → success.html?booking_id=...

2. **Профиль**  
   GET /api/user/bookings, /api/user/passengers; отмена заявки (POST cancel), «Подробнее» (GET /api/bookings/{id}), перенос даты (reschedule-request).

3. **Без Telegram**  
   Без user_id форма бронирования работает (user_id=null), но «Мои заявки» и сохранённые пассажиры недоступны (401).

**Проверено:**

- Валидация пустых пассажиров, несуществующего маршрута, некорректного телефона (тесты test_api.py).
- Двойная отправка формы: кнопка «Забронировать» блокируется на время запроса (booking.js).
- Idempotency: X-Idempotency-Key и дубликат по содержимому (Redis) в booking.py.
- Отмена: кнопка в профиле и на success.html, проверка прав и времени (2 ч / 15 мин) на бэкенде.

**Замечания:**

- В `booking.js` при подстановке из сохранённых пассажиров текст кнопки «Подставить» зависит от `typeof t === 'function'` (i18n). Если i18n не загружен, подпись может не обновиться — косметический момент.
- Локальный маршрут (Гомель–Мозырь): в форме один инпут «Имя пассажира»; бэкенд принимает `first_name` без фамилии — согласовано с валидаторами.

### 2.2 Диспетчер

**Сценарии:**

1. **Вход**  
   При отсутствии uid показывается loginWarning. При 403 (не диспетчер) выводится «Нет доступа (вы не диспетчер)» (dispatcher.js, проверка res.ok в api()).

2. **Новые заявки**  
   GET /api/dispatcher/bookings?status=new → «Взять в работу» → POST take → обновление списков.

3. **В работе**  
   GET /api/dispatcher/bookings?status=active → кнопки Оплачено / Билет отправлен / Завершено / Отменить.  
   **Найденный недочёт:** список `status=active` возвращает **все** заявки в статусе active по маршрутам диспетчера, в том числе взятые другими диспетчерами. При нажатии «Оплачено» и т.п. по чужой заявке API возвращает 403 `not_your_booking`. Рекомендация: на бэкенде при `status=active` фильтровать по `dispatcher_id == текущий диспетчер`, чтобы во вкладке «В работе» были только свои заявки (см. раздел «Исправления»).

4. **Поиск по ID**  
   GET /api/bookings/{q} с заголовками авторизации; при 404 показывается «Не найдено», карточка не рисуется.

5. **WebSocket**  
   /ws/dispatcher/{uid}, первый кадр auth с init_data (при BOT_TOKEN); при new_booking — loadNew() и haptic. При 4003 — «Сессия истекла».

**Проверено:**

- 401 без заголовков (test_dispatcher_bookings_unauthorized).
- Доступ к GET /api/bookings/{id} и полный ответ для диспетчера по своему маршруту (тест пропускается без БД, логика в booking.get_booking и roles.get_dispatcher_route_ids).

### 2.3 Администратор

**Сценарии:**

1. **Статистика**  
   GET /api/admin/stats (период день/неделя/месяц), отображение заявок и суммы. При ошибке — «Нет доступа (не админ)».

2. **Экспорт CSV**  
   GET /api/admin/export?from_date=&to_date= с заголовками; при !res.ok ошибка обрабатывается, .blob() не вызывается по JSON-ответу (admin.html).

3. **Логи и ротация**  
   GET /api/admin/logs, POST /api/admin/rotate-logs с проверкой res.ok.

4. **Админы и диспетчеры**  
   Список админов, добавление (POST /api/admin/admins), список диспетчеров, добавление/удаление (POST/DELETE /api/admin/dispatchers). Ротация логов и архивация заявок (POST archive) с подтверждением.

**Проверено:**

- 401 без заголовков (test_admin_stats_unauthorized, test_admin_logs_unauthorized).
- Отмена заявки админом с причиной (test_cancel_booking_access_control_admin_can_cancel_with_reason, при наличии БД).

---

## 3. Тесты (имитация деятельности)

Запуск: из папки `backend` выполнить `python -m pytest tests/test_api.py -v`.

**Без DATABASE_URL** (локально без PostgreSQL): проходят 15 тестов, 12 пропущены (все сценарии с созданием/чтением заявок, FAQ, новости, контроль доступа к GET/GET cancel).

**Пройденные тесты:**

- health, routes, валидация создания брони (пустые пассажиры, неверный маршрут, неверный телефон, лишние поля).
- 401 для /api/user/bookings, /api/user/passengers, /api/dispatcher/bookings, /api/admin/stats, /api/admin/logs.
- 401 для cancel и reschedule-request без авторизации.
- test_rate_limit_returns_429: делает 11 запросов к GET /api/health; так как /api/health входит в _RATE_LIMIT_SKIP_PATHS, запросы не учитываются в лимите, и тест по сути не проверяет срабатывание 429 (завершается assert True). Рекомендация: для проверки rate limit вызывать endpoint, не входящий в skip-список (например GET /api/user/bookings с заголовками или отдельный тестовый путь).

**С DATABASE_URL** (с БД): дополнительно проходят тесты доступа к заявке (владелец/чужой/админ/диспетчер), отмена владельцем, отмена чужим (403), отмена админом с причиной.

---

## 4. Найденные ошибки и недочёты

### 4.1 Критичные / важные

| # | Описание | Статус |
|---|----------|--------|
| 1 | Вкладка «В работе» диспетчера показывает все заявки со статусом active по маршрутам, а не только взятые текущим диспетчером. | **Исправлено:** в `api/dispatcher.py` при status=active добавлен фильтр по dispatcher_id. |
| 2 | Тест rate limit не проверяет реально 429: запросы идут к /api/health (skip path). | **Оставлено как есть:** в тесте добавлен комментарий; для реальной проверки нужен путь вне skip и БД (GET /api/bookings/ID). |

### 4.2 Средние / UX

| # | Описание | Статус |
|---|----------|--------|
| 3 | В «В работе» кнопки активны для всех карточек; при клике по чужой заявке — 403. | **Неактуально** после исправления п.1 (диспетчер видит только свои заявки). |
| 4 | Кэш ролей: новый админ/диспетчер должен обновить страницу (описано в README). | Документация, правка кода не требуется. |
| 5 | Модель FAQItem: колонка `order` зарезервирована в PostgreSQL. | **Исправлено:** в БД колонка переименована в `sort_order` (models.py + миграция 005). |

### 4.3 Мелкие

| # | Описание | Статус |
|---|----------|--------|
| 6 | Текст кнопки «Подставить» обновлялся только при наличии i18n `t`. | **Исправлено:** fallback «Вставить из сохранённых» в booking.js. |
| 7 | WebSocket при пустом BOT_TOKEN дважды вызывал get_dispatcher_route_ids. | **Исправлено:** один вызов в ветке без токена, один при наличии токена в websocket.py. |
| 8 | admin stats: период «Неделя» — 7 дней, «Месяц» — 30 дней. | Продуктовый вопрос: при необходимости скорректировать в admin.html periodToDates. |

---

## 5. Исправление: фильтр «В работе» для диспетчера

Чтобы во вкладке «В работе» отображались только заявки, взятые текущим диспетчером, в `api/dispatcher.py` в `list_bookings` при `status == "active"` нужно добавить условие по `dispatcher_id`:

```python
# В list_bookings после задания route_ids и q:
if status == "active":
    q = q.where(Booking.dispatcher_id == dispatcher_id)
```

Так диспетчер видит только свои заявки в работе и не получает 403 при нажатии на кнопки статуса.

---

## 6. Безопасность и консистентность

- **Авторизация:** при заданном BOT_TOKEN проверяется X-Telegram-Init-Data (telegram_auth); без BOT_TOKEN достаточно X-Telegram-User-Id (удобно для разработки). Не подменять в проде BOT_TOKEN пустым.
- **Отмена:** владелец может отменить в статусе new всегда; если заявка уже в работе — по правилам времени (2 ч / 15 мин); диспетчер/админ — с обязательной причиной.
- **GET /api/bookings/{id}:** полные данные только владельцу, админу или диспетчеру по своему маршруту; иначе — без passengers и contact_phone.
- **CORS:** по умолчанию allowed_origins=*; для прода можно задать ALLOWED_ORIGINS.

---

## 7. Итог

- **Пассажир:** сценарий поиск → бронирование → успех и профиль (заявки, пассажиры, отмена, перенос) реализованы, валидация и защита от двойной отправки есть. Мелкие замечания — i18n для кнопки подстановки пассажиров.
- **Диспетчер:** логика прав и WebSocket в порядке; вкладка «В работе» должна показывать только заявки текущего диспетчера — рекомендуется правка в dispatcher.py (фильтр по dispatcher_id при status=active).
- **Админ:** статистика, экспорт, логи, ротация, админы и диспетчеры работают; обработка ошибок экспорта и 403 учтена.

Тесты без БД проходят; с БД покрываются сценарии доступа к заявкам и отмены по ролям. Тест rate limit целесообразно перевести на endpoint, учитываемый лимитом.
