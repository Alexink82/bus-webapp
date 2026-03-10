"""Telegram bot - send notifications to passengers (optional standalone)."""
import os
import asyncio
import logging
from dotenv import load_dotenv
import httpx

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
logger = logging.getLogger(__name__)


async def send_message(chat_id: int, text: str) -> bool:
    if not BOT_TOKEN:
        logger.warning("BOT_TOKEN not set")
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json={"chat_id": chat_id, "text": text[:4096], "parse_mode": "HTML"})
        return r.is_success


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        asyncio.run(send_message(int(sys.argv[1]), sys.argv[2]))
    else:
        print("Usage: python notifier.py <chat_id> <message>")
