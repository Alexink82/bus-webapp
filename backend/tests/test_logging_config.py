import io
import logging
import os


def test_setup_logging_forces_stdout_and_replaces_existing_handlers(monkeypatch):
    """setup_logging должен перезаписывать ранее установленные handlers (uvicorn case)."""
    # Имитируем раннюю настройку root logger сторонним фреймворком
    root = logging.getLogger()
    old_stream = io.StringIO()
    old_handler = logging.StreamHandler(old_stream)
    root.handlers = [old_handler]
    root.setLevel(logging.WARNING)

    monkeypatch.setenv("DEBUG", "true")

    from logging_config import setup_logging

    setup_logging()

    # Должен остаться единый поток в stdout после force=True
    handlers = logging.getLogger().handlers
    assert len(handlers) == 1
    assert isinstance(handlers[0], logging.StreamHandler)
    assert handlers[0].stream is os.sys.stdout


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
