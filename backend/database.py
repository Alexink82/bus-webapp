"""Database connection and session management."""
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


async def init_db():
    """
    Create all tables from models if they do not exist (fallback for first run / dev).
    In production prefer: run `alembic upgrade head` before starting the app.
    Schema changes: add new migrations via `alembic revision --autogenerate -m "description"`.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
