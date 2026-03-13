# Чек-лист: что реализовано и что осталось сделать

Дата: 2026-03-10. По результатам анализа проекта и всех рекомендаций из docs (CODE_ANALYSIS_REPORT, ROLE_LOGIC_BENCHMARK, PRODUCT_UX_RESTRUCTURE_PLAN, FULL_PROJECT_AUDIT_2026, PRODUCTION_READINESS, AUDIT_CHATGPT, UI_IMPROVEMENTS_PLAN, FULL_ANALYSIS_PASSENGER_ADMIN_DISPATCHER_DEV).

---

## Уже реализовано (проверено в коде)

| # | Рекомендация | Где |
|---|----------------|-----|
| 1 | UserProfile создаётся перед добавлением SavedPassenger | `backend/api/user.py` (add_passenger) |
| 2 | Расчёт цены сегмента: кумулятивные offset, полный маршрут = base_price | `booking.py` (_route_dict_for_calc), `price_calc.py` |
| 3 | Убран лишний db.commit в payment, user, booking, admin | Эндпоинты полагаются на get_db |
| 4 | Сумма платежа только из Booking.price_total | `backend/api/payment.py` (create_payment) |
| 5 | Диспетчер видит заявки только по своим маршрутам (GET booking) | `backend/api/booking.py` (get_booking, dispatcher_can_view) |
| 6 | WebSocket: рассылка по маршрутам диспетчера | `backend/api/websocket.py` (dispatcher_routes, broadcast_new_booking) |
| 7 | Таймаут 15 с на fetch /api/routes + блок ошибки | `webapp/js/booking.js` (AbortController) |
| 8 | Cache-busting ?v= на index, success, dispatcher, admin, booking | Все HTML |
| 9 | Кнопка «Назад» на success → index.html (не history.back) | `webapp/success.html` |
| 10 | Степпер: отдельный соединитель, линия не наезжает на «Пассажиры» | `booking.html`, `booking.css` |
| 11 | Логирование: stdout + flush для Render | `logging_config.py`, `main.py` |
| 12 | Проверка `typeof t === 'function'` перед вызовом t() | success.html, profile.js, nav.js, faq.html |
| 13 | GET /api/user/roles + вкладки Админ/Диспетчер в nav | `backend/api/user.py`, `webapp/js/nav.js` |
| 14 | Повтор при IntegrityError в create_booking (новый id с суффиксом) | `backend/api/booking.py` |
| 15 | _resolve_departure_time, _ensure_not_departed, stop_times для маршрутов | `booking.py`, `constants.py` |
| 16 | Редактирование/удаление пассажиров в профиле, «Подставить из профиля» с выбором | profile.js, booking.js |
| 17 | Кнопка «Отмена» в модалках — нейтральный стиль (btn-secondary) | app-modal.js |
| 18 | UI: tap-target 44px, focus-visible, границы карточек | main.css, dispatcher.css, UI_STYLE_SYSTEM_AUDIT.md |

---

## Что ещё нужно сделать (по приоритету)

### Высокий приоритет — выполнено

| # | Задача | Статус |
|---|--------|--------|
| 1 | Блокировка при «Взять в работу» (гонка двух диспетчеров) | Реализовано: `take_booking` с `.with_for_update()`. |
| 2 | WebSocket: при закрытии с кодом 4003 не реконнектить | Реализовано: в `dispatcher.js` при `event.code === 4003` показ alert и отмена reconnect. |

### Средний приоритет — выполнено

| # | Задача | Статус |
|---|--------|--------|
| 3 | Подсказка при неполной ссылке на бронирование | Реализовано: редирект на `index.html?error=invalid_booking_link`, на index показ сообщения и очистка URL. |
| 4 | Админка: использовать общий window.api из api.js | Реализовано: в admin.html используется `window.api`, экспорт CSV — отдельный fetch с заголовками. |
| 5 | CreateBookingIn: явный extra='ignore' | Реализовано: `model_config = ConfigDict(extra="ignore")`. |
| 6 | nav.js: проверка faqTab | Уже было: `if (!faqTab) return;`. |
| 7 | Диспетчер: кнопка «Отменить заявку» с причиной | Реализовано: кнопка «Отменить» в «В работе», prompt для причины, SetStatusIn.reason, сохранение в cancel_reason. |

### Низкий приоритет (улучшения и документирование)

| # | Задача | Источник | Детали |
|---|--------|----------|--------|
| 8 | Ротация/архивация log_entries | CODE_ANALYSIS, FULL_PROJECT_AUDIT | Периодическая задача (cron/воркер) удалять или архивировать записи старше N дней; либо писать логи только в файл/внешний сервис, в БД — последние N записей. |
| 9 | Документировать rate limit при нескольких воркерах | CODE_ANALYSIS | В README или docs указать: in-memory rate limit умножается на число воркеров; для строгого лимита — Redis. |
| 10 | Документировать кэш ролей после add_admin | CODE_ANALYSIS | После добавления админа новый админ должен обновить страницу; при нескольких воркерах — перезапуск для распространения ролей. Добавить в README. |
| 11 | Индексы БД для частых запросов | CODE_ANALYSIS | Проверить миграции: индексы на Booking (date, route_id, contact_tg_id, created_at), LogEntry.timestamp, SavedPassenger.user_id. При необходимости добавить миграции. |
| 12 | CORS в проде (опционально) | Несколько доков | Задать ALLOWED_ORIGINS (домен webapp + web.telegram.org и т.п.) вместо "*". |

### P0 из ROLE_LOGIC_BENCHMARK / PRODUCT_UX (новый функционал)

| # | Задача | Детали |
|---|--------|--------|
| 13 | SLA-панель диспетчера | Вкладка/блок «Просроченные > 15 мин» рядом с «Новые». |
| 14 | Блок «Моя активная заявка» на главной/профиле | Карточка с текущей заявкой (номер, статус, «что дальше»). |
| 15 | Админ: audit log ролей | Кто, когда назначил/снял права (admins/dispatchers). |
| 16 | Расширенные фильтры диспетчера | По маршруту, дате, статусу оплаты. |

### P1 (следующий спринт)

| # | Задача | Детали |
|---|--------|--------|
| 17 | Role-shell / единая навигация | Единый верхний слой с ролью и быстрым переходом между контурами (пассажир/диспетчер/админ). |
| 18 | Единый feedback pattern | Toast/alerts/status в одном стиле по всему приложению. |
| 19 | Параметризованные тесты access-control | API-тесты: владелец/диспетчер/админ/чужой для get_booking, cancel, и т.д. |
| 20 | KPI-переключатель периодов в админке | День/неделя/месяц в одном экране. |

### P2 и прочее (по желанию)

| # | Задача | Детали |
|---|--------|--------|
| 21 | Быстрые пресеты дат (Сегодня / Завтра / Выходные) | На форме поиска. |
| 22 | Память последнего маршрута + one-tap повтор | На главной. |
| 23 | FAQ для BE: question_be/answer_be или документировать | Явно указать, что для lang=be показывается en. |
| 24 | UI_IMPROVEMENTS: логотип в шапке, кнопка закрытия только вне Telegram, safe area для tab-bar | По docs/UI_IMPROVEMENTS_PLAN.md. |
| 25 | Health-check с проверкой БД | В /api/health опционально проверять доступность БД. |
| 26 | Идемпотентность create_booking | Idempotency-Key при сетевых ретраях. |

---

## Краткая сводка

- **Сделано:** критические исправления (профиль, цена, оплата, доступ диспетчера, WebSocket по маршрутам), таймауты, cache-busting, логи, UI профиля и модалок, повтор при IntegrityError, время отправления по остановкам.
- **Сделать в первую очередь:** блокировка «Взять в работу» (FOR UPDATE), обработка 4003 в WebSocket на клиенте.
- **Далее:** подсказка invalid_booking_link, админка на общем api(), явный extra в CreateBookingIn, отмена заявки диспетчером с причиной, документирование rate limit и кэша ролей, индексы БД.
- **Новый функционал (по планам):** SLA-панель, «Моя активная заявка», audit log ролей, расширенные фильтры диспетчера, затем P1/P2 из планов.
