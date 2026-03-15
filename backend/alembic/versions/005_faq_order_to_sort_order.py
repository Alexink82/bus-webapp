"""Rename faq_items.order to sort_order (order reserved in PostgreSQL).

Revision ID: 005
Revises: 004
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    r = conn.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'faq_items' AND column_name = 'order'"
    ))
    if r.fetchone():
        op.execute('ALTER TABLE faq_items RENAME COLUMN "order" TO sort_order')


def downgrade() -> None:
    conn = op.get_bind()
    r = conn.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'faq_items' AND column_name = 'sort_order'"
    ))
    if r.fetchone():
        op.execute('ALTER TABLE faq_items RENAME COLUMN sort_order TO "order"')
