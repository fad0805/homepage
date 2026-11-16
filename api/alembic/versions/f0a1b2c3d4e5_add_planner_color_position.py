"""add planner color display order

Revision ID: f0a1b2c3d4e5
Revises: e8f9a0b1c2d3
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "planner_colors",
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY user_id
                    ORDER BY created_at, id
                ) - 1 AS position
            FROM planner_colors
        )
        UPDATE planner_colors AS color
        SET position = ranked.position
        FROM ranked
        WHERE color.id = ranked.id
        """
    )
    op.create_index(
        "ix_planner_colors_user_position",
        "planner_colors",
        ["user_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_planner_colors_user_position",
        table_name="planner_colors",
    )
    op.drop_column("planner_colors", "position")
