"""add bookmark routine calendar_only

Revision ID: 4c5d6e7f8a9b
Revises: 3b2a1c0d9e8f
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4c5d6e7f8a9b"
down_revision: Union[str, Sequence[str], None] = "3b2a1c0d9e8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column(
            "calendar_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_bookmark_routines_calendar_only",
        "bookmark_routines",
        ["calendar_only"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_routines_calendar_only",
        table_name="bookmark_routines",
    )
    op.drop_column("bookmark_routines", "calendar_only")
