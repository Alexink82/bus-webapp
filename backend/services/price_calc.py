"""Price calculation by segments and discount rules."""
from datetime import date
from typing import Any


def get_passenger_age(birth_date: date, travel_date: date) -> int:
    if not birth_date or not travel_date:
        return 99
    return (travel_date - birth_date).days // 365


def get_passenger_type_and_discount(
    birth_date: date,
    travel_date: date,
    discount_rules: dict,
) -> tuple:
    """Return (type_key, discount_percent, has_seat)."""
    if not discount_rules:
        return "adult", 0.0, True
    age = get_passenger_age(birth_date, travel_date)
    for key, rule in discount_rules.items():
        age_to = rule.get("age_to", 0)
        if age <= age_to:
            return (
                key,
                float(rule.get("discount_percent", 0)),
                bool(rule.get("seat", True)),
            )
    return "adult", 0.0, True


def calculate_segment_price(
    stops: list,
    from_city: str,
    to_city: str,
    base_price: float,
) -> float:
    """Цена сегмента = разница кумулятивных offset (полный маршрут = base_price)."""
    if not stops or base_price is None:
        return 0.0
    from_idx = next((i for i, s in enumerate(stops) if s.get("city") == from_city), None)
    to_idx = next((i for i, s in enumerate(stops) if s.get("city") == to_city), None)
    if from_idx is None or to_idx is None or from_idx >= to_idx:
        return 0.0
    from_offset = float(stops[from_idx].get("price_offset", 0))
    to_offset = float(stops[to_idx].get("price_offset", 0))
    return round(to_offset - from_offset, 2)


def calculate_passenger_price(
    segment_price: float,
    discount_percent: float,
    has_seat: bool,
) -> float:
    if discount_percent >= 100 and not has_seat:
        return 0.0
    return round(segment_price * (1 - discount_percent / 100), 2)


def calculate_booking_totals(
    route: dict,
    from_city: str,
    to_city: str,
    passengers: list,
    travel_date: date,
    is_round_trip: bool = False,
) -> tuple:
    """Returns (price_one_way, price_return or None, price_total)."""
    stops = route.get("stops") or []
    base = float(route.get("base_price") or 0)
    rules = route.get("discount_rules") or {}
    segment = calculate_segment_price(stops, from_city, to_city, base)
    one_way = 0.0
    for p in passengers:
        bd = p.get("birth_date")
        if isinstance(bd, str):
            bd = date.fromisoformat(bd) if bd else None
        if not bd:
            one_way += segment
            continue
        _, discount_pct, _ = get_passenger_type_and_discount(bd, travel_date, rules)
        one_way += calculate_passenger_price(segment, discount_pct, True)
    one_way = round(one_way, 2)
    return_price = round(one_way, 2) if is_round_trip else None
    total = one_way + (return_price or 0)
    return one_way, return_price, total
