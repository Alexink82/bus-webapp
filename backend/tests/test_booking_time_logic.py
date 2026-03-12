"""Тесты логики времени отправления и блокировки прошедших рейсов."""
from datetime import date, datetime

import pytest
from fastapi import HTTPException

from api.booking import _resolve_departure_time, _ensure_not_departed


def test_resolve_departure_time_for_intermediate_stop_uses_stop_time():
    route = {
        "departure": "16:30",
        "stops": ["Мозырь", "Калинковичи", "Речица", "Гомель", "Москва"],
        "stop_times": ["16:30", "16:45", "17:15", "17:45", "06:00"],
    }
    assert _resolve_departure_time(route, "Речица", "16:30") == "17:15"


def test_resolve_departure_time_first_stop_uses_departure():
    route = {
        "departure": "16:30",
        "stops": ["Мозырь", "Калинковичи"],
        "stop_times": ["16:30", "16:45"],
    }
    assert _resolve_departure_time(route, "Мозырь", "16:30") == "16:30"


def test_ensure_not_departed_raises_for_past_time(monkeypatch):
    from api import booking as booking_module

    now = datetime(2026, 3, 12, 18, 0, 0)
    monkeypatch.setattr(booking_module, "get_local_time", lambda: now)

    with pytest.raises(HTTPException) as exc:
        _ensure_not_departed(date(2026, 3, 12), "17:59")
    assert exc.value.status_code == 400
    assert exc.value.detail.get("code") == "past_departure_time"


def test_ensure_not_departed_allows_future_time(monkeypatch):
    from api import booking as booking_module

    now = datetime(2026, 3, 12, 18, 0, 0)
    monkeypatch.setattr(booking_module, "get_local_time", lambda: now)

    _ensure_not_departed(date(2026, 3, 12), "18:01")
