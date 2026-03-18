import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from api.auth_deps import get_optional_verified_telegram_user_id, get_verified_telegram_user_id
from services.telegram_auth import get_user_id_from_init_data, validate_init_data


def _build_init_data(bot_token: str, user_id: int, auth_date: int | None = None) -> str:
    payload = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": json.dumps({"id": user_id, "first_name": "Test", "username": "tester"}, separators=(",", ":")),
    }
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(payload.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret_key, data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


def test_validate_init_data_accepts_valid_payload(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123456:TEST_TOKEN")
    monkeypatch.setenv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "86400")
    init_data = _build_init_data("123456:TEST_TOKEN", 100500)

    parsed = validate_init_data(init_data)

    assert parsed is not None
    assert get_user_id_from_init_data(init_data) == 100500


def test_validate_init_data_rejects_stale_payload(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123456:TEST_TOKEN")
    monkeypatch.setenv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "60")
    init_data = _build_init_data("123456:TEST_TOKEN", 100500, auth_date=int(time.time()) - 600)

    assert validate_init_data(init_data) is None
    assert get_user_id_from_init_data(init_data) is None


def test_get_verified_telegram_user_id_rejects_mismatch(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123456:TEST_TOKEN")
    monkeypatch.setenv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "86400")
    init_data = _build_init_data("123456:TEST_TOKEN", 100500)

    try:
        get_verified_telegram_user_id(x_telegram_user_id="42", x_telegram_init_data=init_data)
        assert False, "Expected telegram_id_mismatch"
    except Exception as exc:
        assert getattr(exc, "detail", None) == "telegram_id_mismatch"


def test_get_optional_verified_telegram_user_id_returns_none_on_mismatch(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123456:TEST_TOKEN")
    monkeypatch.setenv("TELEGRAM_INIT_DATA_MAX_AGE_SECONDS", "86400")
    init_data = _build_init_data("123456:TEST_TOKEN", 100500)

    assert get_optional_verified_telegram_user_id(x_telegram_user_id="42", x_telegram_init_data=init_data) is None
