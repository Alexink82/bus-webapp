"""
FastAPI dependency: проверенный Telegram user_id для защищённых маршрутов.
Если задан BOT_TOKEN — требуется X-Telegram-Init-Data и проверка подписи.
Если BOT_TOKEN пустой (разработка) — достаточно X-Telegram-User-Id.
"""
from fastapi import Depends, Header, HTTPException, Request

from config import get_settings
from database import get_db
from services.browser_auth import get_browser_session
from services.telegram_auth import get_user_id_from_init_data
from sqlalchemy.ext.asyncio import AsyncSession


def get_verified_telegram_user_id(
    x_telegram_user_id: str | None = Header(None, alias="X-Telegram-User-Id"),
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
) -> int:
    """
    Возвращает проверенный Telegram user_id или поднимает 401.
    Для продакшена (BOT_TOKEN задан) требуется валидный initData.
    """
    settings = get_settings()
    if (settings.bot_token or "").strip():
        if not x_telegram_init_data or not x_telegram_init_data.strip():
            raise HTTPException(401, detail="init_data_required")
        uid = get_user_id_from_init_data(x_telegram_init_data)
        if uid is None:
            raise HTTPException(401, detail="invalid_init_data")
        if x_telegram_user_id and x_telegram_user_id.strip():
            try:
                header_uid = int(x_telegram_user_id)
            except ValueError:
                raise HTTPException(401, detail="invalid_telegram_id")
            if header_uid != uid:
                raise HTTPException(401, detail="telegram_id_mismatch")
        return uid
    if not x_telegram_user_id:
        raise HTTPException(401, detail="telegram_id_required")
    try:
        return int(x_telegram_user_id)
    except ValueError:
        raise HTTPException(401, detail="invalid_telegram_id")


def get_optional_verified_telegram_user_id(
    x_telegram_user_id: str | None = Header(None, alias="X-Telegram-User-Id"),
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
) -> int | None:
    """Как get_verified_telegram_user_id, но возвращает None вместо 401 при отсутствии данных."""
    settings = get_settings()
    if (settings.bot_token or "").strip():
        if not x_telegram_init_data or not x_telegram_init_data.strip():
            return None
        uid = get_user_id_from_init_data(x_telegram_init_data)
        if uid is None:
            return None
        if x_telegram_user_id and x_telegram_user_id.strip():
            try:
                if int(x_telegram_user_id) != uid:
                    return None
            except ValueError:
                return None
        return uid
    if not x_telegram_user_id:
        return None
    try:
        return int(x_telegram_user_id)
    except ValueError:
        return None


async def get_optional_browser_session_user_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> int | None:
    settings = get_settings()
    raw_token = request.cookies.get(settings.browser_session_cookie_name)
    session = await get_browser_session(db, raw_token)
    if not session:
        return None
    return int(session.telegram_user_id)


async def get_optional_backoffice_user_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_telegram_user_id: str | None = Header(None, alias="X-Telegram-User-Id"),
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
) -> int | None:
    uid = await get_optional_browser_session_user_id(request, db)
    if uid is not None:
        return uid
    return get_optional_verified_telegram_user_id(
        x_telegram_user_id=x_telegram_user_id,
        x_telegram_init_data=x_telegram_init_data,
    )


async def get_backoffice_user_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_telegram_user_id: str | None = Header(None, alias="X-Telegram-User-Id"),
    x_telegram_init_data: str | None = Header(None, alias="X-Telegram-Init-Data"),
) -> int:
    uid = await get_optional_browser_session_user_id(request, db)
    if uid is not None:
        return uid
    if (x_telegram_user_id or "").strip() or (x_telegram_init_data or "").strip():
        return get_verified_telegram_user_id(
            x_telegram_user_id=x_telegram_user_id,
            x_telegram_init_data=x_telegram_init_data,
        )
    raise HTTPException(401, detail="backoffice_auth_required")
