"""add chapter drafts

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-11-09 10:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the single-draft-per-target chapter draft table."""
    op.create_table(
        "chapter_drafts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner", sa.String(length=50), nullable=False),
        sa.Column("draft_key", sa.String(length=120), nullable=False),
        sa.Column(
            "title",
            sa.String(),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("subtitle", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "tags",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
        sa.Column(
            "visible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("target_book_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner",
            "draft_key",
            name="uq_chapter_drafts_owner_key",
        ),
    )


def downgrade() -> None:
    op.drop_table("chapter_drafts")
