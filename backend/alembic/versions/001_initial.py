"""Placeholder for DB already stamped as 001_initial (e.g. from previous migrations/ setup).

Revision ID: 001_initial
Revises:
Create Date: 2026-03-12

Used so that Alembic can locate the revision '001_initial' stored in alembic_version on Render.
No-op upgrade/downgrade.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
