"""goal text records and clover ratings

Revision ID: c3d4e5f6a7b8
Revises: b8c9d0e1f2a3
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookmark_goals",
        sa.Column(
            "content",
            sa.Text(),
            nullable=False,
            server_default="",
        ),
    )
    op.execute(
        """
        UPDATE bookmark_goals
        SET content = btrim(
            COALESCE(title, '') ||
            CASE
                WHEN COALESCE(notes, '') <> '' THEN E'\\n\\n' || notes
                ELSE ''
            END,
            E'\\n'
        )
        """
    )
    op.execute(
        """
        WITH merged AS (
            SELECT
                user_id,
                period_type,
                period_start,
                string_agg(
                    NULLIF(content, ''),
                    E'\\n\\n'
                    ORDER BY id
                ) AS content
            FROM bookmark_goals
            GROUP BY user_id, period_type, period_start
        )
        UPDATE bookmark_goals AS goal
        SET content = COALESCE(merged.content, '')
        FROM merged
        WHERE goal.user_id = merged.user_id
          AND goal.period_type = merged.period_type
          AND goal.period_start = merged.period_start
        """
    )
    op.execute(
        """
        DELETE FROM bookmark_goals AS older
        USING bookmark_goals AS newer
        WHERE older.user_id = newer.user_id
          AND older.period_type = newer.period_type
          AND older.period_start = newer.period_start
          AND older.id > newer.id
        """
    )
    op.drop_index(
        "ix_bookmark_goals_user_period",
        table_name="bookmark_goals",
    )
    op.drop_column("bookmark_goals", "position")
    op.drop_column("bookmark_goals", "done")
    op.drop_column("bookmark_goals", "notes")
    op.drop_column("bookmark_goals", "title")
    op.create_unique_constraint(
        "uq_bookmark_goals_user_period",
        "bookmark_goals",
        ["user_id", "period_type", "period_start"],
    )

    op.create_table(
        "bookmark_ratings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
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
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_bookmark_ratings_range",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_bookmark_ratings_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "period_type",
            "period_start",
            name="uq_bookmark_ratings_user_period",
        ),
    )
    op.create_index(
        "ix_bookmark_ratings_user_id",
        "bookmark_ratings",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_ratings_user_id",
        table_name="bookmark_ratings",
    )
    op.drop_table("bookmark_ratings")

    op.drop_constraint(
        "uq_bookmark_goals_user_period",
        "bookmark_goals",
        type_="unique",
    )
    op.add_column(
        "bookmark_goals",
        sa.Column(
            "title",
            sa.String(length=255),
            nullable=False,
            server_default="",
        ),
    )
    op.add_column(
        "bookmark_goals",
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "bookmark_goals",
        sa.Column(
            "done",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "bookmark_goals",
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.execute(
        """
        UPDATE bookmark_goals
        SET title = left(content, 255),
            notes = content
        """
    )
    op.create_index(
        "ix_bookmark_goals_user_period",
        "bookmark_goals",
        ["user_id", "period_type", "period_start"],
        unique=False,
    )
    op.drop_column("bookmark_goals", "content")
