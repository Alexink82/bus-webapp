"""Booking API — схема как в bus-bot (одна таблица bookings)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.constants import ROUTES, DISCOUNT_RULES, generate_booking_id, get_local_time
from database import get_db
from models import Booking, UserProfile
from services.price_calc import calculate_booking_totals
from services.validators import validate_phone, validate_passenger, validate_booking_dates
from services.notification import notify_booking_created
from logging_config import log_action

router = APIRouter(prefix="/api", tags=["booking"])


class CreateBookingIn(BaseModel):
    route_id: str
    from_city: str
    to_city: str
    departure_date: str
    departure_time: str
    passengers: list
    is_round_trip: bool = False
    is_for_another_person: bool = False
    another_person_phone: str | None = None
    phone: str
    save_phone_in_profile: bool = False
    payment_method: str
    user_id: int | None = None


def _route_dict_for_calc(route_id: str):
    r = ROUTES.get(route_id)
    if not r:
        return None
    route_type = r.get("type", "local")
    stops = r.get("stops", [])
    base = float(r.get("price", 0))
    stops_api = [{"city": c, "price_offset": base * i // max(len(stops), 1)} for i, c in enumerate(stops)]
    return {
        "id": route_id,
        "name": r["name"],
        "type": route_type,
        "stops": stops_api,
        "discount_rules": DISCOUNT_RULES.get(route_type, {}),
        "base_price": base,
    }


@router.post("/bookings")
async def create_booking(
    body: CreateBookingIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    dep_date = date.fromisoformat(body.departure_date)
    ok, err = validate_booking_dates(dep_date)
    if not ok:
        raise HTTPException(400, detail={"code": err})

    if not body.passengers:
        raise HTTPException(400, detail={"code": "passengers_required"})

    route_dict = _route_dict_for_calc(body.route_id)
    if not route_dict:
        raise HTTPException(404, detail="route_not_found")

    for p in body.passengers:
        ok, err = validate_passenger(p, route_dict["type"], dep_date)
        if not ok:
            raise HTTPException(400, detail={"code": err, "passenger": p})

    if not validate_phone(body.phone):
        raise HTTPException(400, detail={"code": "invalid_phone"})

    price_one, price_return, price_total = calculate_booking_totals(
        route_dict, body.from_city, body.to_city, body.passengers, dep_date, body.is_round_trip,
    )

    user_id = body.user_id or 0
    if user_id:
        user_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        profile = user_result.scalar_one_or_none()
        if not profile:
            profile = UserProfile(user_id=user_id, phone=body.phone if body.save_phone_in_profile else None)
            db.add(profile)
            await db.flush()
        elif body.save_phone_in_profile:
            profile.phone = body.phone

    route_info = ROUTES[body.route_id]
    booking_id = generate_booking_id()
    now = get_local_time()
    created_at_str = now.strftime("%Y-%m-%dT%H:%M:%S")

    booking = Booking(
        id=booking_id,
        status="new",
        created_at=created_at_str,
        route_id=body.route_id,
        from_city=body.from_city,
        to_city=body.to_city,
        date=body.departure_date,
        departure=body.departure_time,
        arrival=route_info.get("arrival", ""),
        passengers=body.passengers,
        contact_phone=body.phone,
        contact_tg_id=user_id if user_id else None,
        contact_username=None,
        price_total=price_total,
        payment_method=body.payment_method,
        dispatcher_id=None,
        taken_at=None,
        paid_at=None,
    )
    db.add(booking)
    await db.flush()

    await log_action(
        db, "INFO", "api", "create_booking",
        user_id=user_id if user_id else None,
        details={"booking_id": booking_id, "route_id": body.route_id},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    if user_id and user_id > 0:
        await notify_booking_created(
            user_id, booking_id, route_info["name"],
            body.departure_date, body.departure_time,
            price_total, "BYN", "ru",
        )

    return {
        "booking_id": booking_id,
        "status": "new",
        "price_total": price_total,
        "currency": "BYN",
        "payment_deadline": None,
    }


@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    route_info = ROUTES.get(b.route_id, {})
    return {
        "booking_id": b.id,
        "status": b.status,
        "route_name": route_info.get("name", b.route_id),
        "from_city": b.from_city,
        "to_city": b.to_city,
        "departure_date": b.date,
        "departure_time": b.departure,
        "passengers": b.passengers or [],
        "passengers_count": len(b.passengers) if b.passengers else 0,
        "price_total": b.price_total,
        "currency": "BYN",
        "payment_status": "paid" if b.paid_at else "pending",
        "payment_deadline": None,
        "created_at": b.created_at,
    }


class CancelBookingIn(BaseModel):
    reason: str | None = None


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    body: CancelBookingIn,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.status in ("cancelled", "done", "ticket_sent"):
        raise HTTPException(400, detail="cannot_cancel")
    b.status = "cancelled"
    await db.commit()
    return {"success": True, "status": "cancelled"}
