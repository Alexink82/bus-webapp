"""Admin API - stats, logs, dispatchers, archive."""
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta
import io
import csv

from database import get_db
from config import get_settings
from models import Booking, Dispatcher, LogEntry

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_admin_id(x_telegram_user_id: str | None = Header(None)) -> int:
    if not x_telegram_user_id:
        raise HTTPException(401, detail="telegram_id_required")
    try:
        uid = int(x_telegram_user_id)
    except ValueError:
        raise HTTPException(401, detail="invalid_telegram_id")
    settings = get_settings()
    if uid not in settings.admin_ids_list:
        raise HTTPException(403, detail="not_admin")
    return uid


@router.get("/stats")
async def admin_stats(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Aggregate stats."""
    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()
    q = select(
        func.date(Booking.created_at).label("d"),
        Booking.route_id,
        func.count(Booking.id).label("cnt"),
        func.coalesce(func.sum(Booking.price_total), 0).label("s"),
    ).where(
        Booking.created_at >= datetime.combine(from_date, datetime.min.time()),
        Booking.created_at <= datetime.combine(to_date, datetime.max.time()),
        Booking.is_archived == False,
    ).group_by(func.date(Booking.created_at), Booking.route_id)
    result = await db.execute(q)
    rows = result.all()
    by_day = {}
    by_route = {}
    for r in rows:
        d = str(r.d)
        by_day[d] = by_day.get(d, 0) + r.cnt
        by_route[r.route_id] = by_route.get(r.route_id, 0) + r.cnt
    total_bookings = sum(r.cnt for r in rows)
    total_sum = sum(float(r.s) for r in rows)
    return {
        "from_date": str(from_date),
        "to_date": str(to_date),
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
    """Log entries with filters."""
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
    """Mark old done/cancelled bookings as archived."""
    border = date.today() - timedelta(days=older_than_days)
    result = await db.execute(
        select(Booking).where(
            Booking.is_archived == False,
            Booking.status.in_(["done", "cancelled"]),
            Booking.departure_date < border,
        )
    )
    rows = result.scalars().all()
    now = datetime.utcnow()
    for b in rows:
        b.is_archived = True
        b.archived_at = now
    await db.commit()
    return {"archived": len(rows)}


@router.get("/dispatchers")
async def list_dispatchers(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """List dispatchers."""
    result = await db.execute(select(Dispatcher).order_by(Dispatcher.telegram_id))
    rows = result.scalars().all()
    return {
        "dispatchers": [
            {
                "telegram_id": r.telegram_id,
                "name": r.name,
                "phone": r.phone,
                "routes": r.routes or [],
                "direction": r.direction,
                "is_active": r.is_active,
            }
            for r in rows
        ]
    }


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
    await db.commit()
    return {"success": True}


@router.get("/export")
async def export_bookings(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Export bookings to CSV."""
    if not from_date:
        from_date = date.today() - timedelta(days=30)
    if not to_date:
        to_date = date.today()
    result = await db.execute(
        select(Booking).where(
            Booking.created_at >= datetime.combine(from_date, datetime.min.time()),
            Booking.created_at <= datetime.combine(to_date, datetime.max.time()),
        ).order_by(Booking.created_at)
    )
    rows = result.scalars().all()
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["booking_id", "status", "route_name", "from_city", "to_city", "departure_date", "departure_time", "price_total", "currency", "created_at"])
    for r in rows:
        w.writerow([
            r.booking_id, r.status, r.route_name, r.from_city, r.to_city,
            str(r.departure_date), r.departure_time, r.price_total, r.currency,
            r.created_at.isoformat() if r.created_at else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )
