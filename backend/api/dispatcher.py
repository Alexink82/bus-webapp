"""Dispatcher API - bookings, take, status, stats, export.
Админ имеет полный доступ на чтение (все заявки, статистика, экспорт); диспетчер — только свои маршруты и взятые заявки.
"""
import csv
import io
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth_deps import get_backoffice_user_id
from api.websocket import manager as ws_manager
from core.constants import ROUTES
from database import get_db
from logging_config import log_action
from models import Booking, Dispatcher
from services.notification import notify_booking_status
from services.roles import get_dispatcher_route_ids, has_admin_permission, is_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dispatcher", tags=["dispatcher"])


def _route_ids_list(route_ids: list | None) -> list:
    """Пустой или None = все маршруты."""
    if route_ids and len(route_ids) > 0:
        return list(route_ids)
    return list(ROUTES.keys())


@router.get("/bookings")
async def list_bookings(
    status: str | None = None,
    route_id: str | None = None,
    departure_date: str | None = None,
    payment_status: str | None = None,
    filter_dispatcher_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_backoffice_user_id),
):
    """Список заявок. Диспетчер — только свои маршруты и свои взятые. Админ — все заявки; filter_dispatcher_id сужает до одного диспетчера."""
    route_ids = await get_dispatcher_route_ids(db, user_id)
    admin_view = route_ids is None and is_admin(user_id)
    if route_ids is None and not admin_view:
        raise HTTPException(403, detail="not_dispatcher")
    if admin_view:
        route_ids = list(ROUTES.keys())
    else:
        route_ids = _route_ids_list(route_ids)
    q = select(Booking).where(Booking.route_id.in_(route_ids))
    if status:
        q = q.where(Booking.status == status)
        if status == "active":
            if admin_view and filter_dispatcher_id is not None:
                q = q.where(Booking.dispatcher_id == filter_dispatcher_id)
            elif not admin_view:
                q = q.where(Booking.dispatcher_id == user_id)
    if route_id:
        q = q.where(Booking.route_id == route_id)
    if departure_date:
        q = q.where(Booking.date == departure_date)
    if payment_status == "paid":
        q = q.where(Booking.paid_at.is_not(None), Booking.paid_at != "")
    elif payment_status == "pending":
        q = q.where(or_(Booking.paid_at.is_(None), Booking.paid_at == ""))
    if admin_view and filter_dispatcher_id is not None:
        q = q.where(Booking.dispatcher_id == filter_dispatcher_id)
    q = q.order_by(Booking.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    items = []
    for r in rows:
        route_name = ROUTES.get(r.route_id, {}).get("name", r.route_id or "")
        passengers_count = len(r.passengers) if r.passengers else 0
        pay_status = "paid" if (r.paid_at and r.paid_at.strip()) else "pending"
        items.append({
            "booking_id": r.id,
            "status": r.status,
            "dispatcher_id": r.dispatcher_id,
            "route_name": route_name,
            "from_city": r.from_city,
            "to_city": r.to_city,
            "departure_date": r.date or "",
            "departure_time": r.departure or "",
            "passengers_count": passengers_count,
            "price_total": r.price_total,
            "currency": "BYN",
            "payment_status": pay_status,
            "user_id": r.contact_tg_id,
            "created_at": r.created_at,
        })
    return {"bookings": items, "is_admin_view": admin_view}


@router.post("/bookings/{booking_id}/take")
async def take_booking(
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_backoffice_user_id),
):
    """Взять заявку в работу."""
    route_ids = await get_dispatcher_route_ids(db, dispatcher_id)
    if route_ids is None:
        raise HTTPException(403, detail="not_dispatcher")
    route_ids = _route_ids_list(route_ids)
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.route_id.in_(route_ids),
        ).with_for_update()
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.dispatcher_id and b.dispatcher_id != dispatcher_id:
        raise HTTPException(409, detail="already_taken")
    previous_status = b.status
    b.dispatcher_id = int(dispatcher_id)
    b.status = "active"
    b.taken_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    await log_action(
        db,
        "INFO",
        "dispatcher",
        "take_booking",
        user_id=dispatcher_id,
        details={"booking_id": booking_id, "route_id": b.route_id, "previous_status": previous_status, "new_status": "active"},
    )
    await db.commit()
    if b.contact_tg_id:
        try:
            await notify_booking_status(b.contact_tg_id, booking_id, "active", "ru")
        except Exception as e:
            logger.exception("take_booking: notify_booking_status failed: %s", e)
    try:
        await ws_manager.broadcast_booking_status_changed(booking_id, b.route_id, "active")
    except Exception as e:
        logger.warning("take_booking: ws broadcast failed: %s", e)
    return {"success": True, "status": "active"}


class SetStatusIn(BaseModel):
    status: str
    reason: str | None = None


@router.post("/bookings/{booking_id}/status")
async def set_booking_status(
    booking_id: str,
    body: SetStatusIn,
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_backoffice_user_id),
):
    """Изменить статус заявки."""
    route_ids = await get_dispatcher_route_ids(db, dispatcher_id)
    if route_ids is None:
        raise HTTPException(403, detail="not_dispatcher")
    route_ids = _route_ids_list(route_ids)
    result = await db.execute(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.route_id.in_(route_ids),
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.dispatcher_id != dispatcher_id:
        raise HTTPException(403, detail="not_your_booking")
    allowed = {"active", "payment_link_sent", "paid", "ticket_sent", "done", "cancelled"}
    if body.status not in allowed:
        raise HTTPException(400, detail="invalid_status")
    previous_status = b.status
    b.status = body.status
    if body.status == "cancelled":
        if not (body.reason or "").strip():
            raise HTTPException(400, detail="reason_required")
        b.cancel_reason = (body.reason or "").strip()
    if body.status == "paid":
        b.paid_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    await log_action(
        db,
        "INFO",
        "dispatcher",
        "set_status",
        user_id=dispatcher_id,
        details={
            "booking_id": booking_id,
            "route_id": b.route_id,
            "previous_status": previous_status,
            "new_status": body.status,
            "has_reason": bool((body.reason or "").strip()),
        },
    )
    await db.commit()
    if b.contact_tg_id:
        try:
            await notify_booking_status(b.contact_tg_id, booking_id, body.status, "ru")
        except Exception as e:
            logger.exception("set_booking_status: notify_booking_status failed: %s", e)
    try:
        await ws_manager.broadcast_booking_status_changed(booking_id, b.route_id, body.status)
    except Exception as e:
        logger.warning("set_booking_status: ws broadcast failed: %s", e)
    return {"success": True, "status": body.status, "cancel_reason": getattr(b, "cancel_reason", None)}


@router.get("/stats")
async def dispatcher_stats(
    filter_dispatcher_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_backoffice_user_id),
):
    """Статистика за сегодня. Диспетчер — только свои взятые заявки. Админ — все или по filter_dispatcher_id."""
    route_ids = await get_dispatcher_route_ids(db, user_id)
    admin_view = route_ids is None and is_admin(user_id)
    if route_ids is None and not admin_view:
        raise HTTPException(403, detail="not_dispatcher")
    today_str = date.today().isoformat()
    if admin_view:
        q = select(Booking).where(Booking.created_at.startswith(today_str))
        if filter_dispatcher_id is not None:
            q = q.where(Booking.dispatcher_id == filter_dispatcher_id)
    else:
        route_ids = _route_ids_list(route_ids)
        q = select(Booking).where(
            Booking.route_id.in_(route_ids),
            Booking.dispatcher_id == user_id,
            Booking.created_at.startswith(today_str),
        )
    result = await db.execute(q)
    rows = result.scalars().all()
    total = len(rows)
    s = sum((r.price_total or 0) for r in rows)
    by_status = {}
    overdue_15m = 0
    now = datetime.now(timezone.utc)
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        if r.status == "active" and r.taken_at:
            try:
                taken_dt = datetime.fromisoformat(r.taken_at.replace("Z", "+00:00"))
                if taken_dt.tzinfo is None:
                    taken_dt = taken_dt.replace(tzinfo=timezone.utc)
                if (now - taken_dt).total_seconds() > 15 * 60:
                    overdue_15m += 1
            except Exception:
                continue
    return {"total": total, "sum": round(s, 2), "by_status": by_status, "overdue_15m": overdue_15m, "is_admin_view": admin_view}


@router.get("/export")
async def export_dispatcher_bookings_today(
    filter_dispatcher_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_backoffice_user_id),
):
    """Экспорт заявок за сегодня в CSV. Админ — все или по filter_dispatcher_id."""
    route_ids = await get_dispatcher_route_ids(db, user_id)
    admin_view = route_ids is None and is_admin(user_id)
    if route_ids is None and not admin_view:
        raise HTTPException(403, detail="not_dispatcher")
    if admin_view and not await has_admin_permission(db, user_id, "export_data"):
        raise HTTPException(403, detail="missing_admin_permission:export_data")
    today_str = date.today().isoformat()
    if admin_view:
        q = select(Booking).where(Booking.created_at.startswith(today_str))
        if filter_dispatcher_id is not None:
            q = q.where(Booking.dispatcher_id == filter_dispatcher_id)
    else:
        route_ids = _route_ids_list(route_ids)
        q = select(Booking).where(
            Booking.route_id.in_(route_ids),
            Booking.dispatcher_id == user_id,
            Booking.created_at.startswith(today_str),
        )
    q = q.order_by(Booking.created_at)
    result = await db.execute(q)
    rows = result.scalars().all()
    output = io.StringIO()
    w = csv.writer(output)
    headers_row = [
        "booking_id",
        "status",
        "dispatcher_id",
        "route_name",
        "from_city",
        "to_city",
        "departure_date",
        "departure_time",
        "price_total",
        "currency",
        "created_at",
    ]
    w.writerow(headers_row)
    for r in rows:
        route_name = ROUTES.get(r.route_id, {}).get("name", r.route_id or "")
        w.writerow(
            [
                r.id,
                r.status,
                r.dispatcher_id or "",
                route_name,
                r.from_city,
                r.to_city,
                r.date or "",
                r.departure or "",
                r.price_total,
                "BYN",
                r.created_at or "",
            ]
        )
    output.seek(0)
    suffix = f"admin_{filter_dispatcher_id or 'all'}" if admin_view else str(user_id)
    filename = f"dispatcher_{suffix}_{today_str}.csv"
    await log_action(
        db,
        "INFO",
        "dispatcher",
        "export_dispatcher_bookings",
        user_id=user_id,
        details={"is_admin_view": admin_view, "filter_dispatcher_id": filter_dispatcher_id, "rows": len(rows), "date": today_str},
    )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
