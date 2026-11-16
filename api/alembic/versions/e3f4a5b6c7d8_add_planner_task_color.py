"""add planner task color

Revision ID: e3f4a5b6c7d8
Revises: d1a2b3c4e5f6
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "d1a2b3c4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "planner_tasks",
        sa.Column("color", sa.String(length=7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planner_tasks", "color")
