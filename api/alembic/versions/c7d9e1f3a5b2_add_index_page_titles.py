"""add editable site title and caption to index pages

Revision ID: c7d9e1f3a5b2
Revises: d7e8f9a0b1c2
Create Date: 2026-11-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c7d9e1f3a5b2"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_TITLE = "어디에도 없는 섬"
DEFAULT_SUBTITLE = "Missing Island"


def upgrade() -> None:
    op.add_column(
        "index_pages",
        sa.Column("title", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "index_pages",
        sa.Column("subtitle", sa.String(length=160), nullable=True),
    )

    # Existing pages keep their current header text until an admin edits it.
    connection = op.get_bind()
    connection.execute(
        sa.text("UPDATE index_pages SET title = :title").bindparams(
            title=DEFAULT_TITLE
        )
    )
    connection.execute(
        sa.text("UPDATE index_pages SET subtitle = :subtitle").bindparams(
            subtitle=DEFAULT_SUBTITLE
        )
    )


def downgrade() -> None:
    op.drop_column("index_pages", "subtitle")
    op.drop_column("index_pages", "title")
