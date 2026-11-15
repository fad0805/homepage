"""add separate dark color overrides

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-15 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "author_settings",
        sa.Column("color_background_dark", sa.String(length=7), nullable=True),
    )
    op.add_column(
        "author_settings",
        sa.Column("color_content_dark", sa.String(length=7), nullable=True),
    )
    op.add_column(
        "author_settings",
        sa.Column("color_accent_dark", sa.String(length=7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("author_settings", "color_accent_dark")
    op.drop_column("author_settings", "color_content_dark")
    op.drop_column("author_settings", "color_background_dark")
