"""Add is_archived and cancel_reason to bookings (for existing DBs).

Revision ID: 001
Revises: 001_initial
Create Date: 2026-03-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE bookings DROP COLUMN IF EXISTS cancel_reason")
    op.execute("ALTER TABLE bookings DROP COLUMN IF EXISTS is_archived")
