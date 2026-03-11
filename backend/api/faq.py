"""FAQ and news/cache API."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import FAQItem, CachedData

router = APIRouter(prefix="/api", tags=["faq"])


@router.get("/faq")
async def list_faq(
    category: str | None = None,
    lang: str = "ru",
    db: AsyncSession = Depends(get_db),
):
    """List FAQ items."""
    q = select(FAQItem).where(FAQItem.is_active == True).order_by(FAQItem.order, FAQItem.id)
    if category:
        q = q.where(FAQItem.category == category)
    result = await db.execute(q)
    rows = result.scalars().all()
    items = []
    for r in rows:
        items.append({
            "id": r.id,
            "category": r.category,
            "question": r.question_ru if lang == "ru" else r.question_en,
            "answer": r.answer_ru if lang == "ru" else r.answer_en,
        })
    return {"items": items}


@router.get("/news")
async def get_news(db: AsyncSession = Depends(get_db)):
    """Cached border/weather (for 'Actual info' block). Falls back to stubs if cache empty."""
    result = await db.execute(
        select(CachedData).where(CachedData.key.in_(["border_status", "weather"]))
    )
    rows = result.scalars().all()
    data = {}
    for r in rows:
        data[r.key] = r.data
    border = data.get("border_status")
    weather = data.get("weather")
    if border is None:
        border = {
            "message_ru": "Актуальную информацию уточняйте на границе.",
            "message_en": "Check actual info at the border.",
            "source": "stub",
        }
    if weather is None:
        weather = {
            "city": "Minsk",
            "temp": "—",
            "description_ru": "Нет данных",
            "description_en": "No data",
            "source": "stub",
        }
    return {"border": border, "weather": weather}
