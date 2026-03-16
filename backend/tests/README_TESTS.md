# Тесты API: пользователь, администратор, диспетчер

## Запуск без БД

```bash
cd backend
python -m pytest tests/ -v
```

Часть тестов будет пропущена (skip). Остальные проверяют эндпоинты без доступа к БД.

**Если задан DATABASE_URL, но PostgreSQL не запущен:** тесты, требующие БД, проверяют доступность хоста:порт из URL (TCP, таймаут 2 с). При недоступности они **пропускаются** с причиной «DATABASE_URL not set or PostgreSQL unreachable», а не падают с `ConnectionRefusedError`.

---

## Как пройти тесты с БД

Нужна работающая **PostgreSQL** и переменная окружения **DATABASE_URL**.

### 1. Поднять PostgreSQL

**Вариант A — Docker:**

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bus_booking postgres:15
```

**Вариант B** — установленный локально PostgreSQL. Создайте БД, например:

```sql
CREATE DATABASE bus_booking;
```

### 2. Задать DATABASE_URL и применить миграции

Формат URL: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

**PowerShell (Windows):**

```powershell
cd backend
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bus_booking"
# Применить схему (Alembic или создание таблиц по моделям)
alembic upgrade head
```

**Bash (Linux/macOS):**

```bash
cd backend
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bus_booking"
alembic upgrade head
```

**Через .env:** конфиг бэкенда читает `backend/.env`. Скопируй `backend/.env.example` в `backend/.env` и укажи в нём `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bus_booking`. При запуске pytest из папки `backend` переменная подхватится автоматически.

### 3. Запустить все тесты

```powershell
# PowerShell
python -m pytest tests/ -v
```

```bash
# Bash (если DATABASE_URL уже в .env и не экспортирована)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bus_booking"
python -m pytest tests/ -v
```

При установленной **DATABASE_URL** тесты с БД выполнятся (в т.ч. доступ владелец/админ/диспетчер, dashboard, ETag). Ожидаемый результат: **52 теста**, без пропусков (или с минимумом, если что-то ещё помечено skip).

---

## Покрытие по ролям

### Аноним (без заголовков)

| Эндпоинт | Ожидание |
|----------|----------|
| GET /api/health | 200 |
| GET /api/routes | 200 |
| GET /api/user/roles | 200, is_admin=False, is_dispatcher=False |
| GET /api/user/bookings | 401 |
| GET /api/user/passengers | 401 |
| GET /api/user/dashboard | 401 |
| PUT /api/user/profile | 401 |
| POST /api/user/passengers | 401 |
| DELETE /api/user/passengers/:id | 401 |
| GET /api/dispatcher/bookings | 401 |
| POST /api/dispatcher/bookings/:id/take | 401 |
| POST /api/dispatcher/bookings/:id/status | 401 |
| GET /api/dispatcher/stats | 401 |
| GET /api/dispatcher/export | 401 |
| GET /api/admin/stats | 401 |
| GET /api/admin/logs | 401 |
| GET /api/admin/dispatchers | 401 |
| GET /api/admin/role-audit | 401 |
| GET /api/admin/export | 401 |
| POST /api/admin/bookings/cancel-bulk | 401 |
| POST /api/bookings/:id/cancel | 401 |
| POST /api/bookings/:id/reschedule-request | 401 |

### Пользователь (X-Telegram-User-Id: владелец)

С **DATABASE_URL**:

- Владелец заявки видит полный ответ GET /api/bookings/:id (passengers, contact_phone).
- Владелец может отменить свою заявку (статус new) через POST /api/bookings/:id/cancel.
- GET /api/user/dashboard возвращает 200, структура: profile, passengers, bookings.
- Повторный запрос dashboard с If-None-Match → 304.

### Чужой пользователь (не владелец, не админ, не диспетчер)

- GET /api/bookings/:id → 200, но без passengers и contact_phone.
- POST /api/bookings/:id/cancel → 403 not_authorized_to_cancel.

### Администратор (X-Telegram-User-Id в ADMIN_IDS, в тестах 999)

Без заголовка админ-эндпоинты → 401. С заголовком не-админа (например 888):

- GET /api/admin/stats → 403 not_admin.

С заголовком админа (и DATABASE_URL):

- GET /api/user/roles → 200, is_admin=True.
- GET /api/bookings/:id → 200, полный ответ.
- POST /api/bookings/:id/cancel с reason → 200, status=cancelled.

### Диспетчер (X-Telegram-User-Id в DISPATCHER_IDS, в тестах 222)

С заголовком не-диспетчера (888) и DATABASE_URL:

- GET /api/dispatcher/bookings → 403 not_dispatcher.

С заголовком диспетчера и DATABASE_URL:

- GET /api/bookings/:id → 200, полный ответ (по своим маршрутам).

---

## Валидация и прочее

- Создание брони: пустой passengers → 400/422; несуществующий route_id → 404; некорректный телефон → 400 invalid_phone; лишние поля в теле игнорируются (extra='ignore').
- Логика времени: `_resolve_departure_time`, `_ensure_not_departed` — отдельные тесты в test_booking_time_logic.py.
- Логирование: test_logging_config.py.

---

## Переменные для тестов с ролями

В тестах access-control временно выставляются:

- `BOT_TOKEN=""` (проверка по X-Telegram-User-Id).
- `ADMIN_IDS="999"`.
- `DISPATCHER_IDS="222"`.

После теста значения восстанавливаются.
