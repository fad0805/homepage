"""per-device user sessions

Revision ID: b9c1d2e3f4a5
Revises: a7d9e1f3b5c2
Create Date: 2026-11-11 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9c1d2e3f4a5"
down_revision: Union[str, None] = "a7d9e1f3b5c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Move the per-user refresh token into a per-device sessions table."""
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("refresh_token", sa.String(length=255), nullable=False),
        sa.Column("previous_refresh_token", sa.String(length=255), nullable=True),
        sa.Column("refresh_token_rotated_at", sa.DateTime(), nullable=True),
        sa.Column("device_info", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False
    )

    # Carry each user's current token over so existing logins survive the
    # deploy. A user's other devices were already logged out by the old
    # single-token design, so one row per user is correct here.
    op.execute(
        """
        INSERT INTO user_sessions
            (user_id, refresh_token, previous_refresh_token,
             refresh_token_rotated_at, created_at, last_used_at, expires_at)
        SELECT id, refresh_token, previous_refresh_token,
               refresh_token_rotated_at, now(), now(), now() + interval '30 days'
        FROM users
        WHERE refresh_token IS NOT NULL
        """
    )

    op.drop_column("users", "refresh_token")
    op.drop_column("users", "previous_refresh_token")
    op.drop_column("users", "refresh_token_rotated_at")


def downgrade() -> None:
    op.add_column(
        "users", sa.Column("refresh_token", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("previous_refresh_token", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users", sa.Column("refresh_token_rotated_at", sa.DateTime(), nullable=True)
    )
    # Restore the most recently used session per user.
    op.execute(
        """
        UPDATE users u
        SET refresh_token = s.refresh_token,
            previous_refresh_token = s.previous_refresh_token,
            refresh_token_rotated_at = s.refresh_token_rotated_at
        FROM (
            SELECT DISTINCT ON (user_id) user_id, refresh_token,
                   previous_refresh_token, refresh_token_rotated_at
            FROM user_sessions
            ORDER BY user_id, last_used_at DESC
        ) s
        WHERE u.id = s.user_id
        """
    )
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
