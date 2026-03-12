"""Payment WebPay mock and callback.
Использует Booking.id (не booking_id), paid_at для статуса оплаты.
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Booking, WebPayTransaction

router = APIRouter(prefix="/api", tags=["payment"])


class CreatePaymentIn(BaseModel):
    booking_id: str
    amount: float
    currency: str = "BYN"


@router.post("/payment/create")
async def create_payment(
    body: CreatePaymentIn,
    db: AsyncSession = Depends(get_db),
):
    """Создать платёж WebPay (mock)."""
    result = await db.execute(
        select(Booking).where(Booking.id == body.booking_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.paid_at and str(b.paid_at).strip():
        raise HTTPException(400, detail="already_paid")

    # Сумма только с сервера (не доверяем клиенту)
    amount = float(b.price_total) if b.price_total is not None else 0.0
    currency = body.currency or "BYN"

    transaction_id = f"MOCK-{uuid.uuid4().hex[:12].upper()}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    txn = WebPayTransaction(
        transaction_id=transaction_id,
        booking_id=body.booking_id,
        amount=amount,
        currency=currency,
        status="pending",
        request_data={"amount": amount, "currency": currency},
    )
    db.add(txn)
    await db.flush()

    return {
        "success": True,
        "transaction_id": transaction_id,
        "payment_url": f"/mock-payment/{transaction_id}",
        "amount": amount,
        "currency": currency,
        "expires_at": expires_at.isoformat(),
        "mock_ui": {
            "card": "4111 1111 1111 1111",
            "expiry": "12/25",
            "cvv": "123",
            "button_ru": "Оплатить (тест)",
            "button_en": "Pay (test)",
        },
    }


class CallbackIn(BaseModel):
    transaction_id: str
    success: bool = True
    secret: str | None = None


@router.post("/payment/callback")
async def payment_callback(
    body: CallbackIn,
    db: AsyncSession = Depends(get_db),
):
    """WebPay callback. Если задан WEBPAY_CALLBACK_SECRET — проверяем body.secret."""
    from config import get_settings
    secret = (get_settings().webpay_callback_secret or "").strip()
    if secret:
        if (body.secret or "").strip() != secret:
            raise HTTPException(403, detail="invalid_callback_secret")
    result = await db.execute(
        select(WebPayTransaction).where(
            WebPayTransaction.transaction_id == body.transaction_id
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, detail="transaction_not_found")

    txn.status = "success" if body.success else "failed"
    txn.callback_data = {"success": body.success}

    if body.success:
        b_result = await db.execute(
            select(Booking).where(Booking.id == txn.booking_id)
        )
        b = b_result.scalar_one_or_none()
        if b:
            b.paid_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            b.status = "paid"

    return {"success": True, "payment_status": txn.status}
