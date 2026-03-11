"""Configuration from environment variables."""
import os
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Telegram
    bot_token: str = ""
    channel_id: str = ""

    # Access
    admin_ids: str = ""
    dispatcher_ids: str = ""

    # Database (Render provides DATABASE_URL)
    database_url: str = "postgresql://localhost:5432/bus_booking"

    # API keys
    openweather_api_key: str = ""
    google_analytics_id: str = ""

    # App
    debug: bool = False
    webapp_url: str = "http://localhost:8000"
    backend_url: str = "http://localhost:8000"

    # WebPay callback (проверка подписи/секрета в проде)
    webpay_callback_secret: str = ""

    # Rate limiting (requests per minute per IP; 0 = off)
    rate_limit: int = 120

    @property
    def admin_ids_list(self) -> List[int]:
        if not self.admin_ids:
            return []
        out = []
        for x in self.admin_ids.split(","):
            x = x.strip()
            if not x:
                continue
            try:
                out.append(int(x))
            except ValueError:
                continue
        return out

    @property
    def dispatcher_ids_list(self) -> List[int]:
        if not self.dispatcher_ids:
            return []
        out = []
        for x in self.dispatcher_ids.split(","):
            x = x.strip()
            if not x:
                continue
            try:
                out.append(int(x))
            except ValueError:
                continue
        return out

    class Config:
        env_file = [".env", "../.env"]
        env_file_encoding = "utf-8"
        extra = "ignore"


def get_settings() -> Settings:
    """Return application settings."""
    return Settings()
