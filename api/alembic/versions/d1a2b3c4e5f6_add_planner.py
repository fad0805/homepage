"""add private planner tasks and history

Revision ID: d1a2b3c4e5f6
Revises: e2f3a4b5c6d7
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1a2b3c4e5f6"
down_revision: Union[str, Sequence[str], None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "planner_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "schedule_type",
            sa.String(length=16),
            nullable=False,
            server_default="single",
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("deadline_base_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("deadline_days", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
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
        sa.Column("inactive_at", sa.DateTime(), nullable=True),
        sa.Column("trashed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_planner_tasks_user_id",
        "planner_tasks",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_planner_tasks_start_date",
        "planner_tasks",
        ["start_date"],
        unique=False,
    )
    op.create_index(
        "ix_planner_tasks_end_date",
        "planner_tasks",
        ["end_date"],
        unique=False,
    )
    op.create_index(
        "ix_planner_tasks_status",
        "planner_tasks",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_planner_tasks_user_status_dates",
        "planner_tasks",
        ["user_id", "status", "start_date", "end_date"],
        unique=False,
    )

    op.create_table(
        "planner_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_planner_events_owner_user_id",
        "planner_events",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_planner_events_entity_type",
        "planner_events",
        ["entity_type"],
        unique=False,
    )
    op.create_index(
        "ix_planner_events_entity_id",
        "planner_events",
        ["entity_id"],
        unique=False,
    )
    op.create_index(
        "ix_planner_events_owner_occurred",
        "planner_events",
        ["owner_user_id", "occurred_at"],
        unique=False,
    )

    # Existing content becomes a creation entry on its owner's calendar.
    # Tables without created_at (categories, locations, dolls) are skipped.
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'book', id, 'created', title, NULL,
               COALESCE(created_at, NOW())
        FROM books
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'chapter', id, 'created', title, NULL,
               COALESCE(created_at, NOW())
        FROM chapters
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'illustration', id, 'created', title, NULL,
               COALESCE(created_at, NOW())
        FROM illustrations
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'character', id, 'created', name, NULL,
               COALESCE(created_at, NOW())
        FROM characters
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'link', id, 'created', name, NULL,
               COALESCE(created_at, NOW())
        FROM links
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT user_id, user_id, 'profile', id, 'created',
               COALESCE(NULLIF(title, ''), '프로필'), NULL,
               COALESCE(created_at, NOW())
        FROM profiles
        WHERE user_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT owner.id, owner.id, 'index', page.id, 'created',
               CASE
                   WHEN page.scope = 'integrated' THEN '통합 인덱스'
                   ELSE '작가 인덱스'
               END,
               NULL,
               COALESCE(page.created_at, NOW())
        FROM index_pages page
        JOIN users owner
          ON owner.id = COALESCE(
              page.user_id,
              (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
          )
        """
    )
    op.execute(
        """
        INSERT INTO planner_events
            (owner_user_id, actor_user_id, entity_type, entity_id, action,
             title, changes, occurred_at)
        SELECT id, id, 'account', id, 'created', username, NULL,
               COALESCE(created_at, NOW())
        FROM users
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_planner_events_owner_occurred",
        table_name="planner_events",
    )
    op.drop_index(
        "ix_planner_events_entity_id",
        table_name="planner_events",
    )
    op.drop_index(
        "ix_planner_events_entity_type",
        table_name="planner_events",
    )
    op.drop_index(
        "ix_planner_events_owner_user_id",
        table_name="planner_events",
    )
    op.drop_table("planner_events")

    op.drop_index(
        "ix_planner_tasks_user_status_dates",
        table_name="planner_tasks",
    )
    op.drop_index("ix_planner_tasks_status", table_name="planner_tasks")
    op.drop_index("ix_planner_tasks_end_date", table_name="planner_tasks")
    op.drop_index(
        "ix_planner_tasks_start_date",
        table_name="planner_tasks",
    )
    op.drop_index("ix_planner_tasks_user_id", table_name="planner_tasks")
    op.drop_table("planner_tasks")
