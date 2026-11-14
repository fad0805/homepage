"""add author side menu position

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-11-14 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "author_settings",
        sa.Column(
            "side_position",
            sa.String(length=16),
            nullable=False,
            server_default="left",
        ),
    )


def downgrade() -> None:
    op.drop_column("author_settings", "side_position")
