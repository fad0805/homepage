"""re-anchor chapter history to publication time

Revision ID: e8f9a0b1c2d3
Revises: e7f8a9b0c1d2
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE planner_events AS event
        SET occurred_at = COALESCE(chapter.published_at, chapter.created_at)
        FROM chapters AS chapter
        WHERE event.entity_type = 'chapter'
          AND event.entity_id = chapter.id
          AND COALESCE(chapter.published_at, chapter.created_at) IS NOT NULL
        """
    )


def downgrade() -> None:
    # The original edit timestamps cannot be reconstructed.
    pass
