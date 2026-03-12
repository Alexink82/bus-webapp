"""Configuration from environment variables."""
import os
from typing import List

from pydantic_settings import BaseSettings


def _env_ids_list(primary_key: str, fallback_key: str) -> List[int]:
    """Список ID из env: primary_key (например ADMIN_IDS) или fallback_key (ADMIN_ID) для совместимости."""
    raw = os.environ.get(primary_key) or os.environ.get(fallback_key) or ""
    raw = (raw or "").strip()
    if not raw:
        return []
    out = []
    for x in raw.split(","):
        x = x.strip()
        if not x:
            continue
        try:
            out.append(int(x))
        except ValueError:
            continue
    return out


class Settings(BaseSettings):
    """Application settings."""

    # Telegram
    bot_token: str = ""
    channel_id: str = ""

    # Access (для вкладок Админ/Диспетчер и доступа к API)
    # ADMIN_IDS — через запятую Telegram user_id администраторов (числа)
    # DISPATCHER_IDS — через запятую Telegram user_id диспетчеров (или добавлять через bot_roles)
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
    # CORS: список разрешённых origin; ALLOWED_ORIGINS в env или allowed_origins (строка "*" = все / webapp_url)
    allowed_origins: str = "*"
    allow_credentials: bool = False

    # Rate limiting (requests per minute per IP; 0 = off)
    rate_limit: int = 120

    # WebPay callback (проверка подписи/секрета в проде)
    webpay_callback_secret: str = ""

    @property
    def admin_ids_list(self) -> List[int]:
        # Поддержка ADMIN_IDS и опечатки ADMIN_ID в Render
        env_list = _env_ids_list("ADMIN_IDS", "ADMIN_ID")
        if env_list:
            return env_list
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
        # Поддержка DISPATCHER_IDS и опечатки DISPATCHER_ID в Render
        env_list = _env_ids_list("DISPATCHER_IDS", "DISPATCHER_ID")
        if env_list:
            return env_list
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

    @property
    def cors_origins(self) -> List[str]:
        """Список origin для CORS: ALLOWED_ORIGINS (env) или allowed_origins или [webapp_url]."""
        env_raw = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
        if env_raw:
            return [o.strip().rstrip("/") for o in env_raw.split(",") if o.strip()]
        raw = (getattr(self, "allowed_origins", "") or "").strip()
        if raw and raw != "*":
            return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
        url = (self.webapp_url or "").strip().rstrip("/")
        return [url] if url else ["*"]

    class Config:
        env_file = [".env", "../.env"]
        env_file_encoding = "utf-8"
        extra = "ignore"


def get_settings() -> Settings:
    """Return application settings."""
    return Settings()
