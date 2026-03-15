"""Routes API — данные из core.constants или из БД (services/cache) при USE_ROUTES_FROM_DB=1."""
from fastapi import APIRouter, Depends

from database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_settings
from core.constants import ROUTES, DISCOUNT_RULES
from services.cache import cache as route_cache

router = APIRouter(prefix="/api", tags=["routes"])


def _build_routes_from_constants():
    """Маршруты из core.constants.ROUTES (как в bus-bot)."""
    routes = []
    for rid, r in ROUTES.items():
        route_type = r.get("type", "local")
        discount_rules = DISCOUNT_RULES.get(route_type, {})
        stop_times = r.get("stop_times")
        stops_for_api = []
        for i, city in enumerate(r["stops"]):
            is_first = i == 0
            is_last = i == len(r["stops"]) - 1
            if stop_times and i < len(stop_times):
                t = stop_times[i]
            else:
                t = r.get("departure") if is_first else r.get("arrival")
            stops_for_api.append({
                "city": city,
                "time": t,
                "price_offset": 0,
                "is_boarding": (not is_last) if stop_times else is_first,
                "is_exit": is_last,
            })
        if not stop_times and len(stops_for_api) > 1:
            stops_for_api[0]["time"] = r.get("departure")
            stops_for_api[-1]["time"] = r.get("arrival")
        routes.append({
            "id": rid,
            "name": r["name"],
            "type": route_type,
            "stops": stops_for_api,
            "discount_rules": discount_rules,
            "border_docs_text": "Загранпаспорт, виза при необходимости." if route_type == "international" else "",
            "schedule_days": r.get("schedule_days", [0, 1, 2, 3, 4, 5, 6]),
            "base_price": float(r.get("price", 0)),
        })
    return routes


@router.get("/routes")
async def list_routes(db: AsyncSession = Depends(get_db)):
    """Список маршрутов. При USE_ROUTES_FROM_DB=1 — из БД (services/cache), иначе из core.constants.ROUTES."""
    if get_settings().use_routes_from_db:
        try:
            data = await route_cache.get_routes(db)
            routes = []
            for r in data:
                stops = r.get("stops") or []
                route_type = r.get("type", "local")
                discount_rules = (r.get("discount_rules") or {}).copy() or DISCOUNT_RULES.get(route_type, {})
                stops_for_api = []
                for i, city in enumerate(stops):
                    stops_for_api.append({
                        "city": city if isinstance(city, str) else str(city),
                        "time": "",
                        "price_offset": 0,
                        "is_boarding": i < len(stops) - 1,
                        "is_exit": i == len(stops) - 1,
                    })
                routes.append({
                    "id": r.get("id", ""),
                    "name": r.get("name", ""),
                    "type": route_type,
                    "stops": stops_for_api,
                    "discount_rules": discount_rules,
                    "border_docs_text": r.get("border_docs_text") or ("Загранпаспорт, виза при необходимости." if route_type == "international" else ""),
                    "schedule_days": r.get("schedule_days") or [0, 1, 2, 3, 4, 5, 6],
                    "base_price": float(r.get("base_price", 0)),
                })
            return {"routes": routes}
        except Exception:
            pass
    return {"routes": _build_routes_from_constants()}
