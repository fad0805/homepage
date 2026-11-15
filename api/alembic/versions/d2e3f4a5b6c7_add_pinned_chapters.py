"""add pinned chapters

Revision ID: d2e3f4a5b6c7
Revises: a7b8c9d0e1f2, e7b2d9c4f6a1
Create Date: 2026-11-16 03:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = (
    "a7b8c9d0e1f2",
    "e7b2d9c4f6a1",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chapters",
        sa.Column(
            "pinned",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "chapter_drafts",
        sa.Column(
            "pinned",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("chapter_drafts", "pinned")
    op.drop_column("chapters", "pinned")
