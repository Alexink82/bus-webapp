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


def _normalize_passport_by(s: str) -> str:
    """Кириллица → латиница для паспорта РБ."""
    cyr_to_lat = {
        "М": "M", "Р": "R", "Н": "N", "В": "V", "А": "A", "Б": "B", "Е": "E", "К": "K",
        "О": "O", "Т": "T", "С": "S", "У": "U", "Х": "H", "Г": "G", "Д": "D", "Л": "L",
        "П": "P", "И": "I", "Й": "J",
    }
    for cyr, lat in cyr_to_lat.items():
        s = s.replace(cyr, lat)
    return s


def validate_passport_russia(passport: str) -> tuple[bool, str]:
    """
    Паспорт гражданина РФ (внутренний): 4 цифры серии + 6 цифр номера.
    Серия не 00xx, не 0000; номер не 000000.
    """
    if not passport or not isinstance(passport, str):
        return False, "passport_required"
    cleaned = re.sub(r"\D", "", passport.strip())
    if len(cleaned) != 10:
        return False, "passport_invalid_format"
    series = cleaned[:4]
    number = cleaned[4:]
    if series == "0000":
        return False, "passport_series_invalid"
    if series.startswith("00"):
        return False, "passport_series_invalid"
    if number == "000000":
        return False, "passport_number_invalid"
    return True, ""


def validate_passport_belarus(passport: str) -> tuple[bool, str]:
    """
    Паспорт РБ (старый/биометрический): 2 латинские буквы + 7 цифр.
    Кириллица приводится к латинице.
    """
    if not passport or not isinstance(passport, str):
        return False, "passport_required"
    s = passport.strip().upper().replace(" ", "").replace("-", "").replace("–", "").replace("—", "")
    s = _normalize_passport_by(s)
    if not re.match(r"^[A-Z]{2}\d{7}$", s):
        return False, "passport_invalid_format"
    return True, ""


# Коды стран выдачи паспорта и правила (топ для ЕС ↔ СНГ). OTHER = произвольный номер (min 6 символов).
PASSPORT_COUNTRY_PATTERNS = {
    "RU": ("digits4_6", 10, 10),
    "BY": ("letters2_digits7", 9, 9),
    "UA": ("letters2_digits6to8", 8, 10),
    "PL": ("letters2_digits7", 9, 9),
    "DE": ("alphanum9", 9, 9),
    "US": ("digits9", 9, 9),
    "KZ": ("digits9", 9, 9),
    "LT": ("digits9", 9, 9),
    "LV": ("letters2_digits7", 9, 9),
    "EE": ("digits9", 9, 9),
    "MD": ("letters2_digits7", 9, 9),
    "RO": ("digits9", 9, 9),
    "TR": ("digits9", 9, 9),
    "GE": ("digits9", 9, 9),
    "AM": ("letters2_digits7", 9, 9),
    "CZ": ("digits9", 9, 9),
    "SK": ("digits9", 9, 9),
    "HU": ("letters2_digits7", 9, 9),
    "BG": ("digits9", 9, 9),
    "RS": ("digits9", 9, 9),
}


def _passport_clean(passport: str, country_code: str | None) -> str:
    """Нормализация: без пробелов/дефисов, буквы верхний регистр (E.164-подобно)."""
    if not passport or not isinstance(passport, str):
        return ""
    s = passport.strip().upper().replace(" ", "").replace("-", "").replace("–", "").replace("—", "")
    s = _normalize_passport_by(s)
    return re.sub(r"[^A-Z0-9]", "", s)


def validate_passport_by_country(passport: str, country_code: str | None) -> tuple[bool, str]:
    """
    Валидация паспорта по коду страны выдачи.
    country_code: RU, BY, UA, ... или OTHER (произвольный, min 6 символов), или None (определяем по формату).
    """
    if not passport or not isinstance(passport, str):
        return False, "passport_required"
    cleaned = _passport_clean(passport, country_code)

    if country_code == "OTHER" or not country_code:
        if not country_code and cleaned:
            if len(cleaned) == 10 and re.match(r"^\d{10}$", cleaned):
                return validate_passport_russia(passport)
            if re.match(r"^[A-Z]{2}\d{7}$", cleaned):
                return validate_passport_belarus(passport)
        if country_code == "OTHER":
            if len(cleaned) < 6:
                return False, "passport_invalid_format"
            return True, ""
        if not cleaned:
            return False, "passport_required"
        if len(cleaned) == 10 and re.match(r"^\d{10}$", cleaned):
            return validate_passport_russia(passport)
        if re.match(r"^[A-Z]{2}\d{7}$", cleaned):
            return validate_passport_belarus(passport)
        if len(cleaned) >= 6:
            return True, ""
        return False, "passport_invalid_format"

    rule = PASSPORT_COUNTRY_PATTERNS.get(country_code)
    if not rule:
        if len(cleaned) >= 6:
            return True, ""
        return False, "passport_invalid_format"

    pattern, min_len, max_len = rule
    if len(cleaned) < min_len:
        return False, "passport_invalid_format"
    if len(cleaned) > max_len:
        return False, "passport_invalid_format"

    if pattern == "digits4_6":
        if not re.match(r"^\d{10}$", cleaned):
            return False, "passport_invalid_format"
        series = cleaned[:4]
        if series == "0000" or series.startswith("00"):
            return False, "passport_series_invalid"
        if cleaned[4:] == "000000":
            return False, "passport_number_invalid"
    elif pattern == "letters2_digits7":
        if not re.match(r"^[A-Z]{2}\d{7}$", cleaned):
            return False, "passport_invalid_format"
    elif pattern == "letters2_digits6to8":
        if not re.match(r"^[A-Z]{2}\d{6,8}$", cleaned):
            return False, "passport_invalid_format"
    elif pattern == "digits9":
        if not re.match(r"^\d{9}$", cleaned):
            return False, "passport_invalid_format"
    elif pattern == "alphanum9":
        if not re.match(r"^[A-Z0-9]{9}$", cleaned):
            return False, "passport_invalid_format"

    return True, ""


def validate_passport(passport: str, route_type: str, citizenship: str | None = None) -> tuple[bool, str]:
    """
    Валидация паспорта для международного рейса.
    citizenship / passport_country: код страны выдачи (RU, BY, UA, ... OTHER) или None — авто по формату.
    """
    if route_type != "international":
        return True, ""
    country = citizenship  # backward compat: API может присылать citizenship или passport_country
    return validate_passport_by_country(passport, country)


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
    if route_type == "international":
        country_code = passenger.get("passport_country") or passenger.get("citizenship")
        ok, err = validate_passport(
            passenger.get("passport") or "",
            route_type,
            citizenship=country_code,
        )
        if not ok:
            return False, err
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
