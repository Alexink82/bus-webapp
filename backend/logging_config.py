"""Structured logging configuration."""
import logging
import sys
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


async def log_action(
    db,
    level: str,
    source: str,
    action: str,
    user_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Write action to log_entries table."""
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
        logging.getLogger("logging_config").warning("Failed to write log entry: %s", e)
