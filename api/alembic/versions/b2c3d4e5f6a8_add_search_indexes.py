"""add indexes for accumulating content and search

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BTREE_INDEXES = (
    (
        "ix_books_user_visible_order",
        "books",
        ["user_id", "visible", "order", "id"],
    ),
    (
        "ix_books_visible_order",
        "books",
        ["visible", "order", "id"],
    ),
    (
        "ix_books_category_order",
        "books",
        ["category_id", "order", "id"],
    ),
    (
        "ix_book_categories_user_visible_order",
        "book_categories",
        ["user_id", "visible", "order", "id"],
    ),
    (
        "ix_chapters_book_visible_order",
        "chapters",
        ["book_id", "visible", "order", "id"],
    ),
    (
        "ix_chapters_user_published",
        "chapters",
        ["user_id", "published_at"],
    ),
    (
        "ix_chapters_book_created",
        "chapters",
        ["book_id", "created_at", "id"],
    ),
    (
        "ix_illustrations_user_visible_order",
        "illustrations",
        ["user_id", "visible", "order", "created_at", "id"],
    ),
    (
        "ix_illustrations_visible_order",
        "illustrations",
        ["visible", "order", "created_at", "id"],
    ),
    (
        "ix_illustrations_user_taken",
        "illustrations",
        ["user_id", "taken_at"],
    ),
    (
        "ix_illustrations_user_created",
        "illustrations",
        ["user_id", "created_at"],
    ),
    (
        "ix_planner_tasks_user_start_end",
        "planner_tasks",
        ["user_id", "start_date", "end_date"],
    ),
    (
        "ix_planner_tasks_user_color",
        "planner_tasks",
        ["user_id", "color_id"],
    ),
    (
        "ix_planner_events_owner_type_occurred",
        "planner_events",
        ["owner_user_id", "entity_type", "occurred_at"],
    ),
    (
        "ix_memos_user_pinned_created",
        "memos",
        ["user_id", "pinned", "created_at"],
    ),
    (
        "ix_memos_user_pinned_expires",
        "memos",
        ["user_id", "pinned", "expires_at"],
    ),
    (
        "ix_user_sessions_user_expires",
        "user_sessions",
        ["user_id", "expires_at"],
    ),
    (
        "ix_user_sessions_expires",
        "user_sessions",
        ["expires_at"],
    ),
    (
        "ix_user_signin_history_user_time",
        "user_signin_history",
        ["user_id", "signin_time"],
    ),
    (
        "ix_gallery_invites_user_created",
        "gallery_invites",
        ["user_id", "created_at"],
    ),
    (
        "ix_gallery_sessions_created",
        "gallery_sessions",
        ["created_at"],
    ),
    (
        "ix_notification_deliveries_settings_posted",
        "notification_deliveries",
        ["settings_id", "posted_at"],
    ),
    (
        "ix_site_visits_visited_ip",
        "site_visits",
        ["visited_on", "ip_hash"],
    ),
)


TRIGRAM_INDEXES = (
    ("ix_books_title_trgm", "books", "title"),
    ("ix_books_description_trgm", "books", "description"),
    ("ix_books_tags_trgm", "books", "(tags::text)"),
    ("ix_book_categories_name_trgm", "book_categories", "name"),
    ("ix_chapters_title_trgm", "chapters", "title"),
    ("ix_chapters_subtitle_trgm", "chapters", "subtitle"),
    ("ix_chapters_tags_trgm", "chapters", "(tags::text)"),
    ("ix_illustrations_title_trgm", "illustrations", "title"),
    ("ix_illustrations_tags_trgm", "illustrations", "(tags::text)"),
    ("ix_planner_tasks_title_trgm", "planner_tasks", "title"),
    ("ix_planner_tasks_notes_trgm", "planner_tasks", "notes"),
    ("ix_planner_events_title_trgm", "planner_events", "title"),
    ("ix_planner_events_notes_trgm", "planner_events", "notes"),
    ("ix_planner_events_changes_trgm", "planner_events", "(changes::text)"),
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    for name, table, columns in BTREE_INDEXES:
        op.create_index(name, table, columns, unique=False)

    for name, table, expression in TRIGRAM_INDEXES:
        op.execute(
            f"CREATE INDEX {name} ON {table} "
            f"USING gin ({expression} gin_trgm_ops)"
        )


def downgrade() -> None:
    for name, _, _ in reversed(TRIGRAM_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")

    for name, _, _ in reversed(BTREE_INDEXES):
        op.drop_index(name)
