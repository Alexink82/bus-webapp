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

3. Скопировать переменные окружения:
   ```bash
   copy .env.example .env
   ```
   Заполнить `.env` (см. раздел ниже).

4. Запустить PostgreSQL (локально или Docker) и указать `DATABASE_URL` в `.env`.

5. Инициализировать БД и заполнить тестовыми маршрутами:
   ```bash
   cd backend
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
5. В Web Service → Environment добавить переменные из `.env.example`.
6. **Обязательно задать WEBAPP_URL** — публичный HTTPS-адрес сервиса (например `https://bus-booking-xxx.onrender.com`). Иначе кнопка «Открыть заявки» в Telegram не появится. При необходимости ограничить CORS — задать **ALLOWED_ORIGINS** (через запятую).
7. Deploy.

### CORS и переменные для продакшена

TG WebApp открывается с домена `t.me` (cross-origin). Запросы к вашему сервису на Render должны проходить CORS. В проекте по умолчанию `allow_credentials=False` и `allowed_origins=*` — это допустимо и безопасно. Если нужно ограничить источники:

- **ALLOWED_ORIGINS** — список через запятую, например: `https://ваш-сервис.onrender.com,https://web.telegram.org`. **Не задано** — разрешены все origins (`*`), так что Web App из Telegram работает. Задайте только если нужно ограничить источники.
- **MAINTENANCE_UNTIL** — дата/время в ISO (UTC), до которого `/api/health` возвращает 503 (режим обслуживания). Пример: `MAINTENANCE_UNTIL=2026-03-20T12:00:00Z`.

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

## Структура

- `backend/` — API и бизнес-логика (FastAPI)
- `webapp/` — статичный фронтенд (HTML/CSS/JS), раздаётся корнем сервера
- `docs/` — ANALYSIS.md (связи, сценарии, краш-тесты), PRODUCTION_READINESS.md (готовность к продакшену), ROADMAP.md (дальнейшее развитие), DESIGN_GUIDELINES.md (принципы стилей)

## Переменные окружения (.env)

- `BOT_TOKEN` — токен бота от @BotFather (уведомления пассажирам)
- `CHANNEL_ID` — канал новостей (например @bus_news)
- `ADMIN_IDS` — Telegram ID админов через запятую
- `DATABASE_URL` — строка подключения PostgreSQL
- `WEBAPP_URL` — публичный HTTPS-адрес приложения (обязателен на Render для кнопки в Telegram)
- `ALLOWED_ORIGINS` — CORS: список origin через запятую (не задано — разрешены все, в т.ч. Telegram)
- `OPENWEATHER_API_KEY` — опционально, для погоды/планировщика
- `DEBUG` — true/false

## Лицензия

MIT
