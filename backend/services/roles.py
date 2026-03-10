"""
Roles: admins and dispatchers (aligned with bus-bot).
Merge env (ADMIN_IDS, DISPATCHER_IDS) with DB bot_roles.
"""
import logging
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import BotRole

logger = logging.getLogger(__name__)

_extra_admin_ids: List[int] = []
_extra_dispatcher_ids: List[int] = []


async def load_roles(db: AsyncSession) -> None:
    """Load role overrides from bot_roles into cache. Call on app start."""
    global _extra_admin_ids, _extra_dispatcher_ids
    try:
        result = await db.execute(
            select(BotRole.user_id, BotRole.is_admin, BotRole.is_dispatcher)
        )
        rows = result.all()
        _extra_admin_ids = [r.user_id for r in rows if r.is_admin]
        _extra_dispatcher_ids = [r.user_id for r in rows if r.is_dispatcher]
        logger.info(
            "Roles loaded: +%s admins, +%s dispatchers from bot_roles",
            len(_extra_admin_ids),
            len(_extra_dispatcher_ids),
        )
    except Exception as e:
        logger.exception("Failed to load roles: %s", e)
        _extra_admin_ids = []
        _extra_dispatcher_ids = []


def get_all_admin_ids() -> List[int]:
    """All admin IDs: env + bot_roles."""
    settings = get_settings()
    env_admins = settings.admin_ids_list
    return list(set(env_admins) | set(_extra_admin_ids))


def get_all_dispatcher_ids() -> List[int]:
    """All dispatcher IDs. If any in bot_roles, use only those; else env."""
    if _extra_dispatcher_ids:
        return list(_extra_dispatcher_ids)
    settings = get_settings()
    return list(settings.dispatcher_ids_list)


def is_admin(user_id: int) -> bool:
    return user_id in get_all_admin_ids()


def is_dispatcher(user_id: int) -> bool:
    return user_id in get_all_dispatcher_ids()
