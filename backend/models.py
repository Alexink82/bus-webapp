"""SQLAlchemy models for Bus Booking Web App."""
from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    DateTime,
    Date,
    Float,
    Boolean,
    Text,
    JSON,
    ForeignKey,
    Enum,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


# Enums for columns
class RouteType(str, PyEnum):
    international = "international"
    domestic = "domestic"


class PaymentMethod(str, PyEnum):
    webpay = "webpay"
    cash = "cash"
    callback = "callback"


class PaymentStatus(str, PyEnum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class BookingStatus(str, PyEnum):
    new = "new"
    active = "active"
    payment_link_sent = "payment_link_sent"
    paid = "paid"
    ticket_sent = "ticket_sent"
    done = "done"
    cancelled = "cancelled"
    pending_payment = "pending_payment"


class UserProfile(Base):
    """Профиль пользователя Telegram."""

    __tablename__ = "user_profiles"

    user_id = Column(BigInteger, primary_key=True)
    username = Column(String(100))
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone = Column(String(20))
    language_code = Column(String(10), default="ru")
    timezone = Column(String(50), default="Europe/Minsk")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    saved_passengers = relationship(
        "SavedPassenger", back_populates="user", cascade="all, delete-orphan"
    )


class SavedPassenger(Base):
    """Сохранённые пассажиры."""

    __tablename__ = "saved_passengers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("user_profiles.user_id"))

    last_name = Column(String(100))
    first_name = Column(String(100))
    middle_name = Column(String(100))
    birth_date = Column(Date)
    passport = Column(String(20))

    usage_count = Column(Integer, default=0)
    last_used = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("UserProfile", back_populates="saved_passengers")


class Route(Base):
    """Маршруты (опционально в БД; в проде используем core.constants.ROUTES)."""

    __tablename__ = "routes"

    id = Column(String(50), primary_key=True)
    name = Column(String(100))
    type = Column(String(20))
    stops = Column(JSON)
    discount_rules = Column(JSON)
    border_docs_text = Column(Text)
    schedule_days = Column(JSON, default=[0, 1, 2, 3, 4, 5, 6])
    is_active = Column(Boolean, default=True)
    base_price = Column(Float)


# ─── Совместимость с bus-bot: одна таблица bookings, одна bot_roles ───
class Booking(Base):
    """Бронирование — схема как в bus-bot (одна БД для бота и webapp)."""

    __tablename__ = "bookings"

    id = Column(String(20), primary_key=True)  # BK-ddmmyy-HHMMSS
    status = Column(String(30), default="new")
    created_at = Column(String(30))  # ISO или текст как в боте
    route_id = Column(String(50))
    from_city = Column(String(50))
    to_city = Column(String(50))
    date = Column(String(10))  # YYYY-MM-DD
    departure = Column(String(10))
    arrival = Column(String(10))
    passengers = Column(JSON)
    contact_phone = Column(String(30))
    contact_tg_id = Column(BigInteger)
    contact_username = Column(String(100))
    price_total = Column(Float)
    payment_method = Column(String(20))
    dispatcher_id = Column(BigInteger)
    taken_at = Column(String(30))
    paid_at = Column(String(30))
    is_archived = Column(Boolean, default=False)
    cancel_reason = Column(Text, nullable=True)
    reschedule_requested_date = Column(Date, nullable=True)  # запрос пассажира на перенос на эту дату; диспетчер подтверждает или отменяет


class BotRole(Base):
    """Роли из админ-панели (bus-bot bot_roles)."""

    __tablename__ = "bot_roles"

    user_id = Column(BigInteger, primary_key=True)
    is_admin = Column(Boolean, default=False)
    is_dispatcher = Column(Boolean, default=False)


class Dispatcher(Base):
    """Диспетчеры: telegram_id, маршруты (пусто = все)."""
    __tablename__ = "dispatchers"
    telegram_id = Column(BigInteger, primary_key=True)
    name = Column(String(100), default="")
    phone = Column(String(30), default="")
    routes = Column(JSON, default=list)  # [] = все маршруты
    direction = Column(String(50), default="")
    is_active = Column(Boolean, default=True)


class Blacklist(Base):
    """Чёрный список."""

    __tablename__ = "blacklist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger)
    phone = Column(String(20))
    reason = Column(Text)
    blocked_at = Column(DateTime, server_default=func.now())
    blocked_by = Column(BigInteger)


class FAQItem(Base):
    """Частые вопросы."""

    __tablename__ = "faq_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50))
    question_ru = Column(String(200))
    question_en = Column(String(200))
    answer_ru = Column(Text)
    answer_en = Column(Text)
    order = Column("sort_order", Integer, default=0)  # в БД — sort_order (order зарезервировано в PostgreSQL)
    is_active = Column(Boolean, default=True)


class LogEntry(Base):
    """Лог действий."""

    __tablename__ = "log_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, server_default=func.now())
    level = Column(String(20))
    source = Column(String(50))
    user_id = Column(BigInteger)
    action = Column(String(100))
    details = Column(JSON)
    ip_address = Column(String(50))


class CachedData(Base):
    """Кэш."""

    __tablename__ = "cached_data"

    key = Column(String(100), primary_key=True)
    data = Column(JSON)
    updated_at = Column(DateTime)
    expires_at = Column(DateTime)


class WebPayTransaction(Base):
    """Транзакции WebPay."""

    __tablename__ = "webpay_transactions"

    transaction_id = Column(String(100), primary_key=True)
    booking_id = Column(String(20))
    amount = Column(Float)
    currency = Column(String(3))
    status = Column(String(20))
    request_data = Column(JSON)
    response_data = Column(JSON)
    callback_data = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
