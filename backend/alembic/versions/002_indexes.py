"""Add indexes for bookings, log_entries, saved_passengers.

Revision ID: 002
Revises: 001
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_status_created_at ON bookings (status, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_route_date ON bookings (route_id, date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bookings_dispatcher_status ON bookings (dispatcher_id, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_log_entries_timestamp ON log_entries (timestamp)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_log_entries_source_level ON log_entries (source, level)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_passengers_user_id ON saved_passengers (user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_saved_passengers_user_id")
    op.execute("DROP INDEX IF EXISTS ix_log_entries_source_level")
    op.execute("DROP INDEX IF EXISTS ix_log_entries_timestamp")
    op.execute("DROP INDEX IF EXISTS ix_bookings_dispatcher_status")
    op.execute("DROP INDEX IF EXISTS ix_bookings_route_date")
    op.execute("DROP INDEX IF EXISTS ix_bookings_status_created_at")
