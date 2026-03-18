"""Add browser auth tables for backoffice.

Revision ID: 007_browser_backoffice_auth
Revises: 006_bot_role_permissions
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op

revision: str = "007_browser_backoffice_auth"
down_revision: Union[str, None] = "006_bot_role_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS browser_login_tickets (
            token_hash VARCHAR(64) PRIMARY KEY,
            telegram_user_id BIGINT NOT NULL,
            target VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP NULL,
            used_by_ip VARCHAR(50) NULL,
            used_user_agent VARCHAR(255) NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS browser_sessions (
            session_hash VARCHAR(64) PRIMARY KEY,
            telegram_user_id BIGINT NOT NULL,
            auth_method VARCHAR(30) NOT NULL DEFAULT 'telegram_handoff',
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            last_seen_at TIMESTAMP NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP NULL,
            ip_address VARCHAR(50) NULL,
            user_agent VARCHAR(255) NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_browser_login_tickets_user_expires ON browser_login_tickets (telegram_user_id, expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_browser_sessions_user_expires ON browser_sessions (telegram_user_id, expires_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_browser_sessions_user_expires")
    op.execute("DROP INDEX IF EXISTS ix_browser_login_tickets_user_expires")
    op.execute("DROP TABLE IF EXISTS browser_sessions")
    op.execute("DROP TABLE IF EXISTS browser_login_tickets")
