# Render: диагностика логов приложения

Краткое руководство, если в Render не видно логов FastAPI-приложения (а видны только platform/uvicorn строки).

## Что уже сделано в коде

В `backend/logging_config.py` логирование настраивается через:

- `logging.basicConfig(..., stream=sys.stdout, force=True)` — принудительно перезаписывает handlers, даже если uvicorn настроил их раньше;
- единый формат логов `%(asctime)s | %(levelname)s | %(name)s | %(message)s`;
- для `uvicorn`, `uvicorn.error`, `uvicorn.access` очищаются handlers и включается `propagate=True`, чтобы их поток шёл в root logger;
- после каждой записи выполняется flush stdout, чтобы логи сразу попадали в Render Logs.
- В `backend/main.py` каждый API-ответ получает заголовок `X-Request-Id`, а в логах печатаются пары `API start id=...` / `API done id=...` с временем выполнения.

Это поведение покрыто тестами `backend/tests/test_logging_config.py`.

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
   - Должны появиться строки вида:
     - `Bus Booking API startup complete`
     - `API start id=... GET /api/health | client=...`
     - `API done id=... GET /api/health -> 200 | ...ms`
     - `API error id=... ... traceback: ...` при исключениях

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
