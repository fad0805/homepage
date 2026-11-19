"""add subtitle to manuscript nodes

Revision ID: c8e1a7b4d2f9
Revises: a7b3c9d2e4f6
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8e1a7b4d2f9"
down_revision: str | Sequence[str] | None = "a7b3c9d2e4f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "manuscript_nodes",
        sa.Column("subtitle", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("manuscript_nodes", "subtitle")
