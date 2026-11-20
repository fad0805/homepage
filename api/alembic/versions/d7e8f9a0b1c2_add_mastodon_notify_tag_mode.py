"""add mastodon notify tag mode

Revision ID: d7e8f9a0b1c2
Revises: c4d5e6f7a8b9
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mastodon_settings",
        sa.Column(
            "notify_tag_mode",
            sa.String(length=16),
            nullable=False,
            server_default="any",
        ),
    )


def downgrade() -> None:
    op.drop_column("mastodon_settings", "notify_tag_mode")
