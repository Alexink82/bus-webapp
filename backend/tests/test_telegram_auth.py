import asyncio
import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from urllib.parse import urlencode

from starlette.requests import Request

from api.auth_deps import (
    get_backoffice_user_id,
    get_optional_backoffice_user_id,
    get_optional_verified_telegram_user_id,
    get_verified_telegram_user_id,
)
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


def _request_with_cookie(cookie_name: str, cookie_value: str | None = None) -> Request:
    headers = []
    if cookie_value is not None:
        headers.append((b"cookie", f"{cookie_name}={cookie_value}".encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
    }
    return Request(scope)


def test_get_backoffice_user_id_accepts_browser_session(monkeypatch):
    async def _fake_get_browser_session(db, raw_session_token, touch=True):
        assert raw_session_token == "cookie-token"
        return SimpleNamespace(telegram_user_id=700700)

    monkeypatch.setattr("api.auth_deps.get_browser_session", _fake_get_browser_session)
    request = _request_with_cookie("bus_backoffice_session", "cookie-token")

    uid = asyncio.run(
        get_backoffice_user_id(
            request=request,
            db=None,
            x_telegram_user_id=None,
            x_telegram_init_data=None,
        )
    )

    assert uid == 700700


def test_get_optional_backoffice_user_id_falls_back_to_telegram(monkeypatch):
    async def _fake_get_browser_session(db, raw_session_token, touch=True):
        return None

    monkeypatch.setattr("api.auth_deps.get_browser_session", _fake_get_browser_session)
    monkeypatch.setenv("BOT_TOKEN", "")
    request = _request_with_cookie("bus_backoffice_session", None)

    uid = asyncio.run(
        get_optional_backoffice_user_id(
            request=request,
            db=None,
            x_telegram_user_id="424242",
            x_telegram_init_data=None,
        )
    )

    assert uid == 424242


def test_get_backoffice_user_id_requires_browser_session_or_telegram(monkeypatch):
    async def _fake_get_browser_session(db, raw_session_token, touch=True):
        return None

    monkeypatch.setattr("api.auth_deps.get_browser_session", _fake_get_browser_session)
    request = _request_with_cookie("bus_backoffice_session", None)

    try:
        asyncio.run(
            get_backoffice_user_id(
                request=request,
                db=None,
                x_telegram_user_id=None,
                x_telegram_init_data=None,
            )
        )
        assert False, "Expected backoffice_auth_required"
    except Exception as exc:
        assert getattr(exc, "detail", None) == "backoffice_auth_required"
