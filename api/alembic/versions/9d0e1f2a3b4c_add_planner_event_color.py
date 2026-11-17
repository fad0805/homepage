"""add planner event color

Revision ID: 9d0e1f2a3b4c
Revises: 8b9c0d1e2f3a
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9d0e1f2a3b4c"
down_revision: Union[str, Sequence[str], None] = "8b9c0d1e2f3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "planner_events",
        sa.Column("color", sa.String(length=7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planner_events", "color")
