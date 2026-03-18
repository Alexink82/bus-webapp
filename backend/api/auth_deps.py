"""
FastAPI dependency: проверенный Telegram user_id для защищённых маршрутов.
Если задан BOT_TOKEN — требуется X-Telegram-Init-Data и проверка подписи.
Если BOT_TOKEN пустой (разработка) — достаточно X-Telegram-User-Id.
"""
from fastapi import Header, HTTPException

from config import get_settings
from services.telegram_auth import get_user_id_from_init_data


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
