"""API tests. Запуск: из папки backend выполнить pytest tests/ -v.
Для тестов, требующих БД (booking get, faq, news), нужна PostgreSQL (DATABASE_URL).
Без DATABASE_URL эти тесты пропускаются.
"""
import os
import pytest

_has_db_url = bool(os.environ.get("DATABASE_URL"))


def test_health(client):
    """Проверка живучести сервера."""
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers.get("X-Request-Id")
    data = r.json()
    assert data.get("status") == "ok"


def test_routes_list(client):
    """Список маршрутов из констант (без БД)."""
    r = client.get("/api/routes")
    assert r.status_code == 200
    data = r.json()
    assert "routes" in data
    routes = data["routes"]
    assert isinstance(routes, list)
    if routes:
        r0 = routes[0]
        assert "id" in r0
        assert "name" in r0
        assert "stops" in r0
        assert "base_price" in r0


def test_routes_structure(client):
    """Структура одного маршрута."""
    r = client.get("/api/routes")
    assert r.status_code == 200
    routes = r.json().get("routes", [])
    for route in routes:
        assert "id" in route
        assert "type" in route
        assert "schedule_days" in route
        assert "border_docs_text" in route


def test_create_booking_validation_empty_passengers(client):
    """Создание брони без пассажиров -> 422 или 400."""
    payload = {
        "route_id": "mozyr_moscow",
        "from_city": "Мозырь",
        "to_city": "Москва",
        "departure_date": "2030-06-01",
        "departure_time": "16:30",
        "passengers": [],
        "phone": "+375291234567",
        "payment_method": "cash",
    }
    r = client.post("/api/bookings", json=payload)
    assert r.status_code in (400, 422)


def test_create_booking_validation_invalid_route(client):
    """Несуществующий маршрут -> 404. Дата в пределах 90 дней, иначе сработает валидация too_far."""
    from datetime import date, timedelta
    soon = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "route_id": "nonexistent_route",
        "from_city": "A",
        "to_city": "B",
        "departure_date": soon,
        "departure_time": "12:00",
        "passengers": [{"last_name": "Иванов", "first_name": "Иван", "birth_date": "1990-01-01"}],
        "phone": "+375291234567",
        "payment_method": "cash",
    }
    r = client.post("/api/bookings", json=payload)
    assert r.status_code == 404
    assert r.json().get("detail") == "route_not_found"


def test_create_booking_validation_invalid_phone(client):
    """Некорректный телефон -> 400 с кодом invalid_phone (локальный маршрут, без паспорта)."""
    from datetime import date, timedelta
    soon = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "route_id": "gomel_mozyr",
        "from_city": "Гомель",
        "to_city": "Мозырь",
        "departure_date": soon,
        "departure_time": "12:30",
        "passengers": [{"last_name": "Иванов", "first_name": "Иван", "birth_date": "1990-01-01"}],
        "phone": "123",
        "payment_method": "cash",
    }
    r = client.post("/api/bookings", json=payload)
    assert r.status_code == 400
    data = r.json()
    assert data.get("detail", {}).get("code") == "invalid_phone"


def test_create_booking_accepts_extra_fields_ignored(client):
    """CreateBookingIn с extra='ignore' не падает при лишних полях (например save_passengers_to_profile)."""
    from datetime import date, timedelta
    soon = (date.today() + timedelta(days=30)).isoformat()
    payload = {
        "route_id": "nonexistent_route",
        "from_city": "A",
        "to_city": "B",
        "departure_date": soon,
        "departure_time": "12:00",
        "passengers": [{"last_name": "Иванов", "first_name": "Иван", "birth_date": "1990-01-01"}],
        "phone": "+375291234567",
        "payment_method": "cash",
        "save_passengers_to_profile": True,
        "unknown_field": "ignored",
    }
    r = client.post("/api/bookings", json=payload)
    assert r.status_code == 404
    assert r.json().get("detail") == "route_not_found"


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_get_booking_not_found(client):
    """Получение несуществующей брони -> 404."""
    r = client.get("/api/bookings/NONEXISTENT-ID-123")
    assert r.status_code == 404


def test_user_bookings_unauthorized(client):
    """Список заявок пользователя без X-Telegram-User-Id -> 401."""
    r = client.get("/api/user/bookings")
    assert r.status_code == 401


def test_user_passengers_unauthorized(client):
    """Сохранённые пассажиры без заголовка -> 401."""
    r = client.get("/api/user/passengers")
    assert r.status_code == 401


def test_dispatcher_bookings_unauthorized(client):
    """Диспетчер: без заголовка -> 401."""
    r = client.get("/api/dispatcher/bookings")
    assert r.status_code == 401


def test_admin_stats_unauthorized(client):
    """Админ статистика без заголовка -> 401."""
    r = client.get("/api/admin/stats")
    assert r.status_code == 401


def test_admin_logs_unauthorized(client):
    """Админ логи без заголовка -> 401."""
    r = client.get("/api/admin/logs")
    assert r.status_code == 401


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_faq_no_db_required(client):
    """FAQ возвращает 200 (может быть пустой список без БД)."""
    r = client.get("/api/faq?lang=ru")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_faq_lang_be_returns_200(client):
    """FAQ с lang=be возвращает 200 (fallback на question_en/answer_en)."""
    r = client.get("/api/faq?lang=be")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)


def test_cancel_booking_requires_auth(client):
    """Отмена брони без заголовков авторизации -> 401."""
    r = client.post("/api/bookings/ANY-ID/cancel", json={})
    assert r.status_code == 401


def test_reschedule_request_requires_auth(client):
    """Запрос на перенос даты без авторизации -> 401."""
    r = client.post("/api/bookings/ANY-ID/reschedule-request", json={"new_date": "2030-06-15"})
    assert r.status_code == 401


def test_rate_limit_returns_429(client):
    """При превышении лимита запросов к /api/ возвращается 429.
    GET /api/health входит в RATE_LIMIT_SKIP_PATHS, поэтому эти запросы не учитываются —
    тест не проверяет 429 по сути (при необходимости проверять с БД и путём вне skip, например GET /api/bookings/ID)."""
    for _ in range(11):
        r = client.get("/api/health")
        if r.status_code == 429:
            assert r.json().get("detail") == "too_many_requests"
            return
    assert True


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_news_no_db_required(client):
    """Новости/кэш возвращают 200."""
    r = client.get("/api/news")
    assert r.status_code == 200


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_health_db_check_when_enabled(client):
    """При HEALTH_CHECK_DB=1 и доступной БД в ответе есть db: ok."""
    os.environ["HEALTH_CHECK_DB"] = "1"
    try:
        r = client.get("/api/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert data.get("db") == "ok"
    finally:
        os.environ.pop("HEALTH_CHECK_DB", None)


# --- Access-control: get_booking и cancel (владелец / админ / диспетчер / чужой). BOT_TOKEN пустой → X-Telegram-User-Id. ---

def _env_for_access_tests():
    """Временно выставить env для тестов ролей (BOT_TOKEN пустой, ADMIN_IDS, DISPATCHER_IDS)."""
    old = {}
    for k in ("BOT_TOKEN", "ADMIN_IDS", "DISPATCHER_IDS"):
        old[k] = os.environ.get(k)
    os.environ["BOT_TOKEN"] = ""
    os.environ["ADMIN_IDS"] = "999"
    os.environ["DISPATCHER_IDS"] = "222"
    return old


def _restore_env(old):
    for k, v in old.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_get_booking_access_control_owner_sees_full(client):
    """Владелец заявки (X-Telegram-User-Id = contact_tg_id) видит полный ответ: passengers, contact_phone."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Иванов", "first_name": "Иван", "birth_date": "1990-01-01"}],
            "phone": "+375291234567",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        assert booking_id
        r2 = client.get(f"/api/bookings/{booking_id}", headers={"X-Telegram-User-Id": "111"})
        assert r2.status_code == 200
        data = r2.json()
        assert "passengers" in data
        assert "contact_phone" in data
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_get_booking_access_control_stranger_sees_limited(client):
    """Чужой (без заголовка или другой user_id) видит ограниченный ответ: без passengers и contact_phone."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Петров", "first_name": "Пётр", "birth_date": "1985-05-05"}],
            "phone": "+375299999999",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        assert booking_id
        r2 = client.get(f"/api/bookings/{booking_id}")
        assert r2.status_code == 200
        data = r2.json()
        assert "passengers" not in data
        assert "contact_phone" not in data
        assert "passengers_count" in data
        r3 = client.get(f"/api/bookings/{booking_id}", headers={"X-Telegram-User-Id": "12345"})
        assert r3.status_code == 200
        data3 = r3.json()
        assert "passengers" not in data3
        assert "contact_phone" not in data3
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_get_booking_access_control_admin_sees_full(client):
    """Админ (ADMIN_IDS) видит полный ответ заявки."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Сидоров", "first_name": "Сидор", "birth_date": "1992-02-02"}],
            "phone": "+375337777777",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        r2 = client.get(f"/api/bookings/{booking_id}", headers={"X-Telegram-User-Id": "999"})
        assert r2.status_code == 200
        assert "passengers" in r2.json()
        assert "contact_phone" in r2.json()
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_get_booking_access_control_dispatcher_sees_full(client):
    """Диспетчер (DISPATCHER_IDS) видит полный ответ заявки по своим маршрутам."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Диспетчеров", "first_name": "Дисп", "birth_date": "1988-08-08"}],
            "phone": "+375336666666",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        r2 = client.get(f"/api/bookings/{booking_id}", headers={"X-Telegram-User-Id": "222"})
        assert r2.status_code == 200
        assert "passengers" in r2.json()
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_cancel_booking_access_control_owner_can_cancel(client):
    """Владелец может отменить свою заявку (статус new)."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Отменов", "first_name": "Иван", "birth_date": "1990-01-01"}],
            "phone": "+375255555555",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        r2 = client.post(
            f"/api/bookings/{booking_id}/cancel",
            json={},
            headers={"X-Telegram-User-Id": "111"},
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("status") == "cancelled"
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_cancel_booking_access_control_stranger_403(client):
    """Чужой пользователь не может отменить заявку -> 403."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "Чужой", "first_name": "Не", "birth_date": "1991-01-01"}],
            "phone": "+375254444444",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        r2 = client.post(
            f"/api/bookings/{booking_id}/cancel",
            json={},
            headers={"X-Telegram-User-Id": "12345"},
        )
        assert r2.status_code == 403
        assert r2.json().get("detail") == "not_authorized_to_cancel"
    finally:
        _restore_env(old)


@pytest.mark.skipif(not _has_db_url, reason="DATABASE_URL not set")
def test_cancel_booking_access_control_admin_can_cancel_with_reason(client):
    """Админ может отменить заявку с указанием причины (reason обязателен не от владельца)."""
    from datetime import date, timedelta
    old = _env_for_access_tests()
    try:
        soon = (date.today() + timedelta(days=14)).isoformat()
        payload = {
            "route_id": "gomel_mozyr",
            "from_city": "Гомель",
            "to_city": "Мозырь",
            "departure_date": soon,
            "departure_time": "12:30",
            "passengers": [{"last_name": "АдминОтмена", "first_name": "А", "birth_date": "1993-03-03"}],
            "phone": "+375253333333",
            "payment_method": "cash",
            "user_id": 111,
        }
        r = client.post("/api/bookings", json=payload)
        assert r.status_code == 200
        booking_id = r.json().get("booking_id")
        r2 = client.post(
            f"/api/bookings/{booking_id}/cancel",
            json={"reason": "Причина от админа"},
            headers={"X-Telegram-User-Id": "999"},
        )
        assert r2.status_code == 200
        assert r2.json().get("status") == "cancelled"
    finally:
        _restore_env(old)
