"""repair partially applied planner color chip schema

Revision ID: a8b9c0d1e2f4
Revises: f5a6b7c8d9e0
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8b9c0d1e2f4"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Finish the task color_id transition when the earlier revision was
    applied before its final shape was saved.

    A normal fresh install already has color_id and no color column, so this
    migration becomes a no-op.
    """
    bind = op.get_bind()
    columns = {
        column["name"]
        for column in sa.inspect(bind).get_columns("planner_tasks")
    }
    if "color_id" not in columns:
        op.add_column(
            "planner_tasks",
            sa.Column("color_id", sa.Integer(), nullable=True),
        )

    indexes = {
        index["name"]
        for index in sa.inspect(bind).get_indexes("planner_tasks")
    }
    if "ix_planner_tasks_color_id" not in indexes:
        op.create_index(
            "ix_planner_tasks_color_id",
            "planner_tasks",
            ["color_id"],
            unique=False,
        )

    foreign_keys = {
        foreign_key["name"]
        for foreign_key in sa.inspect(bind).get_foreign_keys(
            "planner_tasks"
        )
    }
    if "fk_planner_tasks_color_id_planner_colors" not in foreign_keys:
        op.create_foreign_key(
            "fk_planner_tasks_color_id_planner_colors",
            "planner_tasks",
            "planner_colors",
            ["color_id"],
            ["id"],
            ondelete="SET NULL",
        )

    columns = {
        column["name"]
        for column in sa.inspect(bind).get_columns("planner_tasks")
    }
    if "color" in columns:
        # A task color may have been written after the earlier revision
        # created the palette table. Make sure every task color has a chip.
        op.execute(
            """
            INSERT INTO planner_colors (user_id, color, created_at)
            SELECT user_id, lower(color), NOW()
            FROM planner_tasks
            WHERE color IS NOT NULL
            GROUP BY user_id, lower(color)
            ON CONFLICT (user_id, color) DO NOTHING
            """
        )
        op.execute(
            """
            UPDATE planner_tasks task_row
            SET color_id = chip.id
            FROM planner_colors chip
            WHERE chip.user_id = task_row.user_id
              AND chip.color = lower(task_row.color)
              AND task_row.color_id IS NULL
            """
        )
        op.drop_column("planner_tasks", "color")


def downgrade() -> None:
    # f5a6b7c8d9e0 owns the inverted schema transition. Keeping this repair
    # step as a no-op lets that migration restore the old color column.
    pass
