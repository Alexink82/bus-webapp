"""Browser auth helpers for admin/dispatcher backoffice."""
import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models import BrowserLoginTicket, BrowserSession


def _utcnow() -> datetime:
    # Use naive UTC timestamps to match the rest of the project DateTime columns.
    return datetime.utcnow()


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256((raw_token or "").encode()).hexdigest()


def _client_ip(headers) -> str | None:
    forwarded = (headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    direct = (headers.get("X-Real-IP") or "").strip()
    return forwarded or direct or None


def _user_agent(headers) -> str | None:
    return (headers.get("User-Agent") or "").strip() or None


async def purge_expired_browser_auth(db: AsyncSession) -> None:
    now = _utcnow()
    await db.execute(
        delete(BrowserLoginTicket).where(
            BrowserLoginTicket.expires_at < now
        )
    )
    await db.execute(
        delete(BrowserSession).where(
            BrowserSession.expires_at < now
        )
    )


async def issue_browser_login_ticket(
    db: AsyncSession,
    telegram_user_id: int,
    target: str,
) -> tuple[str, int]:
    settings = get_settings()
    raw_token = secrets.token_urlsafe(32)
    now = _utcnow()
    expires_at = now + timedelta(seconds=max(15, int(settings.browser_login_ticket_ttl_seconds or 60)))
    db.add(
        BrowserLoginTicket(
            token_hash=_hash_token(raw_token),
            telegram_user_id=int(telegram_user_id),
            target=str(target or "").strip(),
            expires_at=expires_at,
        )
    )
    await purge_expired_browser_auth(db)
    return raw_token, max(15, int(settings.browser_login_ticket_ttl_seconds or 60))


async def consume_browser_login_ticket(
    db: AsyncSession,
    raw_ticket: str,
    headers,
) -> BrowserLoginTicket | None:
    if not raw_ticket:
        return None
    now = _utcnow()
    result = await db.execute(
        select(BrowserLoginTicket).where(
            BrowserLoginTicket.token_hash == _hash_token(raw_ticket)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        return None
    if ticket.used_at is not None or ticket.expires_at < now:
        return None
    ticket.used_at = now
    ticket.used_by_ip = _client_ip(headers)
    ticket.used_user_agent = _user_agent(headers)
    return ticket


async def create_browser_session(
    db: AsyncSession,
    telegram_user_id: int,
    headers,
    auth_method: str = "telegram_handoff",
) -> tuple[str, BrowserSession]:
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    now = _utcnow()
    expires_at = now + timedelta(hours=max(1, int(settings.browser_session_ttl_hours or 12)))
    session = BrowserSession(
        session_hash=_hash_token(raw_token),
        telegram_user_id=int(telegram_user_id),
        auth_method=auth_method,
        last_seen_at=now,
        expires_at=expires_at,
        ip_address=_client_ip(headers),
        user_agent=_user_agent(headers),
    )
    db.add(session)
    await purge_expired_browser_auth(db)
    return raw_token, session


async def get_browser_session(
    db: AsyncSession,
    raw_session_token: str | None,
    *,
    touch: bool = True,
) -> BrowserSession | None:
    if not raw_session_token:
        return None
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.session_hash == _hash_token(raw_session_token)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    now = _utcnow()
    if session.revoked_at is not None or session.expires_at < now:
        return None
    if touch:
        settings = get_settings()
        refresh_after = timedelta(minutes=max(1, int(settings.browser_session_idle_refresh_minutes or 5)))
        if session.last_seen_at is None or now - session.last_seen_at >= refresh_after:
            session.last_seen_at = now
            session.expires_at = now + timedelta(hours=max(1, int(settings.browser_session_ttl_hours or 12)))
    return session


async def revoke_browser_session(
    db: AsyncSession,
    raw_session_token: str | None,
) -> bool:
    session = await get_browser_session(db, raw_session_token, touch=False)
    if not session:
        return False
    session.revoked_at = _utcnow()
    return True


async def list_browser_sessions(
    db: AsyncSession,
    telegram_user_id: int,
    raw_current_session_token: str | None = None,
) -> list[dict]:
    now = _utcnow()
    current_hash = _hash_token(raw_current_session_token) if raw_current_session_token else None
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.telegram_user_id == int(telegram_user_id),
            BrowserSession.revoked_at.is_(None),
            BrowserSession.expires_at >= now,
        ).order_by(BrowserSession.last_seen_at.desc(), BrowserSession.created_at.desc())
    )
    rows = result.scalars().all()
    items = []
    for row in rows:
        items.append(
            {
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "ip_address": row.ip_address,
                "user_agent": row.user_agent,
                "auth_method": row.auth_method,
                "is_current": bool(current_hash and row.session_hash == current_hash),
            }
        )
    return items


async def revoke_all_browser_sessions(
    db: AsyncSession,
    telegram_user_id: int,
) -> int:
    now = _utcnow()
    result = await db.execute(
        select(BrowserSession).where(
            BrowserSession.telegram_user_id == int(telegram_user_id),
            BrowserSession.revoked_at.is_(None),
            BrowserSession.expires_at >= now,
        )
    )
    rows = result.scalars().all()
    changed = 0
    for row in rows:
        row.revoked_at = now
        changed += 1
    return changed
