"""add mastodon settings and notification markers

Revision ID: f4b6c8d0e2a1
Revises: e3a5c7d9f1b2
Create Date: 2026-11-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4b6c8d0e2a1"
down_revision: Union[str, None] = "e3a5c7d9f1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Store Mastodon credentials and per-content notification state."""
    op.create_table(
        "mastodon_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("instance_url", sa.String(length=255), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=True),
        sa.Column("site_url", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column(
        "chapters",
        sa.Column("mastodon_status_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chapters",
        sa.Column("mastodon_posted_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "chapters",
        sa.Column(
            "mastodon_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        op.f("ix_chapters_mastodon_pending"),
        "chapters",
        ["mastodon_pending"],
        unique=False,
    )

    op.add_column(
        "illustrations",
        sa.Column("mastodon_status_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "illustrations",
        sa.Column("mastodon_posted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("illustrations", "mastodon_posted_at")
    op.drop_column("illustrations", "mastodon_status_id")
    op.drop_index(
        op.f("ix_chapters_mastodon_pending"),
        table_name="chapters",
    )
    op.drop_column("chapters", "mastodon_pending")
    op.drop_column("chapters", "mastodon_posted_at")
    op.drop_column("chapters", "mastodon_status_id")
    op.drop_table("mastodon_settings")
