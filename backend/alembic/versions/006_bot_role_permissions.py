"""Add permissions column to bot_roles.

Revision ID: 006_bot_role_permissions
Revises: 005
Create Date: 2026-03-15
"""
from typing import Sequence, Union

from alembic import op

revision: str = "006_bot_role_permissions"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE bot_roles ADD COLUMN IF NOT EXISTS permissions JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE bot_roles DROP COLUMN IF EXISTS permissions")
