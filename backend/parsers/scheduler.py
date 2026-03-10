"""APScheduler tasks - update cache (border, weather)."""
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import get_settings
from models import CachedData, Base
from parsers.border import fetch_border_status
from parsers.weather import fetch_weather

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _get_engine():
    settings = get_settings()
    url = settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return create_async_engine(url)


async def _update_cache():
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        try:
            border = await fetch_border_status()
            if border:
                now = datetime.now(timezone.utc)
                exp = now + timedelta(minutes=60)
                stmt = select(CachedData).where(CachedData.key == "border_status")
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()
                if row:
                    row.data = border
                    row.updated_at = now
                    row.expires_at = exp
                else:
                    session.add(CachedData(key="border_status", data=border, updated_at=now, expires_at=exp))

            weather = await fetch_weather()
            if weather:
                now = datetime.now(timezone.utc)
                exp = now + timedelta(minutes=30)
                stmt = select(CachedData).where(CachedData.key == "weather")
                result = await session.execute(stmt)
                row = result.scalar_one_or_none()
                if row:
                    row.data = weather
                    row.updated_at = now
                    row.expires_at = exp
                else:
                    session.add(CachedData(key="weather", data=weather, updated_at=now, expires_at=exp))
            await session.commit()
        except Exception as e:
            logger.exception("cache update failed: %s", e)
        finally:
            await engine.dispose()


def start_scheduler():
    scheduler.add_job(_update_cache, "interval", minutes=30, id="cache_update")
    scheduler.start()
    logger.info("Scheduler started")


def shutdown_scheduler():
    scheduler.shutdown(wait=False)
