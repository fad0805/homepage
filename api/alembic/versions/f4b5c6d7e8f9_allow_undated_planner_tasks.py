"""allow undated planner tasks

Revision ID: f4b5c6d7e8f9
Revises: f0a1b2c3d4e5
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4b5c6d7e8f9"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "planner_tasks",
        "start_date",
        existing_type=sa.Date(),
        nullable=True,
    )
    op.alter_column(
        "planner_tasks",
        "end_date",
        existing_type=sa.Date(),
        nullable=True,
    )


def downgrade() -> None:
    # Undated tasks cannot be represented by the old schema.
    op.execute(
        "UPDATE planner_tasks SET start_date = CURRENT_DATE "
        "WHERE start_date IS NULL"
    )
    op.execute(
        "UPDATE planner_tasks SET end_date = start_date "
        "WHERE end_date IS NULL"
    )
    op.execute(
        "UPDATE planner_tasks SET schedule_type = 'single' "
        "WHERE schedule_type = 'undated'"
    )
    op.alter_column(
        "planner_tasks",
        "end_date",
        existing_type=sa.Date(),
        nullable=False,
    )
    op.alter_column(
        "planner_tasks",
        "start_date",
        existing_type=sa.Date(),
        nullable=False,
    )
