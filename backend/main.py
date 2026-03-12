"""Bus Booking Web App - FastAPI entry point."""
import os
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
        from parsers.scheduler import start_scheduler, _update_cache
        start_scheduler()
        await _update_cache()
    except Exception as e:
        logger.warning("Scheduler or startup cache update failed: %s", e)
    logger.info("Bus Booking API startup complete")
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

# In-memory rate limit: ip -> list of request timestamps (last 60 sec)
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_WINDOW = 60.0

# GET-запросы к этим путям не считаются в лимите (чтение, много параллельных при загрузке)
_RATE_LIMIT_SKIP_PATHS = frozenset(["/api/routes", "/api/news", "/api/faq", "/api/user/roles", "/api/health"])


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Лимит запросов в минуту на IP (только /api/). Часть read-only GET не учитывается."""
    path = request.url.path
    if not path.startswith("/api/") or get_settings().rate_limit <= 0:
        return await call_next(request)
    if request.method in ("GET", "HEAD") and path in _RATE_LIMIT_SKIP_PATHS:
        return await call_next(request)
    client = request.client.host if request.client else "0.0.0.0"
    now = time.monotonic()
    # удалить старые
    _rate_limit_store[client] = [t for t in _rate_limit_store[client] if now - t < RATE_WINDOW]
    if len(_rate_limit_store[client]) >= get_settings().rate_limit:
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
        logger.info(
            "API start id=%s %s %s | client=%s | query=%s",
            request_id,
            request.method,
            path,
            client_ip,
            request.url.query or "-",
        )
    try:
        response = await call_next(request)
        if path.startswith("/api/"):
            elapsed_ms = (time.perf_counter() - started) * 1000
            response.headers["X-Request-Id"] = request_id
            log_fn = logger.warning if response.status_code >= 400 else logger.info
            log_fn(
                "API done id=%s %s %s -> %s | %.1fms",
                request_id,
                request.method,
                path,
                response.status_code,
                elapsed_ms,
            )
        return response
    except Exception as e:
        tb = traceback.format_exc()
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.error(
            "API error id=%s %s %s | client=%s | %.1fms | %s | traceback:\n%s",
            request_id,
            request.method,
            path,
            client_ip,
            elapsed_ms,
            e,
            tb,
        )
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
    """Статус сервиса + простая проверка БД и режима техработ."""
    import os
    from datetime import datetime, timezone
    from sqlalchemy import text
    from database import AsyncSessionLocal

    db_ok = True
    try:
      async with AsyncSessionLocal() as db:
          await db.execute(text("SELECT 1"))
    except Exception:
      db_ok = False

    until_raw = (os.environ.get("MAINTENANCE_UNTIL") or "").strip()
    if not until_raw:
        return {"status": "ok", "maintenance": False, "db": db_ok}
    try:
        if until_raw.endswith("Z"):
            until = datetime.fromisoformat(until_raw.replace("Z", "+00:00"))
        else:
            until = datetime.fromisoformat(until_raw)
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
    except ValueError:
        return {"status": "ok", "maintenance": False, "db": db_ok}
    now = datetime.now(timezone.utc)
    if now < until:
        return {
            "status": "maintenance",
            "maintenance": True,
            "maintenance_until": until.isoformat(),
            "db": db_ok,
        }
    return {"status": "ok", "maintenance": False, "db": db_ok}

# Mount static webapp (HTML/CSS/JS) — после всех API-маршрутов, иначе /api/health отдаёт статика
webapp_path = os.path.join(os.path.dirname(__file__), "..", "webapp")
if os.path.isdir(webapp_path):
    app.mount("/", StaticFiles(directory=webapp_path, html=True), name="webapp")


