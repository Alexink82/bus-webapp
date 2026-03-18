"""Browser auth endpoints for admin/dispatcher backoffice."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth_deps import get_backoffice_user_id, get_optional_backoffice_user_id, get_verified_telegram_user_id
from config import get_settings
from database import get_db
from logging_config import log_action
from services.browser_auth import (
    consume_browser_login_ticket,
    create_browser_session,
    issue_browser_login_ticket,
    list_browser_sessions,
    revoke_browser_session,
    revoke_all_browser_sessions,
)
from services.roles import get_dispatcher_route_ids, is_admin

router = APIRouter(prefix="/api/auth", tags=["browser-auth"])


class BrowserTicketIn(BaseModel):
    target: str


class BrowserExchangeIn(BaseModel):
    ticket: str


async def _ensure_browser_target_allowed(db: AsyncSession, user_id: int, target: str) -> None:
    target = (target or "").strip()
    if target == "admin":
        if not is_admin(user_id):
            raise HTTPException(403, detail="not_admin")
        return
    if target == "dispatcher":
        route_ids = await get_dispatcher_route_ids(db, user_id)
        if route_ids is None and not is_admin(user_id):
            raise HTTPException(403, detail="not_dispatcher")
        return
    raise HTTPException(400, detail="invalid_browser_auth_target")


def _set_session_cookie(request: Request, response: Response, raw_session_token: str) -> None:
    settings = get_settings()
    max_age = max(3600, int(settings.browser_session_ttl_hours or 12) * 3600)
    response.set_cookie(
        key=settings.browser_session_cookie_name,
        value=raw_session_token,
        httponly=True,
        secure=(request.url.scheme == "https"),
        samesite="lax",
        max_age=max_age,
        path="/",
    )


@router.post("/browser-ticket")
async def create_browser_ticket(
    body: BrowserTicketIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    target = (body.target or "").strip()
    await _ensure_browser_target_allowed(db, user_id, target)
    ticket, expires_in = await issue_browser_login_ticket(db, user_id, target)
    await log_action(
        db,
        "INFO",
        "auth",
        "issue_browser_ticket",
        user_id=user_id,
        details={"target": target, "expires_in_seconds": expires_in},
        ip_address=(request.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or None,
    )
    return {"ticket": ticket, "target": target, "expires_in_seconds": expires_in}


@router.post("/browser-exchange")
async def exchange_browser_ticket(
    body: BrowserExchangeIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    ticket = await consume_browser_login_ticket(db, (body.ticket or "").strip(), request.headers)
    if not ticket:
        raise HTTPException(401, detail="invalid_browser_login_ticket")
    await _ensure_browser_target_allowed(db, int(ticket.telegram_user_id), ticket.target)
    raw_session_token, session = await create_browser_session(db, int(ticket.telegram_user_id), request.headers)
    _set_session_cookie(request, response, raw_session_token)
    await log_action(
        db,
        "INFO",
        "auth",
        "browser_login",
        user_id=int(ticket.telegram_user_id),
        details={"target": ticket.target, "auth_method": session.auth_method},
        ip_address=(request.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or None,
    )
    route_ids = await get_dispatcher_route_ids(db, int(ticket.telegram_user_id))
    return {
        "success": True,
        "target": ticket.target,
        "telegram_user_id": int(ticket.telegram_user_id),
        "is_admin": is_admin(int(ticket.telegram_user_id)),
        "is_dispatcher": route_ids is not None,
    }


@router.get("/session")
async def get_browser_session_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: int | None = Depends(get_optional_backoffice_user_id),
):
    if user_id is None:
        return {"authenticated": False}
    route_ids = await get_dispatcher_route_ids(db, int(user_id))
    settings = get_settings()
    has_cookie = bool(request.cookies.get(settings.browser_session_cookie_name))
    return {
        "authenticated": True,
        "telegram_user_id": int(user_id),
        "is_admin": is_admin(int(user_id)),
        "is_dispatcher": route_ids is not None,
        "auth_mode": "browser" if has_cookie else "telegram",
    }


@router.post("/logout")
async def logout_browser_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user_id: int | None = Depends(get_optional_backoffice_user_id),
):
    settings = get_settings()
    raw_token = request.cookies.get(settings.browser_session_cookie_name)
    revoked = await revoke_browser_session(db, raw_token)
    response.delete_cookie(settings.browser_session_cookie_name, path="/")
    if user_id is not None:
        await log_action(
            db,
            "INFO",
            "auth",
            "browser_logout",
            user_id=int(user_id),
            details={"revoked": revoked},
            ip_address=(request.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or None,
        )
    return {"success": True, "revoked": revoked}


@router.get("/sessions")
async def get_browser_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_backoffice_user_id),
):
    settings = get_settings()
    raw_token = request.cookies.get(settings.browser_session_cookie_name)
    sessions = await list_browser_sessions(db, int(user_id), raw_token)
    return {
        "sessions": sessions,
        "telegram_user_id": int(user_id),
        "current_cookie_session": bool(raw_token),
    }


@router.post("/logout-all")
async def logout_all_browser_sessions(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_backoffice_user_id),
):
    settings = get_settings()
    revoked_count = await revoke_all_browser_sessions(db, int(user_id))
    response.delete_cookie(settings.browser_session_cookie_name, path="/")
    await log_action(
        db,
        "INFO",
        "auth",
        "browser_logout_all",
        user_id=int(user_id),
        details={"revoked_sessions": revoked_count},
        ip_address=(request.headers.get("X-Forwarded-For") or "").split(",")[0].strip() or None,
    )
    return {"success": True, "revoked_sessions": revoked_count}
