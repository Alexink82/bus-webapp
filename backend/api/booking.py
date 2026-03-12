"""Booking API — схема как в bus-bot (одна таблица bookings)."""
import random
import string
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.constants import ROUTES, DISCOUNT_RULES, generate_booking_id, get_local_time
from database import get_db
from config import get_settings
from api.auth_deps import get_verified_telegram_user_id, get_optional_verified_telegram_user_id
from models import Booking, UserProfile, Dispatcher, Blacklist
from services.roles import is_admin, get_dispatcher_route_ids
from services.price_calc import calculate_booking_totals
from services.validators import validate_phone, validate_passenger, validate_booking_dates
from services.notification import notify_booking_created, notify_booking_status
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
    x_telegram_start_param: str | None = Header(None, alias="X-Telegram-Start-Param"),
):
    try:
        dep_date = date.fromisoformat(body.departure_date)
    except (ValueError, TypeError):
        raise HTTPException(400, detail={"code": "invalid_date_format"})

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

    bl_by_phone = await db.execute(select(Blacklist).where(Blacklist.phone == body.phone))
    if bl_by_phone.scalar_one_or_none():
        raise HTTPException(403, detail={"code": "blocked"})
    user_id = body.user_id or 0
    if user_id:
        bl_by_uid = await db.execute(select(Blacklist).where(Blacklist.user_id == user_id))
        if bl_by_uid.scalar_one_or_none():
            raise HTTPException(403, detail={"code": "blocked"})

    price_one, price_return, price_total = calculate_booking_totals(
        route_dict, body.from_city, body.to_city, body.passengers, dep_date, body.is_round_trip,
    )

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
    now = get_local_time()
    created_at_str = now.strftime("%Y-%m-%dT%H:%M:%S")

    booking_id = generate_booking_id()
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
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        booking_id = generate_booking_id() + "-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=2))
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
        details={"booking_id": booking_id, "route_id": body.route_id, **({"start_param": x_telegram_start_param} if x_telegram_start_param else {})},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    if user_id and user_id > 0:
        await notify_booking_created(
            user_id, booking_id, route_info["name"],
            body.departure_date, body.departure_time,
            price_total, "BYN", "ru",
        )

    try:
        from api.websocket import manager
        await manager.broadcast_new_booking(
            {"booking_id": booking_id, "route_id": body.route_id, "route_name": route_info.get("name", ""), "status": "new"},
            body.route_id,
        )
    except Exception:
        pass

    return {
        "booking_id": booking_id,
        "status": "new",
        "price_total": price_total,
        "currency": "BYN",
        "payment_deadline": None,
    }


@router.get("/bookings/{booking_id}")
async def get_booking(
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    uid: int | None = Depends(get_optional_verified_telegram_user_id),
):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    route_info = ROUTES.get(b.route_id, {})
    is_owner = uid is not None and b.contact_tg_id == uid
    is_admin_user = uid is not None and is_admin(uid)
    route_ids = await get_dispatcher_route_ids(db, uid) if uid else None
    is_dispatcher_user = route_ids is not None
    full_access = is_owner or is_admin_user or is_dispatcher_user
    if full_access:
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
            "contact_phone": b.contact_phone or "",
            "price_total": b.price_total,
            "currency": "BYN",
            "payment_status": "paid" if b.paid_at else "pending",
            "payment_deadline": None,
            "created_at": b.created_at,
        }
    return {
        "booking_id": b.id,
        "status": b.status,
        "route_name": route_info.get("name", b.route_id),
        "from_city": b.from_city,
        "to_city": b.to_city,
        "departure_date": b.date,
        "departure_time": b.departure,
        "passengers_count": len(b.passengers) if b.passengers else 0,
        "price_total": b.price_total,
        "currency": "BYN",
        "payment_status": "paid" if b.paid_at else "pending",
        "created_at": b.created_at,
    }


class CancelBookingIn(BaseModel):
    reason: str | None = None


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    body: CancelBookingIn,
    uid: int = Depends(get_verified_telegram_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.status in ("cancelled", "done", "ticket_sent"):
        raise HTTPException(400, detail="cannot_cancel")
    is_owner = b.contact_tg_id == uid
    is_admin_user = is_admin(uid)
    route_ids = await get_dispatcher_route_ids(db, uid)
    is_dispatcher_user = route_ids is not None
    if not (is_owner or is_admin_user or is_dispatcher_user):
        raise HTTPException(403, detail="not_authorized_to_cancel")

    # Правила отмены:
    # — Владелец: заявка в статусе "new" (не взята диспетчером) — можно отменить в любой момент.
    #   Если заявка уже в работе (active и т.д.) — только не позднее чем за 2 ч до отправления.
    # — Диспетчер/админ — отмена с обязательной причиной.
    now = get_local_time()
    if is_owner and b.status != "new":
        try:
            dep_date = date.fromisoformat(b.date) if b.date else None
            dep_time_str = (b.departure or "").strip()[:8]
            if dep_date and dep_time_str and len(dep_time_str) >= 5:
                parts = dep_time_str.split(":")
                h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
                departure_dt = datetime(dep_date.year, dep_date.month, dep_date.day, h, m, 0)
                if now >= departure_dt - timedelta(hours=2):
                    raise HTTPException(400, detail="cancel_only_via_dispatcher")
        except HTTPException:
            raise
        except (ValueError, TypeError):
            pass

    if is_dispatcher_user or is_admin_user:
        reason = (body.reason or "").strip()
        if not reason:
            raise HTTPException(400, detail="reason_required")
        b.cancel_reason = reason
    else:
        b.cancel_reason = None

    b.status = "cancelled"
    await db.commit()
    if b.contact_tg_id:
        await notify_booking_status(b.contact_tg_id, booking_id, "cancelled", "ru")
    return {"success": True, "status": "cancelled"}
