# Bus Booking Web App

Telegram-интегрированное веб-приложение для бронирования автобусных билетов.

**Репозиторий проекта:** единственный и главный репозиторий — [https://github.com/Alexink82/bus-webapp](https://github.com/Alexink82/bus-webapp). Все изменения по проекту пушатся только сюда. Здесь хранится полный актуальный код, без лишнего. Деплой на Render идёт из этого репозитория.

---

## Функции

- Бронирование за 2 минуты (выбор маршрута, даты, пассажиров)
- Сохранённые пассажиры для повторного бронирования
- Real-time панель диспетчера с уведомлениями
- Оффлайн-режим с кэшем (PWA)
- Оплата (WebPay — заглушка для тестов)

## Технологии

- **Backend:** FastAPI, PostgreSQL, SQLAlchemy, WebSocket
- **Frontend:** Vanilla JS, PWA, Telegram WebApp SDK
- **Deploy:** Render.com (Free Tier)

## Быстрый старт

1. Клонировать репозиторий:
   ```bash
   git clone https://github.com/Alexink82/bus-webapp.git
   cd bus-webapp
   ```

2. Создать виртуальное окружение и установить зависимости:
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate   # Windows
   pip install -r requirements.txt
   ```

3. Скопировать переменные окружения (файл `.env.example` лежит в `backend/`):
   ```bash
   copy .env.example .env
   ```
   Заполнить `.env` (обязательно `DATABASE_URL`).

4. Запустить PostgreSQL — без него приложение не стартует.
   - **Вариант А (Docker):** в отдельном терминале:
     ```bash
     docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bus_booking --name bus-pg postgres:15
     ```
     В `.env` указать: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bus_booking`
   - **Вариант Б:** установить PostgreSQL и создать БД `bus_booking`, в `.env` указать свой `DATABASE_URL`.

5. Инициализировать БД и заполнить тестовыми маршрутами (опционально):
   ```bash
   python seed_db.py
   ```

6. Запустить сервер:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0
   ```

7. Открыть в браузере: http://localhost:8000

## Деплой на Render

1. Создать репозиторий на GitHub и отправить код.
2. В [Render](https://render.com): New → Web Service.
3. Подключить репозиторий, указать:
   - **Repository:** `https://github.com/Alexink82/bus-webapp`
   - **Root Directory:** оставить пустым (корень репозитория = приложение)
   - **Build Command:** `cd backend && pip install -r requirements.txt`
   - **Start Command:** `cd backend && alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Добавить PostgreSQL (Render → New → PostgreSQL).
5. В Web Service → Environment добавить переменные из раздела [Переменные окружения](#переменные-окружения-env) (см. ниже). Минимум: `DATABASE_URL`, `WEBAPP_URL`. Рекомендуется для прода: **SENTRY_DSN** (мониторинг ошибок), **REDIS_URL** (общий rate limit для воркеров).
6. **Обязательно задать WEBAPP_URL** — публичный HTTPS-адрес сервиса (например `https://bus-booking-xxx.onrender.com`). Иначе кнопка «Открыть заявки» в Telegram не появится. При необходимости ограничить CORS — задать **ALLOWED_ORIGINS** (через запятую).
7. Deploy.

**Если после пуша в GitHub форма бронирования по‑прежнему не загружается:** в Render Dashboard проверьте, что сервис подключён к репозиторию **Alexink82/bus-webapp** (а не к bus-bot или другому). Затем выполните **Manual Deploy** (Deploy → Deploy latest commit).

### CORS и переменные для продакшена

TG WebApp открывается с домена `t.me` (cross-origin). Запросы к вашему сервису на Render должны проходить CORS. В проекте по умолчанию `allow_credentials=False` и `allowed_origins=*` — это допустимо и безопасно. Если нужно ограничить источники (рекомендуется для прода):

- **ALLOWED_ORIGINS** — список через запятую, например: `https://ваш-сервис.onrender.com,https://web.telegram.org`. **Не задано** — разрешены все origins (`*`), так что Web App из Telegram работает. Для прода можно задать явный список: домен вашего webapp и `https://web.telegram.org`.
- **MAINTENANCE_UNTIL** — дата/время в ISO (UTC), до которого `/api/health` возвращает 503 (режим обслуживания). Пример: `MAINTENANCE_UNTIL=2026-03-20T12:00:00Z`.

### Sentry и Redis (рекомендуется для прода)

- **SENTRY_DSN** — DSN из [Sentry](https://sentry.io) (Project → Getting started). Если задан, ошибки и транзакции отправляются в Sentry. Не задан — мониторинг ошибок отключён. Опционально: **SENTRY_SEND_PII=1** — передавать IP и заголовки в Sentry.
- **REDIS_URL** — строка подключения к Redis (например [Upstash](https://upstash.com) с TLS). Формат: `rediss://default:ТОКЕН@хост.upstash.io:6379`. Токен брать в Upstash Console, в код не вставлять — только в переменные окружения на Render. Если задан — rate limit хранится в Redis (общий для всех воркеров); если не задан — счётчики в памяти процесса (при нескольких воркерах лимит умножается на число воркеров).

### Rate limit и кэш ролей

- **RATE_LIMIT** — число запросов в минуту на IP к `/api/` (по умолчанию 120, 0 = выключено). При **REDIS_URL** лимит общий для всех воркеров; без Redis — в памяти, при перезапуске обнуляется.
- **Кэш ролей (админ/диспетчер):** после добавления нового админа через панель новый админ должен **обновить страницу** в браузере. При нескольких воркерах может потребоваться **перезапуск сервиса** на Render, чтобы все воркеры подхватили обновлённый список ролей из БД.

### Ротация логов (log_entries)

Таблица `log_entries` растёт со временем. В админ-панели во вкладке **«Логи»** есть блок **«Ротация логов»**: укажите число дней (7–365) и нажмите «Выполнить ротацию» — записи старше N дней будут удалены из БД. Для автоматической очистки можно настроить cron (раз в неделю/месяц), вызывающий `POST /api/admin/rotate-logs?older_than_days=90` с заголовками авторизации (X-Telegram-User-Id, X-Telegram-Init-Data от админа).

### Миграции БД (Alembic)

В проекте настроен [Alembic](https://alembic.sqlalchemy.org/): миграции лежат в `backend/alembic/versions/`. URL БД берётся из `DATABASE_URL` (config). При старте приложения в `lifespan` автоматически выполняется `alembic upgrade head`.

- **Новая БД (локально или первый деплой):** запустить приложение — `init_db()` создаёт таблицы совместимости с ботом, затем Alembic применяет миграции из `alembic/versions/`.
- **Уже существующая БД** (создана старым скриптом): один раз выполнить `cd backend && alembic stamp head`, чтобы пометить текущее состояние как применённое. Дальше все изменения схемы — только через миграции.
- **Новые изменения моделей:** `alembic revision --autogenerate -m "add field X"`, проверить `alembic/versions/`, затем `alembic upgrade head` (или перезапустить приложение).

### Как убрать экран «Application loading» (сервис не засыпал)

На **Free Tier** Render останавливает сервис после ~15 минут без запросов. При первом заходе пользователь видит страницу Render «SERVICE WAKING UP» / «APPLICATION LOADING…» — это страница платформы, а не приложения. В логах приложения видно только `Shutting down` / `Application shutdown complete`; сам «пробуждение» логируется на стороне Render.

**Вариант 1 (бесплатно):** держать сервис «бодрым» с помощью внешнего пинга раз в 5–10 минут.

- Зарегистрироваться на [UptimeRobot](https://uptimerobot.com) (бесплатно).
- Добавить монитор типа **HTTP(s)**:
  - **URL:** `https://ВАШ-СЕРВИС.onrender.com/api/health`
  - **Интервал проверки:** 5 минут (или 10 — главное чаще 15 минут).
- Сохранить — сервис будет получать запрос каждые 5 минут и не будет уходить в сон, экран «Application loading» перестанет появляться при первом заходе.

**Вариант 2:** перейти на платный план Render (например, paid Web Service), где инстанс не останавливается при простое.

## Диагностика логов на Render

Если в Render не видны логи приложения (request/error/startup), используйте пошаговый чек-лист: `docs/RENDER_LOGS_TROUBLESHOOTING.md`.

## Структура

- `backend/` — API и бизнес-логика (FastAPI)
- `webapp/` — статичный фронтенд (HTML/CSS/JS), раздаётся корнем сервера
- `docs/` — ANALYSIS.md (связи, сценарии, краш-тесты), PRODUCTION_READINESS.md (готовность к продакшену), ROADMAP.md (дальнейшее развитие), DESIGN_GUIDELINES.md (принципы стилей)

## Переменные окружения (.env)

Имена переменных в Render задаются **в верхнем регистре** (например `DATABASE_URL`, `SENTRY_DSN`). Локально можно использовать `.env` в `backend/` (см. `backend/.env.example`).

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `DATABASE_URL` | Да | Строка подключения PostgreSQL (Render создаёт автоматически при добавлении БД). |
| `WEBAPP_URL` | Да (на Render) | Публичный HTTPS-адрес приложения (например `https://bus-booking-xxx.onrender.com`). Нужен для кнопки «Открыть заявки» в Telegram. |
| `BOT_TOKEN` | Нет (локально) | Токен бота от @BotFather — уведомления пассажирам. |
| `CHANNEL_ID` | Нет | Канал новостей (например `@bus_news`). |
| `ADMIN_IDS` | Нет | Telegram ID админов через запятую (числа). |
| `DISPATCHER_IDS` | Нет | Telegram ID диспетчеров через запятую (или добавлять через панель ролей). |
| `ALLOWED_ORIGINS` | Нет | CORS: список origin через запятую. Не задано — разрешены все (в т.ч. Telegram Web App). |
| `BACKEND_URL` | Нет | URL бэкенда (по умолчанию совпадает с WEBAPP_URL). |
| `OPENWEATHER_API_KEY` | Нет | Ключ OpenWeather для погоды/планировщика. |
| `GOOGLE_ANALYTICS_ID` | Нет | ID для Google Analytics. |
| `DEBUG` | Нет | `true` / `false`. |
| `RATE_LIMIT` | Нет | Запросов в минуту на IP к API (по умолчанию 120, 0 = выключено). |
| `REDIS_URL` | Нет | Подключение к Redis (Upstash: `rediss://default:ТОКЕН@хост.upstash.io:6379`). Если задан — rate limit общий для воркеров. |
| `SENTRY_DSN` | Нет | DSN из Sentry (Project → Getting started) — мониторинг ошибок и производительности. |
| `SENTRY_SEND_PII` | Нет | `1` или `true` — передавать IP/заголовки в Sentry. |
| `WEBPAY_CALLBACK_SECRET` | Нет | Секрет для проверки callback WebPay в проде. |
| `HEALTH_CHECK_DB` | Нет | `1` или `true` — в `/api/health` проверять доступность БД; при недоступности ответ 503 (для UptimeRobot и т.п.). |

Дополнительно для режима обслуживания: **MAINTENANCE_UNTIL** — дата/время в ISO (UTC), до которого `/api/health` возвращает 503 (см. раздел «CORS и переменные для продакшена»). Для мониторинга доступности БД: **HEALTH_CHECK_DB=1** — тогда при недоступной БД `/api/health` вернёт 503 и `{"status": "degraded", "db": "unavailable"}`.

## Проверка доступа (кто что видит и может делать)

Чтобы не сломать права при правках кода, полезно понимать, как определяются роли и что им разрешено.

- **Админ** — пользователь, чей Telegram `user_id` есть в **ADMIN_IDS** (env) или в таблице **bot_roles** с `is_admin = true`. Админ видит все заявки полностью (в т.ч. пассажиры, контакт), имеет доступ к `/api/admin/*`, может отменять любую заявку (с указанием причины).
- **Диспетчер** — пользователь из **DISPATCHER_IDS** (env) или из **bot_roles** с `is_dispatcher = true`, либо запись в таблице **dispatchers** с `is_active = true`. Диспетчер видит заявки только по своим маршрутам (если в `dispatchers` заданы маршруты — только они; иначе все). Может брать заявки в работу, менять статус, отменять с причиной.
- **Пассажир (владелец заявки)** — пользователь, чей `user_id` совпадает с `contact_tg_id` заявки (передаётся при бронировании из Telegram Web App). Видит полные детали только своей заявки; может отменить свою заявку в статусе `new` или по правилам времени до отправления.
- **Чужой** — запрос без авторизации или с другим `user_id`. При GET заявки видит только ограниченный набор полей (без списка пассажиров и контакта). Отменить заявку не может (403).

**Как передаётся авторизация:** при заданном **BOT_TOKEN** требуется заголовок **X-Telegram-Init-Data** (подпись проверяется по секрету бота). Без BOT_TOKEN (локальная разработка) достаточно **X-Telegram-User-Id**. Роли определяются при каждом запросе по ADMIN_IDS, DISPATCHER_IDS и таблицам bot_roles / dispatchers.

**Языки и FAQ:** в таблице `faq_items` есть поля `question_ru`, `answer_ru`, `question_en`, `answer_en`. Для `GET /api/faq?lang=ru` отдаются русские тексты; для `lang=be` и `lang=en` — английские (отдельных полей для белорусского в БД нет; при необходимости можно добавить `question_be`, `answer_be` и доработать API).

## Лицензия

MIT
