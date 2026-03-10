"""Dispatcher API - bookings, take, status, stats."""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta

from database import get_db
from config import get_settings
from models import Booking, Dispatcher
from services.notification import notify_booking_status
from logging_config import log_action

router = APIRouter(prefix="/api/dispatcher", tags=["dispatcher"])


def get_dispatcher_id(x_telegram_user_id: str | None = Header(None)) -> int:
    if not x_telegram_user_id:
        raise HTTPException(401, detail="telegram_id_required")
    try:
        uid = int(x_telegram_user_id)
    except ValueError:
        raise HTTPException(401, detail="invalid_telegram_id")
    return uid


async def require_dispatcher(
    db: AsyncSession,
    telegram_id: int,
) -> Dispatcher:
    result = await db.execute(
        select(Dispatcher).where(
            Dispatcher.telegram_id == telegram_id,
            Dispatcher.is_active == True,
        )
    )
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(403, detail="not_dispatcher")
    return d


@router.get("/bookings")
async def list_bookings(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_dispatcher_id),
):
    """List bookings for dispatcher's routes."""
    disp = await require_dispatcher(db, dispatcher_id)
    routes = disp.routes or []
    if not routes:
        return {"bookings": []}

    q = select(Booking).where(
        Booking.route_id.in_(routes),
        Booking.is_archived == False,
    )
    if status:
        q = q.where(Booking.status == status)
    q = q.order_by(Booking.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    items = []
    for r in rows:
        items.append({
            "booking_id": r.booking_id,
            "status": r.status,
            "dispatcher_id": r.dispatcher_id,
            "route_name": r.route_name,
            "from_city": r.from_city,
            "to_city": r.to_city,
            "departure_date": str(r.departure_date),
            "departure_time": r.departure_time,
            "passengers_count": r.passengers_count,
            "price_total": r.price_total,
            "currency": r.currency,
            "payment_status": r.payment_status,
            "user_id": r.user_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return {"bookings": items}


@router.post("/bookings/{booking_id}/take")
async def take_booking(
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_dispatcher_id),
):
    """Take booking in work."""
    disp = await require_dispatcher(db, dispatcher_id)
    result = await db.execute(
        select(Booking).where(
            Booking.booking_id == booking_id,
            Booking.route_id.in_(disp.routes or []),
        )
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.dispatcher_id and b.dispatcher_id != dispatcher_id:
        raise HTTPException(409, detail="already_taken")
    b.dispatcher_id = dispatcher_id
    b.status = "active"
    await log_action(db, "INFO", "dispatcher", "take_booking", user_id=dispatcher_id, details={"booking_id": booking_id})
    await db.commit()
    if b.user_id:
        await notify_booking_status(b.user_id, booking_id, "active", "ru")
    return {"success": True, "status": "active"}


class SetStatusIn(BaseModel):
    status: str


@router.post("/bookings/{booking_id}/status")
async def set_booking_status(
    booking_id: str,
    body: SetStatusIn,
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_dispatcher_id),
):
    """Change booking status."""
    disp = await require_dispatcher(db, dispatcher_id)
    result = await db.execute(
        select(Booking).where(
            Booking.booking_id == booking_id,
            Booking.route_id.in_(disp.routes or []),
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
    if body.status == "paid":
        b.payment_status = "paid"
    await log_action(db, "INFO", "dispatcher", "set_status", user_id=dispatcher_id, details={"booking_id": booking_id, "status": body.status})
    await db.commit()
    if b.user_id:
        await notify_booking_status(b.user_id, booking_id, body.status, "ru")
    return {"success": True, "status": body.status}


@router.get("/stats")
async def dispatcher_stats(
    db: AsyncSession = Depends(get_db),
    dispatcher_id: int = Depends(get_dispatcher_id),
):
    """My stats for today."""
    disp = await require_dispatcher(db, dispatcher_id)
    today = date.today()
    routes = disp.routes or []
    if not routes:
        return {"total": 0, "sum": 0, "by_status": {}}

    q = select(
        Booking.status,
        func.count(Booking.id).label("cnt"),
        func.coalesce(func.sum(Booking.price_total), 0).label("s"),
    ).where(
        Booking.route_id.in_(routes),
        Booking.dispatcher_id == dispatcher_id,
        func.date(Booking.created_at) == today,
    ).group_by(Booking.status)
    result = await db.execute(q)
    rows = result.all()
    by_status = {r.status: r.cnt for r in rows}
    total = sum(r.cnt for r in rows)
    s = sum(float(r.s) for r in rows)
    return {"total": total, "sum": round(s, 2), "by_status": by_status}
