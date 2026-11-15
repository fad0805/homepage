"""add category visibility and gallery category grants

Revision ID: e1f2a3b4c5d6
Revises: d2e3f4a5b6c7
Create Date: 2026-11-16 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "book_categories",
        sa.Column(
            "visible",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "book_categories",
        sa.Column(
            "protected",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "gallery_invites",
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("book_categories.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_gallery_invites_category_id",
        "gallery_invites",
        ["category_id"],
    )
    op.add_column(
        "gallery_session_grants",
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("book_categories.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_gallery_session_grants_category_id",
        "gallery_session_grants",
        ["category_id"],
    )
    op.create_unique_constraint(
        "uq_gallery_session_category",
        "gallery_session_grants",
        ["session_id", "category_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_gallery_session_category",
        "gallery_session_grants",
        type_="unique",
    )
    op.drop_index(
        "ix_gallery_session_grants_category_id",
        table_name="gallery_session_grants",
    )
    op.drop_column("gallery_session_grants", "category_id")
    op.drop_index(
        "ix_gallery_invites_category_id",
        table_name="gallery_invites",
    )
    op.drop_column("gallery_invites", "category_id")
    op.drop_column("book_categories", "protected")
    op.drop_column("book_categories", "visible")
