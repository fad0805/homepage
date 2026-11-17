"""add bookmark routine manual_done

Revision ID: 8b9c0d1e2f3a
Revises: 5d6e7f8a9b0c
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8b9c0d1e2f3a"
down_revision: Union[str, Sequence[str], None] = "5d6e7f8a9b0c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routine_checks",
        sa.Column(
            "manual_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("bookmark_routine_checks", "manual_done")
