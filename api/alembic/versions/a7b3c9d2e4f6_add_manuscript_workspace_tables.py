"""add manuscript workspace tables

Revision ID: a7b3c9d2e4f6
Revises: 69acf662a76c
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7b3c9d2e4f6"
down_revision: str | Sequence[str] | None = "69acf662a76c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "manuscript_projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column(
            "linked_book_id",
            sa.Integer(),
            sa.ForeignKey("books.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "linked_book_id", name="uq_manuscript_projects_linked_book"
        ),
    )
    op.create_index(
        "ix_manuscript_projects_id", "manuscript_projects", ["id"], unique=False
    )
    op.create_index(
        "ix_manuscript_projects_user_id",
        "manuscript_projects",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "manuscript_nodes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("manuscript_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("manuscript_nodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("node_type", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("synopsis", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "char_count_with_spaces",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "char_count_plain", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("target_chars", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "published_chapter_id",
            sa.Integer(),
            sa.ForeignKey("chapters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("published_manuscript_hash", sa.String(length=64), nullable=True),
        sa.Column("published_chapter_hash", sa.String(length=64), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "published_chapter_id", name="uq_manuscript_nodes_published_chapter"
        ),
    )
    op.create_index(
        "ix_manuscript_nodes_id", "manuscript_nodes", ["id"], unique=False
    )
    op.create_index(
        "ix_manuscript_nodes_user_id", "manuscript_nodes", ["user_id"], unique=False
    )
    op.create_index(
        "ix_manuscript_nodes_project_id",
        "manuscript_nodes",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        "ix_manuscript_nodes_parent_id", "manuscript_nodes", ["parent_id"], unique=False
    )
    op.create_index(
        "ix_manuscript_nodes_deleted_at",
        "manuscript_nodes",
        ["deleted_at"],
        unique=False,
    )
    op.create_index(
        "ix_manuscript_nodes_tree",
        "manuscript_nodes",
        ["project_id", "parent_id", "position"],
        unique=False,
    )

    op.create_table(
        "serial_nodes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "book_id",
            sa.Integer(),
            sa.ForeignKey("books.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("serial_nodes.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("node_type", sa.String(length=16), nullable=False),
        sa.Column(
            "chapter_id",
            sa.Integer(),
            sa.ForeignKey("chapters.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("book_id", "chapter_id", name="uq_serial_nodes_book_chapter"),
        sa.CheckConstraint(
            "((node_type = 'folder' AND chapter_id IS NULL AND label IS NOT NULL) "
            "OR (node_type = 'post' AND chapter_id IS NOT NULL))",
            name="ck_serial_nodes_type",
        ),
    )
    op.create_index("ix_serial_nodes_id", "serial_nodes", ["id"], unique=False)
    op.create_index(
        "ix_serial_nodes_user_id", "serial_nodes", ["user_id"], unique=False
    )
    op.create_index(
        "ix_serial_nodes_book_id", "serial_nodes", ["book_id"], unique=False
    )
    op.create_index(
        "ix_serial_nodes_parent_id", "serial_nodes", ["parent_id"], unique=False
    )
    op.create_index(
        "ix_serial_nodes_tree",
        "serial_nodes",
        ["book_id", "parent_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("serial_nodes")
    op.drop_table("manuscript_nodes")
    op.drop_table("manuscript_projects")
