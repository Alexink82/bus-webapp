"""Structured logging configuration.

На Render/PaaS uvicorn часто настраивает root logger раньше приложения.
Используем basicConfig(force=True), очищаем handlers uvicorn и включаем propagate.
Дополнительно делаем flush после каждой записи в stdout, чтобы логи сразу видны в Render.
"""
import logging
import sys
import inspect
import re
from typing import Any

from config import get_settings


def setup_logging() -> None:
    """Configure logging to stdout and override preconfigured handlers.

    basicConfig(force=True) перезаписывает handlers. Логгеры uvicorn направляем
    в root. Flush после каждой записи — для Render/Docker.
    """
    settings = get_settings()
    level = logging.DEBUG if settings.debug else logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )

    # Отключаем отдельные handlers uvicorn, чтобы он шёл в общий root-поток.
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(logger_name)
        uv_logger.handlers.clear()
        uv_logger.propagate = True

    # Flush после каждой записи (Render/Docker)
    root = logging.getLogger()
    for h in root.handlers:
        if getattr(h, "stream", None) is sys.stdout:
            _emit = h.emit
            def _emit_and_flush(record, _e=_emit, _stream=h.stream):
                _e(record)
                if _stream:
                    _stream.flush()
            h.emit = _emit_and_flush
            break


def get_logger(name: str) -> logging.Logger:
    """Return a logger instance."""
    return logging.getLogger(name)


def _caller_context() -> str:
    """Возвращает файл:строка вызывающего кода (для отладки)."""
    try:
        frame = inspect.currentframe()
        if frame and frame.f_back and frame.f_back.f_back:
            f = frame.f_back.f_back
            return f"{f.f_code.co_filename}:{f.f_lineno}"
    except Exception:
        pass
    return ""


_SENSITIVE_KEYWORDS = (
    "phone",
    "passport",
    "secret",
    "signature",
    "token",
    "init_data",
    "initdata",
    "authorization",
    "cookie",
)


def _mask_string(value: str) -> str:
    s = str(value)
    digits = "".join(ch for ch in s if ch.isdigit())
    if len(digits) >= 7:
        visible = digits[-4:]
        return f"***{visible}"
    if len(s) <= 4:
        return "***"
    return s[:2] + "***" + s[-2:]


def sanitize_log_details(value: Any, key_name: str | None = None) -> Any:
    """Рекурсивно маскирует чувствительные данные перед записью в логи и audit."""
    if isinstance(value, dict):
        return {k: sanitize_log_details(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_log_details(v, key_name) for v in value]
    if isinstance(value, tuple):
        return tuple(sanitize_log_details(v, key_name) for v in value)
    if value is None:
        return None
    key = (key_name or "").lower()
    if any(word in key for word in _SENSITIVE_KEYWORDS):
        return _mask_string(str(value))
    if isinstance(value, str):
        looks_like_phone = re.fullmatch(r"\+?\d[\d\-\s\(\)]{6,}", value.strip() or "") is not None
        if looks_like_phone:
            return _mask_string(value)
    return value


async def log_action(
    db,
    level: str,
    source: str,
    action: str,
    user_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Write action to log_entries table. source/action попадают в лог сервера и в БД."""
    logger = get_logger("api")
    ctx = _caller_context()
    safe_details = sanitize_log_details(details or {})
    msg = f"{source} | {action}"
    if safe_details:
        msg += f" | {safe_details}"
    if user_id is not None:
        msg += f" | user_id={user_id}"
    if ctx:
        msg += f" | at {ctx}"
    if level == "ERROR":
        logger.error(msg)
    else:
        logger.info(msg)
    try:
        from models import LogEntry

        entry = LogEntry(
            level=level,
            source=source,
            user_id=user_id,
            action=action,
            details=safe_details,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
    except Exception as e:
        get_logger("logging_config").warning("Failed to write log entry: %s | at %s", e, _caller_context())
