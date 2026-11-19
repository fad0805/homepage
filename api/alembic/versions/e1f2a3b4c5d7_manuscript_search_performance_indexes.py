"""add manuscript tree/search performance indexes

Revision ID: e1f2a3b4c5d7
Revises: b3f1c9d7e5a2, a7b8c9d0e1f2, f8a9b0c1d2e3
Create Date: 2026-11-19
"""

from collections.abc import Sequence

from alembic import op

revision: str = "e1f2a3b4c5d7"
down_revision: str | Sequence[str] | None = (
    "b3f1c9d7e5a2",
    "a7b8c9d0e1f2",
    "f8a9b0c1d2e3",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BTREE_INDEXES = (
    (
        "ix_manuscript_nodes_live_project_order",
        "(project_id, position, id) WHERE deleted_at IS NULL",
    ),
    (
        "ix_manuscript_nodes_live_user_updated",
        "(user_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL",
    ),
    (
        "ix_manuscript_nodes_live_user_project_updated",
        "(user_id, project_id, updated_at DESC, id DESC) "
        "WHERE deleted_at IS NULL",
    ),
    (
        "ix_manuscript_nodes_live_user_project",
        "(user_id, project_id) WHERE deleted_at IS NULL",
    ),
    (
        "ix_manuscript_nodes_user_trash",
        "(user_id, deleted_at DESC, position, id) "
        "WHERE deleted_at IS NOT NULL",
    ),
    (
        "ix_serial_nodes_folder_lookup",
        "(book_id, parent_id, label) WHERE node_type = 'folder'",
    ),
)

TRIGRAM_INDEXES = (
    ("ix_manuscript_nodes_title_trgm", "title"),
    ("ix_manuscript_nodes_synopsis_trgm", "synopsis"),
    ("ix_manuscript_nodes_notes_trgm", "notes"),
    ("ix_manuscript_nodes_body_trgm", "body"),
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    for name, definition in BTREE_INDEXES:
        table = "serial_nodes" if name.startswith("ix_serial") else "manuscript_nodes"
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON {table} {definition}"
        )

    for name, column in TRIGRAM_INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS {name} ON manuscript_nodes "
            f"USING gin ({column} gin_trgm_ops)"
        )


def downgrade() -> None:
    for name, _ in reversed(TRIGRAM_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")
    for name, _ in reversed(BTREE_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {name}")
