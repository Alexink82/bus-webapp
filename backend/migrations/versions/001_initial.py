"""initial

Revision ID: 001_initial
Revises:
Create Date: 2025-03-10

Creates all tables from models (bookings, bot_roles, user_profiles, saved_passengers,
routes, dispatchers, blacklist, faq_items, log_entries, cached_data, webpay_transactions).
For existing DB created by database.py: run `alembic stamp head` once, then use migrations for new changes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", sa.String(20), primary_key=True),
        sa.Column("status", sa.String(30), server_default="new"),
        sa.Column("created_at", sa.String(30)),
        sa.Column("route_id", sa.String(50)),
        sa.Column("from_city", sa.String(50)),
        sa.Column("to_city", sa.String(50)),
        sa.Column("date", sa.String(10)),
        sa.Column("departure", sa.String(10)),
        sa.Column("arrival", sa.String(10)),
        sa.Column("passengers", sa.JSON()),
        sa.Column("contact_phone", sa.String(30)),
        sa.Column("contact_tg_id", sa.BigInteger()),
        sa.Column("contact_username", sa.String(100)),
        sa.Column("price_total", sa.Float()),
        sa.Column("payment_method", sa.String(20)),
        sa.Column("dispatcher_id", sa.BigInteger()),
        sa.Column("taken_at", sa.String(30)),
        sa.Column("paid_at", sa.String(30)),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false()),
        sa.Column("cancel_reason", sa.Text()),
    )
    op.create_table(
        "bot_roles",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("is_admin", sa.Boolean(), server_default=sa.false()),
        sa.Column("is_dispatcher", sa.Boolean(), server_default=sa.false()),
    )
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("username", sa.String(100)),
        sa.Column("first_name", sa.String(100)),
        sa.Column("last_name", sa.String(100)),
        sa.Column("phone", sa.String(20)),
        sa.Column("language_code", sa.String(10), server_default="ru"),
        sa.Column("timezone", sa.String(50), server_default="Europe/Minsk"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_table(
        "routes",
        sa.Column("id", sa.String(50), primary_key=True),
        sa.Column("name", sa.String(100)),
        sa.Column("type", sa.String(20)),
        sa.Column("stops", sa.JSON()),
        sa.Column("discount_rules", sa.JSON()),
        sa.Column("border_docs_text", sa.Text()),
        sa.Column("schedule_days", sa.JSON()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("base_price", sa.Float()),
    )
    op.create_table(
        "saved_passengers",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("user_profiles.user_id")),
        sa.Column("last_name", sa.String(100)),
        sa.Column("first_name", sa.String(100)),
        sa.Column("middle_name", sa.String(100)),
        sa.Column("birth_date", sa.Date()),
        sa.Column("passport", sa.String(20)),
        sa.Column("usage_count", sa.Integer(), server_default=sa.text("0")),
        sa.Column("last_used", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_table(
        "dispatchers",
        sa.Column("telegram_id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(100), server_default=""),
        sa.Column("phone", sa.String(30), server_default=""),
        sa.Column("routes", sa.JSON()),
        sa.Column("direction", sa.String(50), server_default=""),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
    )
    op.create_table(
        "blacklist",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("user_id", sa.BigInteger()),
        sa.Column("phone", sa.String(20)),
        sa.Column("reason", sa.Text()),
        sa.Column("blocked_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("blocked_by", sa.BigInteger()),
    )
    op.create_table(
        "faq_items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("category", sa.String(50)),
        sa.Column("question_ru", sa.String(200)),
        sa.Column("question_en", sa.String(200)),
        sa.Column("answer_ru", sa.Text()),
        sa.Column("answer_en", sa.Text()),
        sa.Column("order", sa.Integer(), server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
    )
    op.create_table(
        "log_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("level", sa.String(20)),
        sa.Column("source", sa.String(50)),
        sa.Column("user_id", sa.BigInteger()),
        sa.Column("action", sa.String(100)),
        sa.Column("details", sa.JSON()),
        sa.Column("ip_address", sa.String(50)),
    )
    op.create_table(
        "cached_data",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("data", sa.JSON()),
        sa.Column("updated_at", sa.DateTime()),
        sa.Column("expires_at", sa.DateTime()),
    )
    op.create_table(
        "webpay_transactions",
        sa.Column("transaction_id", sa.String(100), primary_key=True),
        sa.Column("booking_id", sa.String(20)),
        sa.Column("amount", sa.Float()),
        sa.Column("currency", sa.String(3)),
        sa.Column("status", sa.String(20)),
        sa.Column("request_data", sa.JSON()),
        sa.Column("response_data", sa.JSON()),
        sa.Column("callback_data", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime()),
    )


def downgrade() -> None:
    for table in (
        "webpay_transactions",
        "cached_data",
        "log_entries",
        "faq_items",
        "blacklist",
        "dispatchers",
        "saved_passengers",
        "routes",
        "user_profiles",
        "bot_roles",
        "bookings",
    ):
        op.drop_table(table)
