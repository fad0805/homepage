"""add copyright name to index pages

Revision ID: f3c4d5e6f7a8
Revises: e4f6a8b0c2d3
Create Date: 2026-11-22 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f3c4d5e6f7a8"
down_revision: Union[str, None] = "e4f6a8b0c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "index_pages",
        sa.Column("copyright_name", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("index_pages", "copyright_name")
