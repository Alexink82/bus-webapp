"""Add index on bookings.contact_tg_id for /api/user/bookings.

Revision ID: 004
Revises: 003
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_contact_tg_id ON bookings (contact_tg_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_bookings_contact_tg_id")
