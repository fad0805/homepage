"""add default light or dark theme

Revision ID: f6a7b8c9d0e1
Revises: e4f5a6b7c8d9
Create Date: 2026-11-15 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "author_settings",
        sa.Column(
            "default_theme",
            sa.String(length=16),
            nullable=False,
            server_default="light",
        ),
    )


def downgrade() -> None:
    op.drop_column("author_settings", "default_theme")
