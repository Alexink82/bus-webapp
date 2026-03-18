import asyncio

from services.roles import ADMIN_PERMISSION_KEYS, get_admin_permissions, normalize_admin_permissions


def test_normalize_admin_permissions_filters_unknown_and_duplicates():
    normalized = normalize_admin_permissions(["view_logs", "view_logs", "invalid", "manage_roles"])

    assert normalized == ["view_logs", "manage_roles"]


def test_get_admin_permissions_returns_full_set_for_env_admin(monkeypatch):
    monkeypatch.setenv("ADMIN_ID", "42")
    monkeypatch.delenv("ADMIN_IDS", raising=False)

    permissions = asyncio.run(get_admin_permissions(None, 42))

    assert permissions == list(ADMIN_PERMISSION_KEYS)
