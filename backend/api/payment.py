"""Payment WebPay mock and callback."""
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
    """Create WebPay payment (mock)."""
    result = await db.execute(
        select(Booking).where(Booking.booking_id == body.booking_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(404, detail="booking_not_found")
    if b.payment_status == "paid":
        raise HTTPException(400, detail="already_paid")

    transaction_id = f"MOCK-{uuid.uuid4().hex[:12].upper()}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    txn = WebPayTransaction(
        transaction_id=transaction_id,
        booking_id=body.booking_id,
        amount=body.amount,
        currency=body.currency,
        status="pending",
        request_data={"amount": body.amount, "currency": body.currency},
    )
    db.add(txn)
    b.webpay_transaction_id = transaction_id
    b.status = "pending_payment"
    await db.flush()
    await db.commit()

    return {
        "success": True,
        "transaction_id": transaction_id,
        "payment_url": f"/mock-payment/{transaction_id}",
        "amount": body.amount,
        "currency": body.currency,
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


@router.post("/payment/callback")
async def payment_callback(
    body: CallbackIn,
    db: AsyncSession = Depends(get_db),
):
    """Simulate WebPay callback (mock)."""
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
            select(Booking).where(Booking.booking_id == txn.booking_id)
        )
        b = b_result.scalar_one_or_none()
        if b:
            b.payment_status = "paid"
            b.status = "paid"
            b.paid_at = datetime.now(timezone.utc)

    await db.commit()
    return {"success": True, "payment_status": txn.status}
