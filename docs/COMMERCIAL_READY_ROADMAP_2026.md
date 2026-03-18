# Commercial-Ready Roadmap 2026

Документ фиксирует следующий этап развития `bus-webapp` как Telegram-first сервиса бронирования с тремя основными ролями:

- `Пассажир` создает и отслеживает свои заявки.
- `Диспетчер` берет заявки в работу и доводит их до завершения.
- `Администратор` управляет ролями, видит общую картину и при необходимости работает как супер-диспетчер.

Текущее правило сохраняется: backend остается единственным источником прав, статусов и аудита действий.

## Must Have

### 1. Auth hardening

- Требовать и верифицировать `Telegram initData` для всех чувствительных API в production.
- Проверять не только подпись, но и свежесть `auth_date`.
- Отсекать ситуации, когда `X-Telegram-User-Id` не совпадает с `initData.user.id`.

Статус:
- `Начато`: добавлена проверка свежести `initData` и защита от mismatch между заголовком и валидированным Telegram user id.

### 2. Full audit trail

- Логировать все чувствительные действия backoffice:
- назначение и снятие ролей;
- массовые отмены;
- архивирование;
- экспорт;
- взятие заявки диспетчером;
- переходы по статусам.

Статус:
- `В работе`: расширен audit для админских и диспетчерских действий, в деталях теперь сохраняются предыдущее/новое состояние и метаданные операции; в админке добавлен отдельный просмотр операционного аудита.

### 3. E2E role coverage

- Сценарии для `passenger`, `dispatcher`, `admin`.
- Отдельные прогоны для mobile viewport и laptop viewport.
- Проверка критичных пользовательских потоков: создание заявки, обработка заявки, экспорт, управление ролями.

Статус:
- `Не начато`.

### 4. CI/CD gate

- Автоматизировать проверки в CI:
- frontend build;
- backend tests;
- smoke checks перед deploy;
- блокировка релиза при падении обязательных проверок.

Статус:
- `Не начато`.

### 5. Observability baseline

- Подключить обязательный operational baseline:
- Sentry;
- алерты по 5xx и всплескам 4xx;
- контроль latency API и БД;
- runbook на деградации и недоступность зависимостей.

Статус:
- `Частично`: есть healthcheck, request logging, базовый structured logging, Sentry уже предусмотрен конфигом, но не оформлен как обязательный production-контур.

### 6. Privacy and data handling

- Ограничить хранение и видимость чувствительных данных.
- Уточнить retention для `passport`, `phone`, экспортов и логов.
- Проверить маскирование чувствительных полей в логах и аудитах.

Статус:
- `В работе`: включено маскирование чувствительных полей в логах/audit, добавлен admin privacy status и ручная очистка старых сохранённых паспортных данных по retention policy.

## Should Have

### 1. Operational admin dashboard

- Виджеты SLA, зависшие заявки, загрузка диспетчеров, ошибки оплат, пики нагрузки.
- Статус: частично реализовано.
- Что уже есть:
- booking operations overview в админке: новые без назначения, SLA-breach по `new/active`, pending payment, переносы, горячие маршруты, загрузка диспетчеров;
- system health, privacy/retention и operations audit уже выведены в backoffice;
- дальше логично добавить SLA-алерты, пики нагрузки и более глубокие widgets по оплатам.

### 2. Fine-grained permissions

- Перейти от грубых ролей к правам:
- просмотр логов;
- экспорт;
- управление ролями;
- архивирование;
- диспетчерский доступ по направлениям.
- Статус: частично реализовано.
- Что уже есть:
- env-админы остаются super-admin без риска сломать текущий доступ;
- для админов из `bot_roles` можно задавать ограниченный набор прав (`manage_roles`, `view_logs`, `manage_operations`, `export_data`, `manage_privacy`);
- фронтенд админки скрывает недоступные вкладки и действия, а карточки администраторов показывают effective permissions;
- для диспетчеров из БД в админке уже настраивается scope маршрутов и направление работы, что напрямую влияет на обработку новых бронирований;
- дальше добиваем SLA-алерты и более глубокую сегментацию/автоназначение.

### 3. Background jobs

- Очереди и ретраи для уведомлений, отчетов и внешних интеграций.

### 4. Resilience tests

- Негативные сценарии: недоступность БД, Redis, payment callback, Telegram auth, повторные сабмиты.

## Enterprise Later

- SLA routing / workforce management.
- staged rollout / feature flags.
- finance reconciliation.
- formal backup drills and compliance procedures.

## Implementation order

1. `Auth + audit`
2. `E2E + CI/CD`
3. `Observability`
4. `Privacy/data handling`
5. `Operational admin dashboard`
6. `Fine-grained permissions`

## Current sprint start

В работу уже взят первый блок:

1. Усиление Telegram auth (`auth_date` freshness, header/initData consistency).
2. Расширение audit trail для admin/dispatcher/booking операций.
3. Админский просмотр операционного аудита.
4. Подготовка тестов под новый security baseline.
