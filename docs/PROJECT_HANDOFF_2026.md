# Project Handoff 2026

Краткий общий файл по текущему состоянию `bus-webapp`: что уже доведено до рабочего состояния, что важно для эксплуатации прямо сейчас и что разумно оставить на следующий этап.

## Что уже сделано

- Усилен Telegram auth:
  - проверка свежести `initData.auth_date`;
  - защита от mismatch между `X-Telegram-User-Id` и `initData.user.id`.
- Расширен audit trail:
  - роли, массовые отмены, архивирование, экспорт;
  - действия диспетчера по заявкам;
  - privacy-операции;
  - изменение scope диспетчеров.
- Админка приведена в более рабочее состояние:
  - прямоугольная боковая панель;
  - desktop/laptop collapse для admin/dispatcher;
  - отдельные блоки `Operations audit`, `System health`, `Privacy & Retention`, `Booking operations`.
- Введены fine-grained permissions для админов из БД:
  - `manage_roles`;
  - `view_logs`;
  - `manage_operations`;
  - `export_data`;
  - `manage_privacy`.
- `env`-админы (`ADMIN_ID` / `ADMIN_IDS`) остаются super-admin и не ломаются от новой permission-модели.
- Администратор может работать как super-dispatcher:
  - видеть dispatcher bookings/stats/export;
  - фильтровать по конкретному диспетчеру.
- Для диспетчеров из БД в админке уже можно задавать:
  - имя и телефон;
  - направление/заметку;
  - scope маршрутов.
- Добавлен booking operations overview:
  - новые без назначения;
  - SLA breach для `new` и `active`;
  - pending payment;
  - reschedule requests;
  - горячие маршруты;
  - загрузка диспетчеров;
  - operational alerts.
- Privacy baseline уже частично закрыт:
  - маскирование чувствительных данных в логах;
  - privacy status в админке;
  - ручная очистка старых паспортных данных по retention policy.
- Frontend pipeline стабилизирован:
  - `webapp/` как source;
  - `dist/` как build output;
  - backend/dist-first схема выдачи фронта.
- Для backoffice добавлен browser/PWA режим:
  - Telegram -> browser handoff ticket;
  - server-side browser-session;
  - logout / logout-all;
  - session list;
  - безопасный возврат на login-screen при истечении session;
  - быстрый desktop quickstart для установки как приложения на ноутбуке.
- Есть smoke E2E и backend regression coverage для ключевых ролей и booking flow.

## Что важно для работоспособности сейчас

- Перед деплоем нового permission-слоя нужно применить миграцию:
  - `backend/alembic/versions/006_bot_role_permissions.py`
- Перед деплоем browser backoffice нужно применить миграцию:
  - `backend/alembic/versions/007_browser_backoffice_auth.py`
- После фронтовых изменений нужно публиковать свежий `dist/`.
- Для production обязательно проверить реальные env:
  - `ADMIN_ID` / `ADMIN_IDS`
  - `DISPATCHER_ID` / `DISPATCHER_IDS`
  - `BOT_TOKEN`
  - `DATABASE_URL`
  - `WEBPAY_CALLBACK_SECRET`
  - `REDIS_URL` при использовании Redis
  - `BROWSER_LOGIN_TICKET_TTL_SECONDS`
  - `BROWSER_SESSION_TTL_HOURS`
  - `BROWSER_SESSION_IDLE_REFRESH_MINUTES`
  - `BROWSER_SESSION_COOKIE_NAME`
- Логика авто-распределения заявок специально НЕ внедрялась на этом этапе.

## Что протестировано

- Backend:
  - `pytest` по security/access/audit/roles/telegram auth.
- Frontend:
  - сборка через `npm run build`;
  - smoke E2E:
    - admin;
    - dispatcher;
    - booking flow.

## Что делать дальше

- Подключить production-grade alerts вне UI:
  - Sentry;
  - уведомления по 5xx / degraded health / DB/Redis issues.
- Довести CI/CD gate до обязательного релизного барьера.
- Добавить более полное E2E покрытие:
  - mobile viewport;
  - реальные негативные сценарии;
  - платежные ветки.
- Усилить observability:
  - latency API/DB;
  - всплески 4xx/5xx;
  - runbook на деградации.
- Вернуться к дальнейшей логике работы диспетчерской только после утверждения бизнес-правил.

## Что пока НЕ делаем

- Автоматическое перераспределение заявок.
- Сложную workforce-логику.
- Enterprise-функции уровня SLA routing / finance reconciliation / staged rollout.

## Полезные команды

```bash
python -m pytest backend/tests/test_api.py backend/tests/test_roles.py backend/tests/test_telegram_auth.py -q
npm run build
npm run test:e2e
```

## Где смотреть в первую очередь

- `backend/api/admin.py`
- `backend/api/dispatcher.py`
- `backend/services/roles.py`
- `webapp/js/admin.js`
- `webapp/js/dispatcher.js`
- `webapp/js/booking.js`
- `docs/COMMERCIAL_READY_ROADMAP_2026.md`
- `docs/BACKOFFICE_BROWSER_AUTH_ROLLOUT.md`
- `docs/BACKOFFICE_DESKTOP_QUICKSTART.md`
- `docs/SESSION_CONTEXT.md`
