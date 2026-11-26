"""add maskable favicon to index pages

Revision ID: b7c8d9e0f1a2
Revises: f9e0d1c2b3a4
Create Date: 2026-11-26 00:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "f9e0d1c2b3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "index_pages",
        sa.Column(
            "favicon_maskable_url",
            sa.String(length=1000),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("index_pages", "favicon_maskable_url")
