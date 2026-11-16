"""add planner color chips

Revision ID: f5a6b7c8d9e0
Revises: e3f4a5b6c7d8
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "planner_colors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "color",
            name="uq_planner_colors_user_color",
        ),
    )
    op.create_index(
        "ix_planner_colors_user_id",
        "planner_colors",
        ["user_id"],
        unique=False,
    )

    op.add_column(
        "planner_tasks",
        sa.Column("color_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_planner_tasks_color_id",
        "planner_tasks",
        ["color_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_planner_tasks_color_id_planner_colors",
        "planner_tasks",
        "planner_colors",
        ["color_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Existing task colors become reusable color chips.
    op.execute(
        """
        INSERT INTO planner_colors (user_id, color, created_at)
        SELECT user_id, lower(color), NOW()
        FROM planner_tasks
        WHERE color IS NOT NULL
        GROUP BY user_id, lower(color)
        """
    )
    op.execute(
        """
        UPDATE planner_tasks task_row
        SET color_id = chip.id
        FROM planner_colors chip
        WHERE chip.user_id = task_row.user_id
          AND chip.color = lower(task_row.color)
        """
    )
    op.drop_column("planner_tasks", "color")


def downgrade() -> None:
    op.add_column(
        "planner_tasks",
        sa.Column("color", sa.String(length=7), nullable=True),
    )
    op.execute(
        """
        UPDATE planner_tasks task_row
        SET color = chip.color
        FROM planner_colors chip
        WHERE chip.id = task_row.color_id
        """
    )
    op.drop_constraint(
        "fk_planner_tasks_color_id_planner_colors",
        "planner_tasks",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_planner_tasks_color_id",
        table_name="planner_tasks",
    )
    op.drop_column("planner_tasks", "color_id")
    op.drop_index(
        "ix_planner_colors_user_id",
        table_name="planner_colors",
    )
    op.drop_table("planner_colors")
