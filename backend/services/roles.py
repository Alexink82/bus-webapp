"""
Roles: admins and dispatchers (aligned with bus-bot).
Merge env (ADMIN_IDS, DISPATCHER_IDS) with DB bot_roles.
Диспетчер = запись в таблице dispatchers (is_active) ИЛИ в bot_roles (is_dispatcher).
Бот отключён — веб единственный клиент; bot_roles только хранит доп. роли.
"""
import logging
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import BotRole, Dispatcher

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
    """All dispatcher IDs: env + bot_roles (для проверки «является ли диспетчером»)."""
    settings = get_settings()
    env_disp = settings.dispatcher_ids_list
    return list(set(env_disp) | set(_extra_dispatcher_ids))


def is_admin(user_id: int) -> bool:
    return user_id in get_all_admin_ids()


def is_dispatcher(user_id: int) -> bool:
    return user_id in get_all_dispatcher_ids()


async def get_dispatcher_route_ids(db: AsyncSession, user_id: int) -> List[str] | None:
    """
    Вернуть список route_id для диспетчера или None, если не диспетчер.
    Сначала таблица dispatchers (is_active), затем bot_roles. Пустой список = все маршруты.
    """
    result = await db.execute(
        select(Dispatcher).where(
            Dispatcher.telegram_id == user_id,
            Dispatcher.is_active == True,
        )
    )
    disp = result.scalar_one_or_none()
    if disp is not None:
        if isinstance(disp.routes, list) and len(disp.routes) > 0:
            return list(disp.routes)
        return []  # пусто = все маршруты, вызывающий подставит ROUTES.keys()
    if user_id in get_all_dispatcher_ids():
        return []  # из bot_roles — все маршруты
    return None
