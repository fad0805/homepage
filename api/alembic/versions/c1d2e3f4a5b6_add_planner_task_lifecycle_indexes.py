"""add planner task lifecycle indexes

Revision ID: c1d2e3f4a5b6
Revises: b9c8d7e6f5a4
Create Date: 2026-11-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "b9c8d7e6f5a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_planner_tasks_user_status_end_date",
        "planner_tasks",
        ["user_id", "status", "end_date"],
        unique=False,
    )
    op.create_index(
        "ix_planner_tasks_user_status_trashed_at",
        "planner_tasks",
        ["user_id", "status", "trashed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_planner_tasks_user_status_trashed_at",
        table_name="planner_tasks",
    )
    op.drop_index(
        "ix_planner_tasks_user_status_end_date",
        table_name="planner_tasks",
    )
