# Полный аудит проекта Bus Booking Web App

**Дата:** 2026-03  
**Репозиторий:** https://github.com/Alexink82/bus-webapp  
**Деплой:** Render.com (Docker)

---

## 1. Обзор проекта

| Аспект | Описание |
|--------|----------|
| **Назначение** | Telegram Web App для бронирования автобусных билетов (маршруты Мозырь–Москва, Гомель–Мозырь и др.) |
| **Backend** | FastAPI, PostgreSQL (async via asyncpg), SQLAlchemy 2, Alembic |
| **Frontend** | Vanilla JS, PWA, Telegram WebApp SDK, статика из одного домена |
| **Роли** | Пассажир, диспетчер (по маршрутам), администратор |
| **Инфраструктура** | Render (Docker), один Web Service + PostgreSQL |

---

## 2. Архитектура и структура

### 2.1 Backend

- **main.py** — точка входа, lifespan (init_db, миграции, роли, планировщик), CORS, rate limit, логирование запросов, монтирование статики.
- **api/** — маршруты: routes, booking, user, payment, dispatcher, admin, websocket, faq; авторизация через **auth_deps** (Telegram initData или X-Telegram-User-Id).
- **core/constants.py** — маршруты и тарифы (единый источник с bus-bot).
- **services/** — роли, валидаторы, расчёт цен, уведомления в Telegram, telegram_auth, кэш, парсеры (погода, граница).
- **models.py** — UserProfile, SavedPassenger, Booking, BotRole, Dispatcher, Blacklist, FAQItem, LogEntry, WebPayTransaction и др.
- **database.py** — async engine (postgresql+asyncpg), сессии, init_db (bookings/bot_roles + таблицы из models).

**Плюсы:** Чёткое разделение API/сервисы/модели, одна БД для бота и webapp, миграции Alembic.

**Замечания:** Два набора миграций (migrations/ и alembic/versions/) — убедиться, что в проде используется только alembic. Планировщик и парсеры могут падать при старте (обработаны в lifespan).

### 2.2 Frontend

- **Страницы:** index (поиск маршрута), booking (форма пассажиров + оплата), success, profile, faq, dispatcher, admin.
- **Скрипты:** api.js (BASE_URL, api(), Telegram headers, escapeHtml), auth.js, theme, i18n, nav (вкладки Админ/Диспетчер), maintenance, consent; booking.js, dispatcher.js, profile.js, app-modal, input-masks, passport-config, phone-config, date-picker.
- **Стили:** main.css, booking.css, telegram-theme, design-system (админка), date-picker, animations.
- **PWA:** manifest.json, sw.js (service worker).

**Плюсы:** Единый api.js с заголовками Telegram, cache-busting (?v=) на ключевых страницах, escapeHtml при подстановке данных в HTML (booking, dispatcher, app-modal).

**Замечания:** Часть страниц (profile, faq) подключают много скриптов — порядок загрузки критичен для booking.js (зависит от api, auth, input-masks и др.). Нет единого бандла — при росте числа скриптов стоит рассмотреть сборку.

---

## 3. Безопасность

### 3.1 Реализовано

- **Авторизация:** В проде (BOT_TOKEN задан) обязателен X-Telegram-Init-Data и проверка подписи (telegram_auth). Без токена — только X-Telegram-User-Id (режим разработки).
- **Роли:** ADMIN_IDS / DISPATCHER_IDS из env + bot_roles в БД; диспетчеры по маршрутам (таблица dispatchers). Доступ к /api/admin и /api/dispatcher только после проверки.
- **Чёрный список:** Blacklist по phone и user_id — блокировка при создании брони.
- **WebPay callback:** Проверка WEBPAY_CALLBACK_SECRET при наличии.
- **CORS:** Настраивается через ALLOWED_ORIGINS; по умолчанию * (допустимо для TG Web App). credentials=false.
- **Секреты:** Токены и ключи только из конфига (env); в коде нет хардкода паролей.
- **Rate limit:** In-memory, по IP, только для /api/, часть read-only путей исключена.

### 3.2 Риски и рекомендации

- **Rate limit:** При нескольких воркерах лимит умножается. Для строгого лимита — Redis или аналог.
- **CORS * в проде:** При желании ужесточить — задать ALLOWED_ORIGINS (webapp URL + web.telegram.org и т.п.).
- **Ввод в HTML:** В большинстве мест используется escapeHtml или esc(); при добавлении нового вывода пользовательских данных — всегда экранировать.
- **WebSocket /ws/dispatcher/{id}:** Авторизация по initData в первом сообщении; при истечении сессии — закрытие с кодом 4003, без бесконечного reconnect (рекомендуется явно обрабатывать на клиенте «обновите страницу»).

---

## 4. Надёжность и данные

### 4.1 Уже исправлено (по предыдущим отчётам)

- Создание **UserProfile** перед добавлением SavedPassenger (api/user.py).
- Расчёт цены сегмента: кумулятивные offset, полный маршрут = base_price (booking + price_calc).
- Убран лишний **db.commit()** в payment (полагаемся на get_db).
- **Таймаут 15 с** на fetch /api/routes в booking.js и показ блока ошибки.
- **Cache-busting** (?v=2, ?v=3) на index, success, dispatcher, admin, booking.
- Кнопка «Назад» на success ведёт на **index.html** (или закрывает Web App), а не history.back().
- **Степпер:** отдельный элемент-соединитель, линия не наезжает на подпись «Пассажиры».
- **Логирование:** root.handlers.clear() + StreamHandler(stdout) + flush после emit для отображения логов на Render.

### 4.2 Остаётся уделить внимание

- **Явный db.commit() в API:** В `get_db` после `yield` выполняется `await session.commit()`. При этом в **user.py** (add_passenger, update_passenger, update_profile, delete_passenger), **booking.py** (create_booking, cancel_booking), **admin.py** (archive, add_admin, add_dispatcher, delete_dispatcher) вызывается `await db.commit()`. Это приводит к двойному commit (сначала в хендлере, затем в get_db). Рекомендация: убрать явные `db.commit()` в этих эндпоинтах и полагаться на commit в `get_db` (как сделано в payment.py).
- **Диспетчер «Взять в работу»:** при одновременном нажатии двумя диспетчерами возможна гонка. Рекомендация: SELECT FOR UPDATE или проверка версии при обновлении.
- **Логи в БД (log_entries):** таблица может сильно расти; нужна ротация или архивация по возрасту.
- **Маршруты (ROUTES):** захардкожены в constants; при изменении в bus-bot — синхронизировать вручную или вынести в общий источник/БД.

---

## 5. API

### 5.1 Публичные (без проверки Telegram)

- `GET /api/health` — статус, режим обслуживания (MAINTENANCE_UNTIL).
- `GET /api/routes` — список маршрутов.
- `GET /api/news` — кэш погоды/границы.
- `GET /api/faq` — FAQ.
- `GET /api/user/roles` — роли текущего пользователя (опциональная авторизация).
- `GET /api/bookings/{id}` — данные заявки (ограниченный набор без полного доступа).
- `POST /api/bookings` — создание заявки (без обязательной авторизации).
- `POST /api/payment/create`, `POST /api/payment/callback` — WebPay mock/callback.

### 5.2 С авторизацией (Telegram)

- **user:** profile, passengers, bookings (get/put/delete), roles.
- **dispatcher:** bookings (list, take, status), stats; WebSocket /ws/dispatcher/{id}.
- **admin:** stats, logs, archive, admins, dispatchers, export.

Права проверяются через auth_deps и services.roles (is_admin, get_dispatcher_route_ids). Доступ к заявке по ID — только владелец, админ или диспетчер по маршруту заявки.

---

## 6. Frontend и UX

- **Главная:** выбор направления, даты, поиск рейсов, расписание, блок «Актуальная информация», вкладки Бронь/Профиль/FAQ (+ Админ/Диспетчер по ролям).
- **Бронирование:** шаги 1 (пассажиры) и 2 (контакт и оплата); кнопка «Подставить из профиля» перед формами; сбор данных с trim и подстановкой даты из видимого поля; валидация с прокруткой к ошибке; кнопка «Продолжить» с улучшенной областью нажатия.
- **Success:** номер заявки, статус, отмена (для владельца), «Назад» → index или закрытие Web App, «Мои заявки» → profile.
- **Профиль:** заявки и сохранённые пассажиры при наличии авторизации.
- **Диспетчер:** вкладки Новые/В работе/Поиск/Статистика, WebSocket для новых заявок.
- **Админ:** статистика, логи, архивация, админы, диспетчеры, экспорт CSV.

**Замечания:** Нет единого компонента навигации «хлебные крошки»; на мобильных важно сохранять достаточные размеры областей нажатия (частично закрыто в booking.css для нижней панели).

---

## 7. Тестирование

- **backend/tests/test_api.py:** health, routes (список и структура), валидация создания брони (пустой passengers). Для тестов с БД нужен DATABASE_URL.
- **conftest.py:** клиент FastAPI (TestClient).

**Рекомендации:** Добавить тесты на расчёт цены (price_calc), на auth_deps (с заголовками Telegram), на доступ к get_booking для владельца/диспетчера/чужих). Рассмотреть pytest-cov для покрытия.

---

## 8. Деплой и окружение

- **Render:** Docker (Dockerfile), порт из $PORT, миграции в CMD перед uvicorn. Переменные из render.yaml и Dashboard; WEBAPP_URL обязателен для кнопки в Telegram.
- **Dockerfile:** Python 3.11-slim, PYTHONUNBUFFERED=1, копирование backend и webapp, установка зависимостей, alembic upgrade head + uvicorn.
- **.env.example:** описан набор переменных для локального запуска; секреты не коммитятся.

**Замечания:** README упоминает Build/Start Command для Render без Docker; при использовании Docker (как в render.yaml) актуальны только Dockerfile и CMD. При нескольких воркерах (если появятся) — учесть in-memory rate limit и кэш ролей.

---

## 9. Документация

- **README.md** — быстрый старт, деплой на Render, CORS, миграции, UptimeRobot, структура, переменные окружения.
- **docs/** — CODE_ANALYSIS_REPORT.md (анализ кода и проблем), PRODUCTION_READINESS, ROADMAP, DESIGN_GUIDELINES, анализ сценариев, чеклисты тестирования и др.

Документация достаточна для запуска и поддержки; актуализировать README при смене способа деплоя (только Docker vs native).

---

## 10. Сводка по приоритетам

| Приоритет | Действие |
|-----------|----------|
| **Высокий** | Диспетчер: блокировка при «Взять в работу» (FOR UPDATE или аналог). |
| **Средний** | Ротация/архивация log_entries; индексы БД под частые запросы (date, route_id, contact_tg_id, created_at). |
| **Средний** | Единый источник маршрутов (constants vs bus-bot) или явная процедура синхронизации. |
| **Низкий** | Доп. тесты (price_calc, auth, get_booking); опционально — ограничить CORS в проде; документировать поведение rate limit при нескольких воркерах. |

---

## 11. Соответствие типовым требованиям

- **Бронирование:** выбор маршрута/даты, форма пассажиров (внутренние/международные), контакт, способ оплаты, создание заявки и редирект на success — реализовано.
- **Роли и доступ:** пассажир (в т.ч. без Telegram), диспетчер по маршрутам, админ — разграничены; вкладки и API защищены.
- **Оплата:** заглушка WebPay (create + callback), проверка секрета в callback — есть.
- **Уведомления:** Telegram при создании заявки и смене статуса; кнопка «Открыть заявки» при заданном WEBAPP_URL.
- **PWA и оффлайн:** manifest и service worker присутствуют; детальная проверка оффлайн-сценариев не входила в этот аудит.
- **Логирование:** приложение пишет в stdout с явным handler и flush; логи должны отображаться на Render при корректном окружении.

Аудит выполнен по состоянию репозитория на момент проверки. Рекомендации из docs/CODE_ANALYSIS_REPORT.md остаются в силе для пунктов, не отмеченных выше как «исправлено».
