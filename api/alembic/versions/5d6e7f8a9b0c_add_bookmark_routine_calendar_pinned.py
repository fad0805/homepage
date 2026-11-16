"""add bookmark routine calendar_pinned

Revision ID: 5d6e7f8a9b0c
Revises: 4c5d6e7f8a9b
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5d6e7f8a9b0c"
down_revision: Union[str, Sequence[str], None] = "4c5d6e7f8a9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_routines",
        sa.Column(
            "calendar_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("bookmark_routines", "calendar_pinned")
