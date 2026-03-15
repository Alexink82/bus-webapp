"""Bus Booking Web App - FastAPI entry point."""
# Самое первое: принудительно настроить root logger на stdout.
# Иначе кастомные логи (logger.info и т.д.) не попадают в консоль Render.
import logging
import os
import sys

# Sentry: инициализация до создания app. DSN задаётся в SENTRY_DSN (на Render).
if os.environ.get("SENTRY_DSN"):
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    sentry_sdk.init(
        dsn=os.environ.get("SENTRY_DSN"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.2,
        send_default_pii=os.environ.get("SENTRY_SEND_PII", "").lower() in ("1", "true"),
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
# Flush после каждой записи — иначе в Docker/Render логи буферизуются и не видны.
for h in logging.getLogger().handlers:
    if getattr(h, "stream", None) is sys.stdout:
        _orig_emit = h.emit
        def _emit_flush(record, _e=_orig_emit, _stream=h.stream):
            _e(record)
            if _stream:
                _stream.flush()
        h.emit = _emit_flush
        break

import time
import traceback
import uuid
from contextlib import asynccontextmanager
from collections import defaultdict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import JSONResponse

from config import get_settings
from database import init_db
from logging_config import setup_logging, get_logger
from api.routes import router as routes_router
from api.booking import router as booking_router
from api.user import router as user_router
from api.payment import router as payment_router
from api.dispatcher import router as dispatcher_router
from api.admin import router as admin_router
from api.websocket import router as ws_router
from api.faq import router as faq_router

setup_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uvicorn может переопределить logging после импорта модуля.
    # Повторная настройка в startup гарантирует, что логи приложения
    # (request/startup/errors) действительно уходят в stdout Render.
    setup_logging()
    await init_db()

    # Автоматические миграции Alembic (синхронный command.upgrade в потоке)
    try:
        import asyncio
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini"))
        await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
        logger.info("Alembic migrations applied successfully")
    except Exception as e:
        logger.warning("Alembic upgrade skipped: %s", e)

    try:
        from database import AsyncSessionLocal
        from services.roles import load_roles
        async with AsyncSessionLocal() as db:
            await load_roles(db)
    except Exception as e:
        logger.warning("Load roles at startup: %s", e)
    try:
        import asyncio
        from parsers.scheduler import start_scheduler, _update_cache
        start_scheduler()
        asyncio.create_task(_update_cache())
    except Exception as e:
        logger.warning("Scheduler or startup cache update failed: %s", e)
    logger.info("Bus Booking API startup complete")
    print("Bus Booking API startup complete", file=sys.stdout, flush=True)
    yield
    try:
        from parsers.scheduler import shutdown_scheduler
        shutdown_scheduler()
    except Exception:
        pass


app = FastAPI(
    title="Bus Booking API",
    description="API for bus ticket booking web app",
    version="1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limit: in-memory fallback или Redis (если задан REDIS_URL)
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_WINDOW = 60.0
_redis_client = None

# GET-запросы к этим путям не считаются в лимите (чтение, много параллельных при загрузке)
_RATE_LIMIT_SKIP_PATHS = frozenset(["/api/routes", "/api/news", "/api/faq", "/api/user/roles", "/api/health"])


def _get_redis():
    """Ленивое подключение к Redis (один раз при первом запросе)."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    url = (get_settings().redis_url or "").strip()
    if not url:
        return None
    try:
        from redis.asyncio import Redis
        _redis_client = Redis.from_url(url, decode_responses=True)
        return _redis_client
    except Exception:
        logger.warning("Redis connection failed, rate limit uses in-memory store")
        _redis_client = False  # mark as attempted
        return None


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Лимит запросов в минуту на IP (только /api/). При REDIS_URL — общий лимит для всех воркеров."""
    path = request.url.path
    if not path.startswith("/api/") or get_settings().rate_limit <= 0:
        return await call_next(request)
    if request.method in ("GET", "HEAD") and path in _RATE_LIMIT_SKIP_PATHS:
        return await call_next(request)
    client = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or (request.client.host if request.client else "0.0.0.0")
    limit = get_settings().rate_limit

    redis = _get_redis()
    if redis:
        try:
            key = f"rl:{client}"
            n = await redis.incr(key)
            if n == 1:
                await redis.expire(key, int(RATE_WINDOW) + 1)
            if n > limit:
                return JSONResponse(status_code=429, content={"detail": "too_many_requests"})
        except Exception:
            redis = None
    if not redis:
        now = time.monotonic()
        _rate_limit_store[client] = [t for t in _rate_limit_store[client] if now - t < RATE_WINDOW]
        if len(_rate_limit_store[client]) >= limit:
            return JSONResponse(status_code=429, content={"detail": "too_many_requests"})
        _rate_limit_store[client].append(now)
    return await call_next(request)


@app.middleware("http")
async def log_requests_and_errors(request: Request, call_next):
    """Логируем каждый API-запрос с request_id, статусом и длительностью."""
    path = request.url.path
    request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
    fwd_for = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    client_ip = fwd_for or (request.client.host if request.client else "")
    started = time.perf_counter()
    if path.startswith("/api/"):
        msg_start = "API start id=%s %s %s | client=%s" % (request_id, request.method, path, client_ip)
        logger.info(msg_start)
        print(msg_start, file=sys.stdout, flush=True)
    try:
        response = await call_next(request)
        if path.startswith("/api/"):
            elapsed_ms = (time.perf_counter() - started) * 1000
            response.headers["X-Request-Id"] = request_id
            log_fn = logger.warning if response.status_code >= 400 else logger.info
            msg_done = "API done id=%s %s %s -> %s | %.1fms" % (request_id, request.method, path, response.status_code, elapsed_ms)
            log_fn(msg_done)
            print(msg_done, file=sys.stdout, flush=True)
        return response
    except Exception as e:
        tb = traceback.format_exc()
        elapsed_ms = (time.perf_counter() - started) * 1000
        msg_err = "API error id=%s %s %s | client=%s | %.1fms | %s" % (request_id, request.method, path, client_ip, elapsed_ms, e)
        logger.error(msg_err + " | traceback:\n%s", tb)
        print(msg_err, file=sys.stdout, flush=True)
        raise

app.include_router(routes_router)
app.include_router(booking_router)
app.include_router(user_router)
app.include_router(payment_router)
app.include_router(dispatcher_router)
app.include_router(admin_router)
app.include_router(ws_router)
app.include_router(faq_router)


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health():
    """Статус сервиса. При MAINTENANCE_UNTIL — режим техработ. При заданной БД — проверка доступности (503 при недоступности)."""
    import os
    from datetime import datetime, timezone
    from sqlalchemy import text

    until_raw = (os.environ.get("MAINTENANCE_UNTIL") or "").strip()
    if until_raw:
        try:
            if until_raw.endswith("Z"):
                until = datetime.fromisoformat(until_raw.replace("Z", "+00:00"))
            else:
                until = datetime.fromisoformat(until_raw)
                if until.tzinfo is None:
                    until = until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < until:
                return {
                    "status": "maintenance",
                    "maintenance": True,
                    "maintenance_until": until.isoformat(),
                }
        except ValueError:
            pass

    payload = {"status": "ok", "maintenance": False}
    # Опционально: при HEALTH_CHECK_DB=1 и заданной БД — пинг БД; при недоступности 503 (для мониторинга).
    if os.environ.get("HEALTH_CHECK_DB", "").strip() in ("1", "true", "yes") and get_settings().database_url:
        try:
            from database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            payload["db"] = "ok"
        except Exception:
            logger.warning("Health check: DB unreachable", exc_info=True)
            return JSONResponse(
                status_code=503,
                content={"status": "degraded", "maintenance": False, "db": "unavailable"},
            )
    return payload

# Mount static webapp (HTML/CSS/JS) — после всех API-маршрутов, иначе /api/health отдаёт статика
webapp_path = os.path.join(os.path.dirname(__file__), "..", "webapp")
if os.path.isdir(webapp_path):
    app.mount("/", StaticFiles(directory=webapp_path, html=True), name="webapp")


