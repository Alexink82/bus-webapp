"""Data validators."""
import re
from datetime import date, datetime, timedelta


def parse_birth_date(value: str | None) -> date | None:
    """Принимает ISO (YYYY-MM-DD) или DD.MM.YYYY. Возвращает date или None при ошибке."""
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    # ISO: YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    # DD.MM.YYYY или DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$", s)
    if m:
        try:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100:
                return date(year, month, day)
        except (ValueError, TypeError):
            pass
    return None


def validate_phone(phone: str) -> bool:
    if not phone or not isinstance(phone, str):
        return False
    cleaned = re.sub(r"\D", "", phone)
    return 9 <= len(cleaned) <= 15


def validate_passport(passport: str, route_type: str) -> bool:
    if route_type != "international":
        return True
    if not passport or not isinstance(passport, str):
        return False
    s = passport.strip().upper().replace(" ", "")
    cyr_to_lat = {"М": "M", "Р": "R", "Н": "N", "В": "V", "А": "A", "Б": "B", "Е": "E", "К": "K", "О": "O", "Т": "T", "С": "S", "У": "U", "Х": "H", "Г": "G", "Д": "D", "Л": "L", "П": "P", "И": "I", "Й": "J"}
    for cyr, lat in cyr_to_lat.items():
        s = s.replace(cyr, lat)
    return bool(re.match(r"^[A-Z]{2}\d{7}$", s))


def validate_passenger(passenger: dict, route_type: str, travel_date: date) -> tuple[bool, str]:
    if not passenger:
        return False, "empty"
    # Внутренние рейсы: достаточно имени (first_name). Телефон — отдельно в заявке.
    if route_type != "international":
        if not passenger.get("first_name") or not str(passenger.get("first_name", "")).strip():
            return False, "name_required"
        return True, ""
    # Международные: полные данные
    if not passenger.get("last_name") or not passenger.get("first_name"):
        return False, "name_required"
    bd = passenger.get("birth_date")
    if not bd:
        return False, "birth_date_required"
    if isinstance(bd, str):
        bd = parse_birth_date(bd)
        if bd is None:
            return False, "birth_date_invalid"
    if bd > travel_date:
        return False, "birth_date_future"
    if route_type == "international" and not validate_passport(passenger.get("passport") or "", route_type):
        return False, "passport_required"
    return True, ""


def validate_booking_dates(departure_date: date) -> tuple[bool, str]:
    today = date.today()
    if departure_date < today:
        return False, "past_date"
    # Optional: max 90 days ahead
    if (departure_date - today).days > 90:
        return False, "too_far"
    return True, ""


def payment_deadline_minutes() -> int:
    return 30


def get_payment_deadline() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc) + timedelta(minutes=payment_deadline_minutes())
