# Перенос проекта на GitHub и автодеплой на Render (план Б)

Пошаговая инструкция: новый репозиторий только для Bus Booking Webapp, старый бот (bus-bot) не трогаем. Деплой на Render с автоматическим обновлением при push в GitHub.

---

## Часть 1. Новый репозиторий на GitHub

### Шаг 1.1. Создать репозиторий на GitHub

1. Зайдите на [github.com](https://github.com), откройте **Your repositories** → **New**.
2. Укажите:
   - **Repository name:** например `bus-booking-webapp` (или `bot-pogoda-booking`).
   - **Visibility:** Private или Public — по желанию.
   - **НЕ** ставьте галочки «Add a README», «Add .gitignore», «Choose a license» — репозиторий должен быть пустым.
3. Нажмите **Create repository**.

После создания GitHub покажет страницу с подсказками. **URL репозитория** будет вида:  
`https://github.com/YOUR_USERNAME/bus-booking-webapp.git`  
— он понадобится ниже (подставьте свой логин и имя репо).

---

### Шаг 1.2. Подключить новый репозиторий и отправить код

Все команды выполнять **в папке проекта** `bus-booking-webapp` (там, где лежат `backend/`, `webapp/`, `Dockerfile`, `render.yaml`).

**В терминале (PowerShell):**

```powershell
cd d:\d\bot_pogoda\bus-booking-webapp
```

1. **Проверить, что нет старого remote (или заменить его на новый):**

```powershell
git remote -v
```

Если там уже есть `origin` на старый бот — удалите его и добавьте новый:

```powershell
git remote remove origin
```

2. **Добавить новый GitHub-репозиторий как `origin`**  
   Замените `YOUR_USERNAME` и `bus-booking-webapp` на свои:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/bus-booking-webapp.git
```

3. **Закоммитить все текущие изменения** (если ещё не закоммичено):

```powershell
git add -A
git status
git commit -m "Add Dockerfile, render.yaml, .dockerignore for Render deploy"
```

(Если `git status` показывает только уже закоммиченные файлы — этот шаг можно пропустить.)

4. **Отправить ветку `main` на GitHub:**

```powershell
git push -u origin main
```

Если GitHub предложил создать репо с веткой `master`, а у вас локально `main`, то либо переименуйте локально:  
`git branch -M main`  
и снова `git push -u origin main`, либо при первом push используйте:  
`git push -u origin main:master` (если репо на GitHub с веткой `master`).

После этого весь код Bus Booking Webapp будет в новом репозитории на GitHub.

---

## Часть 2. Настройка Render для автодеплоя

### Шаг 2.1. Подключить GitHub к Render

1. Зайдите на [dashboard.render.com](https://dashboard.render.com).
2. Войдите через **GitHub** (если ещё не привязан — разрешите доступ Render к вашим репозиториям).
3. В дашборде нажмите **New** → **Web Service**.

### Шаг 2.2. Выбрать репозиторий

1. В списке репозиториев выберите **bus-booking-webapp** (тот, что только что создали).
2. Нажмите **Connect**.

### Шаг 2.3. Настройки сервиса

Render может подхватить настройки из `render.yaml` (Blueprint). Если при создании сервиса спрашивают:

- **Build type:** Docker (или «Docker» в списке).
- **Dockerfile path:** `Dockerfile` (корень репо).
- **Root Directory:** оставить пустым (корень репо).

Либо создайте сервис вручную:

- **Name:** `bus-booking-webapp`.
- **Region:** выберите ближайший.
- **Branch:** `main`.
- **Runtime:** **Docker**.
- **Dockerfile path:** `Dockerfile` (относительно корня репо).
- **Instance type:** Free (или платный при необходимости).

### Шаг 2.4. Переменные окружения (Environment)

В разделе **Environment** добавьте переменные (значения — свои, без коммита в репо):

| Key              | Описание |
|------------------|----------|
| `BOT_TOKEN`      | Токен бота от @BotFather |
| `CHANNEL_ID`     | Канал (например `@bus_news` или `-100...`) |
| `ADMIN_IDS`      | ID админов через запятую |
| `DISPATCHER_IDS` | ID диспетчеров через запятую |
| `DATABASE_URL`   | Строка подключения PostgreSQL (см. ниже) |
| `WEBAPP_URL`     | Публичный HTTPS-URL этого сервиса на Render (например `https://bus-booking-webapp.onrender.com`) |
| `BACKEND_URL`    | То же значение, что и `WEBAPP_URL` |
| `WEBPAY_CALLBACK_SECRET` | Секрет для WebPay (в проде) |
| `DEBUG`          | `false` |
| `RATE_LIMIT`     | `60` (или по желанию) |

**База данных:**  
В Render: **Dashboard** → **New** → **PostgreSQL**. Создайте БД, в настройках сервиса скопируйте **Internal Database URL** (или External, если подключаетесь снаружи) и вставьте в `DATABASE_URL` у Web Service.

### Шаг 2.5. Автодеплой

- В настройках сервиса включите **Auto-Deploy**: **Yes** (обычно по умолчанию).
- Тогда при каждом **push в ветку `main`** Render будет собирать образ из Dockerfile и перезапускать сервис.

### Шаг 2.6. Первый деплой и миграции

1. Нажмите **Create Web Service** (или **Save**).
2. Дождитесь первой сборки и запуска.
3. После запуска нужно один раз применить миграции/схему БД. Варианты:
   - **Локально:** в `.env` указать `DATABASE_URL` от Render (External URL) и выполнить `python backend/seed_db.py` или свои миграции.
   - **Render Shell:** в дашборде сервиса → **Shell** и в контейнере выполнить команду инициализации БД (если добавите такую команду в проект).

После этого приложение должно открываться по ссылке вида `https://bus-booking-webapp.onrender.com`.

---

## Краткий чек-лист

- [ ] Создан пустой репозиторий на GitHub.
- [ ] В папке `bus-booking-webapp`: `git remote add origin https://github.com/.../bus-booking-webapp.git` (или заменён старый `origin`).
- [ ] Выполнен `git push -u origin main`.
- [ ] В Render создан Web Service с репозиторием `bus-booking-webapp`, сборка — Docker.
- [ ] Заданы переменные окружения (BOT_TOKEN, DATABASE_URL, WEBAPP_URL и т.д.).
- [ ] Создана PostgreSQL в Render, строка подключения подставлена в `DATABASE_URL`.
- [ ] Включён Auto-Deploy на ветку `main`.
- [ ] Выполнена первичная инициализация БД (seed/migrate).

Дальше: любой push в `main` будет автоматически разворачиваться на Render.
