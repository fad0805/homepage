"""add mastodon notify tag

Revision ID: c4d5e6f7a8b9
Revises: a9b7c5d3e1f4
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "a9b7c5d3e1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column("notify_tag", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mastodon_settings", "notify_tag")
