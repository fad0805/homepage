"""store date marker calendar intervals

Revision ID: f5b6c7d8e9a0
Revises: e4d5c6b7a8f9
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5b6c7d8e9a0"
down_revision: Union[str, Sequence[str], None] = "e4d5c6b7a8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_date_markers",
        sa.Column("intervals", sa.JSON(), nullable=True),
    )
    op.execute(
        """
        UPDATE bookmark_date_markers
        SET intervals = json_build_array(
            json_build_object('unit', 'day', 'value', interval_days)
        )
        WHERE interval_days IS NOT NULL
          AND interval_days > 0
        """
    )
    op.drop_constraint(
        "ck_bookmark_date_markers_interval",
        "bookmark_date_markers",
        type_="check",
    )
    op.drop_column("bookmark_date_markers", "interval_days")


def downgrade() -> None:
    op.add_column(
        "bookmark_date_markers",
        sa.Column("interval_days", sa.Integer(), nullable=True),
    )
    op.execute(
        """
        UPDATE bookmark_date_markers
        SET interval_days = (
            SELECT (entry->>'value')::integer
            FROM json_array_elements(intervals) AS entry
            WHERE entry->>'unit' = 'day'
            LIMIT 1
        )
        WHERE intervals IS NOT NULL
        """
    )
    op.create_check_constraint(
        "ck_bookmark_date_markers_interval",
        "bookmark_date_markers",
        "interval_days IS NULL OR interval_days > 0",
    )
    op.drop_column("bookmark_date_markers", "intervals")
