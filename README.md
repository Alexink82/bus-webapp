# Bus Booking Web App

Telegram-интегрированное веб-приложение для бронирования автобусных билетов.

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
   git clone https://github.com/YOUR_USERNAME/bus-booking-webapp.git
   cd bus-booking-webapp
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
   - **Root Directory:** `bus-booking-webapp`
   - **Build Command:** `cd backend && pip install -r requirements.txt`
   - **Start Command:** `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Добавить PostgreSQL (Render → New → PostgreSQL).
5. В Web Service → Environment добавить переменные из `.env.example`.
6. Deploy.

## Структура

- `backend/` — API и бизнес-логика (FastAPI)
- `webapp/` — статичный фронтенд (HTML/CSS/JS), раздаётся корнем сервера
- `docs/` — ANALYSIS.md (связи, сценарии, краш-тесты), PRODUCTION_READINESS.md (готовность к продакшену), ROADMAP.md (дальнейшее развитие), DESIGN_GUIDELINES.md (принципы стилей)

## Переменные окружения (.env)

- `BOT_TOKEN` — токен бота от @BotFather (уведомления пассажирам)
- `CHANNEL_ID` — канал новостей (например @bus_news)
- `ADMIN_IDS` — Telegram ID админов через запятую
- `DATABASE_URL` — строка подключения PostgreSQL
- `OPENWEATHER_API_KEY` — опционально, для погоды
- `DEBUG` — true/false

## Лицензия

MIT
