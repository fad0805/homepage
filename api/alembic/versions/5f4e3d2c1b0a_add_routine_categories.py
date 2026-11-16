"""add routine categories

Revision ID: 5f4e3d2c1b0a
Revises: 6a5b4c3d2e1f
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5f4e3d2c1b0a"
down_revision: Union[str, Sequence[str], None] = "6a5b4c3d2e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookmark_routine_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_bookmark_routine_categories_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "name",
            name="uq_bookmark_routine_categories_user_name",
        ),
    )
    op.create_index(
        "ix_bookmark_routine_categories_user_id",
        "bookmark_routine_categories",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_routine_categories_user_position",
        "bookmark_routine_categories",
        ["user_id", "position"],
        unique=False,
    )
    op.add_column(
        "bookmark_routines",
        sa.Column("category_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bookmark_routines_category_id",
        "bookmark_routines",
        "bookmark_routine_categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_bookmark_routines_category_id",
        "bookmark_routines",
        ["category_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_routines_category_id",
        table_name="bookmark_routines",
    )
    op.drop_constraint(
        "fk_bookmark_routines_category_id",
        "bookmark_routines",
        type_="foreignkey",
    )
    op.drop_column("bookmark_routines", "category_id")
    op.drop_index(
        "ix_bookmark_routine_categories_user_position",
        table_name="bookmark_routine_categories",
    )
    op.drop_index(
        "ix_bookmark_routine_categories_user_id",
        table_name="bookmark_routine_categories",
    )
    op.drop_table("bookmark_routine_categories")
