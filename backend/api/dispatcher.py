"""Dispatcher API - bookings, take, status, stats."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timezone

from database import get_db
from api.auth_deps import get_verified_telegram_user_id
from api.websocket import manager as ws_manager
from models import Booking, Dispatcher
from core.constants import ROUTES
from services.roles import get_dispatcher_route_ids
from services.notification import notify_booking_status
from logging_config import log_action

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
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_verified_telegram_user_id),
):
    """Список заявок: все маршруты если routes пустой, иначе по маршрутам диспетчера."""
    route_ids = await get_dispatcher_route_ids(db, dispatcher_id)
    if route_ids is None:
        raise HTTPException(403, detail="not_dispatcher")
    route_ids = _route_ids_list(route_ids)
    q = select(Booking).where(Booking.route_id.in_(route_ids))
    if status:
        q = q.where(Booking.status == status)
        # Во вкладке «В работе» показываем только заявки, взятые текущим диспетчером
        if status == "active":
            q = q.where(Booking.dispatcher_id == dispatcher_id)
    if route_id:
        q = q.where(Booking.route_id == route_id)
    if departure_date:
        q = q.where(Booking.date == departure_date)
    if payment_status == "paid":
        q = q.where(Booking.paid_at.is_not(None), Booking.paid_at != "")
    elif payment_status == "pending":
        q = q.where(or_(Booking.paid_at.is_(None), Booking.paid_at == ""))
    q = q.order_by(Booking.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    items = []
    for r in rows:
        route_name = ROUTES.get(r.route_id, {}).get("name", r.route_id or "")
        passengers_count = len(r.passengers) if r.passengers else 0
        payment_status = "paid" if (r.paid_at and r.paid_at.strip()) else "pending"
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
            "payment_status": payment_status,
            "user_id": r.contact_tg_id,
            "created_at": r.created_at,
        })
    return {"bookings": items}


@router.post("/bookings/{booking_id}/take")
async def take_booking(
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_verified_telegram_user_id),
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
    b.dispatcher_id = int(dispatcher_id)
    b.status = "active"
    b.taken_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    await log_action(db, "INFO", "dispatcher", "take_booking", user_id=dispatcher_id, details={"booking_id": booking_id})
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
    dispatcher_id: int = Depends(get_verified_telegram_user_id),
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
    b.status = body.status
    if body.status == "cancelled":
        if not (body.reason or "").strip():
            raise HTTPException(400, detail="reason_required")
        b.cancel_reason = (body.reason or "").strip()
    if body.status == "paid":
        b.paid_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    await log_action(db, "INFO", "dispatcher", "set_status", user_id=dispatcher_id, details={"booking_id": booking_id, "status": body.status})
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
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_verified_telegram_user_id),
):
    """Статистика диспетчера за сегодня (по дате создания заявки)."""
    route_ids = await get_dispatcher_route_ids(db, dispatcher_id)
    if route_ids is None:
        raise HTTPException(403, detail="not_dispatcher")
    route_ids = _route_ids_list(route_ids)
    today_str = date.today().isoformat()
    q = select(Booking).where(
        Booking.route_id.in_(route_ids),
        Booking.dispatcher_id == dispatcher_id,
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
    return {"total": total, "sum": round(s, 2), "by_status": by_status, "overdue_15m": overdue_15m}
