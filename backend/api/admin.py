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
import os

from database import get_db
from config import get_settings
from api.auth_deps import get_backoffice_user_id
from logging_config import log_action
from services.roles import (
    ADMIN_PERMISSION_KEYS,
    get_all_admin_ids,
    get_all_dispatcher_ids,
    get_full_admin_permissions,
    has_admin_permission,
    is_admin,
    load_roles,
    normalize_admin_permissions,
)
from models import Booking, Dispatcher, LogEntry, BotRole, SavedPassenger
from core.constants import ROUTES
from services.dashboard_cache import invalidate_dashboard_cache
from services.redis_client import get_redis

router = APIRouter(prefix="/api/admin", tags=["admin"])
ADMIN_PERMISSION_LABELS = {
    "manage_roles": "Управление ролями",
    "view_logs": "Логи и аудит",
    "manage_operations": "Операционные действия",
    "export_data": "Экспорт данных",
    "manage_privacy": "Privacy и retention",
}


def get_admin_id(uid: int = Depends(get_backoffice_user_id)) -> int:
    if not is_admin(uid):
        raise HTTPException(403, detail="not_admin")
    return uid


def _permissions_catalog() -> list[dict]:
    return [{"key": key, "label": ADMIN_PERMISSION_LABELS.get(key, key)} for key in ADMIN_PERMISSION_KEYS]


def _parse_text_dt(value: str | None) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _normalize_dispatcher_routes(routes: list[str] | None) -> list[str]:
    allowed = set(ROUTES.keys())
    normalized = []
    for value in routes or []:
        route_id = str(value or "").strip()
        if route_id and route_id in allowed and route_id not in normalized:
            normalized.append(route_id)
    return normalized


async def _ensure_admin_permission(db: AsyncSession, admin_id: int, permission: str) -> None:
    if not await has_admin_permission(db, admin_id, permission):
        raise HTTPException(403, detail=f"missing_admin_permission:{permission}")


async def _list_admin_entries(db: AsyncSession) -> list[dict]:
    settings = get_settings()
    env_ids = set(settings.admin_ids_list)
    result = await db.execute(select(BotRole).where(BotRole.is_admin == True).order_by(BotRole.user_id))
    rows = result.scalars().all()
    rows_by_id = {row.user_id: row for row in rows}
    entries = []
    for telegram_id in sorted(env_ids | set(rows_by_id.keys())):
        row = rows_by_id.get(telegram_id)
        from_env = telegram_id in env_ids
        explicit_permissions = normalize_admin_permissions(getattr(row, "permissions", None)) if row else []
        effective_permissions = get_full_admin_permissions() if from_env else (explicit_permissions or get_full_admin_permissions())
        entries.append(
            {
                "telegram_id": telegram_id,
                "from_env": from_env,
                "is_super_admin": from_env or not explicit_permissions,
                "permissions": effective_permissions,
                "explicit_permissions": explicit_permissions,
            }
        )
    return entries


@router.get("/me")
async def admin_me(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    permissions = await _list_admin_entries(db)
    current = next((item for item in permissions if item["telegram_id"] == admin_id), None)
    return {
        "telegram_id": admin_id,
        "permissions_catalog": _permissions_catalog(),
        "permissions": current["permissions"] if current else get_full_admin_permissions(),
        "is_super_admin": current["is_super_admin"] if current else True,
    }


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


@router.get("/booking-ops-overview")
async def admin_booking_ops_overview(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Операционный booking-overview для ежедневной работы бэк-офиса."""
    rows = (
        await db.execute(
            select(Booking).where(Booking.is_archived == False).order_by(Booking.created_at.desc())
        )
    ).scalars().all()
    now = datetime.now(timezone.utc)
    today_str = date.today().isoformat()
    unassigned_new = 0
    overdue_new_15m = 0
    active_sla_breach_30m = 0
    pending_payment = 0
    reschedule_requests = 0
    created_today = 0
    paid_today = 0
    active_by_dispatcher: dict[str, int] = {}
    route_hotspots: dict[str, int] = {}
    attention_bookings: list[dict] = []
    for row in rows:
        route_hotspots[row.route_id or "unknown"] = route_hotspots.get(row.route_id or "unknown", 0) + 1
        if (row.created_at or "").startswith(today_str):
            created_today += 1
        if (row.paid_at or "").startswith(today_str):
            paid_today += 1
        if row.status in ("payment_link_sent", "pending_payment"):
            pending_payment += 1
        if row.reschedule_requested_date and row.status not in ("cancelled", "done"):
            reschedule_requests += 1
        if row.status == "active" and row.dispatcher_id:
            key = str(row.dispatcher_id)
            active_by_dispatcher[key] = active_by_dispatcher.get(key, 0) + 1
        created_dt = _parse_text_dt(row.created_at)
        taken_dt = _parse_text_dt(row.taken_at)
        if row.status == "new" and not row.dispatcher_id:
            unassigned_new += 1
            if created_dt and (now - created_dt).total_seconds() > 15 * 60:
                overdue_new_15m += 1
                attention_bookings.append(
                    {
                        "booking_id": row.id,
                        "status": row.status,
                        "route_id": row.route_id,
                        "route_name": ROUTES.get(row.route_id, {}).get("name", row.route_id or ""),
                        "age_minutes": int((now - created_dt).total_seconds() // 60),
                    }
                )
        elif row.status == "active" and taken_dt and (now - taken_dt).total_seconds() > 30 * 60:
            active_sla_breach_30m += 1
            attention_bookings.append(
                {
                    "booking_id": row.id,
                    "status": row.status,
                    "route_id": row.route_id,
                    "route_name": ROUTES.get(row.route_id, {}).get("name", row.route_id or ""),
                    "age_minutes": int((now - taken_dt).total_seconds() // 60),
                    "dispatcher_id": row.dispatcher_id,
                }
            )
    attention_bookings.sort(key=lambda item: item.get("age_minutes", 0), reverse=True)
    top_routes = sorted(route_hotspots.items(), key=lambda item: item[1], reverse=True)[:5]
    top_dispatchers = sorted(active_by_dispatcher.items(), key=lambda item: item[1], reverse=True)[:5]
    alerts: list[dict] = []
    if overdue_new_15m > 0:
        alerts.append(
            {
                "severity": "critical",
                "code": "new_bookings_sla_breach",
                "message": f"{overdue_new_15m} новых заявок ждут назначения более 15 минут.",
            }
        )
    if active_sla_breach_30m > 0:
        alerts.append(
            {
                "severity": "warning",
                "code": "active_bookings_sla_breach",
                "message": f"{active_sla_breach_30m} активных заявок находятся в работе более 30 минут.",
            }
        )
    if pending_payment > 0:
        alerts.append(
            {
                "severity": "info",
                "code": "pending_payment_backlog",
                "message": f"{pending_payment} заявок ждут оплату или подтверждение payment link.",
            }
        )
    if reschedule_requests > 0:
        alerts.append(
            {
                "severity": "info",
                "code": "reschedule_requests_open",
                "message": f"{reschedule_requests} заявок имеют открытый запрос на перенос даты.",
            }
        )
    return {
        "today": {
            "created": created_today,
            "paid": paid_today,
        },
        "queues": {
            "unassigned_new": unassigned_new,
            "overdue_new_15m": overdue_new_15m,
            "active_sla_breach_30m": active_sla_breach_30m,
            "pending_payment": pending_payment,
            "reschedule_requests": reschedule_requests,
        },
        "route_hotspots": [
            {"route_id": route_id, "route_name": ROUTES.get(route_id, {}).get("name", route_id), "count": count}
            for route_id, count in top_routes
        ],
        "dispatcher_load": [
            {"dispatcher_id": int(dispatcher_id), "active_bookings": count}
            for dispatcher_id, count in top_dispatchers
        ],
        "alerts": alerts,
        "attention_bookings": attention_bookings[:8],
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
    await _ensure_admin_permission(db, admin_id, "manage_operations")
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
    await _ensure_admin_permission(db, admin_id, "view_logs")
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


ROLE_AUDIT_ACTIONS = ("add_admin", "add_dispatcher", "delete_dispatcher", "update_admin_permissions", "update_dispatcher_scope")
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
    "redact_saved_passports",
)


@router.get("/role-audit")
async def admin_role_audit(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """История изменений ролей: кто, когда добавил/удалил админа или диспетчера."""
    await _ensure_admin_permission(db, admin_id, "view_logs")
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
    await _ensure_admin_permission(db, admin_id, "view_logs")
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


@router.get("/system-health")
async def admin_system_health(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Сводка по базовым operational-сигналам для админа."""
    await _ensure_admin_permission(db, admin_id, "view_logs")
    from sqlalchemy import text

    settings = get_settings()
    db_ok = True
    redis_ok = False
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    redis = get_redis()
    if redis:
        try:
            await redis.ping()
            redis_ok = True
        except Exception:
            redis_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "unavailable",
        "redis": "ok" if redis_ok else ("disabled" if not (settings.redis_url or "").strip() else "unavailable"),
        "sentry_enabled": bool((os.environ.get("SENTRY_DSN") or "").strip()),
        "rate_limit_per_minute": settings.rate_limit,
        "frontend_mode": "dist-first",
        "bot_token_configured": bool((settings.bot_token or "").strip()),
        "webpay_secret_configured": bool((settings.webpay_callback_secret or "").strip()),
    }


@router.get("/privacy-status")
async def admin_privacy_status(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Сводка по privacy-retention контуру."""
    await _ensure_admin_permission(db, admin_id, "manage_privacy")
    settings = get_settings()
    retention_days = max(1, int(settings.saved_passenger_passport_retention_days or 365))
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        select(SavedPassenger).where(
            SavedPassenger.passport.is_not(None),
            SavedPassenger.passport != "",
        )
    )
    rows = result.scalars().all()
    stale_count = 0
    for row in rows:
        reference_dt = row.last_used or row.created_at
        if reference_dt is not None:
            if getattr(reference_dt, "tzinfo", None) is None:
                reference_dt = reference_dt.replace(tzinfo=timezone.utc)
            if reference_dt < cutoff:
                stale_count += 1
    return {
        "saved_passenger_passport_retention_days": retention_days,
        "stored_passports_count": len(rows),
        "stale_passports_count": stale_count,
        "log_redaction_enabled": True,
    }


@router.post("/privacy/redact-saved-passports")
async def admin_redact_saved_passports(
    older_than_days: int | None = Query(None, ge=30, le=3650),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Очистить сохранённые паспортные данные у давно не использовавшихся saved passengers."""
    await _ensure_admin_permission(db, admin_id, "manage_privacy")
    settings = get_settings()
    retention_days = older_than_days or max(1, int(settings.saved_passenger_passport_retention_days or 365))
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        select(SavedPassenger).where(
            SavedPassenger.passport.is_not(None),
            SavedPassenger.passport != "",
        )
    )
    rows = result.scalars().all()
    redacted = 0
    for row in rows:
        reference_dt = row.last_used or row.created_at
        if reference_dt is None:
            continue
        if getattr(reference_dt, "tzinfo", None) is None:
            reference_dt = reference_dt.replace(tzinfo=timezone.utc)
        if reference_dt < cutoff:
            row.passport = None
            redacted += 1
    await db.flush()
    await log_action(
        db,
        "INFO",
        "admin",
        "redact_saved_passports",
        user_id=admin_id,
        details={"older_than_days": retention_days, "cutoff": cutoff.isoformat(), "redacted": redacted},
    )
    return {"success": True, "redacted": redacted, "older_than_days": retention_days}


@router.post("/archive")
async def run_archive(
    older_than_days: int = Query(90),
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Пометить старые заявки как архивированные (is_archived=True)."""
    await _ensure_admin_permission(db, admin_id, "manage_operations")
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
    await _ensure_admin_permission(db, admin_id, "manage_operations")
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    result = await db.execute(delete(LogEntry).where(LogEntry.timestamp < cutoff))
    await db.flush()
    await log_action(db, "INFO", "admin", "rotate_logs", user_id=admin_id, details={"older_than_days": older_than_days, "deleted": result.rowcount})
    return {"deleted": result.rowcount, "older_than_days": older_than_days}


@router.get("/admins")
async def list_admins(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Список администраторов с effective permissions."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
    admins = await _list_admin_entries(db)
    return {
        "admin_ids": [row["telegram_id"] for row in admins],
        "admins": admins,
        "permissions_catalog": _permissions_catalog(),
    }


class AdminIn(BaseModel):
    telegram_id: int


@router.post("/admins")
async def add_admin(
    body: AdminIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Добавить администратора (запись в bot_roles). После добавления обновите страницу."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
    existing = await db.execute(select(BotRole).where(BotRole.user_id == body.telegram_id))
    row = existing.scalar_one_or_none()
    if row:
        row.is_admin = True
        if row.permissions is None:
            row.permissions = get_full_admin_permissions()
    else:
        db.add(
            BotRole(
                user_id=body.telegram_id,
                is_admin=True,
                is_dispatcher=False,
                permissions=get_full_admin_permissions(),
            )
        )
    await db.flush()
    await load_roles(db)
    await log_action(db, "INFO", "admin", "add_admin", user_id=admin_id, details={"target_telegram_id": body.telegram_id})
    return {"success": True}


class AdminPermissionsIn(BaseModel):
    telegram_id: int
    permissions: list[str]


@router.post("/admin-permissions")
async def update_admin_permissions(
    body: AdminPermissionsIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    await _ensure_admin_permission(db, admin_id, "manage_roles")
    settings = get_settings()
    if body.telegram_id in settings.admin_ids_list:
        raise HTTPException(400, detail="env_admin_permissions_are_fixed")
    result = await db.execute(select(BotRole).where(BotRole.user_id == body.telegram_id, BotRole.is_admin == True))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(404, detail="admin_not_found")
    normalized = normalize_admin_permissions(body.permissions)
    if not normalized:
        raise HTTPException(400, detail="permissions_required")
    row.permissions = normalized
    await db.flush()
    await load_roles(db)
    await log_action(
        db,
        "INFO",
        "admin",
        "update_admin_permissions",
        user_id=admin_id,
        details={"target_telegram_id": body.telegram_id, "permissions": normalized},
    )
    return {"success": True, "telegram_id": body.telegram_id, "permissions": normalized}


@router.get("/dispatchers")
async def list_dispatchers(
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """List dispatchers (из БД и из переменной DISPATCHER_IDS на Render)."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
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
            "route_names": [ROUTES.get(route_id, {}).get("name", route_id) for route_id in (r.routes or [])],
            "direction": r.direction,
            "is_active": r.is_active,
            "from_env": False,
        }
        for r in rows
    ]
    for uid in env_ids:
        if uid not in db_ids:
            list_.append({"telegram_id": uid, "name": None, "phone": None, "routes": [], "route_names": [], "direction": None, "is_active": True, "from_env": True})
    list_.sort(key=lambda x: x["telegram_id"])
    return {"dispatchers": list_}


class DispatcherIn(BaseModel):
    telegram_id: int
    name: str
    phone: str = ""
    routes: list[str] = []
    direction: str = ""


@router.post("/dispatchers")
async def add_dispatcher(
    body: DispatcherIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Add dispatcher."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
    existing = await db.execute(
        select(Dispatcher).where(Dispatcher.telegram_id == body.telegram_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail="dispatcher_exists")
    d = Dispatcher(
        telegram_id=body.telegram_id,
        name=(body.name or "").strip(),
        phone=(body.phone or "").strip(),
        routes=_normalize_dispatcher_routes(body.routes),
        direction=(body.direction or "").strip(),
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


@router.put("/dispatchers/{telegram_id}")
async def update_dispatcher(
    telegram_id: int,
    body: DispatcherIn,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Update dispatcher scope and contact data."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
    result = await db.execute(
        select(Dispatcher).where(Dispatcher.telegram_id == telegram_id)
    )
    dispatcher = result.scalar_one_or_none()
    if not dispatcher:
        raise HTTPException(404, detail="dispatcher_not_found")
    dispatcher.name = (body.name or "").strip()
    dispatcher.phone = (body.phone or "").strip()
    dispatcher.routes = _normalize_dispatcher_routes(body.routes)
    dispatcher.direction = (body.direction or "").strip()
    await db.flush()
    await log_action(
        db,
        "INFO",
        "admin",
        "update_dispatcher_scope",
        user_id=admin_id,
        details={
            "target_telegram_id": telegram_id,
            "routes": dispatcher.routes or [],
            "direction": dispatcher.direction,
            "name": dispatcher.name,
        },
    )
    return {"success": True, "telegram_id": telegram_id}


@router.delete("/dispatchers/{telegram_id}")
async def remove_dispatcher(
    telegram_id: int,
    db: AsyncSession = Depends(get_db),
    admin_id: int = Depends(get_admin_id),
):
    """Деактивировать диспетчера (is_active=False). Вкладка «Диспетчер» у него пропадёт."""
    await _ensure_admin_permission(db, admin_id, "manage_roles")
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
    await _ensure_admin_permission(db, admin_id, "export_data")
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
