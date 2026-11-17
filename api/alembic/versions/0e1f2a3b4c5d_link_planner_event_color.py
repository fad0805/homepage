"""link planner event color

Revision ID: 0e1f2a3b4c5d
Revises: 9d0e1f2a3b4c
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0e1f2a3b4c5d"
down_revision: Union[str, Sequence[str], None] = "9d0e1f2a3b4c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "planner_events",
        sa.Column("color_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_planner_events_color_id",
        "planner_events",
        "planner_colors",
        ["color_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE planner_events AS event
        SET color_id = (
            SELECT color.id
            FROM planner_colors AS color
            WHERE color.user_id = event.owner_user_id
              AND color.color = event.color
            ORDER BY color.id
            LIMIT 1
        )
        WHERE event.color IS NOT NULL
        """
    )
    op.drop_column("planner_events", "color")


def downgrade() -> None:
    op.add_column(
        "planner_events",
        sa.Column("color", sa.String(length=7), nullable=True),
    )
    op.execute(
        """
        UPDATE planner_events AS event
        SET color = (
            SELECT color.color
            FROM planner_colors AS color
            WHERE color.id = event.color_id
        )
        WHERE event.color_id IS NOT NULL
        """
    )
    op.drop_constraint(
        "fk_planner_events_color_id",
        "planner_events",
        type_="foreignkey",
    )
    op.drop_column("planner_events", "color_id")
