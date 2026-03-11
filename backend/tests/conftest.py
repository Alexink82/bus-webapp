"""Pytest configuration and fixtures.
Тесты API: для полного прогона нужна PostgreSQL (DATABASE_URL).
Без БД проходят: /api/health, /api/routes.
"""
import os
import pytest
from fastapi.testclient import TestClient

# Отключаем реальное подключение к БД для изолированных тестов (опционально)
os.environ.setdefault("DEBUG", "true")


@pytest.fixture
def client():
    """Sync TestClient для тестов без реальной БД (health, routes)."""
    from main import app
    return TestClient(app)
