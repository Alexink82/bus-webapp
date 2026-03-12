"""User profile and saved passengers API."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
import logging

from database import get_db
from api.auth_deps import get_verified_telegram_user_id, get_optional_verified_telegram_user_id
from models import UserProfile, SavedPassenger, Booking
from services.roles import is_admin
from services.roles import get_dispatcher_route_ids
from services.validators import parse_birth_date

router = APIRouter(prefix="/api/user", tags=["user"])
log = logging.getLogger(__name__)


@router.get("/roles")
async def get_roles(
    db: AsyncSession = Depends(get_db),
    user_id: int | None = Depends(get_optional_verified_telegram_user_id),
):
    """Роли текущего пользователя для отображения вкладок Админ/Диспетчер в навигации."""
    if user_id is None:
        return {"is_admin": False, "is_dispatcher": False}
    route_ids = await get_dispatcher_route_ids(db, user_id)
    admin = is_admin(user_id)
    if not admin:
        log.info("roles: user_id=%s is_admin=False — добавьте этот ID в ADMIN_IDS на сервере или в bot_roles.is_admin", user_id)
    return {
        "is_admin": admin,
        "is_dispatcher": route_ids is not None,
    }


@router.get("/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    p = result.scalar_one_or_none()
    if not p:
        return {"user_id": user_id, "exists": False}
    return {
        "user_id": p.user_id,
        "username": p.username,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "phone": p.phone,
        "language_code": p.language_code or "ru",
        "timezone": p.timezone or "Europe/Minsk",
        "exists": True,
    }


class UpdateProfileIn(BaseModel):
    phone: str | None = None
    language_code: str | None = None
    timezone: str | None = None
    first_name: str | None = None
    last_name: str | None = None


@router.put("/profile")
async def update_profile(
    body: UpdateProfileIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
    p = result.scalar_one_or_none()
    if not p:
        p = UserProfile(user_id=user_id)
        db.add(p)
        await db.flush()
    if body.phone is not None:
        p.phone = body.phone
    if body.language_code is not None:
        p.language_code = body.language_code
    if body.timezone is not None:
        p.timezone = body.timezone
    if body.first_name is not None:
        p.first_name = body.first_name
    if body.last_name is not None:
        p.last_name = body.last_name
    await db.commit()
    return {"success": True}


@router.get("/passengers")
async def list_passengers(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    result = await db.execute(
        select(SavedPassenger)
        .where(SavedPassenger.user_id == user_id)
        .order_by(SavedPassenger.usage_count.desc(), SavedPassenger.last_used.desc())
    )
    rows = result.scalars().all()
    return {
        "passengers": [
            {
                "id": r.id,
                "last_name": r.last_name,
                "first_name": r.first_name,
                "middle_name": r.middle_name or "",
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "passport": r.passport or "",
                "usage_count": r.usage_count,
            }
            for r in rows
        ]
    }


class PassengerIn(BaseModel):
    last_name: str = ""
    first_name: str
    middle_name: str = ""
    birth_date: str | None = None
    passport: str = ""


@router.post("/passengers")
async def add_passenger(
    body: PassengerIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    try:
        bd = parse_birth_date(body.birth_date) if body.birth_date else None
        if body.birth_date and bd is None:
            raise ValueError("invalid_birth_date")
    except (ValueError, TypeError):
        raise HTTPException(400, detail="invalid_birth_date")
    p = SavedPassenger(
        user_id=user_id,
        last_name=body.last_name,
        first_name=body.first_name,
        middle_name=body.middle_name,
        birth_date=bd,
        passport=body.passport or None,
    )
    db.add(p)
    await db.flush()
    await db.commit()
    return {"id": p.id, "success": True}


@router.put("/passengers/{passenger_id}")
async def update_passenger(
    passenger_id: int,
    body: PassengerIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    result = await db.execute(
        select(SavedPassenger).where(
            SavedPassenger.id == passenger_id,
            SavedPassenger.user_id == user_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, detail="passenger_not_found")
    try:
        bd = parse_birth_date(body.birth_date) if body.birth_date else None
        if body.birth_date and bd is None:
            raise ValueError("invalid_birth_date")
    except (ValueError, TypeError):
        raise HTTPException(400, detail="invalid_birth_date")
    p.last_name = body.last_name
    p.first_name = body.first_name
    p.middle_name = body.middle_name
    p.birth_date = bd
    p.passport = body.passport or None
    await db.commit()
    return {"success": True}


@router.delete("/passengers/{passenger_id}")
async def delete_passenger(
    passenger_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
):
    result = await db.execute(
        select(SavedPassenger).where(
            SavedPassenger.id == passenger_id,
            SavedPassenger.user_id == user_id,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, detail="passenger_not_found")
    await db.delete(p)
    await db.commit()
    return {"success": True}


@router.get("/bookings")
async def list_my_bookings(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_verified_telegram_user_id),
    status: str | None = None,
):
    q = select(Booking).where(Booking.contact_tg_id == user_id).order_by(Booking.created_at.desc())
    if status:
        q = q.where(Booking.status == status)
    result = await db.execute(q)
    rows = result.scalars().all()
    from core.constants import ROUTES
    return {
        "bookings": [
            {
                "booking_id": r.id,
                "status": r.status,
                "route_name": ROUTES.get(r.route_id, {}).get("name", r.route_id),
                "from_city": r.from_city,
                "to_city": r.to_city,
                "departure_date": r.date,
                "departure_time": r.departure,
                "price_total": r.price_total,
                "currency": "BYN",
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }
