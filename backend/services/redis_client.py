"""Общий Redis-клиент (ленивое подключение). Используется для rate limit (main) и idempotency (booking)."""
import logging

from config import get_settings

logger = logging.getLogger(__name__)
_redis_client = None


def get_redis():
    """Возвращает asyncio Redis или None, если REDIS_URL не задан или подключение не удалось."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client if _redis_client is not False else None
    url = (get_settings().redis_url or "").strip()
    if not url:
        _redis_client = False
        return None
    try:
        from redis.asyncio import Redis
        _redis_client = Redis.from_url(url, decode_responses=True)
        return _redis_client
    except Exception:
        logger.warning("Redis connection failed, idempotency/rate limit may use in-memory or be disabled")
        _redis_client = False
        return None
