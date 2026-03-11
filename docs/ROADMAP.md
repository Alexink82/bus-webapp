# Дальнейшее развитие (Roadmap)

Краткий список идей для следующих итераций. Текущее состояние — см. [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) и [ANALYSIS.md](ANALYSIS.md).

## Безопасность и прод

- **CORS**: сузить `allow_origins` до домена веб-приложения и Telegram Web App origin (сейчас `["*"]`).
- **README**: в отдельном разделе описать, как проверяются админ (ADMIN_IDS + bot_roles), диспетчер (dispatchers + bot_roles), пассажир (X-Telegram-Init-Data при заданном BOT_TOKEN).

## Надёжность

- **Idempotency при бронировании**: ключ от (маршрут + дата + время + телефон + user_id), отклонение дубликата за N минут; на фронте — disable кнопки после первого клика (частично уже есть).
- **Реальный WebPay**: проверка подписи в callback (сейчас при заданном WEBPAY_CALLBACK_SECRET проверяется body.secret).

## Функциональность

- **Админка**: UI для архивации (POST /api/admin/archive) и управления диспетчерами (GET/POST /api/admin/dispatchers) — API уже есть.
- **Кэш маршрутов**: при переходе на API маршрутов подключить `services/cache.py` и таблицу/источник маршрутов.

## Дизайн

- **DESIGN_GUIDELINES.md**: использовать для обновления `webapp/css/main.css`, логотипа, PWA-иконок, экрана загрузки при необходимости.
