"""add favicon to index pages

Revision ID: f9e0d1c2b3a4
Revises: d2e8f4a6b1c3
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f9e0d1c2b3a4"
down_revision: Union[str, None] = "d2e8f4a6b1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "index_pages",
        sa.Column("favicon_url", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("index_pages", "favicon_url")
