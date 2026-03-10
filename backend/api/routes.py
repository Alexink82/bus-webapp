"""Routes API — данные из core.constants (как в bus-bot)."""
from fastapi import APIRouter

from core.constants import ROUTES, DISCOUNT_RULES

router = APIRouter(prefix="/api", tags=["routes"])


@router.get("/routes")
async def list_routes():
    """Список маршрутов из констант (одна правда с bus-bot)."""
    routes = []
    for rid, r in ROUTES.items():
        route_type = r.get("type", "local")
        discount_rules = DISCOUNT_RULES.get(route_type, {})
        stops_for_api = [
            {"city": city, "time": r.get("departure") if i == 0 else r.get("arrival"), "price_offset": 0, "is_boarding": True, "is_exit": i == len(r["stops"]) - 1}
            for i, city in enumerate(r["stops"])
        ]
        if len(stops_for_api) > 1:
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
