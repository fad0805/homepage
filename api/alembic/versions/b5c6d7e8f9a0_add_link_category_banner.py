"""add banner and description to link categories

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-11-22 03:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "links-categories",
        sa.Column("banner_url", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "links-categories",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "links-categories",
        sa.Column(
            "is_special",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("links-categories", "is_special")
    op.drop_column("links-categories", "description")
    op.drop_column("links-categories", "banner_url")
