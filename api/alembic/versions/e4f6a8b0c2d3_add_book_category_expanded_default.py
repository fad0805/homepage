"""add expanded-by-default state to book categories

Revision ID: e4f6a8b0c2d3
Revises: c7d9e1f3a5b2
Create Date: 2026-11-22 01:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e4f6a8b0c2d3"
down_revision: Union[str, None] = "c7d9e1f3a5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "book_categories",
        sa.Column(
            "expanded_by_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("book_categories", "expanded_by_default")
