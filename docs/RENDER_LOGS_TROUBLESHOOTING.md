# Render: диагностика логов приложения

Краткое руководство, если в Render не видно логов FastAPI-приложения (а видны только platform/uvicorn строки).

## Почему логи могли пропасть после перехода на uvicorn / Docker

При запуске через **uvicorn в Docker** порядок такой:

1. Контейнер стартует, выполняется `uvicorn main:app ...`.
2. Uvicorn первым делом настраивает свои логгеры (`uvicorn`, `uvicorn.error`, `uvicorn.access`) и по умолчанию выводит только их (access и свои ошибки).
3. Логгеры приложения (`logging.getLogger(__name__)` в main и др.) к root по умолчанию не привязаны к одному и тому же выводу в консоль, либо root уже переопределён uvicorn’ом.
4. Render показывает только **stdout/stderr** процесса. Если вывод идёт только через `logger.info()`, а у root нет подходящего handler’а в этот момент, в логах Render ничего не видно.

Раньше (без Docker или с другой командой запуска) процесс мог подниматься иначе, и логи приложения попадали в консоль. После перехода на uvicorn в Docker это перестало работать без дополнительной настройки.

## Что сделано в коде сейчас (три уровня)

1. **В самом начале `backend/main.py`** (до импорта FastAPI и остального):
   - `logging.basicConfig(level=logging.INFO, handlers=[StreamHandler(sys.stdout)], force=True)` — принудительно вешаем вывод в stdout на root logger до того, как что‑то ещё успеет его изменить;
   - для этого handler’а добавлен flush после каждой записи, чтобы буфер не задерживал логи в Render.

2. **В `backend/logging_config.py`** (вызов `setup_logging()` при импорте и в lifespan):
   - повторная настройка формата и уровня;
   - у логгеров `uvicorn`, `uvicorn.error`, `uvicorn.access` очищаются свои handlers и включается `propagate=True`, чтобы их записи тоже шли в root и в stdout.

3. **Гарантированный вывод в stdout** (на случай если logging в Render всё ещё не виден):
   - в `main.py` для ключевых событий добавлен **`print(..., file=sys.stdout, flush=True)`**:
     - при старте: `Bus Booking API startup complete`;
     - для каждого запроса к `/api/`: `API start id=...` и `API done id=...`;
     - при ошибке: `API error id=...`.
   - Render всегда показывает stdout процесса, поэтому эти строки должны быть видны в Logs.

В `backend/main.py` каждый API-ответ по-прежнему получает заголовок `X-Request-Id`; в логах (и в print) печатаются пары `API start id=...` / `API done id=...` с временем выполнения.

Поведение logging-настройки покрыто тестами `backend/tests/test_logging_config.py`.

## Что проверить в Render

1. **Runtime и образ**
   - Используется Docker-образ проекта;
   - в `Dockerfile` задан `PYTHONUNBUFFERED=1`.

2. **Команда запуска**
   - сервис запускается через `uvicorn main:app --host 0.0.0.0 --port $PORT` (или эквивалент);
   - root директория/рабочая директория соответствует `backend/`.

3. **Environment**
   - `DEBUG=true` (временно, для расширенного вывода);
   - корректные `DATABASE_URL`, `BOT_TOKEN` (если используется initData), `WEBAPP_URL`.

4. **Проверка после деплоя**
   - Открыть Render → Service → **Logs**;
   - Должны появиться строки (они дублируются через `logger` и через `print`, чтобы гарантированно попасть в Render):
     - `Bus Booking API startup complete`
     - `API start id=... GET /api/health | client=...`
     - `API done id=... GET /api/health -> 200 | ...ms`
     - `API error id=... ...` при исключениях
   - Если видите только системные сообщения uvicorn, но не эти строки — проверьте, что деплой идёт из последнего коммита (где в main.py добавлены вызовы `print(..., flush=True)`).

## Быстрый smoke-план

1. Открыть `GET /api/health`.
2. Открыть `GET /api/routes`.
3. Сделать заведомо невалидный запрос на создание брони (получить 400/422).

После этого в логах должны быть как минимум записи request/response из middleware.
Для любой проблемной операции копируйте `X-Request-Id` из ответа и ищите этот id в Render Logs — это самый быстрый путь к причине.

## Если логов всё ещё нет

1. Проверьте, что деплой действительно собран из последнего коммита (Manual Deploy latest commit).
2. Проверьте, что не запущен другой сервис/репозиторий (частая причина на Render).
3. Убедитесь, что запросы приходят в это приложение (домен/WEBAPP_URL совпадает).
4. Временно поставьте `DEBUG=true` и повторите smoke-план.
5. Сравните время запроса и таймстемпы в Logs (timezone может отличаться).

## Команды локальной проверки (перед деплоем)

```bash
cd backend
pytest -q
uvicorn main:app --host 0.0.0.0 --port 8000
```

В локальной консоли должны быть видны те же строки логов, что ожидаются на Render.
