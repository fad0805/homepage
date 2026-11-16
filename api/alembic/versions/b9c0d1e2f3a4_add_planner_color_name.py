"""add planner color chip names

Revision ID: b9c0d1e2f3a4
Revises: f5a6b7c8d9e0
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "planner_colors",
        sa.Column("name", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("planner_colors", "name")
