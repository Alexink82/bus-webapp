"""Тесты настройки логирования (stdout, force, uvicorn propagate)."""
import io
import logging
import sys

import pytest


def test_setup_logging_forces_stdout_and_replaces_existing_handlers(monkeypatch):
    """setup_logging должен перезаписывать ранее установленные handlers (uvicorn case)."""
    monkeypatch.setenv("DEBUG", "true")
    # Имитируем раннюю настройку root logger сторонним фреймворком
    root = logging.getLogger()
    old_stream = io.StringIO()
    old_handler = logging.StreamHandler(old_stream)
    root.handlers = [old_handler]
    root.setLevel(logging.WARNING)

    from logging_config import setup_logging

    setup_logging()

    handlers = logging.getLogger().handlers
    assert len(handlers) == 1
    assert isinstance(handlers[0], logging.StreamHandler)
    assert handlers[0].stream is sys.stdout


def test_setup_logging_clears_uvicorn_handlers_and_enables_propagation(monkeypatch):
    """Логгеры uvicorn должны проксировать в root для единого вывода в Render Logs."""
    monkeypatch.setenv("DEBUG", "false")

    uv_access = logging.getLogger("uvicorn.access")
    uv_access.handlers = [logging.StreamHandler(io.StringIO())]
    uv_access.propagate = False

    from logging_config import setup_logging

    setup_logging()

    assert logging.getLogger("uvicorn").handlers == []
    assert logging.getLogger("uvicorn.error").handlers == []
    assert logging.getLogger("uvicorn.access").handlers == []
    assert logging.getLogger("uvicorn").propagate is True
    assert logging.getLogger("uvicorn.error").propagate is True
    assert logging.getLogger("uvicorn.access").propagate is True


def test_sanitize_log_details_masks_sensitive_fields():
    from logging_config import sanitize_log_details

    data = {
        "phone": "+375291234567",
        "passport": "MP1234567",
        "nested": {
            "secret": "super-secret",
            "signature": "abcdef123456",
            "safe": "visible",
        },
    }

    sanitized = sanitize_log_details(data)

    assert sanitized["phone"] != data["phone"]
    assert sanitized["passport"] != data["passport"]
    assert sanitized["nested"]["secret"] != data["nested"]["secret"]
    assert sanitized["nested"]["signature"] != data["nested"]["signature"]
    assert sanitized["nested"]["safe"] == "visible"
