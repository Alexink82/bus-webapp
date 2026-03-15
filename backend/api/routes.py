"""Routes API — данные из core.constants (как в bus-bot)."""
from fastapi import APIRouter

from core.constants import ROUTES, DISCOUNT_RULES

router = APIRouter(prefix="/api", tags=["routes"])


@router.get("/routes")
async def list_routes():
    """Список маршрутов из констант (core.constants.ROUTES). БД не используется — ответ сразу."""
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
    return {"routes": routes}
