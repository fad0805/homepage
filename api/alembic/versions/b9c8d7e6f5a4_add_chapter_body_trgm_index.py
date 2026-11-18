"""add trigram index on chapters.body

Revision ID: b9c8d7e6f5a4
Revises: f5b6c7d8e9a0
Create Date: 2026-11-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b9c8d7e6f5a4"
down_revision: str | Sequence[str] | None = "f5b6c7d8e9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_chapters_body_trgm "
        "ON chapters USING gin (body gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chapters_body_trgm")
