"""Telegram notifications for passengers."""
import logging
from typing import Optional, Any

import httpx
from config import get_settings

logger = logging.getLogger(__name__)


async def send_telegram_message(
    chat_id: int,
    text: str,
    parse_mode: str = "HTML",
    disable_web_page_preview: bool = True,
    reply_markup: Optional[dict[str, Any]] = None,
) -> bool:
    """Send message to user via Bot API. reply_markup — опционально (например inline_keyboard с web_app)."""
    settings = get_settings()
    if not settings.bot_token:
        logger.warning("BOT_TOKEN not set, skip send")
        return False
    url_api = f"https://api.telegram.org/bot{settings.bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text[:4096],
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_page_preview,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url_api, json=payload)
            if r.is_success:
                return True
            logger.warning("Telegram API error: %s %s", r.status_code, r.text)
            return False
    except Exception as e:
        logger.exception("send_telegram_message failed: %s", e)
        return False


async def notify_booking_created(
    user_id: int,
    booking_id: str,
    route_name: str,
    departure_date: str,
    departure_time: str,
    total_price: float,
    currency: str = "BYN",
    lang: str = "ru",
) -> bool:
    if lang == "en":
        text = (
            f"✅ <b>Booking created</b>\n\n"
            f"Booking ID: <code>{booking_id}</code>\n"
            f"Route: {route_name}\n"
            f"Date: {departure_date} {departure_time}\n"
            f"Total: {total_price} {currency}\n\n"
            f"Track status in the app."
        )
    else:
        text = (
            f"✅ <b>Заявка создана</b>\n\n"
            f"Номер заявки: <code>{booking_id}</code>\n"
            f"Маршрут: {route_name}\n"
            f"Дата: {departure_date} {departure_time}\n"
            f"Сумма: {total_price} {currency}\n\n"
            f"Отслеживайте статус в приложении."
        )
    reply_markup = None
    webapp_url = (get_settings().webapp_url or "").strip()
    if webapp_url.startswith("https:"):
        reply_markup = {"inline_keyboard": [[{"text": "📋 Открыть заявки", "web_app": {"url": webapp_url}}]]}
    return await send_telegram_message(user_id, text, reply_markup=reply_markup)


async def notify_booking_status(
    user_id: int,
    booking_id: str,
    status: str,
    lang: str = "ru",
) -> bool:
    status_text_ru = {
        "active": "принята в работу",
        "paid": "оплачена",
        "ticket_sent": "билет отправлен",
        "done": "завершена",
        "cancelled": "отменена",
    }
    status_text_en = {
        "active": "in progress",
        "paid": "paid",
        "ticket_sent": "ticket sent",
        "done": "completed",
        "cancelled": "cancelled",
    }
    st = status_text_en.get(status, status) if lang == "en" else status_text_ru.get(status, status)
    if lang == "en":
        text = f"📋 Booking <code>{booking_id}</code>: {st}."
    else:
        text = f"📋 Заявка <code>{booking_id}</code>: {st}."
    reply_markup = None
    webapp_url = (get_settings().webapp_url or "").strip()
    if webapp_url.startswith("https:"):
        reply_markup = {"inline_keyboard": [[{"text": "📋 Открыть заявки", "web_app": {"url": webapp_url}}]]}
    return await send_telegram_message(user_id, text, reply_markup=reply_markup)
