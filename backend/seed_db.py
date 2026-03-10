"""Seed database with initial routes and FAQ."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from database import engine, AsyncSessionLocal
from models import Base, Route, FAQItem
from sqlalchemy import select


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        routes_data = [
            {
                "id": "mozyr_moscow",
                "name": "Мозырь → Москва",
                "type": "international",
                "stops": [
                    {"city": "Мозырь", "time": "06:00", "price_offset": 0, "is_boarding": True, "is_exit": False},
                    {"city": "Гомель", "time": "08:00", "price_offset": 15, "is_boarding": True, "is_exit": False},
                    {"city": "Минск", "time": "11:00", "price_offset": 35, "is_boarding": True, "is_exit": False},
                    {"city": "Москва", "time": "22:00", "price_offset": 120, "is_boarding": False, "is_exit": True},
                ],
                "discount_rules": {
                    "infant": {"age_to": 2, "discount_percent": 100, "seat": False, "label": "До 2 лет"},
                    "child": {"age_to": 11, "discount_percent": 50, "seat": True, "label": "3-11 лет"},
                },
                "border_docs_text": "Для пересечения границы РФ необходимы: загранпаспорт, виза (при необходимости).",
                "schedule_days": [0, 1, 2, 3, 4, 5, 6],
                "base_price": 120,
            },
            {
                "id": "gomel_mozyr",
                "name": "Гомель → Мозырь",
                "type": "domestic",
                "stops": [
                    {"city": "Гомель", "time": "07:00", "price_offset": 0, "is_boarding": True, "is_exit": False},
                    {"city": "Мозырь", "time": "09:30", "price_offset": 0, "is_boarding": False, "is_exit": True},
                ],
                "discount_rules": {
                    "child": {"age_to": 11, "discount_percent": 50, "seat": True, "label": "Дети 3-11 лет"},
                },
                "border_docs_text": "",
                "schedule_days": [0, 1, 2, 3, 4, 5, 6],
                "base_price": 15,
            },
        ]
        for r in routes_data:
            existing = await db.execute(select(Route).where(Route.id == r["id"]))
            if existing.scalar_one_or_none() is None:
                db.add(Route(**r))
                print("Added route:", r["id"])

        faq_data = [
            {"category": "documents", "question_ru": "Какие документы нужны?", "question_en": "What documents are required?", "answer_ru": "Для внутренних рейсов — паспорт. Для международных — загранпаспорт и виза при необходимости.", "answer_en": "For domestic — ID. For international — passport and visa if required.", "order": 1},
            {"category": "payment", "question_ru": "Как оплатить?", "question_en": "How to pay?", "answer_ru": "Онлайн картой (WebPay), наличными у водителя или заказать обратный звонок.", "answer_en": "Online (WebPay), cash to driver, or request callback.", "order": 2},
            {"category": "cancellation", "question_ru": "Как отменить бронь?", "question_en": "How to cancel?", "answer_ru": "В разделе «Мои заявки» выберите бронь и нажмите «Отменить».", "answer_en": "In «My bookings» select the booking and click «Cancel».", "order": 3},
        ]
        for f in faq_data:
            existing = await db.execute(select(FAQItem).where(FAQItem.question_ru == f["question_ru"]))
            if existing.scalar_one_or_none() is None:
                db.add(FAQItem(**f))
                print("Added FAQ:", f["question_ru"][:30])

        await db.commit()
    print("Seed done.")


if __name__ == "__main__":
    asyncio.run(seed())
