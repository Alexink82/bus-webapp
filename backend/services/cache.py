"""Route cache service - 10 min TTL."""
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Route, CachedData


class RouteCache:
    """In-memory + DB cache for routes."""

    def __init__(self):
        self._memory: dict[str, Any] = {}
        self._expires: dict[str, datetime] = {}
        self._ttl_minutes = 10

    async def get_routes(self, db: AsyncSession):
        """Return list of active routes (from cache or DB)."""
        now = datetime.utcnow()
        key = "routes"
        if key in self._memory and self._expires.get(key, now) > now:
            return self._memory[key]

        result = await db.execute(
            select(Route).where(Route.is_active == True).order_by(Route.name)
        )
        routes = result.scalars().all()
        data = [
            {
                "id": r.id,
                "name": r.name,
                "type": r.type,
                "stops": r.stops or [],
                "discount_rules": r.discount_rules or {},
                "border_docs_text": r.border_docs_text or "",
                "schedule_days": r.schedule_days or [0, 1, 2, 3, 4, 5, 6],
                "base_price": float(r.base_price) if r.base_price else 0,
            }
            for r in routes
        ]
        self._memory[key] = data
        self._expires[key] = now + timedelta(minutes=self._ttl_minutes)
        return data

    def invalidate(self, key: str = "routes") -> None:
        self._memory.pop(key, None)
        self._expires.pop(key, None)


cache = RouteCache()
