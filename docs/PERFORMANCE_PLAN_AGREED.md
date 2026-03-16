# План оптимизации — согласованная версия (после глубокого анализа проекта)

> **Отложено.** Сначала в работе правки UI/UX (логотип, шапка, нижняя панель, профиль, админка). К оптимизации (Vite, кэш, dashboard и т.д.) вернёмся после.

**Цель:** LCP < 800 мс, повторные открытия < 200 мс при сохранении всего визуального богатства (blur bottom-sheet, анимированные бейджи, чекмарк с draw, haptic, segmented control, role-shell, графики, QR и т.д.).

**Рекомендуемый порядок:** День 1–2 → A1 (Vite), День 3–4 → A2+A3, День 5–7 → B4+B5, дальше C и D.

---

## С чем согласен полностью

- Последовательность A → B → C → D и приоритеты.
- A1 (Vite multi-page) как первый шаг и главный прирост.
- A2 (клиентский кэш) + A3 (/api/user/dashboard) вместе на 3–4 день.
- B4 (режим интерфейса: авто / нормальный / экономный) и B5 (lazy Chart/QR), B6 (sw.js Cache First).
- Вынесение Preload, Redis-кэш, ETag, пагинацию в C; виртуализация и прочее — в D.

---

## Глубокий анализ проекта — что скорректировано

### Статика и деплой

- **Текущее состояние:** `backend/main.py` монтирует статику с **корня**: `app.mount("/", StaticFiles(directory=webapp_path, html=True))`, где `webapp_path = "../webapp"`. Приложение открывается по адресу вида `https://xxx.onrender.com/` (без `/webapp/`).
- **Вывод:** В Vite нужно использовать **`base: '/'`**, а не `base: '/webapp/'`. Иначе после деплоя все ссылки на JS/CSS будут вести на несуществующий путь.
- **Сборка и Docker:** Сейчас Dockerfile копирует `webapp/` как есть. После A1: либо (1) перед сборкой образа выполнять `npm run build` в корне и копировать содержимое `dist/` в папку, с которой работает main (например `webapp/`), либо (2) в main.py при наличии папки `dist/` отдавать статику из неё. Рекомендация: **outDir: '../dist'** (корень репозитория), после `npm run build` копировать `dist/*` в `webapp/` при сборке Docker-образа, чтобы не менять логику main.py (он по-прежнему смотрит в `../webapp`).

### Точная карта скриптов по страницам (для A1 entry-файлов)

| Страница   | Скрипты (порядок важен) |
|-----------|---------------------------|
| **index** | maintenance, api, auth, theme, i18n, settings, nav, prefetch, app-modal, consent + inline (tgCloseBtn, fromSelect/toSelect, routes fetch, applyI18nToPage) |
| **booking** | api, auth, imask (CDN), input-masks, passport-config, phone-config, date-picker, app-modal, i18n, settings, theme, consent, icons, booking |
| **profile** | maintenance, api, auth, imask (CDN), input-masks, passport-config, icons, qrcode (CDN), theme, segmented-control, app-modal, nav, prefetch, consent, profile |
| **admin**  | segmented-control, Chart.js (CDN), api, auth, app-modal, nav + **один большой inline-скрипт** (вся логика: loadStats, drawStatsCharts, loadAdminBookings, логи, роли, админы, диспетчеры). Отдельного `admin.js` в проекте **нет**. |
| **dispatcher** | api, icons, auth, app-modal, theme, nav, dispatcher |
| **success** | api, icons, auth, app-modal, i18n, settings, theme, nav + **inline** (applyI18nToPage, haptic, tgCloseBtn, booking_id, api('/api/bookings/:id'), cancelBtn) |
| **faq**    | maintenance, api, auth, i18n, settings, theme, nav, prefetch + **inline** (applyI18nToPage, fetch /api/faq, поиск по FAQ) |

Отсюда корректировки для A1:

- **admin:** Логику из inline-скрипта в `admin.html` нужно **вынести в отдельный модуль** `admin.js` (или `admin-init.js`). Entry: `admin-entry.js` импортирует api, auth, app-modal, nav, segmented-control и этот новый модуль. Chart.js — по плану B5 загружать только при первом открытии вкладки «Статистика» (см. ниже).
- **success и faq:** Небольшой inline можно оставить (инициализация после загрузки модулей) или вынести в `success.js` / `faq.js` и импортировать из `success-entry.js` / `faq-entry.js`. Для минимальных изменений при A1 допустимо оставить короткий inline, который только вызывает функции из глобальных объектов (api, applyI18nToPage и т.д.), при условии что эти объекты экспортируются/пробрасываются из entry-модулей в window.

### Роль-shell и nav.js

- В плане в profile/admin entry фигурировал `role-shell.js`. В проекте роль-шелл (вкладки Бронь | Профиль | Диспетчер | Админ) реализован в **nav.js** (заполнение `#roleShellPlaceholder`).
- **Корректировка:** Отдельный `role-shell.js` не создавать; в entry-файлах импортировать **nav.js**.

### cache.js и заголовки API (Telegram)

- Все запросы к API идут через **api()** в `webapp/js/api.js` с заголовками `X-Telegram-User-Id`, `X-Telegram-Init-Data`, `X-Telegram-Start-Param`.
- **Корректировка:** Кэш в A2 должен быть **внутри или поверх api()**, а не заменять его на голый `fetch`. Вариант: в api.js проверять кэш по ключу (url + опционально initData), при попадании — возвращать данные; при промахе — выполнять fetch с теми же заголовками, класть ответ в кэш, возвращать. Либо отдельный `cachedApi(path, ttl)` в cache.js, который внутри вызывает `api(path)` и кэширует результат. Инвалидация — как в п.6 ниже.

### QR-код: CDN vs npm

- Сейчас: **qrcode.js** с CDN (глобальный `QRCode`, `new QRCode(el, { text, width, height })`). В profile.js модалка «Подробнее» по заявке использует этот API.
- Пакет npm `qrcode` имеет другой API (toCanvas, toDataURL).
- **Корректировка:** Либо (A) динамически подгружать текущий CDN-скрипт при открытии модалки с QR; либо (B) перейти на npm `qrcode` и в модалке вызывать `QRCode.toCanvas(canvas, url, options)` / toDataURL. B удобнее после перехода на Vite (единые зависимости).

### Эндпоинт dashboard

- Роутер пользователя: **backend/api/user.py**, префикс `/api/user`. Эндпоинты: `/roles`, `/profile`, `/passengers`, `/bookings`.
- **Корректировка:** В A3 добавить в **backend/api/user.py** эндпоинт `@router.get("/dashboard")` (полный путь **GET /api/user/dashboard**), авторизация — тот же `Depends(get_verified_telegram_user_id)`. В ответе объединить: заявки пользователя, сохранённых пассажиров, профиль (phone и т.д.), при необходимости краткую сводку для блока «Поездок / Потрачено / Следующая поездка». Фронт (profile) при открытии страницы делает один вызов кэшированного `api('/api/user/dashboard')` вместо нескольких к `/api/user/bookings`, `/api/user/passengers`, `/api/user/profile`.

### Инвалидация кэша

- Добавить явно: после создания заявки (редирект на success) — инвалидировать `/api/user/bookings`, `/api/user/dashboard`; после добавления/редактирования/удаления пассажира — `/api/user/passengers`, `/api/user/dashboard`; после отмены/переноса/архивации заявки — те же ключи; после массовой отмены в админке — кэш списка заявок админки (если он будет кэшироваться в A2).

### sw.js

- Сейчас: Cache name `bus-booking-v1`, при fetch для не-API — `caches.match` затем fetch (сеть как fallback). После Vite статика будет с корня (`/`), имена файлов с хешем.
- **Корректировка B6:** Не привязываться к `/webapp/` или `/dist/` в URL. Условие Cache First для статики: запросы к тому же origin и путь не начинается с `/api/`. Либо явно: `request.url.startsWith(origin) && !request.url.includes('/api/')`. Фиксированный список `urlsToCache` в install заменить на кэширование по мере запросов (Cache First: при первом запросе к HTML/JS/CSS — fetch и положить в кэш, при повторном — отдавать из кэша), чтобы не перечислять хешированные имена. Версию кэша (CACHE_NAME) увеличивать при каждом существенном релизе.

### Админка: Chart и вкладка «Статистика» (B5)

- Сейчас в admin при загрузке сразу вызывается `loadStats('month')`, который запрашивает `/api/admin/stats` и вызывает `drawStatsCharts(data)` — то есть Chart.js используется сразу (подключён с CDN в начале страницы).
- **Корректировка B5:** Загружать Chart.js **только при первом открытии вкладки «Статистика»**: по клику на `[data-tab="statsPanel"]` один раз выполнить dynamic import `chart.js/auto`, затем вызвать loadStats и drawStatsCharts. При первой загрузке admin не вызывать loadStats — показывать пустое состояние вкладки или заглушку «Откройте вкладку Статистика». Так тяжёлая библиотека не грузится при открытии админки, если пользователь зашёл только в «Все заявки» или «Логи».

### Админка: пагинация (C)

- В backend **api/admin.py** эндпоинт `/api/admin/bookings` уже поддерживает **limit** и **offset** (по умолчанию limit=50). Во фронте (inline admin) уже есть `bookingsOffset`, `bookingsLimit`, кнопки «Назад» / «Вперёд», вызов `loadAdminBookings()` с новым offset.
- **Корректировка C:** Пункт плана «пагинация в таблице Все заявки (limit 50 + Загрузить ещё)» считать **частично выполненным**. При необходимости — добавить кнопку «Загрузить ещё» (append к списку без смены страницы) как альтернативу постраничной навигации; иначе оставить текущую реализацию.

### CSS по страницам

- **index, success, faq:** main.css, telegram-theme.css, animations.css.
- **booking:** main, telegram-theme, booking.css, date-picker.css.
- **profile:** main, telegram-theme, date-picker.css.
- **dispatcher:** main, telegram-theme, dispatcher.css.
- **admin:** main, telegram-theme, **design-system.css** (только здесь).
- При сборке Vite будет подхватывать импорты CSS из entry-файлов; страничные CSS нужно подключать в соответствующих entry (например `import '../css/booking.css'` в booking-entry.js) или оставить в HTML. Рекомендация: в entry импортировать только общие (main, telegram-theme) и страничные CSS, чтобы один бандл на страницу включал нужные стили.

### FAQ и кэш

- faq.html использует **сырой fetch** к `/api/faq?lang=...`, не через api(). Для A2: либо перевести на вызов api() и кэшировать через обёртку api, либо добавить в cache.js поддержку GET-запросов с теми же заголовками (если понадобится авторизация для FAQ в будущем). Пока FAQ публичный — можно кэшировать по ключу url; при использовании api() кэш будет единообразным.

### Backend: Redis и кэш

- **backend/services/cache.py** — это **RouteCache** (in-memory + TTL для маршрутов из БД), не Redis.
- Redis используется в **main.py** только для rate limit. В плане C «Redis-кэш на сервере» для dashboard — это **новая** функциональность: кэшировать ответ GET /api/user/dashboard в Redis с TTL (например 60 с) по ключу `dashboard:{user_id}`. Реализовать в api/user.py или в отдельном middleware/service.

---

## Итоговый чек-лист (с учётом анализа)

- **A1** — Vite: root `webapp`, **base `'/'`**, outDir `'../dist'`; rollup input — все 7 HTML; 7 entry-файлов (в т.ч. **вынести логику админки из inline в admin.js**); в каждом HTML — один `<script type="module" src="./js/...-entry.js">`; Telegram Web App скрипт оставить в HTML (вне бандла). Сборка и preview проверены; деплой: копирование dist в webapp или отдача статики из dist при сохранении текущего URL корня.
- **A2** — Кэш **внутри/поверх api()** с сохранением Telegram-заголовков; инвалидация при создании/отмене заявки, изменении пассажиров, действиях в админке; при желании — кэш для /api/faq.
- **A3** — Эндпоинт **GET /api/user/dashboard** в api/user.py; профиль переведён на один запрос и кэш.
- **B4** — Переключатель «Режим интерфейса» в настройках профиля; performance.js с авто-режимом и учётом prefers-reduced-motion; в экономном режиме — отключение blur, тяжёлых анимаций, автозагрузки Chart.
- **B5** — Chart.js загружать только при первом открытии вкладки «Статистика» в админке; QR — только при открытии модалки с QR (CDN или npm qrcode с адаптацией).
- **B6** — sw.js: Cache First для статики того же origin, не /api/; версионирование кэша; не полагаться на фиксированный список urlsToCache с именами без хешей.
- **C** — Preload для profile и booking (после сборки — реальные хеши или preload entry-chunk); Redis-кэш для /api/user/dashboard (новый слой); ETag + 304 для dashboard и при необходимости для других GET; пагинация админки уже есть — при необходимости доработать до «Загрузить ещё».
- **D** — Виртуализация списков, Web Vitals в Sentry, A/B economy-режима, TypeScript — по мере необходимости.

План скорректирован по результатам глубокого анализа и готов к реализации по шагам A1 → A2+A3 → B4+B5 → B6 → C → D.

---

## Справочно: рекомендуемый vite.config и состав entry

**vite.config.js** (в корне проекта):

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'webapp',
  base: '/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'index.html',
        booking: 'booking.html',
        profile: 'profile.html',
        admin: 'admin.html',
        dispatcher: 'dispatcher.html',
        success: 'success.html',
        faq: 'faq.html',
      },
    },
    target: 'es2020',
    minify: 'esbuild',
    cssCodeSplit: true,
  },
  server: { port: 5173, open: '/index.html' },
});
```

При `root: 'webapp'` все пути в `input` задаются относительно webapp, поэтому достаточно имён файлов: `index.html`, `booking.html` и т.д.

**Состав entry-модулей (импорты в каждом):**

- **index-entry.js:** maintenance, api, auth, theme, i18n, settings, nav, prefetch, app-modal, consent; инициализация маршрутов/формы в самом entry или в отдельном index.js.
- **booking-entry.js:** api, auth, input-masks, passport-config, phone-config, date-picker, app-modal, i18n, settings, theme, consent, icons, booking. IMask — dynamic import при первом использовании полей с маской (дата, паспорт).
- **profile-entry.js:** maintenance, api, auth, input-masks, passport-config, icons, theme, segmented-control, app-modal, nav, prefetch, consent, profile. IMask и qrcode — dynamic import при открытии модалки (паспорт/дата и QR).
- **admin-entry.js:** api, auth, app-modal, nav, segmented-control, **admin.js** (новый файл с логикой из текущего inline). Chart.js — не импортировать в entry, подгружать при первом клике на вкладку «Статистика».
- **dispatcher-entry.js:** api, icons, auth, app-modal, theme, nav, dispatcher.
- **success-entry.js:** api, icons, auth, app-modal, i18n, settings, theme, nav; логика success (booking_id, cancel, haptic) — в entry или в success.js.
- **faq-entry.js:** maintenance, api, auth, i18n, settings, theme, nav, prefetch; загрузка FAQ и поиск — в entry или faq.js.

Скрипт Telegram Web App (`https://telegram.org/js/telegram-web-app.js`) остаётся в каждом HTML тегом `<script src="...">` — в бандл не включать.
