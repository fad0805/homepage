"""add protected state and book/chapter grants

Revision ID: c8d3e5f7a9b1
Revises: b7c2d9e4f1a8
Create Date: 2026-11-11 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8d3e5f7a9b1"
down_revision: Union[str, None] = "b7c2d9e4f1a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("illustrations", "chapters", "books"):
        op.add_column(
            table,
            sa.Column(
                "protected",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    op.add_column(
        "gallery_invites",
        sa.Column("chapter_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_invites_chapter_id",
        "gallery_invites",
        ["chapter_id"],
    )
    op.create_foreign_key(
        "fk_gallery_invites_chapter_id",
        "gallery_invites",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column(
        "gallery_invites",
        sa.Column("book_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_invites_book_id",
        "gallery_invites",
        ["book_id"],
    )
    op.create_foreign_key(
        "fk_gallery_invites_book_id",
        "gallery_invites",
        "books",
        ["book_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column(
        "gallery_session_grants",
        sa.Column("chapter_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_session_grants_chapter_id",
        "gallery_session_grants",
        ["chapter_id"],
    )
    op.create_foreign_key(
        "fk_gallery_session_grants_chapter_id",
        "gallery_session_grants",
        "chapters",
        ["chapter_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column(
        "gallery_session_grants",
        sa.Column("book_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_gallery_session_grants_book_id",
        "gallery_session_grants",
        ["book_id"],
    )
    op.create_foreign_key(
        "fk_gallery_session_grants_book_id",
        "gallery_session_grants",
        "books",
        ["book_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_unique_constraint(
        "uq_gallery_session_chapter",
        "gallery_session_grants",
        ["session_id", "chapter_id"],
    )
    op.create_unique_constraint(
        "uq_gallery_session_book",
        "gallery_session_grants",
        ["session_id", "book_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_gallery_session_book",
        "gallery_session_grants",
        type_="unique",
    )
    op.drop_constraint(
        "uq_gallery_session_chapter",
        "gallery_session_grants",
        type_="unique",
    )

    op.drop_constraint(
        "fk_gallery_session_grants_book_id",
        "gallery_session_grants",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_session_grants_book_id",
        table_name="gallery_session_grants",
    )
    op.drop_column("gallery_session_grants", "book_id")

    op.drop_constraint(
        "fk_gallery_session_grants_chapter_id",
        "gallery_session_grants",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_session_grants_chapter_id",
        table_name="gallery_session_grants",
    )
    op.drop_column("gallery_session_grants", "chapter_id")

    op.drop_constraint(
        "fk_gallery_invites_book_id",
        "gallery_invites",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_invites_book_id",
        table_name="gallery_invites",
    )
    op.drop_column("gallery_invites", "book_id")

    op.drop_constraint(
        "fk_gallery_invites_chapter_id",
        "gallery_invites",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_gallery_invites_chapter_id",
        table_name="gallery_invites",
    )
    op.drop_column("gallery_invites", "chapter_id")

    for table in ("books", "chapters", "illustrations"):
        op.drop_column(table, "protected")
