"""add routine count windows

Revision ID: f2b3c4d5e6f8
Revises: e1f2a3b4c5d7
Create Date: 2026-11-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f2b3c4d5e6f8"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column("window_start", sa.Integer(), nullable=True),
    )
    op.add_column(
        "bookmark_routines",
        sa.Column("window_end", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookmark_routines", "window_end")
    op.drop_column("bookmark_routines", "window_start")
