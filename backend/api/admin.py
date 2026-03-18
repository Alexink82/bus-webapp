"""Admin API - stats, logs, dispatchers, export.
Использует схему Booking: id, date, departure, created_at (string).
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta, timezone
import io
import csv

from database import get_db
from config import get_settings
from api.auth_deps import get_verified_telegram_user_id
from logging_config import log_action
from services.roles import is_admin
from services.roles import get_all_admin_ids, get_all_dispatcher_ids
from models import Booking, Dispatcher, LogEntry, BotRole
from core.constants import ROUTES
from services.dashboard_cache import invalidate_dashboard_cache

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


@router.get("/bookings")
async def admin_list_bookings(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    status: str | None = Query(None),
    route_id: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Список заявок для админки с фильтрами и пагинацией."""
    q = select(Booking).where(Booking.is_archived == False)
    if from_date:
        q = q.where(Booking.date >= from_date.isoformat())
    if to_date:
        q = q.where(Booking.date <= to_date.isoformat())
    if status:
        q = q.where(Booking.status == status)
    if route_id:
        q = q.where(Booking.route_id == route_id)
    q = q.order_by(Booking.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    rows = result.scalars().all()
    total_q = select(func.count()).select_from(Booking).where(Booking.is_archived == False)
    if from_date:
        total_q = total_q.where(Booking.date >= from_date.isoformat())
    if to_date:
        total_q = total_q.where(Booking.date <= to_date.isoformat())
    if status:
        total_q = total_q.where(Booking.status == status)
    if route_id:
        total_q = total_q.where(Booking.route_id == route_id)
    total_result = await db.execute(total_q)
    total_count = total_result.scalar() or 0
    return {
        "bookings": [
            {
                "booking_id": r.id,
                "status": r.status,
                "route_id": r.route_id,
                "route_name": ROUTES.get(r.route_id, {}).get("name", r.route_id or ""),
                "from_city": r.from_city or "",
                "to_city": r.to_city or "",
                "departure_date": r.date or "",
                "departure_time": r.departure or "",
                "price_total": r.price_total,
                "currency": "BYN",
                "contact_phone": r.contact_phone or "",
                "created_at": r.created_at or "",
            }
            for r in rows
        ],
        "total": total_count,
        "limit": limit,
        "offset": offset,
    }


class CancelBulkIn(BaseModel):
    booking_ids: list[str]


@router.post("/bookings/cancel-bulk")
async def admin_cancel_bulk(
    body: CancelBulkIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Массовая отмена заявок (только для админа)."""
    ids = [x.strip() for x in (body.booking_ids or []) if x and x.strip()]
    if not ids:
        return {"cancelled": 0, "message": "Нет выбранных заявок"}
    rows = await db.execute(
        select(Booking.contact_tg_id).where(Booking.id.in_(ids)).where(~Booking.status.in_(("cancelled", "done", "ticket_sent")))
    )
    user_ids = {r[0] for r in rows.all() if r[0]}
    stmt = (
        update(Booking)
        .where(Booking.id.in_(ids))
        .where(~Booking.status.in_(("cancelled", "done", "ticket_sent")))
        .values(status="cancelled")
    )
    result = await db.execute(stmt)
    await db.commit()
    await log_action(
        db,
        "INFO",
        "admin",
        "cancel_bulk_bookings",
        user_id=admin_id,
        details={"booking_ids": ids[:50], "requested_count": len(ids), "cancelled": result.rowcount},
    )
    for uid in user_ids:
        await invalidate_dashboard_cache(uid)
    return {"cancelled": result.rowcount, "message": f"Отменено заявок: {result.rowcount}"}


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


ROLE_AUDIT_ACTIONS = ("add_admin", "add_dispatcher", "delete_dispatcher")
OPERATIONS_AUDIT_ACTIONS = (
    "cancel_bulk_bookings",
    "archive_bookings",
    "rotate_logs",
    "export_bookings",
    "take_booking",
    "set_status",
    "export_dispatcher_bookings",
    "cancel_booking",
    "reschedule_request",
)


@router.get("/role-audit")
async def admin_role_audit(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """История изменений ролей: кто, когда добавил/удалил админа или диспетчера."""
    q = (
        select(LogEntry)
        .where(LogEntry.source == "admin", LogEntry.action.in_(ROLE_AUDIT_ACTIONS))
        .order_by(LogEntry.timestamp.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "entries": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "action": r.action,
                "user_id": r.user_id,
                "details": r.details or {},
            }
            for r in rows
        ]
    }


@router.get("/operations-audit")
async def admin_operations_audit(
    limit: int = Query(100, le=300),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """История чувствительных операционных действий админки и диспетчерской."""
    q = (
        select(LogEntry)
        .where(LogEntry.action.in_(OPERATIONS_AUDIT_ACTIONS))
        .order_by(LogEntry.timestamp.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    rows = result.scalars().all()
    return {
        "entries": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "level": r.level,
                "source": r.source,
                "action": r.action,
                "user_id": r.user_id,
                "details": r.details or {},
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
    await db.flush()
    await log_action(
        db,
        "INFO",
        "admin",
        "archive_bookings",
        user_id=admin_id,
        details={"older_than_days": older_than_days, "threshold": threshold, "archived": result.rowcount},
    )
    return {"archived": result.rowcount, "message": f"Archived bookings with date < {threshold}"}


@router.post("/rotate-logs")
async def rotate_logs(
    older_than_days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Удалить записи из log_entries старше N дней. Для ротации логов (cron или вручную)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    result = await db.execute(delete(LogEntry).where(LogEntry.timestamp < cutoff))
    await db.flush()
    await log_action(db, "INFO", "admin", "rotate_logs", user_id=admin_id, details={"older_than_days": older_than_days, "deleted": result.rowcount})
    return {"deleted": result.rowcount, "older_than_days": older_than_days}


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
    await log_action(db, "INFO", "admin", "add_admin", user_id=admin_id, details={"target_telegram_id": body.telegram_id})
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
    await db.flush()
    await log_action(
        db,
        "INFO",
        "admin",
        "add_dispatcher",
        user_id=admin_id,
        details={"target_telegram_id": body.telegram_id, "name": body.name, "routes_count": len(body.routes or [])},
    )
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
    await log_action(db, "INFO", "admin", "delete_dispatcher", user_id=admin_id, details={"target_telegram_id": telegram_id})
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
    await log_action(
        db,
        "INFO",
        "admin",
        "export_bookings",
        user_id=admin_id,
        details={"from_date": from_str, "to_date": to_str, "rows": len(rows)},
    )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )
