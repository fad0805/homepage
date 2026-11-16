"""add daily mood tags and wake time

Revision ID: 3b2a1c0d9e8f
Revises: 4d3c2b1a0f9e
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "3b2a1c0d9e8f"
down_revision: Union[str, Sequence[str], None] = "4d3c2b1a0f9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookmark_mood_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
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
            name="fk_bookmark_mood_tags_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "name",
            name="uq_bookmark_mood_tags_user_name",
        ),
    )
    op.create_index(
        "ix_bookmark_mood_tags_user_id",
        "bookmark_mood_tags",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_mood_tags_user_position",
        "bookmark_mood_tags",
        ["user_id", "position"],
        unique=False,
    )

    op.add_column(
        "bookmark_goals",
        sa.Column("wake_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "bookmark_goals",
        sa.Column("mood_tag_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_bookmark_goals_mood_tag_id",
        "bookmark_goals",
        "bookmark_mood_tags",
        ["mood_tag_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_bookmark_goals_mood_tag_id",
        "bookmark_goals",
        ["mood_tag_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_goals_mood_tag_id",
        table_name="bookmark_goals",
    )
    op.drop_constraint(
        "fk_bookmark_goals_mood_tag_id",
        "bookmark_goals",
        type_="foreignkey",
    )
    op.drop_column("bookmark_goals", "mood_tag_id")
    op.drop_column("bookmark_goals", "wake_time")
    op.drop_index(
        "ix_bookmark_mood_tags_user_position",
        table_name="bookmark_mood_tags",
    )
    op.drop_index(
        "ix_bookmark_mood_tags_user_id",
        table_name="bookmark_mood_tags",
    )
    op.drop_table("bookmark_mood_tags")
