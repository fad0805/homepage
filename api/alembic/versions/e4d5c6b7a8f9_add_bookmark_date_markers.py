"""add bookmark date markers

Revision ID: e4d5c6b7a8f9
Revises: 1f2a3b4c5d6e
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4d5c6b7a8f9"
down_revision: Union[str, Sequence[str], None] = "1f2a3b4c5d6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookmark_date_markers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("marker_date", sa.Date(), nullable=False),
        sa.Column(
            "is_dday",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "pinned",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "interval_days IS NULL OR interval_days > 0",
            name="ck_bookmark_date_markers_interval",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bookmark_date_markers_user_id"),
        "bookmark_date_markers",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookmark_date_markers_marker_date"),
        "bookmark_date_markers",
        ["marker_date"],
        unique=False,
    )
    op.create_index(
        "ix_bookmark_date_markers_user_date",
        "bookmark_date_markers",
        ["user_id", "marker_date"],
        unique=False,
    )

    # D-days used to live in bookmark_routines as calendar-only entries.
    # Move them into the dedicated marker table and remove the old rows.
    op.execute(
        """
        INSERT INTO bookmark_date_markers (
            user_id,
            title,
            memo,
            marker_date,
            is_dday,
            pinned,
            interval_days,
            created_at,
            updated_at
        )
        SELECT
            user_id,
            title,
            notes,
            start_date,
            true,
            calendar_pinned,
            NULL,
            created_at,
            updated_at
        FROM bookmark_routines
        WHERE calendar_only = true
          AND frequency = 'once'
          AND start_date IS NOT NULL
        """
    )
    op.execute(
        """
        DELETE FROM bookmark_routines
        WHERE calendar_only = true
          AND frequency = 'once'
        """
    )


def downgrade() -> None:
    # D-days can be represented as one-off calendar entries again. Simple
    # markers and interval settings have no equivalent in the old table.
    op.execute(
        """
        INSERT INTO bookmark_routines (
            user_id,
            title,
            notes,
            frequency,
            start_date,
            end_date,
            tracking_mode,
            target_count,
            active,
            calendar_only,
            calendar_pinned,
            position,
            created_at,
            updated_at
        )
        SELECT
            user_id,
            title,
            memo,
            'once',
            marker_date,
            marker_date,
            'date',
            1,
            true,
            true,
            pinned,
            0,
            created_at,
            updated_at
        FROM bookmark_date_markers
        WHERE is_dday = true
        """
    )
    op.drop_index(
        "ix_bookmark_date_markers_user_date",
        table_name="bookmark_date_markers",
    )
    op.drop_index(
        op.f("ix_bookmark_date_markers_marker_date"),
        table_name="bookmark_date_markers",
    )
    op.drop_index(
        op.f("ix_bookmark_date_markers_user_id"),
        table_name="bookmark_date_markers",
    )
    op.drop_table("bookmark_date_markers")
