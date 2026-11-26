"""add 192px favicon to index pages

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-11-26 00:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "index_pages",
        sa.Column("favicon_192_url", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("index_pages", "favicon_192_url")
