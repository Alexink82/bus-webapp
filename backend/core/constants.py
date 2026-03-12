"""
Constants aligned with bus-bot (Alexink82/bus-bot).
Single source of truth for routes; same env parsing.
"""
import os
from datetime import datetime, timedelta
from typing import Any, Optional, Tuple

# ─── Safe ENV parsing (Render can set empty strings) ───
def _env_str(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip() if v.strip() else default


def _env_int_list(name: str) -> list:
    raw = _env_str(name, "")
    if not raw:
        return []
    result = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            result.append(int(part))
        except ValueError:
            continue
    return result


# ─── Routes (same as bus-bot core/constants.py) ───
# В боте нет поля schedule_days — рейсы ежедневно. Здесь schedule_days [0..6] = то же самое.
ROUTES = {
    "mozyr_moscow": {
        "id": "mozyr_moscow",
        "name": "Мозырь → Москва",
        "departure": "16:30",
        "arrival": "06:00",
        "border_dir": "by_to_ru",
        "price": 120,
        "type": "international",
        "stops": ["Мозырь", "Калинковичи", "Речица", "Гомель", "Москва"],
        "stop_times": ["16:30", "16:45", "17:15", "17:45", "06:00"],
        "cities": [("Mozyr", "Мозырь"), ("Gomel", "Гомель"), ("Moscow", "Москва")],
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
    },
    "moscow_mozyr": {
        "id": "moscow_mozyr",
        "name": "Москва → Мозырь",
        "departure": "21:10",
        "arrival": "10:00",
        "border_dir": "ru_to_by",
        "price": 120,
        "type": "international",
        "stops": ["Москва", "Гомель", "Речица", "Калинковичи", "Мозырь"],
        "cities": [("Moscow", "Москва"), ("Gomel", "Гомель"), ("Mozyr", "Мозырь")],
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
    },
    "gomel_mozyr": {
        "id": "gomel_mozyr",
        "name": "Гомель → Мозырь",
        "departure": "12:30",
        "arrival": "15:00",
        "border_dir": "local",
        "price": 20,
        "type": "local",
        "stops": ["Гомель", "Калинковичи", "Мозырь"],
        "cities": [("Gomel", "Гомель"), ("Mozyr", "Мозырь")],
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
    },
    "mozyr_gomel": {
        "id": "mozyr_gomel",
        "name": "Мозырь → Гомель",
        "departure": "11:00",
        "arrival": "13:30",
        "border_dir": "local",
        "price": 20,
        "type": "local",
        "stops": ["Мозырь", "Калинковичи", "Гомель"],
        "cities": [("Mozyr", "Мозырь"), ("Gomel", "Гомель")],
        "schedule_days": [0, 1, 2, 3, 4, 5, 6],
    },
}

# Discount rules per route type (for price calculation)
# Мозырь—Москва / Москва—Мозырь: до 2 лет 100% с местом, до 11 лет 50% с местом.
# Гомель—Мозырь—Гомель: до 9 лет 50% с местом.
DISCOUNT_RULES = {
    "international": {
        "infant": {"age_to": 2, "discount_percent": 100, "seat": True, "label": "До 2 лет"},
        "child": {"age_to": 11, "discount_percent": 50, "seat": True, "label": "3–11 лет"},
    },
    "local": {
        "child": {"age_to": 9, "discount_percent": 50, "seat": True, "label": "Дети до 9 лет"},
    },
}


def get_route_by_cities(from_city: str, to_city: str) -> Tuple[Optional[str], Optional[dict]]:
    """Find route id and dict by from/to cities (same logic as bus-bot)."""
    for route_id, route in ROUTES.items():
        stops = route.get("stops", [])
        if from_city in stops and to_city in stops:
            idx_from = stops.index(from_city)
            idx_to = stops.index(to_city)
            if idx_from < idx_to:
                return route_id, route
    return None, None


def get_local_time() -> datetime:
    """Current time in Moscow/Minsk (UTC+3)."""
    return datetime.utcnow() + timedelta(hours=3)


def generate_booking_id() -> str:
    """Same format as bus-bot: BK-{ddmmyy}-{HHMMSS}."""
    now = get_local_time()
    return f"BK-{now.strftime('%d%m%y')}-{now.strftime('%H%M%S')}"
