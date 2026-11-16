"""add bookmark weekly routine weekdays

Revision ID: b8c9d0e1f2a3
Revises: b1c2d3e4f5a7
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column("weekdays", sa.JSON(), nullable=True),
    )
    op.execute(
        """
        UPDATE bookmark_routines
        SET weekdays = json_build_array(weekday)
        WHERE frequency = 'weekly' AND weekday IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE bookmark_routines
        SET weekday = NULL
        WHERE frequency = 'weekly'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE bookmark_routines
        SET weekday = (weekdays->>0)::integer
        WHERE frequency = 'weekly'
          AND weekdays IS NOT NULL
          AND json_array_length(weekdays) > 0
        """
    )
    op.drop_column("bookmark_routines", "weekdays")
