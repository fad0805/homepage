"""add author color theme

Revision ID: b1c2d3e4f5a6
Revises: a8b9c0d1e2f3
Create Date: 2026-11-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "author_settings",
        sa.Column(
            "color_theme",
            sa.String(length=32),
            nullable=False,
            server_default="mint",
        ),
    )
    op.add_column(
        "author_settings",
        sa.Column("color_background", sa.String(length=7), nullable=True),
    )
    op.add_column(
        "author_settings",
        sa.Column("color_content", sa.String(length=7), nullable=True),
    )
    op.add_column(
        "author_settings",
        sa.Column("color_accent", sa.String(length=7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("author_settings", "color_accent")
    op.drop_column("author_settings", "color_content")
    op.drop_column("author_settings", "color_background")
    op.drop_column("author_settings", "color_theme")
