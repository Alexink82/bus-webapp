"""Database connection and session management."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from config import get_settings
from models import Base

_settings = get_settings()

# Render PostgreSQL uses postgres://, SQLAlchemy async needs postgresql+asyncpg://
_db_url = _settings.database_url
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    _db_url,
    echo=_settings.debug,
    poolclass=NullPool if _settings.debug else None,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db():
    """Dependency for FastAPI: yield async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


_BOOKINGS_CREATE = """
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    created_at TEXT,
    route_id TEXT,
    from_city TEXT,
    to_city TEXT,
    date TEXT,
    departure TEXT,
    arrival TEXT,
    passengers JSONB,
    contact_phone TEXT,
    contact_tg_id BIGINT,
    contact_username TEXT,
    price_total REAL,
    payment_method TEXT,
    dispatcher_id BIGINT,
    taken_at TEXT,
    paid_at TEXT
)
"""
_BOT_ROLES_CREATE = """
CREATE TABLE IF NOT EXISTS bot_roles (
    user_id BIGINT PRIMARY KEY,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_dispatcher BOOLEAN NOT NULL DEFAULT FALSE
)
"""

_BOOKINGS_ADD_ARCHIVED = """
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE
"""

_BOOKINGS_ADD_CANCEL_REASON = """
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT
"""

# Telegram user_id может превышать int32 (например 7345144922). Приводим колонки к BIGINT.
_ALTER_USER_PROFILES_USER_ID = """
ALTER TABLE user_profiles ALTER COLUMN user_id TYPE BIGINT USING user_id::bigint
"""
_ALTER_SAVED_PASSENGERS_USER_ID = """
ALTER TABLE saved_passengers ALTER COLUMN user_id TYPE BIGINT USING user_id::bigint
"""
_ALTER_DISPATCHERS_TELEGRAM_ID = """
ALTER TABLE dispatchers ALTER COLUMN telegram_id TYPE BIGINT USING telegram_id::bigint
"""
_ALTER_BOT_ROLES_USER_ID = """
ALTER TABLE bot_roles ALTER COLUMN user_id TYPE BIGINT USING user_id::bigint
"""

_ALTER_LOG_ENTRIES_USER_ID = """
ALTER TABLE log_entries ALTER COLUMN user_id TYPE BIGINT USING user_id::bigint
"""


async def init_db():
    """Create tables: shared (bookings, bot_roles) IF NOT EXISTS, then webapp-only."""
    async with engine.begin() as conn:
        await conn.execute(text(_BOOKINGS_CREATE))
        await conn.execute(text(_BOT_ROLES_CREATE))
        try:
            await conn.execute(text(_BOOKINGS_ADD_ARCHIVED))
        except Exception:
            pass
        try:
            await conn.execute(text(_BOOKINGS_ADD_CANCEL_REASON))
        except Exception:
            pass
        webapp_tables = [
            t for t in Base.metadata.sorted_tables
            if t.name not in ("bookings", "bot_roles")
        ]
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=webapp_tables))
        for stmt in [
            _ALTER_USER_PROFILES_USER_ID,
            _ALTER_SAVED_PASSENGERS_USER_ID,
            _ALTER_DISPATCHERS_TELEGRAM_ID,
            _ALTER_BOT_ROLES_USER_ID,
            _ALTER_LOG_ENTRIES_USER_ID,
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
