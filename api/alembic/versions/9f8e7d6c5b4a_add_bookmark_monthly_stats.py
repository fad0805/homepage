"""add bookmark routine monthly stats

Revision ID: 9f8e7d6c5b4a
Revises: c3d4e5f6a7b8
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9f8e7d6c5b4a"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookmark_routine_monthly_stats",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=True),
        sa.Column("routine_title", sa.String(length=255), nullable=False),
        sa.Column("frequency", sa.String(length=10), nullable=False),
        sa.Column("month_start", sa.Date(), nullable=False),
        sa.Column(
            "completed_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "expected_count",
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
            name="fk_bookmark_routine_monthly_stats_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["routine_id"],
            ["bookmark_routines.id"],
            name="fk_bookmark_routine_monthly_stats_routine_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "routine_id",
            "month_start",
            name="uq_bookmark_routine_monthly_stats_period",
        ),
    )
    op.create_index(
        "ix_bookmark_routine_monthly_stats_user_id",
        "bookmark_routine_monthly_stats",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_routine_monthly_stats_routine_id",
        "bookmark_routine_monthly_stats",
        ["routine_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_routine_monthly_stats_user_month",
        "bookmark_routine_monthly_stats",
        ["user_id", "month_start"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bookmark_routine_monthly_stats_user_month",
        table_name="bookmark_routine_monthly_stats",
    )
    op.drop_index(
        "ix_bookmark_routine_monthly_stats_routine_id",
        table_name="bookmark_routine_monthly_stats",
    )
    op.drop_index(
        "ix_bookmark_routine_monthly_stats_user_id",
        table_name="bookmark_routine_monthly_stats",
    )
    op.drop_table("bookmark_routine_monthly_stats")
