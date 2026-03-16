"""Кэш и инвалидация для GET /api/user/dashboard (Redis)."""
import hashlib
import json
import logging

from services.redis_client import get_redis

DASHBOARD_TTL = 60  # секунд
KEY_PREFIX = "dashboard:"
log = logging.getLogger(__name__)


def _json_default(obj):
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    raise TypeError(type(obj).__name__)


async def get_dashboard_cached(user_id: int) -> dict | None:
    """Возвращает закэшированный ответ dashboard или None."""
    redis = get_redis()
    if not redis:
        return None
    try:
        key = f"{KEY_PREFIX}{user_id}"
        raw = await redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        log.warning("dashboard cache get error: %s", e)
        return None


async def set_dashboard_cached(user_id: int, data: dict) -> None:
    """Сохраняет ответ dashboard в кэш."""
    redis = get_redis()
    if not redis:
        return
    try:
        key = f"{KEY_PREFIX}{user_id}"
        payload = json.dumps(data, default=_json_default)
        await redis.setex(key, DASHBOARD_TTL, payload)
    except Exception as e:
        log.warning("dashboard cache set error: %s", e)


async def invalidate_dashboard_cache(user_id: int) -> None:
    """Удаляет кэш dashboard пользователя (после изменений профиля/пассажиров/бронирований)."""
    redis = get_redis()
    if not redis:
        return
    try:
        key = f"{KEY_PREFIX}{user_id}"
        await redis.delete(key)
    except Exception as e:
        log.warning("dashboard cache invalidate error: %s", e)
