"""Add indexes and updated_at for bookings.

Revision ID: 002
Revises: 001
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_status_created_at ON bookings (status, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_route_date ON bookings (route_id, date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_dispatcher_status ON bookings (dispatcher_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_log_entries_timestamp ON log_entries (timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_log_entries_source_level ON log_entries (source, level)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_passengers_user_last_used ON saved_passengers (user_id, last_used)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_saved_passengers_user_last_used")
    op.execute("DROP INDEX IF EXISTS ix_log_entries_source_level")
    op.execute("DROP INDEX IF EXISTS ix_log_entries_timestamp")
    op.execute("DROP INDEX IF EXISTS ix_bookings_dispatcher_status")
    op.execute("DROP INDEX IF EXISTS ix_bookings_route_date")
    op.execute("DROP INDEX IF EXISTS ix_bookings_status_created_at")
    op.execute("ALTER TABLE bookings DROP COLUMN IF EXISTS updated_at")
