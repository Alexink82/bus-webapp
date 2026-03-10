# План вывода Bus Booking Web App в прод (по аналогии с bus-bot)

## Текущая ситуация

- **bus-bot** (Alexink82/bus-bot): Telegram-бот, одна БД PostgreSQL на Render, без REST API.
- **bus-booking-webapp**: FastAPI + статика, своя схема БД (SQLAlchemy, таблицы routes, bookings и др.).

Цель: одна общая БД, одни и те же маршруты и роли, webapp и бот работают с одними заявками.

---

## 1. База данных — одна на бота и webapp

### 1.1 Схема из bus-bot (уже есть)

- **bookings**  
  `id` (TEXT, PK), `status`, `created_at`, `route_id`, `from_city`, `to_city`, `date`, `departure`, `arrival`, `passengers` (JSONB), `contact_phone`, `contact_tg_id`, `contact_username`, `price_total`, `payment_method`, `dispatcher_id`, `taken_at`, `paid_at`.

- **bot_roles**  
  `user_id` (PK), `is_admin`, `is_dispatcher` — роли из админ-панели (env дублируется/дополняется).

### 1.2 Что делает webapp

- **Использовать ту же таблицу `bookings`** — те же поля и типы. Формат ID заявки: `BK-{ddmmyy}-{HHMMSS}` (как в боте).
- **Использовать ту же таблицу `bot_roles`** — проверка «диспетчер/админ» через env + `bot_roles` (как в `services/roles.py`).
- Дополнительные таблицы только для webapp (если нужны): `user_profiles`, `saved_passengers`, `faq_items`, `cached_data`. Создавать их миграцией/скриптом, не трогая существующие таблицы бота.

Итог: один `DATABASE_URL` на Render; бот и webapp подключаются к одной БД.

---

## 2. Маршруты — один источник правды

- В bus-bot маршруты заданы в **core/constants.py** (`ROUTES`): `mozyr_moscow`, `moscow_mozyr`, `gomel_mozyr`, `mozyr_gomel`.
- В webapp: **не заводить отдельную таблицу `routes` для прода** (или использовать только для кэша/админки). В коде взять те же константы: скопировать `ROUTES` и `get_route_by_cities()` в webapp (например `backend/core/constants.py`).
- API списка маршрутов отдаёт данные из этого словаря (и при необходимости — расписание по дням из констант).

---

## 3. Роли (диспетчеры / админы)

- Как в bus-bot: **env** `ADMIN_IDS`, `DISPATCHER_IDS` + таблица **bot_roles** (кто добавлен через админ-панель).
- В webapp при проверке прав:
  - админ: `user_id in (ADMIN_IDS из env + is_admin=True из bot_roles)`;
  - диспетчер: `user_id in (DISPATCHER_IDS из env + is_dispatcher=True из bot_roles)` с тем же приоритетом, что в боте (например, если в панели есть диспетчеры — брать только их).
- Реализация: модуль в webapp по аналогии с `services/roles.py` — загрузка ролей из БД при старте и/или по требованию, те же правила объединения с env.

---

## 4. Парсеры (граница, погода)

- **Граница**: логика из bus-bot `parsers/border.py` (gpk.gov.by, кэш ~10 мин). Перенести в webapp (тот же URL, те же форматы ответа и кэш).
- **Погода**: логика из bus-bot `parsers/weather.py` (OpenWeatherMap, температура по городам маршрута, при необходимости — алерты). Адаптировать под webapp (тот же API ключ из env).

Так и бот, и webapp показывают одну и ту же «актуальную информацию».

---

## 5. Конфиг и переменные окружения

Использовать те же переменные, что и в bus-bot:

- `BOT_TOKEN`, `CHANNEL_ID`, `ADMIN_IDS`, `DISPATCHER_IDS`, `DATABASE_URL`
- `OPENWEATHER_API_KEY`, при необходимости `TOMTOM_*` для трафика (если позже добавите).

В webapp добавить только то, что нужно именно для веб-приложения (например `WEBAPP_URL`, `BACKEND_URL` для ссылок в письмах/уведомлениях).

---

## 6. Деплой на Render

- **Один PostgreSQL** (уже используется bus-bot).
- **Два сервиса**:
  - Текущий **bus-bot** (Docker или Python) — без изменений, тот же `DATABASE_URL`.
  - **bus-booking-webapp** — новый Web Service (FastAPI + статика), тот же `DATABASE_URL`, те же `BOT_TOKEN`, `CHANNEL_ID`, `ADMIN_IDS`, `DISPATCHER_IDS`.
- В `render.yaml` описать оба сервиса; для webapp указать build/start так, чтобы поднимался uvicorn и раздавалась статика.

---

## 7. Пошаговый чек-лист до продакшена

1. **Схема и код**
   - [ ] Webapp пишет заявки только в таблицу `bookings` в формате bus-bot (поля и формат ID `BK-ddmmyy-HHMMSS`).
   - [ ] Роли в webapp читаются из env + `bot_roles` (та же логика, что в боте).
   - [ ] Маршруты в webapp берутся из констант (ROUTES), без расхождений с ботом.

2. **Парсеры и кэш**
   - [ ] Парсер границы (gpk.gov.by) перенесён и используется в webapp.
   - [ ] Погода (OpenWeatherMap) по городам маршрута — как в боте.

3. **Инфраструктура**
   - [ ] Один `DATABASE_URL` для бота и webapp.
   - [ ] render.yaml обновлён: два сервиса, общая БД.
   - [ ] Health-check для webapp (например `/api/health`).

4. **Проверки**
   - [ ] Заявка, созданная в боте, видна в webapp (диспетчер/админ).
   - [ ] Заявка, созданная в webapp, видна в боте (диспетчер/админ).
   - [ ] Один и тот же набор диспетчеров/админов (env + bot_roles) работает и в боте, и в webapp.

После этого можно считать, что проект доведён до единого продакшена с bus-bot и общей БД.
