"""add one-time gallery access

Revision ID: a9b8c7d6e5f4
Revises: b9c1d2e3f4a5
Create Date: 2026-11-11 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, None] = "b9c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gallery_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("used_ip", sa.String(length=45), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_gallery_invites_code_hash",
        "gallery_invites",
        ["code_hash"],
        unique=True,
    )
    op.create_index(
        "ix_gallery_invites_expires_at",
        "gallery_invites",
        ["expires_at"],
    )

    op.create_table(
        "gallery_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_gallery_sessions_token_hash",
        "gallery_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_gallery_sessions_expires_at",
        "gallery_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_gallery_sessions_expires_at",
        table_name="gallery_sessions",
    )
    op.drop_index(
        "ix_gallery_sessions_token_hash",
        table_name="gallery_sessions",
    )
    op.drop_table("gallery_sessions")

    op.drop_index(
        "ix_gallery_invites_expires_at",
        table_name="gallery_invites",
    )
    op.drop_index(
        "ix_gallery_invites_code_hash",
        table_name="gallery_invites",
    )
    op.drop_table("gallery_invites")
