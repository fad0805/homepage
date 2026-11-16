"""add bookmark module

Revision ID: b1c2d3e4f5a7
Revises: f4b5c6d7e8f9
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a7"
down_revision: Union[str, Sequence[str], None] = "f4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookmark_routines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("frequency", sa.String(length=10), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("nth_week", sa.Integer(), nullable=True),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
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
            name="fk_bookmark_routines_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bookmark_routines_user_id",
        "bookmark_routines",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "bookmark_routine_checks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column(
            "done",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
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
            name="fk_bookmark_routine_checks_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["routine_id"],
            ["bookmark_routines.id"],
            name="fk_bookmark_routine_checks_routine_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "routine_id",
            "period_type",
            "period_start",
            name="uq_bookmark_routine_checks_period",
        ),
    )
    op.create_index(
        "ix_bookmark_routine_checks_user_id",
        "bookmark_routine_checks",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_routine_checks_routine_id",
        "bookmark_routine_checks",
        ["routine_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_routine_checks_user_period",
        "bookmark_routine_checks",
        ["user_id", "period_type", "period_start"],
        unique=False,
    )

    op.create_table(
        "bookmark_goals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "done",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
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
            name="fk_bookmark_goals_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_bookmark_goals_user_id",
        "bookmark_goals",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_goals_user_period",
        "bookmark_goals",
        ["user_id", "period_type", "period_start"],
        unique=False,
    )

    op.create_table(
        "bookmark_reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=10), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column(
            "content",
            sa.Text(),
            nullable=False,
            server_default="",
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
            name="fk_bookmark_reviews_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "period_type",
            "period_start",
            name="uq_bookmark_reviews_user_period",
        ),
    )
    op.create_index(
        "ix_bookmark_reviews_user_id",
        "bookmark_reviews",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_reviews_user_id",
        table_name="bookmark_reviews",
    )
    op.drop_table("bookmark_reviews")
    op.drop_index(
        "ix_bookmark_goals_user_period",
        table_name="bookmark_goals",
    )
    op.drop_index(
        "ix_bookmark_goals_user_id",
        table_name="bookmark_goals",
    )
    op.drop_table("bookmark_goals")
    op.drop_index(
        "ix_bookmark_routine_checks_user_period",
        table_name="bookmark_routine_checks",
    )
    op.drop_index(
        "ix_bookmark_routine_checks_routine_id",
        table_name="bookmark_routine_checks",
    )
    op.drop_index(
        "ix_bookmark_routine_checks_user_id",
        table_name="bookmark_routine_checks",
    )
    op.drop_table("bookmark_routine_checks")
    op.drop_index(
        "ix_bookmark_routines_user_id",
        table_name="bookmark_routines",
    )
    op.drop_table("bookmark_routines")
