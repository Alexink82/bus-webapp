"""Admin API - stats, logs, dispatchers, export.
Использует схему Booking: id, date, departure, created_at (string).
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta
import io
import csv

from database import get_db
from config import get_settings
from api.auth_deps import get_verified_telegram_user_id
from services.roles import is_admin
from services.roles import get_all_admin_ids, get_all_dispatcher_ids
from models import Booking, Dispatcher, LogEntry, BotRole
from core.constants import ROUTES
from logging_config import log_action

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_admin_id(uid: int = Depends(get_verified_telegram_user_id)) -> int:
    if not is_admin(uid):
        raise HTTPException(403, detail="not_admin")
    return uid


@router.get("/stats")
async def admin_stats(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Агрегированная статистика за период (по полю date и created_at)."""
    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()
    from_str = from_date.isoformat()
    to_str = to_date.isoformat()
    q = select(Booking).where(
        Booking.date >= from_str,
        Booking.date <= to_str,
        Booking.is_archived == False,
    )
    result = await db.execute(q)
    rows = result.scalars().all()
    total_bookings = len(rows)
    total_sum = sum(float(r.price_total or 0) for r in rows)
    by_day = {}
    by_route = {}
    for r in rows:
        d = r.date or ""
        by_day[d] = by_day.get(d, 0) + 1
        rid = r.route_id or ""
        by_route[rid] = by_route.get(rid, 0) + 1
    return {
        "from_date": from_str,
        "to_date": to_str,
        "total_bookings": total_bookings,
        "total_sum": round(total_sum, 2),
        "by_day": by_day,
        "by_route": by_route,
    }


@router.get("/logs")
async def admin_logs(
    level: str | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Записи лога с фильтрами."""
    q = select(LogEntry).order_by(LogEntry.timestamp.desc()).limit(limit)
    if level:
        q = q.where(LogEntry.level == level)
    if source:
        q = q.where(LogEntry.source == source)
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "logs": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "level": r.level,
                "source": r.source,
                "user_id": r.user_id,
                "action": r.action,
                "details": r.details,
            }
            for r in rows
        ]
    }


@router.post("/archive")
async def run_archive(
    older_than_days: int = Query(90),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Пометить старые заявки как архивированные (is_archived=True)."""
    threshold = (date.today() - timedelta(days=older_than_days)).isoformat()
    result = await db.execute(
        update(Booking).where(
            Booking.date < threshold,
            Booking.is_archived == False,
        ).values(is_archived=True)
    )
    return {"archived": result.rowcount, "message": f"Archived bookings with date < {threshold}"}


@router.get("/admins")
async def list_admins(admin_id: int = Depends(get_admin_id)):
    """Список ID администраторов (из env + bot_roles)."""
    return {"admin_ids": get_all_admin_ids()}


class AdminIn(BaseModel):
    telegram_id: int


@router.post("/admins")
async def add_admin(
    body: AdminIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Добавить администратора (запись в bot_roles). После добавления обновите страницу."""
    existing = await db.execute(select(BotRole).where(BotRole.user_id == body.telegram_id))
    row = existing.scalar_one_or_none()
    if row:
        row.is_admin = True
    else:
        db.add(BotRole(user_id=body.telegram_id, is_admin=True, is_dispatcher=False))
    await db.flush()
    from services.roles import load_roles
    await load_roles(db)
    await log_action(db, "INFO", "admin", "add_admin", user_id=admin_id, details={"target_user_id": body.telegram_id})
    return {"success": True}


@router.get("/dispatchers")
async def list_dispatchers(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """List dispatchers (из БД и из переменной DISPATCHER_IDS на Render)."""
    result = await db.execute(select(Dispatcher).where(Dispatcher.is_active == True).order_by(Dispatcher.telegram_id))
    rows = result.scalars().all()
    env_ids = set(get_all_dispatcher_ids())
    db_ids = {r.telegram_id for r in rows}
    list_ = [
        {
            "telegram_id": r.telegram_id,
            "name": r.name,
            "phone": r.phone,
            "routes": r.routes or [],
            "direction": r.direction,
            "is_active": r.is_active,
            "from_env": False,
        }
        for r in rows
    ]
    for uid in env_ids:
        if uid not in db_ids:
            list_.append({"telegram_id": uid, "name": None, "phone": None, "routes": [], "direction": None, "is_active": True, "from_env": True})
    list_.sort(key=lambda x: x["telegram_id"])
    return {"dispatchers": list_}


class DispatcherIn(BaseModel):
    telegram_id: int
    name: str
    phone: str = ""
    routes: list = []
    direction: str = ""


@router.post("/dispatchers")
async def add_dispatcher(
    body: DispatcherIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Add dispatcher."""
    existing = await db.execute(
        select(Dispatcher).where(Dispatcher.telegram_id == body.telegram_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail="dispatcher_exists")
    d = Dispatcher(
        telegram_id=body.telegram_id,
        name=body.name,
        phone=body.phone,
        routes=body.routes,
        direction=body.direction,
        is_active=True,
    )
    db.add(d)
    await log_action(db, "INFO", "admin", "add_dispatcher", user_id=admin_id, details={"target_user_id": body.telegram_id, "routes": body.routes or []})
    return {"success": True}


@router.delete("/dispatchers/{telegram_id}")
async def remove_dispatcher(
    telegram_id: int,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Деактивировать диспетчера (is_active=False). Вкладка «Диспетчер» у него пропадёт."""
    result = await db.execute(
        select(Dispatcher).where(Dispatcher.telegram_id == telegram_id)
    )
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(404, detail="dispatcher_not_found")
    d.is_active = False
    await log_action(db, "INFO", "admin", "remove_dispatcher", user_id=admin_id, details={"target_user_id": telegram_id})
    return {"success": True}


@router.get("/export")
async def export_bookings(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Экспорт заявок в CSV."""
    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()
    from_str = from_date.isoformat()
    to_str = to_date.isoformat()
    result = await db.execute(
        select(Booking).where(
            Booking.date >= from_str,
            Booking.date <= to_str,
            Booking.is_archived == False,
        ).order_by(Booking.created_at)
    )
    rows = result.scalars().all()
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["booking_id", "status", "route_name", "from_city", "to_city", "departure_date", "departure_time", "price_total", "currency", "created_at"])
    for r in rows:
        route_name = ROUTES.get(r.route_id, {}).get("name", r.route_id or "")
        w.writerow([
            r.id, r.status, route_name, r.from_city, r.to_city,
            r.date or "", r.departure or "", r.price_total, "BYN",
            r.created_at or "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )


@router.get("/roles/audit")
async def role_audit(
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Аудит изменений ролей (админы/диспетчеры)."""
    q = select(LogEntry).where(
        LogEntry.source == "admin",
        LogEntry.action.in_(["add_admin", "add_dispatcher", "remove_dispatcher"]),
    ).order_by(LogEntry.timestamp.desc()).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "items": [
            {
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "action": r.action,
                "user_id": r.user_id,
                "details": r.details or {},
            }
            for r in rows
        ]
    }
