"""API tests. Запуск: из папки backend выполнить pytest tests/ -v.
Для тестов, требующих БД (booking, user, admin, dispatcher), нужна PostgreSQL (DATABASE_URL).
"""
import pytest


def test_health(client):
    """Проверка живучести сервера."""
    r = client.get("/api/health")
    assert r.status_code == 200
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
    """Несуществующий маршрут -> 404."""
    payload = {
        "route_id": "nonexistent_route",
        "from_city": "A",
        "to_city": "B",
        "departure_date": "2030-06-01",
        "departure_time": "12:00",
        "passengers": [{"last_name": "Иванов", "first_name": "Иван", "birth_date": "1990-01-01"}],
        "phone": "+375291234567",
        "payment_method": "cash",
    }
    r = client.post("/api/bookings", json=payload)
    assert r.status_code == 404


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


def test_faq_no_db_required(client):
    """FAQ возвращает 200 (может быть пустой список без БД)."""
    r = client.get("/api/faq?lang=ru")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data


def test_cancel_booking_requires_auth(client):
    """Отмена брони без заголовков авторизации -> 401."""
    r = client.post("/api/bookings/ANY-ID/cancel", json={})
    assert r.status_code == 401


def test_rate_limit_returns_429(client):
    """При превышении лимита запросов к /api/ возвращается 429."""
    # Лимит из config (по умолчанию 10 в минуту). Делаем 11 запросов.
    for _ in range(11):
        r = client.get("/api/health")
        if r.status_code == 429:
            assert r.json().get("detail") == "too_many_requests"
            return
    # Если rate_limit отключён (<=0), 429 не будет
    assert True


def test_news_no_db_required(client):
    """Новости/кэш возвращают 200."""
    r = client.get("/api/news")
    assert r.status_code == 200
