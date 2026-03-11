"""Structured logging configuration.
Все ошибки и ключевые действия пишут в лог с указанием модуля и контекста.
"""
import logging
import sys
import inspect
from typing import Any

from config import get_settings


def setup_logging() -> None:
    """Configure logging for the application."""
    settings = get_settings()
    level = logging.DEBUG if settings.debug else logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )


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
    msg = f"{source} | {action}"
    if details:
        msg += f" | {details}"
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
            details=details or {},
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
    except Exception as e:
        get_logger("logging_config").warning("Failed to write log entry: %s | at %s", e, _caller_context())
