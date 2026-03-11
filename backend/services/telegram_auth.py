"""
Проверка initData Telegram Web App на бэкенде.
Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hmac
import hashlib
import json
import logging
from urllib.parse import parse_qsl

from config import get_settings

logger = logging.getLogger(__name__)


def validate_init_data(init_data: str) -> dict | None:
    """
    Проверить подпись initData и вернуть распарсенные данные (в т.ч. user).
    Если подпись неверная или данных нет — возвращает None.
    """
    if not init_data or not init_data.strip():
        return None
    settings = get_settings()
    bot_token = (settings.bot_token or "").strip()
    if not bot_token:
        return None
    try:
        parsed = dict(parse_qsl(init_data.strip(), keep_blank_values=True))
    except Exception:
        return None
    hash_val = parsed.pop("hash", None)
    if not hash_val:
        return None
    # data-check-string: ключи в алфавитном порядке, key=value через \n
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode(),
        hashlib.sha256,
    ).digest()
    computed = hmac.new(
        secret_key,
        data_check.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(computed, hash_val):
        return None
    return parsed


def get_user_id_from_init_data(init_data: str) -> int | None:
    """
    Валидировать initData и вернуть user_id из поля user (JSON).
    """
    parsed = validate_init_data(init_data)
    if not parsed:
        return None
    user_str = parsed.get("user")
    if not user_str:
        return None
    try:
        user = json.loads(user_str)
        uid = user.get("id")
        if uid is None:
            return None
        return int(uid)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
