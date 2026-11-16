"""add routine lifespan dates

Revision ID: 4d3c2b1a0f9e
Revises: 5f4e3d2c1b0a
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4d3c2b1a0f9e"
down_revision: Union[str, Sequence[str], None] = "5f4e3d2c1b0a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column("start_date", sa.Date(), nullable=True),
    )
    op.execute(
        """
        UPDATE bookmark_routines
        SET start_date = COALESCE(created_at::date, CURRENT_DATE)
        """
    )
    op.alter_column(
        "bookmark_routines",
        "start_date",
        nullable=False,
    )
    op.add_column(
        "bookmark_routines",
        sa.Column("end_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookmark_routines", "end_date")
    op.drop_column("bookmark_routines", "start_date")
